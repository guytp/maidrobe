/**
 * Image processing utilities for crop & adjust flow.
 *
 * Provides on-device image cropping, resizing, and compression using
 * expo-image-manipulator. Transforms the visible crop frame area into
 * a final processed image ready for upload.
 *
 * Processing pipeline:
 * 1. Compute crop rectangle from transform state (scale, translate) and frame geometry
 * 2. Apply crop using expo-image-manipulator
 * 3. Resize to target dimensions (longest edge ~1600px)
 * 4. Compress to JPEG at specified quality
 * 5. Return processed image URI and dimensions
 *
 * @module features/wardrobe/crop/utils/imageProcessing
 */

import * as ImageManipulator from 'expo-image-manipulator';
import { CaptureSource } from '../../../../core/types/capture';
import { wrapAsCropError } from './errors';

/**
 * Target maximum dimension for longest edge after processing.
 * Images are resized so the longest edge is approximately this value.
 */
export const TARGET_MAX_DIMENSION = 1600;

/**
 * JPEG compression quality (0.0 to 1.0).
 * 0.85 provides good quality with reasonable file size.
 */
export const JPEG_QUALITY = 0.85;

/**
 * Crop frame aspect ratio (width / height).
 * Must match the UI crop frame ratio (4:5 portrait).
 */
export const CROP_ASPECT_RATIO = 4 / 5; // 0.8

/**
 * Maximum image dimension before pre-downscaling.
 * Images larger than this will be downscaled before cropping to prevent
 * out-of-memory errors on low-end devices. Set to 4K resolution as threshold.
 */
export const MAX_INPUT_DIMENSION = 4096;

/**
 * Crop rectangle in image pixel coordinates.
 */
export interface CropRect {
  /** Origin X coordinate in pixels */
  x: number;
  /** Origin Y coordinate in pixels */
  y: number;
  /** Crop width in pixels */
  width: number;
  /** Crop height in pixels */
  height: number;
}

/**
 * Frame dimensions from the crop UI.
 */
export interface FrameDimensions {
  /** Frame left position in screen pixels */
  left: number;
  /** Frame top position in screen pixels */
  top: number;
  /** Frame width in screen pixels */
  width: number;
  /** Frame height in screen pixels */
  height: number;
}

/**
 * Processed image result ready for handoff to item creation.
 */
export interface ProcessedCropResult {
  /** Local URI to processed image file */
  uri: string;
  /** Final image width in pixels */
  width: number;
  /** Final image height in pixels */
  height: number;
  /** Original capture source (preserved from input) */
  source: CaptureSource;
}

/**
 * Computes the crop rectangle in original image pixel coordinates.
 *
 * Takes the visible crop frame from the UI and the current image transform
 * (scale, translation) and calculates which pixels from the original image
 * should be included in the crop. Uses inverse transform to map screen
 * coordinates back to image space.
 *
 * Algorithm:
 * 1. Get frame corners in screen space
 * 2. Apply inverse transform (subtract translate, divide by scale)
 * 3. Clamp to image bounds
 * 4. Ensure 4:5 aspect ratio is preserved
 *
 * @param originalWidth - Original image width in pixels
 * @param originalHeight - Original image height in pixels
 * @param scale - Current image scale factor (>=1.0)
 * @param translateX - Current X translation in screen pixels
 * @param translateY - Current Y translation in screen pixels
 * @param frame - Crop frame dimensions in screen coordinates
 * @returns Crop rectangle in original image pixel coordinates
 */
export function computeCropRectangle(
  originalWidth: number,
  originalHeight: number,
  scale: number,
  translateX: number,
  translateY: number,
  frame: FrameDimensions
): CropRect {
  // Frame boundaries in screen space
  const frameLeft = frame.left;
  const frameTop = frame.top;
  const frameRight = frame.left + frame.width;
  const frameBottom = frame.top + frame.height;

  // Inverse transform: screen -> image space
  // imageCoord = (screenCoord - translate) / scale
  const imageLeft = (frameLeft - translateX) / scale;
  const imageTop = (frameTop - translateY) / scale;
  const imageRight = (frameRight - translateX) / scale;
  const imageBottom = (frameBottom - translateY) / scale;

  // Crop dimensions in image space
  const cropWidth = imageRight - imageLeft;
  const cropHeight = imageBottom - imageTop;

  // Clamp to image bounds (prevent out-of-bounds crop)
  const clampedX = Math.max(0, Math.min(imageLeft, originalWidth - cropWidth));
  const clampedY = Math.max(0, Math.min(imageTop, originalHeight - cropHeight));
  const clampedWidth = Math.min(cropWidth, originalWidth - clampedX);
  const clampedHeight = Math.min(cropHeight, originalHeight - clampedY);

  // Round to integers (pixel coordinates)
  return {
    x: Math.round(clampedX),
    y: Math.round(clampedY),
    width: Math.round(clampedWidth),
    height: Math.round(clampedHeight),
  };
}

