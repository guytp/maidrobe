/**
 * Image upload utilities for wardrobe item creation.
 *
 * Provides image preparation (resize, compress, EXIF strip) and upload
 * to Supabase Storage for wardrobe items.
 *
 * Processing pipeline:
 * 1. Resize image so longest edge is max 1600px (no upscaling)
 * 2. Compress to JPEG at 0.85 quality (~1.5MB typical)
 * 3. EXIF metadata stripped automatically by expo-image-manipulator
 * 4. Upload to Supabase Storage with authenticated client
 *
 * @module features/wardrobe/utils/imageUpload
 */

import * as ImageManipulator from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { supabase } from '../../../services/supabase';
import { logError } from '../../../core/telemetry';
import { WARDROBE_STORAGE_CONFIG } from '../../onboarding/types/wardrobeItem';

/**
 * Maximum dimension for longest edge after processing.
 * Images are resized so the longest edge does not exceed this value.
 * No upscaling is performed if the image is already smaller.
 */
export const MAX_UPLOAD_DIMENSION = 1600;

/**
 * JPEG compression quality (0.0 to 1.0).
 * 0.85 provides good visual quality while keeping typical uploads under ~1.5MB.
 */
export const JPEG_UPLOAD_QUALITY = 0.85;

/**
 * Supabase Storage bucket name for wardrobe items.
 */
export const WARDROBE_BUCKET_NAME = 'wardrobe-items';

/**
 * Error types for upload operations.
 */
export type UploadErrorType =
  | 'processing'
  | 'file_read'
  | 'network'
  | 'storage'
  | 'permission'
  | 'unknown';

/**
 * Custom error class for upload failures.
 *
 * Provides typed error classification for appropriate user messaging
 * and telemetry categorization.
 */
export class UploadError extends Error {
  constructor(
    message: string,
    public readonly errorType: UploadErrorType,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'UploadError';
  }
}

/**
 * Result of image preparation.
 */
export interface PreparedImage {
  /** Local URI to processed image file */
  uri: string;
  /** Final image width in pixels */
  width: number;
  /** Final image height in pixels */
  height: number;
  /** File size in bytes */
  fileSize: number;
}

/**
 * Generates a non-guessable storage path for an item image.
 *
 * Path format: user/{userId}/items/{itemId}/original.jpg
 *
 * Uses WARDROBE_STORAGE_CONFIG.pathTemplate as the single source of truth
 * to ensure consistency with other parts of the codebase.
 *
 * @param userId - The authenticated user's ID
 * @param itemId - The stable item ID (UUIDv7)
 * @returns Storage path string
 */
export function generateStoragePath(userId: string, itemId: string): string {
  return WARDROBE_STORAGE_CONFIG.pathTemplate(userId, itemId);
}

/**
 * Prepares an image for upload by resizing and compressing.
 *
 * Processing steps:
 * 1. Resize so longest edge is max MAX_UPLOAD_DIMENSION (1600px)
 * 2. No upscaling if image is already smaller
 * 3. Compress to JPEG at JPEG_UPLOAD_QUALITY (0.85)
 * 4. EXIF metadata (GPS, camera, timestamps) stripped automatically
 *
 * @param imageUri - Local URI to source image (file:// scheme)
 * @param sourceWidth - Original image width in pixels
 * @param sourceHeight - Original image height in pixels
 * @returns Prepared image with URI, dimensions, and file size
 * @throws UploadError if processing fails
 *
 * @example
 * ```ts
 * const prepared = await prepareImageForUpload(
 *   'file:///path/to/image.jpg',
 *   2400,
 *   3000
 * );
 * // prepared.uri -> 'file:///path/to/processed.jpg'
 * // prepared.width -> 1280 (scaled down proportionally)
 * // prepared.height -> 1600 (longest edge capped at 1600)
 * ```
 */
export async function prepareImageForUpload(
  imageUri: string,
  sourceWidth: number,
  sourceHeight: number
): Promise<PreparedImage> {
  try {
    // Calculate resize dimensions
    const longestEdge = Math.max(sourceWidth, sourceHeight);
    let targetWidth: number;
    let targetHeight: number;

    if (longestEdge <= MAX_UPLOAD_DIMENSION) {
      // Image is already smaller than max - no resize needed
      targetWidth = sourceWidth;
      targetHeight = sourceHeight;
    } else {
      // Scale down proportionally so longest edge = MAX_UPLOAD_DIMENSION
      const scaleFactor = MAX_UPLOAD_DIMENSION / longestEdge;
      targetWidth = Math.round(sourceWidth * scaleFactor);
      targetHeight = Math.round(sourceHeight * scaleFactor);
    }

    // Build actions array - only resize if dimensions changed
    const actions: ImageManipulator.Action[] = [];
    if (targetWidth !== sourceWidth || targetHeight !== sourceHeight) {
      actions.push({
        resize: {
          width: targetWidth,
          height: targetHeight,
        },
      });
    }

    // Process image with expo-image-manipulator
    // EXIF metadata is automatically stripped when saving to a new file
    const result = await ImageManipulator.manipulateAsync(imageUri, actions, {
      compress: JPEG_UPLOAD_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
    });

    // Get file size for telemetry and validation using new File API
    const file = new File(result.uri);
    const fileSize = file.size ?? 0;

    return {
      uri: result.uri,
      width: result.width,
      height: result.height,
      fileSize,
    };
  } catch (error) {
    // Classify error
    let errorType: UploadErrorType = 'processing';
    let message = 'Failed to process image';

    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();

      if (errorMessage.includes('memory') || errorMessage.includes('oom')) {
        errorType = 'processing';
        message = 'Image too large to process';
      } else if (
        errorMessage.includes('enoent') ||
        errorMessage.includes('no such file') ||
        errorMessage.includes('file not found')
      ) {
        errorType = 'file_read';
        message = 'Image file not found';
      } else if (errorMessage.includes('permission')) {
        errorType = 'permission';
        message = 'Permission denied accessing image';
      }
    }

    throw new UploadError(message, errorType, error);
  }
}

