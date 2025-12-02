/**
 * Process Item Image Edge Function
 *
 * Handles background removal and thumbnail generation for wardrobe items.
 * This function can be invoked in multiple modes:
 * 1. Direct mode: Process a specific item by itemId
 * 2. Queue mode: Poll image_processing_jobs table for pending jobs
 * 3. Recovery mode: Scan for and recover stale jobs stuck in processing
 *
 * PROCESSING PIPELINE:
 * 1. Validate item exists with original_key and status in {pending, failed}
 * 2. Atomically update image_processing_status to 'processing'
 * 3. Download original image from Supabase Storage
 * 4. Call background-removal provider (Replicate) over TLS
 * 5. Generate mid-resolution clean image and thumbnail in memory
 * 6. Upload clean and thumb variants to deterministic storage paths
 * 7. Update item with clean_key, thumb_key, status = 'succeeded'
 *
 * ERROR HANDLING:
 * - Categorizes errors as 'transient' (retry) or 'permanent' (no retry)
 * - Transient: timeouts, 429 rate limits, network errors, 5xx server errors
 * - Permanent: 4xx client errors (except 429), unsupported formats, validation
 * - Exponential backoff with jitter for transient retries
 * - Structured logging with item_id, user_id, provider, duration, error codes
 *
 * IDEMPOTENCY:
 * - Re-validates item state before processing
 * - Uses deterministic storage paths (upsert semantics)
 * - Safe to repeat for same (item_id, original_key) pair
 * - On failure, clears clean_key/thumb_key to avoid inconsistent state
 *
 * STALE JOB RECOVERY:
 * - Scans for jobs stuck in 'processing' beyond threshold
 * - Resets to 'pending' if retries remain, 'failed' otherwise
 * - Prevents items from being permanently stuck
 *
 * SECURITY AND PRIVACY:
 * - Uses service role to bypass RLS (background job pattern)
 * - No user authentication required (internal/scheduled invocation)
 * - All operations scoped to specific item_id with explicit user_id tracking
 * - Structured logs include user_id for audit trail but never include PII
 * - Storage paths are user-scoped: user/{userId}/items/{itemId}/*
 * - Cross-user data access is impossible due to path-based isolation
 *
 * PRIVACY - EXIF METADATA:
 * - All output images (clean, thumb) are re-encoded via ImageScript.encodeJPEG()
 * - JPEG re-encoding strips all EXIF metadata from processed images
 * - Original images are already EXIF-free (client strips before upload)
 * - Even when feature flag is OFF, originals are EXIF-free from client-side stripping
 *
 * RLS ENFORCEMENT:
 * - This function uses service role (bypasses RLS) for background processing
 * - User isolation is enforced through:
 *   1. Items table: user_id is set at creation and never changed
 *   2. Storage paths: Include user_id, enforced by storage policies
 *   3. Job queue: Jobs reference items, inheriting user scope
 * - All database queries include explicit user_id in logs for audit
 *
 * REQUEST:
 * POST /process-item-image
 * Body: {
 *   itemId?: string,       // Direct mode: process specific item
 *   batchSize?: number,    // Queue mode: max jobs to process (default: 10)
 *   recoverStale?: boolean // Recovery mode: scan for stale jobs
 * }
 *
 * ENVIRONMENT VARIABLES:
 * - SUPABASE_URL: Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Service role key for bypassing RLS
 * - REPLICATE_API_KEY: API key for background removal
 * - IMAGE_PROCESSING_TIMEOUT_MS: API timeout (default: 20000ms / 20 seconds)
 * - THUMBNAIL_SIZE: Square thumbnail dimension in pixels (default: 200, creates 200x200)
 * - CLEAN_IMAGE_MAX_DIMENSION: Clean image max edge (default: 1600)
 * - RETRY_BASE_DELAY_MS: Base delay for exponential backoff (default: 1000)
 * - RETRY_MAX_DELAY_MS: Maximum retry delay (default: 60000)
 * - STALE_JOB_THRESHOLD_MS: Time before job considered stale (default: 600000)
 * - MAX_CONCURRENT_JOBS: Max parallel job processing per invocation (default: 5)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts';

import { isImageCleanupEnabled } from '../_shared/featureFlags.ts';
import {
  createLogger,
  getOrGenerateCorrelationId,
  type StructuredLogger,
} from '../_shared/structuredLogger.ts';

// ============================================================================
// Types
// ============================================================================

/**
 * Error category for retry logic
 */
type ErrorCategory = 'transient' | 'permanent';

/**
 * Normalized error codes
 */
type ErrorCode =
  | 'timeout'
  | 'rate_limit'
  | 'network'
  | 'server_error'
  | 'not_found'
  | 'unauthorized'
  | 'forbidden'
  | 'unsupported_format'
  | 'validation'
  | 'provider_failed'
  | 'unknown';

/**
 * Provider identifiers
 */
type Provider = 'storage' | 'replicate' | 'internal';

/**
 * Classified error with full context
 */
interface ClassifiedError extends Error {
  category: ErrorCategory;
  code: ErrorCode;
  provider: Provider;
  httpStatus?: number;
}

/**
 * Request body schema
 */
interface ProcessItemImageRequest {
  /** Process a specific item (direct mode) */
  itemId?: string;
  /** Max jobs to process in queue mode (default: 10) */
  batchSize?: number;
  /** Recover stale jobs stuck in processing */
  recoverStale?: boolean;
}

/**
 * Individual job processing result
 */
interface JobResult {
  itemId: string;
  jobId?: number;
  success: boolean;
  /** Whether the item was skipped (e.g., feature disabled) */
  skipped?: boolean;
  error?: string;
  errorCode?: ErrorCode;
  errorCategory?: ErrorCategory;
  durationMs?: number;
}

/**
 * Response body schema
 */
interface ProcessItemImageResponse {
  success: boolean;
  processed?: number;
  failed?: number;
  /** Number of items skipped (e.g., feature disabled) */
  skipped?: number;
  recovered?: number;
  results?: JobResult[];
  error?: string;
  code?: string;
  /** Correlation ID for request tracing */
  correlationId?: string;
}

/**
 * Item record from database
 */
interface ItemRecord {
  id: string;
  user_id: string;
  original_key: string | null;
  clean_key: string | null;
  thumb_key: string | null;
  image_processing_status: string;
}

/**
 * Job record from image_processing_jobs table
 */
interface JobRecord {
  id: number;
  item_id: string;
  original_key: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  started_at: string | null;
}

/**
 * Replicate prediction response
 */
interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[];
  error?: string;
}

/**
 * Function name for logging
 */
const FUNCTION_NAME = 'process-item-image';

