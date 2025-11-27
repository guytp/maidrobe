/**
 * Detect Item Attributes Edge Function
 *
 * Handles AI-based attribute detection for wardrobe items using GPT-4o vision.
 * This function can be invoked in multiple modes:
 * 1. Direct mode: Process a specific item by itemId
 * 2. Queue mode: Poll attribute_detection_jobs table for pending jobs
 * 3. Recovery mode: Scan for and recover stale jobs stuck in processing
 *
 * PROCESSING PIPELINE:
 * 1. Validate configuration (API keys, feature flag)
 * 2. Load item record and determine source image key (clean_key preferred)
 * 3. Generate short-lived pre-signed URL for the image
 * 4. Call GPT-4o vision API with strict JSON-only prompt
 * 5. Parse and validate response (canonicalisation in Step 4)
 * 6. Update item with detected attributes and status
 *
 * ERROR HANDLING:
 * - Categorizes errors as 'transient' (retry) or 'permanent' (no retry)
 * - Maps to attribute_error_reason: timeout, invalid_json, missing_image,
 *   rate_limited, config_error
 * - All code paths end in 'succeeded' or 'failed' - never stuck in 'processing'
 *
 * SECURITY:
 * - Uses service role to bypass RLS (background job pattern)
 * - Validates user ownership of items even with elevated privileges
 * - Uses short-lived pre-signed URLs (5 minutes) for image access
 * - No raw image data or secrets in logs
 *
 * REQUEST:
 * POST /detect-item-attributes
 * Body: {
 *   itemId?: string,       // Direct mode: process specific item
 *   batchSize?: number,    // Queue mode: max jobs to process (default: 10)
 *   recoverStale?: boolean // Recovery mode: scan for stale jobs
 * }
 *
 * ENVIRONMENT VARIABLES:
 * - SUPABASE_URL: Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Service role key for bypassing RLS
 * - OPENAI_API_KEY: OpenAI API key for GPT-4o
 * - OPENAI_MODEL: Model name (default: gpt-4o)
 * - ATTRIBUTE_DETECTION_ENABLED: Feature flag (default: true)
 * - DETECTION_TIMEOUT_MS: API timeout (default: 15000)
 * - SIGNED_URL_EXPIRY_SECONDS: Pre-signed URL expiry (default: 300)
 * - MAX_CONCURRENT_JOBS: Parallel job limit (default: 5)
 * - RETRY_BASE_DELAY_MS: Base delay for retries (default: 1000)
 * - RETRY_MAX_DELAY_MS: Max delay for retries (default: 60000)
 * - STALE_JOB_THRESHOLD_MS: Time before job is stale (default: 300000)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

import {
  canonicaliseAttributes,
  hasAnyAttributes,
  type CanonicalisedAttributes,
  type CanonicalisationResult,
} from './canonicalise.ts';
import { isAIAttributesEnabled } from '../_shared/featureFlags.ts';
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
 * Normalized error codes matching attribute_error_reason in items table
 */
type AttributeErrorCode =
  | 'timeout'
  | 'invalid_json'
  | 'missing_image'
  | 'rate_limited'
  | 'config_error';

/**
 * Extended error codes for internal tracking (includes transient network errors)
 */
type ErrorCode = AttributeErrorCode | 'network' | 'server_error' | 'unknown';

/**
 * Provider identifiers for error attribution
 */
type Provider = 'storage' | 'openai' | 'internal';

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
interface DetectAttributesRequest {
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
  /** True if processing was skipped (e.g., feature flag disabled) */
  skipped?: boolean;
  error?: string;
  errorCode?: ErrorCode;
  errorCategory?: ErrorCategory;
  durationMs?: number;
}

/**
 * Response body schema
 */
interface DetectAttributesResponse {
  success: boolean;
  processed?: number;
  failed?: number;
  recovered?: number;
  skipped?: number;
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
  attribute_status: string;
  type: string | null;
  colour: string[] | null;
  pattern: string | null;
  fabric: string | null;
  season: string[] | null;
  fit: string | null;
}

