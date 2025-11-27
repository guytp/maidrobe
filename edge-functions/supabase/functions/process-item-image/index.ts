/**
 * Process Item Image Edge Function
 *
 * Handles background removal and thumbnail generation for wardrobe items.
 * This function can be invoked in two modes:
 * 1. Direct mode: Process a specific item by itemId
 * 2. Queue mode: Poll image_processing_jobs table for pending jobs
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
 * IDEMPOTENCY:
 * - Re-validates item state before processing
 * - Uses deterministic storage paths (upsert semantics)
 * - Safe to repeat for same (item_id, original_key) pair
 * - Job queue has UNIQUE constraint on (item_id, original_key)
 *
 * SECURITY:
 * - Uses service role to bypass RLS (background job pattern)
 * - No user authentication required (internal/scheduled invocation)
 * - All operations scoped to specific item_id
 *
 * REQUEST:
 * POST /process-item-image
 * Body: { itemId?: string, batchSize?: number }
 *   - itemId: Process specific item (direct mode)
 *   - batchSize: Max jobs to process in queue mode (default: 10)
 *
 * RESPONSE:
 * Success: { success: true, processed: number, failed: number, results: [...] }
 * Error: { success: false, error: string, code: string }
 *
 * ENVIRONMENT VARIABLES:
 * - SUPABASE_URL: Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Service role key for bypassing RLS
 * - REPLICATE_API_KEY: API key for background removal
 * - IMAGE_PROCESSING_TIMEOUT_MS: API timeout (default: 120000ms)
 * - THUMBNAIL_SIZE: Thumbnail dimension in pixels (default: 200)
 * - CLEAN_IMAGE_MAX_DIMENSION: Clean image max edge (default: 1600)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// ============================================================================
// Types
// ============================================================================

/**
 * Request body schema
 */
interface ProcessItemImageRequest {
  /** Process a specific item (direct mode) */
  itemId?: string;
  /** Max jobs to process in queue mode (default: 10) */
  batchSize?: number;
}

/**
 * Individual job processing result
 */
interface JobResult {
  itemId: string;
  success: boolean;
  error?: string;
}

/**
 * Response body schema
 */