/**
 * Processes an image through the crop, resize, and compress pipeline.
 *
 * Uses expo-image-manipulator to:
 * 1. Pre-downscale if image is very large (prevents OOM on low-end devices)
 * 2. Crop to the specified rectangle
 * 3. Resize so longest edge is approximately TARGET_MAX_DIMENSION
 * 4. Compress to JPEG at JPEG_QUALITY
 *
 * The resize step maintains the 4:5 aspect ratio by calculating dimensions
 * based on the longest edge. Both width and height are resized proportionally.
 *
 * Large image handling:
 * If the original image is larger than MAX_INPUT_DIMENSION on any edge,
 * it is pre-downscaled before cropping. The crop rectangle is adjusted
 * proportionally to match the downscaled coordinates.
 *
 * @param imageUri - Local URI of original image (file:// scheme)
 * @param cropRect - Crop rectangle in image pixel coordinates
 * @param source - Original capture source (camera or gallery)
 * @param originalWidth - Original image width in pixels (for downscaling check)
 * @param originalHeight - Original image height in pixels (for downscaling check)
 * @returns Processed image result with URI and dimensions
 * @throws Error if image processing fails
 */
export async function cropAndProcessImage(
  imageUri: string,
  cropRect: CropRect,
  source: CaptureSource,
  originalWidth: number,
  originalHeight: number
): Promise<ProcessedCropResult> {
  try {
    // Step 0: Pre-downscale if image is very large to prevent OOM
    const maxDimension = Math.max(originalWidth, originalHeight);
    let workingUri = imageUri;
    let workingCropRect = cropRect;

    if (maxDimension > MAX_INPUT_DIMENSION) {
      // Pre-downscale to prevent out-of-memory errors on low-end devices
      const downscaleFactor = MAX_INPUT_DIMENSION / maxDimension;
      const downscaledWidth = Math.round(originalWidth * downscaleFactor);
      const downscaledHeight = Math.round(originalHeight * downscaleFactor);

      // Downscale the image first
      const downscaled = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: downscaledWidth, height: downscaledHeight } }],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
      );

      workingUri = downscaled.uri;

      // Adjust crop rectangle for downscaled coordinates
      workingCropRect = {
        x: Math.round(cropRect.x * downscaleFactor),
        y: Math.round(cropRect.y * downscaleFactor),
        width: Math.round(cropRect.width * downscaleFactor),
        height: Math.round(cropRect.height * downscaleFactor),
      };
    }

    // Step 1 & 2: Crop and determine resize dimensions
    // Crop gives us an image at cropRect dimensions
    const croppedWidth = workingCropRect.width;
    const croppedHeight = workingCropRect.height;

    // Calculate resize dimensions: longest edge -> TARGET_MAX_DIMENSION
    const longestEdge = Math.max(croppedWidth, croppedHeight);
    let resizeWidth: number;
    let resizeHeight: number;

    if (longestEdge <= TARGET_MAX_DIMENSION) {
      // Image is already smaller than target, keep original size
      resizeWidth = croppedWidth;
      resizeHeight = croppedHeight;
    } else {
      // Scale down proportionally
      const scaleFactor = TARGET_MAX_DIMENSION / longestEdge;
      resizeWidth = Math.round(croppedWidth * scaleFactor);
      resizeHeight = Math.round(croppedHeight * scaleFactor);
    }

    // Apply all transforms in one pass for efficiency
    const result = await ImageManipulator.manipulateAsync(
      workingUri,
      [
        // Crop to rectangle
        {
          crop: {
            originX: workingCropRect.x,
            originY: workingCropRect.y,
            width: workingCropRect.width,
            height: workingCropRect.height,
          },
        },
        // Resize to target dimensions
        {
          resize: {
            width: resizeWidth,
            height: resizeHeight,
          },
        },
      ],
      {
        // Compress to JPEG
        compress: JPEG_QUALITY,
        format: ImageManipulator.SaveFormat.JPEG,
        // Note: EXIF stripping happens automatically
      }
    );

    return {
      uri: result.uri,
      width: result.width,
      height: result.height,
      source,
    };
  } catch (error) {
    // Wrap error with proper classification for telemetry
    throw wrapAsCropError(error, 'Image processing failed');
  }
}