// ============================================================================
// Constants
// ============================================================================

/** Storage bucket for wardrobe items */
const STORAGE_BUCKET = 'wardrobe-items';

/**
 * Default timeout for external API calls in milliseconds.
 *
 * Set to 20 seconds as specified in the user story requirements:
 * "Provider call timeout default: 20 seconds (configurable)"
 *
 * This timeout applies to the entire Replicate prediction lifecycle:
 * - Initial prediction creation API call
 * - Polling loop until prediction completes
 * - Downloading the processed image result
 *
 * If background removal consistently times out in production, increase
 * via IMAGE_PROCESSING_TIMEOUT_MS environment variable. The provider's
 * actual processing time depends on image complexity and queue depth.
 */
const DEFAULT_TIMEOUT_MS = 20000;

/**
 * Default thumbnail size in pixels (square dimension).
 *
 * CONFIRMED: 200x200px square thumbnails are the approved specification,
 * replacing the original 256-320px range after product review. This decision
 * has been validated with stakeholders and reflects the current design direction.
 *
 * Rationale for 200px square format:
 * - Optimized for 2-4 column grid layouts on mobile devices (170-200px cells typical)
 * - Creates consistent grid cell sizing with contain/letterbox strategy
 * - Balances visual clarity with file size (~5-15KB per thumbnail)
 * - Improves list scrolling performance when displaying hundreds of wardrobe items
 * - Full garment visibility preserved (no cropping)
 *
 * Can be overridden via THUMBNAIL_SIZE environment variable if larger
 * thumbnails are needed for tablet or high-density displays.
 */
const DEFAULT_THUMBNAIL_SIZE = 200;

/** Default clean image max dimension */
const DEFAULT_CLEAN_MAX_DIMENSION = 1600;

/** Default batch size for queue processing */
const DEFAULT_BATCH_SIZE = 10;

/** Replicate API base URL */
const REPLICATE_API_URL = 'https://api.replicate.com/v1';

/**
 * Default Replicate model for background removal
 * Using cjwbw/rembg - a popular open-source background removal model
 */
const DEFAULT_REPLICATE_MODEL =
  'cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003';

/** Polling interval for Replicate predictions (ms) */
const REPLICATE_POLL_INTERVAL_MS = 1000;

/** Valid statuses for processing eligibility */
const ELIGIBLE_STATUSES = ['pending', 'failed'];

/** JPEG compression quality */
const JPEG_QUALITY = 0.85;

/** Default base delay for exponential backoff (1 second) */
const DEFAULT_RETRY_BASE_DELAY_MS = 1000;

/** Default maximum delay between retries (1 minute) */
const DEFAULT_RETRY_MAX_DELAY_MS = 60000;

/** Default threshold for stale job detection (10 minutes) */
const DEFAULT_STALE_JOB_THRESHOLD_MS = 600000;

/**
 * Default maximum concurrent job processing per function invocation.
 * Limits parallel Replicate API calls to avoid rate limiting and memory pressure.
 * Set to 5 as a balance between throughput and resource usage.
 */
const DEFAULT_MAX_CONCURRENCY = 5;

// ============================================================================
// Error Classification
// ============================================================================

/**
 * Creates a classified error with category and code
 */
function createClassifiedError(
  message: string,
  category: ErrorCategory,
  code: ErrorCode,
  provider: Provider,
  httpStatus?: number
): ClassifiedError {
  const error = new Error(message) as ClassifiedError;
  error.category = category;
  error.code = code;
  error.provider = provider;
  error.httpStatus = httpStatus;
  return error;
}

/**
 * Classifies an HTTP status code into error category and code.
 *
 * @param status - HTTP status code to classify
 * @param _provider - Provider identifier (unused). Retained for interface consistency
 *   with callers and to support future provider-specific classification logic.
 *   Prefixed with underscore to satisfy TypeScript's noUnusedParameters check.
 */
function classifyHttpStatus(
  status: number,
  _provider: Provider
): { category: ErrorCategory; code: ErrorCode } {
  // Rate limiting - transient
  if (status === 429) {
    return { category: 'transient', code: 'rate_limit' };
  }

  // Server errors - transient (can retry)
  if (status >= 500) {
    return { category: 'transient', code: 'server_error' };
  }

  // Client errors - permanent (except 429 handled above)
  if (status === 401) {
    return { category: 'permanent', code: 'unauthorized' };
  }
  if (status === 403) {
    return { category: 'permanent', code: 'forbidden' };
  }
  if (status === 404) {
    return { category: 'permanent', code: 'not_found' };
  }
  if (status >= 400) {
    return { category: 'permanent', code: 'validation' };
  }

  // Default for unexpected status
  return { category: 'permanent', code: 'unknown' };
}

/**
 * Wraps an error with classification based on its characteristics
 */
function classifyError(error: unknown, provider: Provider): ClassifiedError {
  // Already classified
  if (error instanceof Error && 'category' in error && 'code' in error) {
    return error as ClassifiedError;
  }

  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  // Timeout errors - transient
  if (
    lowerMessage.includes('timeout') ||
    lowerMessage.includes('timed out') ||
    lowerMessage.includes('deadline')
  ) {
    return createClassifiedError(message, 'transient', 'timeout', provider);
  }

  // Network errors - transient
  if (
    lowerMessage.includes('network') ||
    lowerMessage.includes('econnrefused') ||
    lowerMessage.includes('econnreset') ||
    lowerMessage.includes('enotfound') ||
    lowerMessage.includes('socket') ||
    lowerMessage.includes('dns')
  ) {
    return createClassifiedError(message, 'transient', 'network', provider);
  }

  // Rate limit indicators - transient
  if (lowerMessage.includes('rate limit') || lowerMessage.includes('too many requests')) {
    return createClassifiedError(message, 'transient', 'rate_limit', provider);
  }

  // Unsupported format - permanent
  if (
    lowerMessage.includes('unsupported') ||
    lowerMessage.includes('invalid format') ||
    lowerMessage.includes('invalid image')
  ) {
    return createClassifiedError(message, 'permanent', 'unsupported_format', provider);
  }

  // Not found - permanent
  if (lowerMessage.includes('not found') || lowerMessage.includes('does not exist')) {
    return createClassifiedError(message, 'permanent', 'not_found', provider);
  }

  // Provider failure - permanent
  if (
    lowerMessage.includes('failed') &&
    (lowerMessage.includes('background removal') || lowerMessage.includes('prediction'))
  ) {
    return createClassifiedError(message, 'permanent', 'provider_failed', provider);
  }

  // Default to transient for unknown errors (safer to retry)
  return createClassifiedError(message, 'transient', 'unknown', provider);
}