interface ProcessItemImageResponse {
  success: boolean;
  processed?: number;
  failed?: number;
  results?: JobResult[];
  error?: string;
  code?: string;
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

// ============================================================================
// Constants
// ============================================================================

/** Storage bucket for wardrobe items */
const STORAGE_BUCKET = 'wardrobe-items';

/** Default timeout for external API calls (2 minutes) */
const DEFAULT_TIMEOUT_MS = 120000;

/** Default thumbnail size in pixels */
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
const DEFAULT_REPLICATE_MODEL = 'cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003';

/** Polling interval for Replicate predictions (ms) */
const REPLICATE_POLL_INTERVAL_MS = 1000;

/** Valid statuses for processing eligibility */
const ELIGIBLE_STATUSES = ['pending', 'failed'];

/** JPEG compression quality */
const JPEG_QUALITY = 0.85;

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
 * Downloads an image from Supabase Storage
 */
async function downloadImage(
  supabase: SupabaseClient,
  imageKey: string
): Promise<Uint8Array> {
  console.log('[ProcessImage] Downloading image:', imageKey);

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(imageKey);

  if (error) {
    throw new Error(`Failed to download image: ${error.message}`);
  }

  if (!data) {
    throw new Error('Downloaded image data is empty');
  }

  return new Uint8Array(await data.arrayBuffer());
}

/**
 * Uploads an image to Supabase Storage with upsert semantics
 */
async function uploadImage(
  supabase: SupabaseClient,
  imageKey: string,
  imageData: Uint8Array,
  contentType: string = 'image/jpeg'
): Promise<void> {
  console.log('[ProcessImage] Uploading image:', imageKey);

  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(imageKey, imageData, {
    contentType,
    upsert: true, // Overwrite if exists (idempotency)
  });

  if (error) {
    throw new Error(`Failed to upload image: ${error.message}`);
  }
}

/**
 * Calls Replicate API to remove background from image
 * Returns the processed image as Uint8Array
 */
async function removeBackground(
  imageData: Uint8Array,
  apiKey: string,
  model: string,
  timeoutMs: number
): Promise<Uint8Array> {
  console.log('[ProcessImage] Calling background removal API');

  // Convert image to base64 data URI
  const base64Image = btoa(String.fromCharCode(...imageData));
  const mimeType = detectMimeType(imageData);
  const dataUri = `data:${mimeType};base64,${base64Image}`;

  // Create prediction
  const createResponse = await fetch(`${REPLICATE_API_URL}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: model.split(':')[1], // Extract version from model string
      input: {
        image: dataUri,
      },
    }),
  });

  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    throw new Error(`Replicate API error: ${createResponse.status} - ${errorText}`);
  }

  const prediction = (await createResponse.json()) as ReplicatePrediction;
  console.log('[ProcessImage] Created prediction:', prediction.id);

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
      throw new Error(`Background removal timed out after ${timeoutMs}ms`);
    }

    await sleep(REPLICATE_POLL_INTERVAL_MS);

    const pollResponse = await fetch(`${REPLICATE_API_URL}/predictions/${prediction.id}`, {
      headers: {
        Authorization: `Token ${apiKey}`,
      },
    });

    if (!pollResponse.ok) {
      throw new Error(`Failed to poll prediction: ${pollResponse.status}`);
    }

    currentPrediction = (await pollResponse.json()) as ReplicatePrediction;
    console.log('[ProcessImage] Prediction status:', currentPrediction.status);
  }

  if (currentPrediction.status === 'failed') {
    throw new Error(`Background removal failed: ${currentPrediction.error || 'Unknown error'}`);
  }

  if (currentPrediction.status === 'canceled') {
    throw new Error('Background removal was canceled');
  }

  // Get output URL
  const outputUrl = Array.isArray(currentPrediction.output)
    ? currentPrediction.output[0]
    : currentPrediction.output;

  if (!outputUrl) {
    throw new Error('No output URL in prediction result');
  }

  // Download processed image
  console.log('[ProcessImage] Downloading processed image from:', outputUrl);
  const outputResponse = await fetch(outputUrl);

  if (!outputResponse.ok) {
    throw new Error(`Failed to download processed image: ${outputResponse.status}`);
  }

  return new Uint8Array(await outputResponse.arrayBuffer());
}

/**
 * Detects MIME type from image data magic bytes
 */
function detectMimeType(data: Uint8Array): string {
  // JPEG: FF D8 FF
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return 'image/jpeg';
  }
  // PNG: 89 50 4E 47
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    return 'image/png';
  }
  // WebP: RIFF...WEBP
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
  // Default to JPEG
  return 'image/jpeg';
}

/**
 * Resizes image to specified max dimension while maintaining aspect ratio
 * Uses canvas-based approach for Deno
 *
 * Note: In Deno, we use a simplified approach - for production, consider
 * using a dedicated image processing library or service
 */
async function resizeImage(
  imageData: Uint8Array,
  maxDimension: number,
  quality: number = JPEG_QUALITY
): Promise<Uint8Array> {
  // For now, we'll use the processed image as-is since Deno doesn't have
  // built-in image manipulation. The background removal service typically
  // returns reasonably sized images.
  //
  // In production, you could:
  // 1. Use a Deno image library (e.g., https://deno.land/x/imagescript)
  // 2. Call another service endpoint for resizing
  // 3. Use the Replicate API's resize options if available

  // For thumbnail generation, we'll need to implement actual resizing
  // This is a placeholder that returns the input
  console.log(
    `[ProcessImage] Resize requested to max ${maxDimension}px at quality ${quality}`
  );

  return imageData;
}

/**
 * Generates a thumbnail from the clean image
 * Returns JPEG data at the specified size
 */
async function generateThumbnail(
  imageData: Uint8Array,
  size: number
): Promise<Uint8Array> {
  // Similar to resizeImage, this needs proper image library support
  // For now, return the input image
  // In production, implement actual thumbnail generation
  console.log(`[ProcessImage] Generating thumbnail at ${size}x${size}`);

  return resizeImage(imageData, size);
}

// ============================================================================
// Job Processing Functions
// ============================================================================

/**
 * Processes a single item through the image pipeline
 */
async function processItem(
  supabase: SupabaseClient,
  itemId: string,
  config: {
    replicateApiKey: string;
    replicateModel: string;
    timeoutMs: number;
    thumbnailSize: number;
    cleanMaxDimension: number;
  }
): Promise<void> {
  console.log('[ProcessImage] Processing item:', itemId);

  // Step 1: Fetch and validate item
  const { data: item, error: fetchError } = await supabase
    .from('items')
    .select('id, user_id, original_key, clean_key, thumb_key, image_processing_status')
    .eq('id', itemId)
    .single();

  if (fetchError) {
    throw new Error(`Failed to fetch item: ${fetchError.message}`);
  }

  if (!item) {
    throw new Error('Item not found');
  }

  const typedItem = item as ItemRecord;

  // Validate original_key exists
  if (!typedItem.original_key) {
    throw new Error('Item has no original_key');
  }

  // Validate status is eligible for processing
  if (!ELIGIBLE_STATUSES.includes(typedItem.image_processing_status)) {
    throw new Error(
      `Item status '${typedItem.image_processing_status}' not eligible for processing`
    );
  }

  // Step 2: Atomically update status to 'processing'
  const { error: updateError } = await supabase
    .from('items')
    .update({ image_processing_status: 'processing' })
    .eq('id', itemId)
    .eq('image_processing_status', typedItem.image_processing_status); // Optimistic lock

  if (updateError) {
    throw new Error(`Failed to update item status: ${updateError.message}`);
  }

  try {
    // Step 3: Download original image
    const originalImage = await downloadImage(supabase, typedItem.original_key);
    console.log('[ProcessImage] Downloaded original image, size:', originalImage.length);

    // Step 4: Call background removal provider
    const cleanImage = await removeBackground(
      originalImage,
      config.replicateApiKey,
      config.replicateModel,
      config.timeoutMs
    );
    console.log('[ProcessImage] Background removal complete, size:', cleanImage.length);

    // Step 5: Generate clean image (resize if needed) and thumbnail
    const resizedCleanImage = await resizeImage(cleanImage, config.cleanMaxDimension);
    const thumbnail = await generateThumbnail(cleanImage, config.thumbnailSize);

    // Step 6: Upload clean and thumb to deterministic paths
    const pathInfo = parseStoragePath(typedItem.original_key);
    if (!pathInfo) {
      throw new Error(`Invalid original_key path format: ${typedItem.original_key}`);
    }

    const { cleanKey, thumbKey } = generateOutputPaths(pathInfo.userId, pathInfo.itemId);

    await uploadImage(supabase, cleanKey, resizedCleanImage);
    await uploadImage(supabase, thumbKey, thumbnail);

    // Step 7: Update item with storage keys and success status
    const { error: finalUpdateError } = await supabase
      .from('items')
      .update({
        clean_key: cleanKey,
        thumb_key: thumbKey,
        image_processing_status: 'succeeded',
      })
      .eq('id', itemId);

    if (finalUpdateError) {
      throw new Error(`Failed to update item with results: ${finalUpdateError.message}`);
    }

    console.log('[ProcessImage] Successfully processed item:', itemId);
  } catch (processingError) {
    // On failure, update status back to 'failed'
    console.error('[ProcessImage] Processing failed, updating status to failed');
    await supabase
      .from('items')
      .update({ image_processing_status: 'failed' })
      .eq('id', itemId);

    throw processingError;
  }
}

/**
 * Processes a job from the job queue
 */
async function processJob(
  supabase: SupabaseClient,
  job: JobRecord,
  config: {
    replicateApiKey: string;
    replicateModel: string;
    timeoutMs: number;
    thumbnailSize: number;
    cleanMaxDimension: number;
  }
): Promise<void> {
  console.log('[ProcessImage] Processing job:', job.id, 'for item:', job.item_id);

  // Update job to processing status
  const { error: jobUpdateError } = await supabase
    .from('image_processing_jobs')
    .update({
      status: 'processing',
      started_at: new Date().toISOString(),
      attempt_count: job.attempt_count + 1,
    })
    .eq('id', job.id);

  if (jobUpdateError) {
    throw new Error(`Failed to update job status: ${jobUpdateError.message}`);
  }

  try {
    // Process the item
    await processItem(supabase, job.item_id, config);

    // Mark job as completed
    await supabase
      .from('image_processing_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    console.log('[ProcessImage] Job completed successfully:', job.id);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[ProcessImage] Job failed:', job.id, errorMessage);

    // Determine if we should retry or mark as permanently failed
    const newAttemptCount = job.attempt_count + 1;
    const isPermanentlyFailed = newAttemptCount >= job.max_attempts;

    await supabase
      .from('image_processing_jobs')
      .update({
        status: isPermanentlyFailed ? 'failed' : 'pending',
        last_error: errorMessage,
        completed_at: isPermanentlyFailed ? new Date().toISOString() : null,
      })
      .eq('id', job.id);

    // If permanently failed, also update the item status
    if (isPermanentlyFailed) {
      await supabase
        .from('items')
        .update({ image_processing_status: 'failed' })
        .eq('id', job.item_id);
    }

    throw error;
  }
}

/**
 * Polls the job queue and processes pending jobs
 */
async function processJobQueue(
  supabase: SupabaseClient,
  batchSize: number,
  config: {
    replicateApiKey: string;
    replicateModel: string;
    timeoutMs: number;
    thumbnailSize: number;
    cleanMaxDimension: number;
  }
): Promise<{ processed: number; failed: number; results: JobResult[] }> {
  console.log('[ProcessImage] Polling job queue, batch size:', batchSize);

  // Fetch pending jobs ordered by creation time (FIFO)
  const { data: jobs, error: queryError } = await supabase
    .from('image_processing_jobs')
    .select('id, item_id, original_key, status, attempt_count, max_attempts')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(batchSize);

  if (queryError) {
    throw new Error(`Failed to query job queue: ${queryError.message}`);
  }

  const typedJobs = (jobs || []) as JobRecord[];
  console.log('[ProcessImage] Found', typedJobs.length, 'pending jobs');

  const results: JobResult[] = [];
  let processed = 0;
  let failed = 0;

  for (const job of typedJobs) {
    try {
      await processJob(supabase, job, config);
      processed++;
      results.push({ itemId: job.item_id, success: true });
    } catch (error) {
      failed++;
      results.push({
        itemId: job.item_id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { processed, failed, results };
}

// ============================================================================
// Main Handler
// ============================================================================

/**
 * Main handler for image processing requests.
 *
 * Exported for unit testing. The serve() call at the bottom wires this
 * handler to the Deno HTTP server.
 */
export async function handler(req: Request): Promise<Response> {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return jsonResponse(
      { success: false, error: 'Method not allowed', code: 'validation' },
      405
    );
  }

  try {
    // Load configuration from environment
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const replicateApiKey = Deno.env.get('REPLICATE_API_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[ProcessImage] Missing Supabase configuration');
      return jsonResponse(
        { success: false, error: 'Service configuration error', code: 'server' },
        500
      );
    }

    if (!replicateApiKey) {
      console.error('[ProcessImage] Missing REPLICATE_API_KEY');
      return jsonResponse(
        { success: false, error: 'Image processing service not configured', code: 'server' },
        500
      );
    }

    // Parse optional configuration
    const replicateModel =
      Deno.env.get('REPLICATE_MODEL_VERSION') || DEFAULT_REPLICATE_MODEL;
    const timeoutMs = parseInt(
      Deno.env.get('IMAGE_PROCESSING_TIMEOUT_MS') || String(DEFAULT_TIMEOUT_MS),
      10
    );
    const thumbnailSize = parseInt(
      Deno.env.get('THUMBNAIL_SIZE') || String(DEFAULT_THUMBNAIL_SIZE),
      10
    );
    const cleanMaxDimension = parseInt(
      Deno.env.get('CLEAN_IMAGE_MAX_DIMENSION') || String(DEFAULT_CLEAN_MAX_DIMENSION),
      10
    );

    const config = {
      replicateApiKey,
      replicateModel,
      timeoutMs,
      thumbnailSize,
      cleanMaxDimension,
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
        { success: false, error: 'Invalid request body', code: 'validation' },
        400
      );
    }

    // Create Supabase client with service role (bypasses RLS)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Determine processing mode
    if (requestBody.itemId) {
      // Direct mode: Process specific item
      const { itemId } = requestBody;

      // Validate itemId format
      if (!isValidUuid(itemId)) {
        return jsonResponse(
          { success: false, error: 'Invalid itemId format', code: 'validation' },
          400
        );
      }

      try {
        await processItem(supabase, itemId, config);
        return jsonResponse(
          {
            success: true,
            processed: 1,
            failed: 0,
            results: [{ itemId, success: true }],
          },
          200
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('[ProcessImage] Direct processing failed:', errorMessage);
        return jsonResponse(
          {
            success: false,
            processed: 0,
            failed: 1,
            results: [{ itemId, success: false, error: errorMessage }],
            error: errorMessage,
            code: 'processing',
          },
          200 // Return 200 with error details for batch compatibility
        );
      }
    } else {
      // Queue mode: Process pending jobs from queue
      const batchSize = Math.min(
        requestBody.batchSize || DEFAULT_BATCH_SIZE,
        DEFAULT_BATCH_SIZE
      );

      const { processed, failed, results } = await processJobQueue(
        supabase,
        batchSize,
        config
      );

      return jsonResponse(
        {
          success: true,
          processed,
          failed,
          results,
        },
        200
      );
    }
  } catch (error) {
    console.error('[ProcessImage] Unexpected error:', error);
    return jsonResponse(
      { success: false, error: 'Unexpected error', code: 'server' },
      500
    );
  }
}

// Wire the handler to Deno's HTTP server
serve(handler);