/**
 * Reads a local image file and converts it to an ArrayBuffer for upload.
 *
 * Uses the new expo-file-system File API which implements Blob interface.
 *
 * @param imageUri - Local URI to image file (file:// scheme)
 * @returns ArrayBuffer containing image data
 * @throws UploadError if file read fails
 */
async function readImageAsArrayBuffer(imageUri: string): Promise<ArrayBuffer> {
  try {
    // Use new File API which implements Blob interface
    const file = new File(imageUri);
    const arrayBuffer = await file.arrayBuffer();
    return arrayBuffer;
  } catch (error) {
    let message = 'Failed to read image file';

    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();

      if (
        errorMessage.includes('enoent') ||
        errorMessage.includes('no such file') ||
        errorMessage.includes('file not found')
      ) {
        message = 'Image file not found';
      } else if (errorMessage.includes('permission')) {
        message = 'Permission denied reading image';
      }
    }

    throw new UploadError(message, 'file_read', error);
  }
}

/**
 * Classifies a Supabase storage error into an UploadErrorType.
 *
 * @param error - Error from Supabase storage operation
 * @returns Appropriate UploadErrorType
 */
export function classifyStorageError(error: unknown): UploadErrorType {
  if (!(error instanceof Error) && (typeof error !== 'object' || error === null)) {
    return 'unknown';
  }

  // Check for Supabase error structure
  const err = error as { message?: string; statusCode?: number; error?: string };
  const message = (err.message || err.error || '').toLowerCase();
  const statusCode = err.statusCode;

  // Network errors
  if (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('timeout') ||
    message.includes('connection') ||
    message.includes('econnrefused')
  ) {
    return 'network';
  }

  // Permission/auth errors (4xx status codes)
  if (
    statusCode === 401 ||
    statusCode === 403 ||
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('permission')
  ) {
    return 'permission';
  }

  // Storage-specific errors
  if (
    message.includes('bucket') ||
    message.includes('storage') ||
    message.includes('quota') ||
    message.includes('size')
  ) {
    return 'storage';
  }

  return 'storage';
}

/**
 * Uploads a prepared image to Supabase Storage.
 *
 * Uses the authenticated Supabase client to upload to the private
 * wardrobe-items bucket. Supports upsert for retry idempotency.
 *
 * @param preparedImage - Image prepared by prepareImageForUpload
 * @param storagePath - Non-guessable storage path from generateStoragePath
 * @returns The storage path on success (same as input)
 * @throws UploadError if upload fails
 *
 * @example
 * ```ts
 * const storagePath = generateStoragePath(userId, itemId);
 * const prepared = await prepareImageForUpload(imageUri, width, height);
 * const path = await uploadImageToStorage(prepared, storagePath);
 * // path -> 'user/abc-123/items/def-456/original.jpg'
 * ```
 */
export async function uploadImageToStorage(
  preparedImage: PreparedImage,
  storagePath: string
): Promise<string> {
  try {
    // Read image file as ArrayBuffer
    const imageData = await readImageAsArrayBuffer(preparedImage.uri);

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(WARDROBE_BUCKET_NAME)
      .upload(storagePath, imageData, {
        contentType: 'image/jpeg',
        upsert: true, // Enable upsert for retry idempotency
      });

    if (uploadError) {
      const errorType = classifyStorageError(uploadError);
      const message =
        errorType === 'network'
          ? 'Network error during upload'
          : errorType === 'permission'
            ? 'Permission denied uploading image'
            : 'Failed to upload image to storage';

      // Log to telemetry
      logError(uploadError, errorType === 'network' ? 'network' : 'server', {
        feature: 'wardrobe',
        operation: 'image_upload',
        metadata: {
          errorType,
          storagePath,
          fileSize: preparedImage.fileSize,
        },
      });

      throw new UploadError(message, errorType, uploadError);
    }

    return storagePath;
  } catch (error) {
    // Re-throw if already an UploadError
    if (error instanceof UploadError) {
      throw error;
    }

    // Classify and wrap unexpected errors
    const errorType = classifyStorageError(error);
    const message =
      errorType === 'network' ? 'Network error during upload' : 'Failed to upload image';

    // Log to telemetry
    logError(error instanceof Error ? error : new Error(String(error)), 'server', {
      feature: 'wardrobe',
      operation: 'image_upload',
      metadata: {
        errorType,
        storagePath,
        fileSize: preparedImage.fileSize,
      },
    });

    throw new UploadError(message, errorType, error);
  }
}