/**
 * Job record from attribute_detection_jobs table
 */
interface JobRecord {
  id: number;
  item_id: string;
  image_key: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  started_at: string | null;
}

/**
 * OpenAI API response structure
 */
interface OpenAIResponse {
  id: string;
  choices: Array<{
    message: {
      content: string;
    };
    finish_reason: string;
  }>;
  error?: {
    message: string;
    type: string;
    code: string;
  };
}

/**
 * Function name for logging
 */
const FUNCTION_NAME = 'detect-item-attributes';

/**
 * Processing configuration loaded from environment
 */
interface ProcessingConfig {
  openaiApiKey: string;
  openaiModel: string;
  timeoutMs: number;
  signedUrlExpirySeconds: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  staleJobThresholdMs: number;
  maxConcurrency: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Storage bucket for wardrobe items */
const STORAGE_BUCKET = 'wardrobe-items';

/** OpenAI API endpoint */
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

/** Default model for attribute detection */
const DEFAULT_OPENAI_MODEL = 'gpt-4o';

/** Default timeout for OpenAI API calls (15 seconds per story requirement) */
const DEFAULT_TIMEOUT_MS = 15000;

/** Default pre-signed URL expiry (5 minutes) */
const DEFAULT_SIGNED_URL_EXPIRY_SECONDS = 300;

/** Default batch size for queue processing */
const DEFAULT_BATCH_SIZE = 10;

/** Default max concurrent jobs */
const DEFAULT_MAX_CONCURRENCY = 5;

/** Default base delay for exponential backoff */
const DEFAULT_RETRY_BASE_DELAY_MS = 1000;

/** Default maximum retry delay */
const DEFAULT_RETRY_MAX_DELAY_MS = 60000;

/** Default threshold for stale job detection (5 minutes) */
const DEFAULT_STALE_JOB_THRESHOLD_MS = 300000;

/** Valid statuses for processing eligibility */
const ELIGIBLE_STATUSES = ['pending', 'failed'];

/**
 * System prompt for GPT-4o to detect garment attributes.
 * Instructs the model to return strict JSON with specific fields.
 */
const DETECTION_PROMPT = `You are a fashion analysis assistant. Analyze this clothing item image and return a JSON object with the following fields:

- type: The garment type as a single string (e.g., "t-shirt", "dress", "jeans", "jacket", "skirt", "sweater", "coat", "shorts", "blouse", "hoodie", "cardigan", "trousers", "polo", "tank top", "suit", "blazer")
- colour: An array of colour names present in the garment (e.g., ["blue", "white"], ["black"], ["red", "navy"])
- pattern: The pattern type as a string if applicable (e.g., "solid", "striped", "checked", "floral", "geometric", "abstract", "animal print", "polka dot", "plaid", "camo")
- fabric: The likely fabric type as a string (e.g., "cotton", "denim", "wool", "polyester", "silk", "linen", "leather", "knit", "fleece", "velvet")
- season: An array of suitable seasons (e.g., ["spring", "summer"], ["autumn", "winter"], ["all-season"])
- fit: The fit style as a string (e.g., "slim", "regular", "relaxed", "oversized", "fitted", "loose")

Rules:
1. Return ONLY valid JSON, no other text or explanation
2. Use lowercase for all values
3. For colour, list the most prominent colours first (max 3)
4. If you cannot determine a field with confidence, omit it from the response
5. For season, use "all-season" if the item is versatile

Example response:
{"type":"t-shirt","colour":["navy","white"],"pattern":"striped","fabric":"cotton","season":["spring","summer"],"fit":"regular"}`;

// ============================================================================
// Processing Summary Types
// ============================================================================

/**
 * Consolidated processing summary for observability.
 *
 * This interface defines the single summary log entry emitted at the end
 * of each item processing attempt, containing all fields required for
 * monitoring and debugging without exposing sensitive data.
 *
 * Privacy guarantees:
 * - No raw image data or base64 content
 * - No bucket paths or storage keys
 * - No API keys or secrets
 * - No PII beyond user/item IDs
 */
interface ProcessingSummary {
  /** Item being processed (UUID) */
  itemId: string;
  /** Owner of the item (UUID) */
  userId: string;
  /** AI provider used (e.g., 'openai') */
  modelProvider: string;
  /** Specific model name (e.g., 'gpt-4o') */
  modelName: string;
  /** ISO 8601 timestamp when processing started */
  startTimestamp: string;
  /** ISO 8601 timestamp when processing completed */
  endTimestamp: string;
  /** Total processing time in milliseconds */
  durationMs: number;
  /** Final status: 'succeeded' or 'failed' */
  attributeStatus: 'succeeded' | 'failed';
  /** Error reason if failed, null if succeeded */
  attributeErrorReason: AttributeErrorCode | null;
}

/**
 * Emits a consolidated processing summary log entry.
 *
 * This function outputs a single structured JSON log containing all
 * information needed for monitoring and debugging attribute detection:
 * - Item and user identifiers (IDs only, no PII)
 * - Model provider and name for attribution
 * - Timing information (start, end, duration)
 * - Final status and error reason
 *
 * The log explicitly excludes:
 * - Raw image data or URLs
 * - Storage bucket paths or keys
 * - API keys or authentication tokens
 * - Personal information beyond IDs
 *
 * @param summary - Processing summary data
 * @param logger - Structured logger instance for request-scoped logging
 */
function emitProcessingSummary(summary: ProcessingSummary, logger: StructuredLogger): void {
  const logData = {
    item_id: summary.itemId,
    user_id: summary.userId,
    duration_ms: summary.durationMs,
    metadata: {
      model_provider: summary.modelProvider,
      model_name: summary.modelName,
      start_timestamp: summary.startTimestamp,
      end_timestamp: summary.endTimestamp,
      attribute_status: summary.attributeStatus,
      attribute_error_reason: summary.attributeErrorReason,
    },
  };

  if (summary.attributeStatus === 'failed') {
    logger.error('attribute_detection_summary', logData);
  } else {
    logger.info('attribute_detection_summary', logData);
  }
}

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
 * @param status - HTTP status code
 * @param _provider - Provider for future provider-specific handling (currently unused)
 */
function classifyHttpStatus(
  status: number,
  _provider: Provider
): { category: ErrorCategory; code: ErrorCode } {
  // Rate limiting - transient
  if (status === 429) {
    return { category: 'transient', code: 'rate_limited' };
  }

  // Server errors - transient (can retry)
  if (status >= 500) {
    return { category: 'transient', code: 'server_error' };
  }

  // Auth errors - permanent (config issue)
  if (status === 401 || status === 403) {
    return { category: 'permanent', code: 'config_error' };
  }

  // Not found - permanent
  if (status === 404) {
    return { category: 'permanent', code: 'missing_image' };
  }

  // Other client errors - permanent
  if (status >= 400) {
    return { category: 'permanent', code: 'invalid_json' };
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
    lowerMessage.includes('deadline') ||
    lowerMessage.includes('aborted')
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
    lowerMessage.includes('dns') ||
    lowerMessage.includes('fetch failed')
  ) {
    return createClassifiedError(message, 'transient', 'network', provider);
  }

  // Rate limit indicators - transient
  if (lowerMessage.includes('rate limit') || lowerMessage.includes('too many requests')) {
    return createClassifiedError(message, 'transient', 'rate_limited', provider);
  }

  // JSON parsing errors - permanent
  if (
    lowerMessage.includes('json') ||
    lowerMessage.includes('parse') ||
    lowerMessage.includes('unexpected token')
  ) {
    return createClassifiedError(message, 'permanent', 'invalid_json', provider);
  }

  // Not found - permanent
  if (lowerMessage.includes('not found') || lowerMessage.includes('does not exist')) {
    return createClassifiedError(message, 'permanent', 'missing_image', provider);
  }

  // Default to transient for unknown errors (safer to retry)
  return createClassifiedError(message, 'transient', 'unknown', provider);
}

/**
 * Maps internal error codes to attribute_error_reason values stored in the database.
 * Some internal codes (network, server_error, unknown) map to more specific DB codes.
 */
function mapToAttributeErrorReason(code: ErrorCode): AttributeErrorCode {
  switch (code) {
    case 'timeout':
    case 'invalid_json':
    case 'missing_image':
    case 'rate_limited':
    case 'config_error':
      return code;
    case 'network':
    case 'server_error':
      // Network and server errors are transient, but if they cause permanent failure,
      // we store them as timeout (closest match for "couldn't reach service")
      return 'timeout';
    case 'unknown':
    default:
      return 'config_error';
  }
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
function jsonResponse(body: DetectAttributesResponse, status: number): Response {
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

// ============================================================================
// Storage Operations
// ============================================================================

/**
 * Generates a short-lived pre-signed URL for an image.
 * Used to provide GPT-4o access to the image without exposing permanent URLs.
 */
async function generateSignedUrl(
  supabase: SupabaseClient,
  imageKey: string,
  expirySeconds: number,
  logger: StructuredLogger
): Promise<string> {
  logger.info('signed_url_generate_start', { metadata: { expiry_seconds: expirySeconds } });

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(imageKey, expirySeconds);

  if (error) {
    const lowerMessage = error.message.toLowerCase();
    if (lowerMessage.includes('not found') || lowerMessage.includes('404')) {
      throw createClassifiedError(
        `Image not found: ${imageKey}`,
        'permanent',
        'missing_image',
        'storage',
        404
      );
    }
    throw createClassifiedError(
      `Failed to generate signed URL: ${error.message}`,
      'transient',
      'server_error',
      'storage'
    );
  }

  if (!data?.signedUrl) {
    throw createClassifiedError(
      'Signed URL generation returned empty result',
      'permanent',
      'missing_image',
      'storage'
    );
  }

  logger.info('signed_url_generate_complete');
  return data.signedUrl;
}

// ============================================================================
// OpenAI API Integration
// ============================================================================

/**
 * Calls GPT-4o vision API to detect garment attributes from an image.
 *
 * This function:
 * 1. Sends the image to GPT-4o with the detection prompt
 * 2. Parses the JSON response
 * 3. Validates the response structure (type checking)
 * 4. Canonicalises values to internal labels
 *
 * Returns canonicalised attributes ready for persistence.
 * Throws ClassifiedError on any failure (network, timeout, invalid response).
 */
async function callOpenAIVision(
  imageUrl: string,
  apiKey: string,
  model: string,
  timeoutMs: number,
  logger: StructuredLogger
): Promise<CanonicalisedAttributes> {
  logger.info('openai_request_start', { metadata: { model, timeout_ms: timeoutMs } });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: DETECTION_PROMPT,
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl,
                  detail: 'low', // Use low detail for faster processing
                },
              },
            ],
          },
        ],
        max_tokens: 500,
        temperature: 0.1, // Low temperature for consistent outputs
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Handle HTTP errors
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      const { category, code } = classifyHttpStatus(response.status, 'openai');

      logger.error('openai_http_error', {
        error_category: category,
        error_code: code,
        metadata: { http_status: response.status },
      });

      throw createClassifiedError(
        `OpenAI API error: ${response.status} - ${errorText}`,
        category,
        code,
        'openai',
        response.status
      );
    }

    // Parse response
    const data = (await response.json()) as OpenAIResponse;

    // Check for API-level errors
    if (data.error) {
      throw createClassifiedError(
        `OpenAI API error: ${data.error.message}`,
        'permanent',
        'config_error',
        'openai'
      );
    }

    // Extract content from response
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw createClassifiedError(
        'OpenAI returned empty response',
        'permanent',
        'invalid_json',
        'openai'
      );
    }

    logger.info('openai_response_received', {
      metadata: {
        finish_reason: data.choices?.[0]?.finish_reason,
        content_length: content.length,
      },
    });

    // Parse JSON from response
    let rawAttributes: unknown;
    try {
      // Try to extract JSON from the response (handle potential markdown wrapping)
      let jsonContent = content.trim();

      // Remove markdown code block if present
      if (jsonContent.startsWith('```json')) {
        jsonContent = jsonContent.slice(7);
      } else if (jsonContent.startsWith('```')) {
        jsonContent = jsonContent.slice(3);
      }
      if (jsonContent.endsWith('```')) {
        jsonContent = jsonContent.slice(0, -3);
      }
      jsonContent = jsonContent.trim();

      rawAttributes = JSON.parse(jsonContent);
    } catch (parseError) {
      logger.error('openai_json_parse_error', {
        error_message: parseError instanceof Error ? parseError.message : String(parseError),
        metadata: { content_preview: content.substring(0, 100) },
      });

      throw createClassifiedError(
        `Failed to parse OpenAI response as JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
        'permanent',
        'invalid_json',
        'openai'
      );
    }

    // Validate structure and canonicalise attributes
    const canonResult: CanonicalisationResult = canonicaliseAttributes(rawAttributes);

    if (!canonResult.valid || !canonResult.attributes) {
      logger.error('openai_validation_error', {
        error_message: canonResult.error,
        metadata: { content_preview: content.substring(0, 100) },
      });

      throw createClassifiedError(
        `Invalid attribute structure: ${canonResult.error}`,
        'permanent',
        'invalid_json',
        'openai'
      );
    }

    const canonicalised = canonResult.attributes;

    logger.info('openai_request_complete', {
      metadata: {
        has_type: canonicalised.type !== null,
        has_colour: canonicalised.colour !== null && canonicalised.colour.length > 0,
        has_season: canonicalised.season !== null && canonicalised.season.length > 0,
        has_pattern: canonicalised.pattern !== null,
        has_fabric: canonicalised.fabric !== null,
        has_fit: canonicalised.fit !== null,
        has_any_attributes: hasAnyAttributes(canonicalised),
      },
    });

    return canonicalised;
  } catch (error) {
    clearTimeout(timeoutId);

    // Handle abort/timeout specifically
    if (error instanceof Error && error.name === 'AbortError') {
      throw createClassifiedError(
        `OpenAI request timed out after ${timeoutMs}ms`,
        'transient',
        'timeout',
        'openai'
      );
    }

    // Re-throw if already classified
    if (error instanceof Error && 'category' in error) {
      throw error;
    }

    // Classify and re-throw
    throw classifyError(error, 'openai');
  }
}

// ============================================================================
// Item Processing Functions
// ============================================================================

/**
 * Updates an item with failed status and error reason.
 * Ensures items never remain stuck in 'processing'.
 */
async function markItemFailed(
  supabase: SupabaseClient,
  itemId: string,
  errorCode: ErrorCode,
  logger: StructuredLogger
): Promise<void> {
  const attributeErrorReason = mapToAttributeErrorReason(errorCode);

  const { error } = await supabase
    .from('items')
    .update({
      attribute_status: 'failed',
      attribute_error_reason: attributeErrorReason,
      attribute_last_run_at: new Date().toISOString(),
    })
    .eq('id', itemId);

  if (error) {
    logger.error('item_update_failed', {
      item_id: itemId,
      error_message: error.message,
    });
  }
}

/**
 * Updates an item with successful detection results.
 *
 * Persists canonicalised attributes to the database:
 * - Sets all attribute columns (type, colour, pattern, fabric, season, fit)
 * - Sets attribute_status to 'succeeded'
 * - Clears attribute_error_reason to null
 * - Sets attribute_last_run_at to current timestamp
 *
 * The update is idempotent - later successful runs cleanly overwrite prior values.
 * Empty arrays are converted to null for consistency with PostgreSQL conventions.
 */
async function markItemSucceeded(
  supabase: SupabaseClient,
  itemId: string,
  attributes: CanonicalisedAttributes
): Promise<void> {
  // Convert empty arrays to null for database consistency
  // This distinguishes "no colours detected" from "not yet processed"
  const colourValue =
    attributes.colour !== null && attributes.colour.length > 0 ? attributes.colour : null;
  const seasonValue =
    attributes.season !== null && attributes.season.length > 0 ? attributes.season : null;

  const { error } = await supabase
    .from('items')
    .update({
      attribute_status: 'succeeded',
      attribute_error_reason: null,
      attribute_last_run_at: new Date().toISOString(),
      // Single-value fields: null if not detected
      type: attributes.type,
      pattern: attributes.pattern,
      fabric: attributes.fabric,
      fit: attributes.fit,
      // Array fields: null if empty or not detected
      colour: colourValue,
      season: seasonValue,
    })
    .eq('id', itemId);

  if (error) {
    throw createClassifiedError(
      `Failed to update item with attributes: ${error.message}`,
      'transient',
      'server_error',
      'internal'
    );
  }
}

/**
 * Processes a single item through the attribute detection pipeline.
 *
 * Pipeline steps:
 * 1. Fetch and validate item record
 * 2. Determine source image key (clean_key preferred)
 * 3. Check eligibility status
 * 4. Atomically claim item for processing
 * 5. Generate pre-signed URL
 * 6. Call OpenAI Vision API (with canonicalisation)
 * 7. Persist canonicalised attributes
 *
 * @param supabase - Supabase client with service role
 * @param itemId - ID of the item to process
 * @param config - Processing configuration
 * @param logger - Structured logger instance for request-scoped logging
 * @param jobId - Optional job ID for logging
 * @returns Processing result with user ID, duration, and canonicalised attributes
 */
async function processItem(
  supabase: SupabaseClient,
  itemId: string,
  config: ProcessingConfig,
  logger: StructuredLogger,
  jobId?: number
): Promise<{ userId: string; durationMs: number; attributes: CanonicalisedAttributes }> {
  const startTime = Date.now();
  let userId = '';

  logger.info('item_processing_start', { item_id: itemId, job_id: jobId });

  // Step 1: Fetch and validate item
  const { data: item, error: fetchError } = await supabase
    .from('items')
    .select(
      'id, user_id, original_key, clean_key, attribute_status, type, colour, pattern, fabric, season, fit'
    )
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
    throw createClassifiedError('Item not found', 'permanent', 'missing_image', 'internal');
  }

  const typedItem = item as ItemRecord;
  userId = typedItem.user_id;

  // Step 2: Determine image key (clean_key preferred, original_key fallback)
  const imageKey = typedItem.clean_key ?? typedItem.original_key;

  if (!imageKey) {
    logger.warn('item_no_image_key', { item_id: itemId, user_id: userId });

    await markItemFailed(supabase, itemId, 'missing_image', logger);

    throw createClassifiedError(
      'Item has no valid image key (clean_key or original_key)',
      'permanent',
      'missing_image',
      'internal'
    );
  }

  // Step 3: Check if item status is eligible
  if (!ELIGIBLE_STATUSES.includes(typedItem.attribute_status)) {
    throw createClassifiedError(
      `Item status '${typedItem.attribute_status}' not eligible for processing`,
      'permanent',
      'config_error',
      'internal'
    );
  }

  // Step 4: Atomically update status to 'processing'
  const { error: updateError, count } = await supabase
    .from('items')
    .update({ attribute_status: 'processing' })
    .eq('id', itemId)
    .in('attribute_status', ELIGIBLE_STATUSES);

  if (updateError) {
    throw createClassifiedError(
      `Failed to update item status: ${updateError.message}`,
      'transient',
      'server_error',
      'internal'
    );
  }

  // If no rows updated, item was already claimed by another worker
  if (count === 0) {
    throw createClassifiedError(
      'Item already being processed by another worker',
      'permanent',
      'config_error',
      'internal'
    );
  }

  try {
    // Step 5: Generate pre-signed URL for the image
    const signedUrl = await generateSignedUrl(supabase, imageKey, config.signedUrlExpirySeconds, logger);

    // Step 6: Call OpenAI Vision API
    const attributes = await callOpenAIVision(
      signedUrl,
      config.openaiApiKey,
      config.openaiModel,
      config.timeoutMs,
      logger
    );

    // Step 7: Update item with results
    await markItemSucceeded(supabase, itemId, attributes);

    const durationMs = Date.now() - startTime;

    logger.info('item_processing_complete', {
      item_id: itemId,
      user_id: userId,
      job_id: jobId,
      duration_ms: durationMs,
      metadata: {
        model: config.openaiModel,
        attribute_status: 'succeeded',
      },
    });

    // Emit consolidated summary log for observability
    // Contains all required fields per FR 7.1-7.4
    // Explicitly avoids: raw image data, bucket paths, secrets, PII beyond IDs
    emitProcessingSummary({
      itemId,
      userId,
      modelProvider: 'openai',
      modelName: config.openaiModel,
      startTimestamp: new Date(startTime).toISOString(),
      endTimestamp: new Date().toISOString(),
      durationMs,
      attributeStatus: 'succeeded',
      attributeErrorReason: null,
    }, logger);

    return { userId, durationMs, attributes };
  } catch (processingError) {
    const durationMs = Date.now() - startTime;
    const classifiedError = classifyError(processingError, 'internal');

    // Mark item as failed
    await markItemFailed(supabase, itemId, classifiedError.code, logger);

    const attributeErrorReason = mapToAttributeErrorReason(classifiedError.code);

    logger.error('item_processing_failed', {
      item_id: itemId,
      user_id: userId,
      job_id: jobId,
      duration_ms: durationMs,
      error_category: classifiedError.category,
      error_code: classifiedError.code,
      error_message: classifiedError.message,
      metadata: {
        model: config.openaiModel,
        provider: classifiedError.provider,
        attribute_status: 'failed',
      },
    });

    // Emit consolidated summary log for observability
    emitProcessingSummary({
      itemId,
      userId,
      modelProvider: 'openai',
      modelName: config.openaiModel,
      startTimestamp: new Date(startTime).toISOString(),
      endTimestamp: new Date().toISOString(),
      durationMs,
      attributeStatus: 'failed',
      attributeErrorReason,
    }, logger);

    throw classifiedError;
  }
}

// ============================================================================
// Job Queue Processing
// ============================================================================

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
    .from('attribute_detection_jobs')
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
      .from('attribute_detection_jobs')
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

    // Determine if we should retry
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

    await supabase.from('attribute_detection_jobs').update(jobUpdate).eq('id', job.id);

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
 * Processes multiple jobs with controlled concurrency
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
 * Polls the job queue and processes pending jobs
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

  // Fetch pending jobs that are ready for retry
  const { data: jobs, error: queryError } = await supabase
    .from('attribute_detection_jobs')
    .select('id, item_id, image_key, status, attempt_count, max_attempts, started_at')
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
 * Recovers stale jobs stuck in 'processing' status
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
    .from('attribute_detection_jobs')
    .select('id, item_id, image_key, status, attempt_count, max_attempts, started_at')
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
        .from('attribute_detection_jobs')
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

      // Reset item status to pending
      await supabase
        .from('items')
        .update({
          attribute_status: 'pending',
          attribute_error_reason: null,
        })
        .eq('id', job.item_id);
    } else {
      // Mark as permanently failed
      await supabase
        .from('attribute_detection_jobs')
        .update({
          status: 'failed',
          last_error: 'Job exceeded max attempts after stale recovery',
          error_category: 'permanent',
          error_code: 'timeout',
          error_provider: 'internal',
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      // Mark item as failed
      await markItemFailed(supabase, job.item_id, 'timeout', logger);
    }

    recovered++;
    results.push({
      itemId: job.item_id,
      jobId: job.id,
      success: canRetry,
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
 * Main handler for attribute detection requests.
 * Exported for unit testing.
 */
export async function handler(req: Request): Promise<Response> {
  // Create per-request logger with correlation ID
  // This ensures correlation IDs cannot leak between concurrent requests
  const correlationId = getOrGenerateCorrelationId(req);
  const logger = createLogger(FUNCTION_NAME, correlationId);

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed', code: 'validation', correlationId }, 405);
  }

  logger.info('request_received');

  try {
    // Load Supabase configuration early - needed even when feature disabled for skip updates
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    // Check feature flag first - safe default is disabled
    // Server-side decision: client cannot override this behaviour
    // Uses shared feature flag module for consistency with other edge functions
    if (!isAIAttributesEnabled()) {
      logger.info('feature_disabled', { metadata: { feature: 'wardrobe_ai_attributes' } });

      // If a specific itemId was provided, mark it as 'skipped' so it doesn't remain
      // in 'pending' state forever. This provides clear status tracking.
      if (supabaseUrl && supabaseServiceKey) {
        let requestBody: DetectAttributesRequest = {};
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
            .update({ attribute_status: 'skipped' })
            .eq('id', requestBody.itemId)
            .eq('attribute_status', 'pending');

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
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    // Validate required configuration
    if (!supabaseUrl || !supabaseServiceKey) {
      logger.error('config_missing', { metadata: { missing: 'SUPABASE_URL or SERVICE_KEY' } });
      return jsonResponse(
        { success: false, error: 'Service configuration error', code: 'config_error', correlationId },
        500
      );
    }

    if (!openaiApiKey) {
      logger.error('config_missing', { metadata: { missing: 'OPENAI_API_KEY' } });
      return jsonResponse(
        { success: false, error: 'AI provider not configured', code: 'config_error', correlationId },
        500
      );
    }

    // Parse configuration with defaults
    const config: ProcessingConfig = {
      openaiApiKey,
      openaiModel: Deno.env.get('OPENAI_MODEL') || DEFAULT_OPENAI_MODEL,
      timeoutMs: parseInt(Deno.env.get('DETECTION_TIMEOUT_MS') || String(DEFAULT_TIMEOUT_MS), 10),
      signedUrlExpirySeconds: parseInt(
        Deno.env.get('SIGNED_URL_EXPIRY_SECONDS') || String(DEFAULT_SIGNED_URL_EXPIRY_SECONDS),
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
    let requestBody: DetectAttributesRequest = {};
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

      // If also processing queue, continue
      if (!requestBody.itemId && !requestBody.batchSize) {
        return jsonResponse(
          {
            success: true,
            recovered,
            processed: 0,
            failed: 0,
            results,
            correlationId,
          },
          200
        );
      }

      // Continue to queue processing
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

        // Mark item as failed in case processItem didn't complete the update
        await markItemFailed(supabase, itemId, classifiedError.code, logger);

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
            code: classifiedError.code,
            correlationId,
          },
          200
        );
      }
    }

    // Handle queue mode (default)
    const batchSize = Math.min(requestBody.batchSize || DEFAULT_BATCH_SIZE, DEFAULT_BATCH_SIZE);
    const { processed, failed, results } = await processJobQueue(supabase, batchSize, config, logger);

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
    return jsonResponse({ success: false, error: 'Unexpected error', code: 'server', correlationId }, 500);
  }
}

// Wire the handler to Deno's HTTP server
serve(handler);