// ============================================================================
// Retry Logic
// ============================================================================

/**
 * Calculates exponential backoff delay with jitter
 */
function calculateBackoffDelay(
  attemptCount: number,
  baseDelayMs: number,
  maxDelayMs: number
): number {
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = baseDelayMs * Math.pow(2, attemptCount);

  // Cap at maximum delay
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

  // Add jitter (±25%) to prevent thundering herd
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);

  return Math.round(cappedDelay + jitter);
}

/**
 * Calculates the next retry timestamp
 */
function calculateNextRetryAt(
  attemptCount: number,
  baseDelayMs: number,
  maxDelayMs: number
): string {
  const delayMs = calculateBackoffDelay(attemptCount, baseDelayMs, maxDelayMs);
  return new Date(Date.now() + delayMs).toISOString();
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Creates a JSON response with appropriate headers
 */
function jsonResponse(body: ProcessItemImageResponse, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Validates UUID format
 */
function isValidUuid(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Extracts user_id and item_id from an original_key path
 * Path format: user/{userId}/items/{itemId}/original.{ext}
 */
function parseStoragePath(originalKey: string): { userId: string; itemId: string } | null {
  const parts = originalKey.split('/');
  // Expected: ['user', '{userId}', 'items', '{itemId}', 'original.{ext}']
  if (parts.length >= 5 && parts[0] === 'user' && parts[2] === 'items') {
    return {
      userId: parts[1],
      itemId: parts[3],
    };
  }
  return null;
}

/**
 * Generates deterministic storage paths for clean and thumb images
 */
function generateOutputPaths(
  userId: string,
  itemId: string
): { cleanKey: string; thumbKey: string } {
  return {
    cleanKey: `user/${userId}/items/${itemId}/clean.jpg`,
    thumbKey: `user/${userId}/items/${itemId}/thumb.jpg`,
  };
}

/**
 * Sleeps for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Image Processing Functions
// ============================================================================

/**
 * Downloads an image from Supabase Storage with error classification
 */
async function downloadImage(
  supabase: SupabaseClient,
  imageKey: string,
  logger: StructuredLogger
): Promise<Uint8Array> {
  logger.info('storage_download_start', { metadata: { storage_key: imageKey } });

  try {
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(imageKey);

    if (error) {
      // Classify storage errors
      const lowerMessage = error.message.toLowerCase();
      if (lowerMessage.includes('not found') || lowerMessage.includes('404')) {
        throw createClassifiedError(
          `Image not found: ${imageKey}`,
          'permanent',
          'not_found',
          'storage',
          404
        );
      }
      if (lowerMessage.includes('unauthorized') || lowerMessage.includes('401')) {
        throw createClassifiedError(
          `Unauthorized access to storage`,
          'permanent',
          'unauthorized',
          'storage',
          401
        );
      }
      // Default to transient for other storage errors
      throw createClassifiedError(
        `Storage download failed: ${error.message}`,
        'transient',
        'server_error',
        'storage'
      );
    }

    if (!data) {
      throw createClassifiedError(
        'Downloaded image data is empty',
        'permanent',
        'not_found',
        'storage'
      );
    }

    const imageData = new Uint8Array(await data.arrayBuffer());
    logger.info('storage_download_complete', {
      metadata: { storage_key: imageKey, size_bytes: imageData.length },
    });

    return imageData;
  } catch (error) {
    if (error instanceof Error && 'category' in error) {
      throw error;
    }
    throw classifyError(error, 'storage');
  }
}

/**
 * Uploads an image to Supabase Storage with error classification
 */
async function uploadImage(
  supabase: SupabaseClient,
  imageKey: string,
  imageData: Uint8Array,
  logger: StructuredLogger,
  contentType: string = 'image/jpeg'
): Promise<void> {
  logger.info('storage_upload_start', {
    metadata: { storage_key: imageKey, size_bytes: imageData.length },
  });

  try {
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(imageKey, imageData, {
      contentType,
      upsert: true, // Overwrite if exists (idempotency)
    });

    if (error) {
      const lowerMessage = error.message.toLowerCase();
      if (lowerMessage.includes('too large') || lowerMessage.includes('413')) {
        throw createClassifiedError(
          `Image too large for upload`,
          'permanent',
          'validation',
          'storage',
          413
        );
      }
      if (lowerMessage.includes('unsupported') || lowerMessage.includes('mime')) {
        throw createClassifiedError(
          `Unsupported image format`,
          'permanent',
          'unsupported_format',
          'storage'
        );
      }
      // Default to transient for other storage errors
      throw createClassifiedError(
        `Storage upload failed: ${error.message}`,
        'transient',
        'server_error',
        'storage'
      );
    }

    logger.info('storage_upload_complete', { metadata: { storage_key: imageKey } });
  } catch (error) {
    if (error instanceof Error && 'category' in error) {
      throw error;
    }
    throw classifyError(error, 'storage');
  }
}

/**
 * Calls Replicate API to remove background from image with error classification
 */
async function removeBackground(
  imageData: Uint8Array,
  apiKey: string,
  model: string,
  timeoutMs: number,
  logger: StructuredLogger
): Promise<Uint8Array> {
  logger.info('replicate_start', { metadata: { model } });

  try {
    // Convert image to base64 data URI
    // Using TextDecoder with 'latin1' (ISO-8859-1) encoding for memory-efficient conversion.
    // This avoids the spread operator (...imageData) which fails on large images due to
    // JavaScript's maximum argument limit (~65K-125K depending on engine).
    // latin1 maps each byte (0-255) directly to the same Unicode code point,
    // making it safe for binary-to-base64 conversion of images up to 50 MiB.
    const base64Image = btoa(new TextDecoder('latin1').decode(imageData));
    const mimeType = detectMimeType(imageData);
    const dataUri = `data:${mimeType};base64,${base64Image}`;

    // Create prediction with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let createResponse: Response;
    try {
      createResponse = await fetch(`${REPLICATE_API_URL}/predictions`, {
        method: 'POST',
        headers: {
          Authorization: `Token ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          version: model.split(':')[1],
          input: { image: dataUri },
        }),
        signal: controller.signal,
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        throw createClassifiedError(
          `Replicate API request timed out after ${timeoutMs}ms`,
          'transient',
          'timeout',
          'replicate'
        );
      }
      throw classifyError(fetchError, 'replicate');
    }
    clearTimeout(timeoutId);

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      const { category, code } = classifyHttpStatus(createResponse.status, 'replicate');
      throw createClassifiedError(
        `Replicate API error: ${createResponse.status} - ${errorText}`,
        category,
        code,
        'replicate',
        createResponse.status
      );
    }

    const prediction = (await createResponse.json()) as ReplicatePrediction;
    logger.info('replicate_prediction_created', { metadata: { prediction_id: prediction.id } });

    // Poll for completion
    const startTime = Date.now();
    let currentPrediction = prediction;

    while (
      currentPrediction.status !== 'succeeded' &&
      currentPrediction.status !== 'failed' &&
      currentPrediction.status !== 'canceled'
    ) {
      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        throw createClassifiedError(
          `Background removal timed out after ${timeoutMs}ms`,
          'transient',
          'timeout',
          'replicate'
        );
      }

      await sleep(REPLICATE_POLL_INTERVAL_MS);

      const pollResponse = await fetch(`${REPLICATE_API_URL}/predictions/${prediction.id}`, {
        headers: { Authorization: `Token ${apiKey}` },
      });

      if (!pollResponse.ok) {
        const { category, code } = classifyHttpStatus(pollResponse.status, 'replicate');
        throw createClassifiedError(
          `Failed to poll prediction: ${pollResponse.status}`,
          category,
          code,
          'replicate',
          pollResponse.status
        );
      }

      currentPrediction = (await pollResponse.json()) as ReplicatePrediction;
      logger.info('replicate_poll', {
        metadata: { prediction_id: prediction.id, status: currentPrediction.status },
      });
    }

    if (currentPrediction.status === 'failed') {
      throw createClassifiedError(
        `Background removal failed: ${currentPrediction.error || 'Unknown error'}`,
        'permanent',
        'provider_failed',
        'replicate'
      );
    }

    if (currentPrediction.status === 'canceled') {
      throw createClassifiedError(
        'Background removal was canceled',
        'transient',
        'unknown',
        'replicate'
      );
    }

    // Get output URL
    const outputUrl = Array.isArray(currentPrediction.output)
      ? currentPrediction.output[0]
      : currentPrediction.output;

    if (!outputUrl) {
      throw createClassifiedError(
        'No output URL in prediction result',
        'permanent',
        'provider_failed',
        'replicate'
      );
    }

    // Download processed image
    logger.info('replicate_download_start', { metadata: { output_url: outputUrl } });
    const outputResponse = await fetch(outputUrl);

    if (!outputResponse.ok) {
      const { category, code } = classifyHttpStatus(outputResponse.status, 'replicate');
      throw createClassifiedError(
        `Failed to download processed image: ${outputResponse.status}`,
        category,
        code,
        'replicate',
        outputResponse.status
      );
    }

    const result = new Uint8Array(await outputResponse.arrayBuffer());
    logger.info('replicate_complete', {
      metadata: { prediction_id: prediction.id, output_size_bytes: result.length },
    });

    return result;
  } catch (error) {
    if (error instanceof Error && 'category' in error) {
      throw error;
    }
    throw classifyError(error, 'replicate');
  }
}

/**
 * Detects MIME type from image data magic bytes
 */
function detectMimeType(data: Uint8Array): string {
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return 'image/jpeg';
  }
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    return 'image/png';
  }
  if (
    data[0] === 0x52 &&
    data[1] === 0x49 &&
    data[2] === 0x46 &&
    data[3] === 0x46 &&
    data[8] === 0x57 &&
    data[9] === 0x45 &&
    data[10] === 0x42 &&
    data[11] === 0x50
  ) {
    return 'image/webp';
  }
  return 'image/jpeg';
}

/**
 * Resizes image to specified max dimension while maintaining aspect ratio.
 *
 * Uses ImageScript for Deno-compatible image processing.
 * - Constrains the longest edge to maxDimension pixels
 * - Preserves aspect ratio (no distortion)
 * - Does not upscale images smaller than maxDimension
 * - Outputs JPEG format with configurable quality
 *
 * @param imageData - Raw image bytes (JPEG, PNG, or GIF)
 * @param maxDimension - Maximum size for the longest edge in pixels
 * @param logger - Structured logger instance for request-scoped logging
 * @param quality - JPEG quality (0.0 to 1.0, default 0.85)
 * @returns Resized image as JPEG bytes
 */
async function resizeImage(
  imageData: Uint8Array,
  maxDimension: number,
  logger: StructuredLogger,
  quality: number = JPEG_QUALITY
): Promise<Uint8Array> {
  const startTime = Date.now();

  try {
    // Decode the image using ImageScript
    const image = await Image.decode(imageData);
    const originalWidth = image.width;
    const originalHeight = image.height;

    logger.info('resize_image_start', {
      metadata: {
        max_dimension: maxDimension,
        quality,
        original_width: originalWidth,
        original_height: originalHeight,
      },
    });

    // Determine the longest edge
    const longestEdge = Math.max(originalWidth, originalHeight);

    // Only resize if the image exceeds maxDimension (no upscaling)
    if (longestEdge > maxDimension) {
      // Calculate scale factor to constrain longest edge to maxDimension
      const scaleFactor = maxDimension / longestEdge;
      const newWidth = Math.round(originalWidth * scaleFactor);
      const newHeight = Math.round(originalHeight * scaleFactor);

      // Resize the image using RESIZE_AUTO for best quality
      // ImageScript's resize method maintains aspect ratio when both dimensions provided
      image.resize(newWidth, newHeight);

      logger.info('resize_image_resized', {
        metadata: {
          new_width: newWidth,
          new_height: newHeight,
          scale_factor: scaleFactor,
        },
      });
    } else {
      logger.info('resize_image_skip', {
        metadata: {
          reason: 'image_smaller_than_max',
          longest_edge: longestEdge,
          max_dimension: maxDimension,
        },
      });
    }

    // Encode to JPEG with specified quality
    // ImageScript quality is 1-100, convert from 0.0-1.0
    const jpegQuality = Math.round(quality * 100);
    const outputData = await image.encodeJPEG(jpegQuality);

    const durationMs = Date.now() - startTime;
    logger.info('resize_image_complete', {
      duration_ms: durationMs,
      metadata: {
        input_size_bytes: imageData.length,
        output_size_bytes: outputData.length,
      },
    });

    return outputData;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('resize_image_failed', {
      duration_ms: durationMs,
      error_message: errorMessage,
      metadata: { max_dimension: maxDimension },
    });

    // Classify as permanent error since invalid image data can't be retried
    throw createClassifiedError(
      `Image resize failed: ${errorMessage}`,
      'permanent',
      'unsupported_format',
      'internal'
    );
  }
}

/**
 * Generates a square thumbnail from the source image using a contain/letterbox strategy.
 *
 * Creates consistent square thumbnails optimized for grid views:
 * - Resizes image to fit within target square (preserving aspect ratio)
 * - Centers the resized image on a white square canvas
 * - No cropping - entire item remains visible
 * - Outputs JPEG for small file size
 *
 * This approach is ideal for wardrobe items where:
 * - Background is already removed (white fill blends naturally)
 * - Full garment visibility is important
 * - Grid layout requires consistent dimensions
 *
 * @param imageData - Raw image bytes (JPEG, PNG, or GIF)
 * @param size - Target square dimension in pixels (e.g., 200 for 200x200)
 * @param logger - Structured logger instance for request-scoped logging
 * @param quality - JPEG quality (0.0 to 1.0, default 0.90 for thumbnails)
 * @returns Square thumbnail as JPEG bytes
 */
async function generateThumbnail(
  imageData: Uint8Array,
  size: number,
  logger: StructuredLogger,
  quality: number = 0.9
): Promise<Uint8Array> {
  const startTime = Date.now();

  try {
    // Decode the source image
    const sourceImage = await Image.decode(imageData);
    const sourceWidth = sourceImage.width;
    const sourceHeight = sourceImage.height;

    logger.info('generate_thumbnail_start', {
      metadata: {
        target_size: size,
        quality,
        source_width: sourceWidth,
        source_height: sourceHeight,
      },
    });

    // Calculate scale to fit within target square (contain strategy)
    const longestEdge = Math.max(sourceWidth, sourceHeight);
    const scale = Math.min(size / longestEdge, 1); // Don't upscale

    const scaledWidth = Math.round(sourceWidth * scale);
    const scaledHeight = Math.round(sourceHeight * scale);

    // Resize the source image to fit within the square
    sourceImage.resize(scaledWidth, scaledHeight);

    // Create a square canvas with white background
    // ImageScript uses RGBA format: 0xRRGGBBAA
    const WHITE_BACKGROUND = 0xffffffff;
    const canvas = new Image(size, size);
    canvas.fill(WHITE_BACKGROUND);

    // Calculate position to center the resized image on the canvas
    const offsetX = Math.round((size - scaledWidth) / 2);
    const offsetY = Math.round((size - scaledHeight) / 2);

    // Composite the resized image onto the white canvas
    canvas.composite(sourceImage, offsetX, offsetY);

    logger.info('generate_thumbnail_composed', {
      metadata: {
        scaled_width: scaledWidth,
        scaled_height: scaledHeight,
        offset_x: offsetX,
        offset_y: offsetY,
        canvas_size: size,
      },
    });

    // Encode to JPEG with specified quality
    // Use slightly higher quality for thumbnails since they're already small
    const jpegQuality = Math.round(quality * 100);
    const outputData = await canvas.encodeJPEG(jpegQuality);

    const durationMs = Date.now() - startTime;
    logger.info('generate_thumbnail_complete', {
      duration_ms: durationMs,
      metadata: {
        input_size_bytes: imageData.length,
        output_size_bytes: outputData.length,
        target_size: size,
      },
    });

    return outputData;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('generate_thumbnail_failed', {
      duration_ms: durationMs,
      error_message: errorMessage,
      metadata: { target_size: size },
    });

    // Classify as permanent error since invalid image data can't be retried
    throw createClassifiedError(
      `Thumbnail generation failed: ${errorMessage}`,
      'permanent',
      'unsupported_format',
      'internal'
    );
  }
}

// ============================================================================
// Job Processing Functions
// ============================================================================

/**
 * Configuration for processing
 */
interface ProcessingConfig {
  replicateApiKey: string;
  replicateModel: string;
  timeoutMs: number;
  thumbnailSize: number;
  cleanMaxDimension: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  staleJobThresholdMs: number;
  maxConcurrency: number;
}

/**
 * Processes a single item through the image pipeline
 */
async function processItem(
  supabase: SupabaseClient,
  itemId: string,
  config: ProcessingConfig,
  logger: StructuredLogger,
  jobId?: number
): Promise<{ userId: string; durationMs: number }> {
  const startTime = Date.now();
  let userId = '';

  logger.info('job_started', { item_id: itemId, job_id: jobId });

  // Step 1: Fetch and validate item
  const { data: item, error: fetchError } = await supabase
    .from('items')
    .select('id, user_id, original_key, clean_key, thumb_key, image_processing_status')
    .eq('id', itemId)
    .single();

  if (fetchError) {
    throw createClassifiedError(
      `Failed to fetch item: ${fetchError.message}`,
      'transient',
      'server_error',
      'internal'
    );
  }

  if (!item) {
    throw createClassifiedError('Item not found', 'permanent', 'not_found', 'internal');
  }

  const typedItem = item as ItemRecord;
  userId = typedItem.user_id;

  if (!typedItem.original_key) {
    throw createClassifiedError('Item has no original_key', 'permanent', 'validation', 'internal');
  }

  if (!ELIGIBLE_STATUSES.includes(typedItem.image_processing_status)) {
    throw createClassifiedError(
      `Item status '${typedItem.image_processing_status}' not eligible for processing`,
      'permanent',
      'validation',
      'internal'
    );
  }

  // Step 2: Atomically update status to 'processing'
  const { error: updateError } = await supabase
    .from('items')
    .update({ image_processing_status: 'processing' })
    .eq('id', itemId)
    .eq('image_processing_status', typedItem.image_processing_status);

  if (updateError) {
    throw createClassifiedError(
      `Failed to update item status: ${updateError.message}`,
      'transient',
      'server_error',
      'internal'
    );
  }

  try {
    // Step 3: Download original image
    const originalImage = await downloadImage(supabase, typedItem.original_key, logger);

    // Step 4: Call background removal provider
    const cleanImage = await removeBackground(
      originalImage,
      config.replicateApiKey,
      config.replicateModel,
      config.timeoutMs,
      logger
    );

    // Step 5: Generate clean image (resize if needed) and thumbnail
    const resizedCleanImage = await resizeImage(cleanImage, config.cleanMaxDimension, logger);
    const thumbnail = await generateThumbnail(cleanImage, config.thumbnailSize, logger);

    // Step 6: Upload clean and thumb to deterministic paths
    const pathInfo = parseStoragePath(typedItem.original_key);
    if (!pathInfo) {
      throw createClassifiedError(
        `Invalid original_key path format: ${typedItem.original_key}`,
        'permanent',
        'validation',
        'internal'
      );
    }

    const { cleanKey, thumbKey } = generateOutputPaths(pathInfo.userId, pathInfo.itemId);

    // Upload both images (upsert ensures idempotency)
    await uploadImage(supabase, cleanKey, resizedCleanImage, logger);
    await uploadImage(supabase, thumbKey, thumbnail, logger);

    // Step 7: Update item with storage keys and success status
    // Only set keys after BOTH uploads succeed
    const { error: finalUpdateError } = await supabase
      .from('items')
      .update({
        clean_key: cleanKey,
        thumb_key: thumbKey,
        image_processing_status: 'succeeded',
      })
      .eq('id', itemId);

    if (finalUpdateError) {
      throw createClassifiedError(
        `Failed to update item with results: ${finalUpdateError.message}`,
        'transient',
        'server_error',
        'internal'
      );
    }

    const durationMs = Date.now() - startTime;
    logger.info('job_completed', {
      item_id: itemId,
      user_id: userId,
      job_id: jobId,
      duration_ms: durationMs,
    });

    return { userId, durationMs };
  } catch (processingError) {
    const durationMs = Date.now() - startTime;
    const classifiedError = classifyError(processingError, 'internal');

    // On failure, clear any partial state and set to failed
    // This ensures we don't have inconsistent clean_key/thumb_key
    await supabase
      .from('items')
      .update({
        clean_key: null,
        thumb_key: null,
        image_processing_status: 'failed',
      })
      .eq('id', itemId);

    logger.error('job_failed', {
      item_id: itemId,
      user_id: userId,
      job_id: jobId,
      duration_ms: durationMs,
      error_category: classifiedError.category,
      error_code: classifiedError.code,
      error_message: classifiedError.message,
      metadata: { provider: classifiedError.provider },
    });

    throw classifiedError;
  }
}

/**
 * Processes a job from the job queue with retry logic
 */
async function processJob(
  supabase: SupabaseClient,
  job: JobRecord,
  config: ProcessingConfig,
  logger: StructuredLogger
): Promise<JobResult> {
  const startTime = Date.now();
  const newAttemptCount = job.attempt_count + 1;

  logger.info('job_pickup', {
    job_id: job.id,
    item_id: job.item_id,
    metadata: { attempt_count: newAttemptCount },
  });

  // Update job to processing status
  const { error: jobUpdateError } = await supabase
    .from('image_processing_jobs')
    .update({
      status: 'processing',
      started_at: new Date().toISOString(),
      attempt_count: newAttemptCount,
    })
    .eq('id', job.id);

  if (jobUpdateError) {
    throw createClassifiedError(
      `Failed to update job status: ${jobUpdateError.message}`,
      'transient',
      'server_error',
      'internal'
    );
  }

  try {
    const { durationMs } = await processItem(supabase, job.item_id, config, logger, job.id);

    // Mark job as completed
    await supabase
      .from('image_processing_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        processing_duration_ms: durationMs,
        error_category: null,
        error_code: null,
        error_provider: null,
        last_error: null,
      })
      .eq('id', job.id);

    return {
      itemId: job.item_id,
      jobId: job.id,
      success: true,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const classifiedError = classifyError(error, 'internal');

    // Determine if we should retry or mark as permanently failed
    const shouldRetry =
      classifiedError.category === 'transient' && newAttemptCount < job.max_attempts;

    const jobUpdate: Record<string, unknown> = {
      status: shouldRetry ? 'pending' : 'failed',
      last_error: classifiedError.message,
      error_category: classifiedError.category,
      error_code: classifiedError.code,
      error_provider: classifiedError.provider,
      processing_duration_ms: durationMs,
      completed_at: shouldRetry ? null : new Date().toISOString(),
    };

    // Set next retry time if retrying
    if (shouldRetry) {
      jobUpdate.next_retry_at = calculateNextRetryAt(
        newAttemptCount,
        config.retryBaseDelayMs,
        config.retryMaxDelayMs
      );
      logger.info('job_retry_scheduled', {
        job_id: job.id,
        item_id: job.item_id,
        error_category: classifiedError.category,
        error_code: classifiedError.code,
        metadata: {
          attempt_count: newAttemptCount,
          next_retry_at: jobUpdate.next_retry_at as string,
        },
      });
    } else {
      // Update item status to failed (already done in processItem, but ensure consistency)
      await supabase
        .from('items')
        .update({
          clean_key: null,
          thumb_key: null,
          image_processing_status: 'failed',
        })
        .eq('id', job.item_id);

      logger.error('job_permanently_failed', {
        job_id: job.id,
        item_id: job.item_id,
        error_category: classifiedError.category,
        error_code: classifiedError.code,
        error_message: classifiedError.message,
        metadata: {
          attempt_count: newAttemptCount,
          max_attempts: job.max_attempts,
          provider: classifiedError.provider,
        },
      });
    }

    await supabase.from('image_processing_jobs').update(jobUpdate).eq('id', job.id);

    return {
      itemId: job.item_id,
      jobId: job.id,
      success: false,
      error: classifiedError.message,
      errorCode: classifiedError.code,
      errorCategory: classifiedError.category,
      durationMs,
    };
  }
}

/**
 * Processes an array of jobs with controlled concurrency.
 *
 * Splits jobs into chunks of maxConcurrency and processes each chunk in parallel
 * using Promise.all. This balances throughput with resource usage and rate limits.
 *
 * @param jobs - Array of jobs to process
 * @param supabase - Supabase client
 * @param config - Processing configuration
 * @param logger - Structured logger instance for request-scoped logging
 * @returns Aggregated results from all processed jobs
 */
async function processJobsWithConcurrency(
  jobs: JobRecord[],
  supabase: SupabaseClient,
  config: ProcessingConfig,
  logger: StructuredLogger
): Promise<{ processed: number; failed: number; results: JobResult[] }> {
  const results: JobResult[] = [];
  let processed = 0;
  let failed = 0;

  // Process jobs in chunks of maxConcurrency
  for (let i = 0; i < jobs.length; i += config.maxConcurrency) {
    const chunk = jobs.slice(i, i + config.maxConcurrency);
    const chunkIndex = Math.floor(i / config.maxConcurrency);

    logger.info('concurrent_chunk_start', {
      metadata: {
        chunk_index: chunkIndex,
        chunk_size: chunk.length,
        max_concurrency: config.maxConcurrency,
        total_jobs: jobs.length,
      },
    });

    // Process chunk in parallel
    const chunkResults = await Promise.all(
      chunk.map((job) => processJob(supabase, job, config, logger))
    );

    // Aggregate results
    for (const result of chunkResults) {
      results.push(result);
      if (result.success) {
        processed++;
      } else {
        failed++;
      }
    }

    logger.info('concurrent_chunk_complete', {
      metadata: {
        chunk_index: chunkIndex,
        chunk_processed: chunkResults.filter((r) => r.success).length,
        chunk_failed: chunkResults.filter((r) => !r.success).length,
      },
    });
  }

  return { processed, failed, results };
}

/**
 * Polls the job queue and processes pending jobs with controlled concurrency.
 *
 * Jobs are processed in parallel batches up to config.maxConcurrency (default: 5)
 * to balance throughput with rate limits and memory constraints.
 */
async function processJobQueue(
  supabase: SupabaseClient,
  batchSize: number,
  config: ProcessingConfig,
  logger: StructuredLogger
): Promise<{ processed: number; failed: number; results: JobResult[] }> {
  logger.info('queue_poll_start', {
    metadata: { batch_size: batchSize, max_concurrency: config.maxConcurrency },
  });

  // Fetch pending jobs that are ready for retry (next_retry_at is null or <= now)
  const { data: jobs, error: queryError } = await supabase
    .from('image_processing_jobs')
    .select('id, item_id, original_key, status, attempt_count, max_attempts, started_at')
    .eq('status', 'pending')
    .or(`next_retry_at.is.null,next_retry_at.lte.${new Date().toISOString()}`)
    .order('created_at', { ascending: true })
    .limit(batchSize);

  if (queryError) {
    throw createClassifiedError(
      `Failed to query job queue: ${queryError.message}`,
      'transient',
      'server_error',
      'internal'
    );
  }

  const typedJobs = (jobs || []) as JobRecord[];
  logger.info('queue_poll_complete', { metadata: { jobs_found: typedJobs.length } });

  if (typedJobs.length === 0) {
    return { processed: 0, failed: 0, results: [] };
  }

  // Process jobs with controlled concurrency
  const { processed, failed, results } = await processJobsWithConcurrency(
    typedJobs,
    supabase,
    config,
    logger
  );

  logger.info('queue_batch_complete', {
    metadata: {
      processed,
      failed,
      total: typedJobs.length,
      max_concurrency: config.maxConcurrency,
    },
  });

  return { processed, failed, results };
}

/**
 * Recovers stale jobs that have been stuck in 'processing' status
 */
async function recoverStaleJobs(
  supabase: SupabaseClient,
  config: ProcessingConfig,
  logger: StructuredLogger
): Promise<{ recovered: number; results: JobResult[] }> {
  const thresholdTime = new Date(Date.now() - config.staleJobThresholdMs).toISOString();

  logger.info('stale_recovery_start', {
    metadata: { threshold_ms: config.staleJobThresholdMs, threshold_time: thresholdTime },
  });

  // Find jobs stuck in processing
  const { data: staleJobs, error: queryError } = await supabase
    .from('image_processing_jobs')
    .select('id, item_id, original_key, status, attempt_count, max_attempts, started_at')
    .eq('status', 'processing')
    .lt('started_at', thresholdTime);

  if (queryError) {
    throw createClassifiedError(
      `Failed to query stale jobs: ${queryError.message}`,
      'transient',
      'server_error',
      'internal'
    );
  }

  const typedStaleJobs = (staleJobs || []) as JobRecord[];
  logger.info('stale_jobs_found', { metadata: { count: typedStaleJobs.length } });

  const results: JobResult[] = [];
  let recovered = 0;

  for (const job of typedStaleJobs) {
    const canRetry = job.attempt_count < job.max_attempts;

    logger.warn('stale_job_recovered', {
      job_id: job.id,
      item_id: job.item_id,
      metadata: {
        attempt_count: job.attempt_count,
        max_attempts: job.max_attempts,
        started_at: job.started_at,
        action: canRetry ? 'reset_to_pending' : 'mark_as_failed',
      },
    });

    if (canRetry) {
      // Reset to pending with next retry time
      await supabase
        .from('image_processing_jobs')
        .update({
          status: 'pending',
          last_error: 'Job timed out (stale processing)',
          error_category: 'transient',
          error_code: 'timeout',
          error_provider: 'internal',
          next_retry_at: calculateNextRetryAt(
            job.attempt_count,
            config.retryBaseDelayMs,
            config.retryMaxDelayMs
          ),
        })
        .eq('id', job.id);

      // Reset item status to pending so it can be reprocessed
      await supabase
        .from('items')
        .update({ image_processing_status: 'pending' })
        .eq('id', job.item_id);
    } else {
      // Mark as permanently failed
      await supabase
        .from('image_processing_jobs')
        .update({
          status: 'failed',
          last_error: 'Job exceeded max attempts after stale recovery',
          error_category: 'permanent',
          error_code: 'timeout',
          error_provider: 'internal',
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      // Mark item as failed and clear any partial state
      await supabase
        .from('items')
        .update({
          clean_key: null,
          thumb_key: null,
          image_processing_status: 'failed',
        })
        .eq('id', job.item_id);
    }

    recovered++;
    results.push({
      itemId: job.item_id,
      jobId: job.id,
      success: canRetry, // Successful recovery if it can retry
      error: canRetry ? undefined : 'Exceeded max attempts',
      errorCode: 'timeout',
      errorCategory: canRetry ? 'transient' : 'permanent',
    });
  }

  logger.info('stale_recovery_complete', { metadata: { recovered } });
  return { recovered, results };
}

// ============================================================================
// Main Handler
// ============================================================================

/**
 * Main handler for image processing requests.
 */
export async function handler(req: Request): Promise<Response> {
  // Create per-request logger with correlation ID
  // This ensures correlation IDs cannot leak between concurrent requests
  const correlationId = getOrGenerateCorrelationId(req);
  const logger = createLogger(FUNCTION_NAME, correlationId);

  if (req.method !== 'POST') {
    return jsonResponse(
      { success: false, error: 'Method not allowed', code: 'validation', correlationId },
      405
    );
  }

  logger.info('request_received');

  try {
    // Load configuration from environment (needed even when feature disabled for skip updates)
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    // Check feature flag first - safe default is disabled
    // Server-side decision: client cannot override this behaviour
    //
    // PRIVACY GUARANTEE:
    // When image cleanup is disabled, we rely ENTIRELY on client-side EXIF stripping.
    // The mobile client (imageUpload.ts) uses expo-image-manipulator to re-encode all
    // images to JPEG, which strips EXIF metadata before upload. This is a MANDATORY
    // privacy protection that runs regardless of this feature flag.
    //
    // Even when this flag is OFF:
    // - Original images are already EXIF-free (stripped client-side)
    // - No clean/thumb variants are generated (original serves both purposes)
    // - User privacy is maintained through client-side enforcement
    if (!isImageCleanupEnabled()) {
      logger.info('feature_disabled', {
        metadata: {
          feature: 'wardrobe_image_cleanup',
          privacy_note: 'EXIF stripping enforced client-side before upload',
        },
      });

      // If a specific itemId was provided, mark it as 'skipped' so it doesn't remain
      // in 'pending' state forever. This provides clear status tracking.
      if (supabaseUrl && supabaseServiceKey) {
        let requestBody: ProcessItemImageRequest = {};
        try {
          const text = await req.text();
          if (text) {
            requestBody = JSON.parse(text);
          }
        } catch {
          // Ignore parse errors for feature-disabled path
        }

        if (requestBody.itemId && isValidUuid(requestBody.itemId)) {
          const supabase = createClient(supabaseUrl, supabaseServiceKey);
          const { error: updateError } = await supabase
            .from('items')
            .update({ image_processing_status: 'skipped' })
            .eq('id', requestBody.itemId)
            .eq('image_processing_status', 'pending');

          if (updateError) {
            logger.warn('skip_status_update_failed', {
              item_id: requestBody.itemId,
              error_message: updateError.message,
            });
          } else {
            logger.info('item_marked_skipped', {
              item_id: requestBody.itemId,
              skip_reason: 'feature_disabled',
            });
          }

          return jsonResponse(
            {
              success: true,
              processed: 0,
              failed: 0,
              skipped: 1,
              results: [{ itemId: requestBody.itemId, success: true, skipped: true }],
              correlationId,
            },
            200
          );
        }
      }

      return jsonResponse(
        {
          success: true,
          processed: 0,
          failed: 0,
          results: [],
          correlationId,
        },
        200
      );
    }

    // Load remaining configuration (supabaseUrl and supabaseServiceKey already loaded above)
    const replicateApiKey = Deno.env.get('REPLICATE_API_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      logger.error('config_missing', { metadata: { missing: 'SUPABASE_URL or SERVICE_KEY' } });
      return jsonResponse(
        { success: false, error: 'Service configuration error', code: 'server', correlationId },
        500
      );
    }

    if (!replicateApiKey) {
      logger.error('config_missing', { metadata: { missing: 'REPLICATE_API_KEY' } });
      return jsonResponse(
        {
          success: false,
          error: 'Image processing service not configured',
          code: 'server',
          correlationId,
        },
        500
      );
    }

    // Parse configuration with defaults
    const config: ProcessingConfig = {
      replicateApiKey,
      replicateModel: Deno.env.get('REPLICATE_MODEL_VERSION') || DEFAULT_REPLICATE_MODEL,
      timeoutMs: parseInt(
        Deno.env.get('IMAGE_PROCESSING_TIMEOUT_MS') || String(DEFAULT_TIMEOUT_MS),
        10
      ),
      thumbnailSize: parseInt(Deno.env.get('THUMBNAIL_SIZE') || String(DEFAULT_THUMBNAIL_SIZE), 10),
      cleanMaxDimension: parseInt(
        Deno.env.get('CLEAN_IMAGE_MAX_DIMENSION') || String(DEFAULT_CLEAN_MAX_DIMENSION),
        10
      ),
      retryBaseDelayMs: parseInt(
        Deno.env.get('RETRY_BASE_DELAY_MS') || String(DEFAULT_RETRY_BASE_DELAY_MS),
        10
      ),
      retryMaxDelayMs: parseInt(
        Deno.env.get('RETRY_MAX_DELAY_MS') || String(DEFAULT_RETRY_MAX_DELAY_MS),
        10
      ),
      staleJobThresholdMs: parseInt(
        Deno.env.get('STALE_JOB_THRESHOLD_MS') || String(DEFAULT_STALE_JOB_THRESHOLD_MS),
        10
      ),
      maxConcurrency: parseInt(
        Deno.env.get('MAX_CONCURRENT_JOBS') || String(DEFAULT_MAX_CONCURRENCY),
        10
      ),
    };

    // Parse request body
    let requestBody: ProcessItemImageRequest = {};
    try {
      const text = await req.text();
      if (text) {
        requestBody = JSON.parse(text);
      }
    } catch {
      return jsonResponse(
        { success: false, error: 'Invalid request body', code: 'validation', correlationId },
        400
      );
    }

    // Create Supabase client with service role (bypasses RLS)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Handle stale job recovery mode
    if (requestBody.recoverStale) {
      const { recovered, results } = await recoverStaleJobs(supabase, config, logger);

      // If also processing queue, continue; otherwise return
      if (!requestBody.itemId && !requestBody.batchSize) {
        return jsonResponse(
          {
            success: true,
            recovered,
            results,
            correlationId,
          },
          200
        );
      }

      // Continue to queue processing but include recovery results
      const queueBatchSize = Math.min(
        requestBody.batchSize || DEFAULT_BATCH_SIZE,
        DEFAULT_BATCH_SIZE
      );

      const queueResults = await processJobQueue(supabase, queueBatchSize, config, logger);

      return jsonResponse(
        {
          success: true,
          processed: queueResults.processed,
          failed: queueResults.failed,
          recovered,
          results: [...results, ...queueResults.results],
          correlationId,
        },
        200
      );
    }

    // Handle direct mode
    if (requestBody.itemId) {
      const { itemId } = requestBody;

      if (!isValidUuid(itemId)) {
        return jsonResponse(
          { success: false, error: 'Invalid itemId format', code: 'validation', correlationId },
          400
        );
      }

      try {
        const { durationMs } = await processItem(supabase, itemId, config, logger);
        return jsonResponse(
          {
            success: true,
            processed: 1,
            failed: 0,
            results: [{ itemId, success: true, durationMs }],
            correlationId,
          },
          200
        );
      } catch (error) {
        const classifiedError = classifyError(error, 'internal');
        return jsonResponse(
          {
            success: false,
            processed: 0,
            failed: 1,
            results: [
              {
                itemId,
                success: false,
                error: classifiedError.message,
                errorCode: classifiedError.code,
                errorCategory: classifiedError.category,
              },
            ],
            error: classifiedError.message,
            code: 'processing',
            correlationId,
          },
          200
        );
      }
    }

    // Handle queue mode (default)
    const batchSize = Math.min(requestBody.batchSize || DEFAULT_BATCH_SIZE, DEFAULT_BATCH_SIZE);
    const { processed, failed, results } = await processJobQueue(
      supabase,
      batchSize,
      config,
      logger
    );

    return jsonResponse(
      {
        success: true,
        processed,
        failed,
        results,
        correlationId,
      },
      200
    );
  } catch (error) {
    const classifiedError = classifyError(error, 'internal');
    logger.error('unexpected_error', {
      error_message: classifiedError.message,
      error_category: classifiedError.category,
      error_code: classifiedError.code,
    });
    return jsonResponse(
      { success: false, error: 'Unexpected error', code: 'server', correlationId },
      500
    );
  }
}

// Wire the handler to Deno's HTTP server
serve(handler);
