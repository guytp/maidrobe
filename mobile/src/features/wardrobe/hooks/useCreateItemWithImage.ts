/**
 * Item creation orchestration hook for wardrobe feature.
 *
 * This hook orchestrates the complete item creation flow:
 * 1. Connectivity check - fail fast if offline
 * 2. Token refresh - transparent session validation before any writes (AC13)
 * 3. Generate stable itemId (cached for retries)
 * 4. Image preparation (resize to max 1600px, JPEG compression, EXIF stripping)
 * 5. Image upload to Supabase Storage (private bucket with RLS)
 * 6. Item record insertion to database
 * 7. Background pipeline trigger (image processing and AI classification)
 * 8. React Query cache invalidation
 *
 * Key Design Decisions:
 * - Single-flight semantics: Only one save operation at a time
 * - Stable itemId: Generated once, cached for retries to enable idempotent writes
 * - Fail fast offline: Check connectivity before starting any work
 * - Auth refresh: Transparent token refresh before writes prevents orphaned uploads
 *   and ensures RLS policies are evaluated with valid session (AC13)
 * - Cryptographic UUIDs: Uses crypto.getRandomValues() to generate non-guessable
 *   item IDs, preventing unauthorized access to private storage paths
 * - Externalized constants: Edge Function names defined in constants.ts for
 *   maintainability and refactoring safety across the codebase
 * - Telemetry: Structured events for monitoring save success/failure rates
 * - Error classification: Typed errors for appropriate user messaging
 * - Non-guessable storage path: user/{userId}/items/{itemId}/original.jpg
 *
 * SECURITY - RLS ENFORCEMENT:
 * ---------------------------
 * All database and storage operations use the authenticated Supabase client which
 * enforces Row Level Security (RLS) policies. This provides defense-in-depth:
 *
 * Database (items table):
 * - INSERT policy: `auth.uid() = user_id` - users can only create items for themselves
 * - SELECT/UPDATE/DELETE policies: `auth.uid() = user_id` - users can only access own items
 * - user_id is set from auth context, not from user input, preventing spoofing
 *
 * Storage (wardrobe-items bucket):
 * - Path-based RLS: Policies enforce `user/{auth.uid()}/...` path pattern
 * - Users can ONLY upload/read files in their own user folder
 * - Cross-user access is impossible at the storage layer
 *
 * PRIVACY - EXIF STRIPPING:
 * -------------------------
 * All images are processed through prepareImageForUpload() which uses
 * expo-image-manipulator to re-encode images as JPEG. This process STRIPS
 * all EXIF metadata (GPS, device info, timestamps) before upload.
 * See imageUpload.ts for detailed privacy guarantees.
 *
 * CROSS-USER ISOLATION:
 * ---------------------
 * Complete user isolation is enforced through multiple layers:
 * 1. Auth context: All operations use authenticated session with auth.uid()
 * 2. RLS policies: Database enforces user_id = auth.uid() on all operations
 * 3. Storage paths: Include user_id, enforced by storage policies
 * 4. Non-guessable IDs: UUIDv7 with crypto random prevents enumeration
 * 5. No PII in logs: Telemetry uses pseudonymous user IDs only
 *
 * @module features/wardrobe/hooks/useCreateItemWithImage
 */

// Polyfill for crypto.getRandomValues() in React Native
// Required for cryptographically secure random number generation
import 'react-native-get-random-values';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import { useStore } from '../../../core/state/store';
import { logSuccess, logError, trackCaptureEvent, logAuthEvent } from '../../../core/telemetry';
import { supabase } from '../../../services/supabase';
import { WardrobeItem } from '../../onboarding/types/wardrobeItem';
import { ItemType } from '../../onboarding/types/itemMetadata';
import {
  prepareImageForUpload,
  uploadImageToStorage,
  generateStoragePath,
  UploadError,
} from '../utils/imageUpload';
import { EDGE_FUNCTIONS } from '../constants';
import { generateCorrelationId, getCorrelationHeaders } from '../../../core/utils/correlationId';

/**
 * Error types for item creation failures.
 *
 * Used for error classification and appropriate user messaging:
 * - offline: Device has no network connectivity
 * - network: Network error during operation (connection reset, DNS failure)
 * - timeout: Operation timed out waiting for server response
 * - storage: Failed to upload image to Supabase Storage
 * - database: Failed to insert item record
 * - validation: Invalid input data
 * - auth: Authentication/session expired
 * - unknown: Unexpected error
 */
export type CreateItemErrorType =
  | 'offline'
  | 'network'
  | 'timeout'
  | 'storage'
  | 'database'
  | 'validation'
  | 'auth'
  | 'unknown';

/**
 * Retry configuration for bounded retry logic.
 */
const RETRY_CONFIG = {
  /** Maximum number of retry attempts for transient failures */
  maxRetries: 3,
  /** Initial delay before first retry in milliseconds */
  initialDelayMs: 1000,
  /** Maximum delay between retries in milliseconds */
  maxDelayMs: 10000,
  /** Exponential backoff multiplier */
  backoffMultiplier: 2,
} as const;

/**
 * User story #241 spec-compliant error type enum.
 * Maps internal error types to the analytics spec enum values.
 */
type SpecErrorType = 'network' | 'server_error' | 'validation' | 'timeout';

/**
 * Maps internal CreateItemErrorType to user story #241 spec-compliant error_type enum.
 *
 * Per spec, error_type should be one of: "network", "server_error", "validation", "timeout"
 *
 * @param errorType - Internal error type classification
 * @returns Spec-compliant error_type enum value
 */
function mapErrorTypeToSpecEnum(errorType: CreateItemErrorType): SpecErrorType {
  switch (errorType) {
    case 'offline':
    case 'network':
      return 'network';
    case 'timeout':
      return 'timeout';
    case 'storage':
    case 'database':
    case 'auth':
    case 'unknown':
      return 'server_error';
    case 'validation':
      return 'validation';
    default:
      return 'server_error';
  }
}

/**
 * Determines if an error message indicates a timeout.
 *
 * @param message - Error message to analyze
 * @returns true if the error indicates a timeout
 */
function isTimeoutError(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes('timeout') ||
    lowerMessage.includes('timed out') ||
    lowerMessage.includes('aborted') ||
    lowerMessage.includes('deadline exceeded')
  );
}

/**
 * Determines if an error is transient and should be retried.
 *
 * @param errorType - The classified error type
 * @returns true if the error is transient and retryable
 */
function isRetryableError(errorType: CreateItemErrorType): boolean {
  // Retry on transient errors: network issues, timeouts, server errors
  return errorType === 'network' || errorType === 'timeout' || errorType === 'storage';
}

/**
 * Calculates delay for exponential backoff.
 *
 * @param attempt - Current retry attempt (0-based)
 * @returns Delay in milliseconds with jitter
 */
function calculateRetryDelay(attempt: number): number {
  const exponentialDelay =
    RETRY_CONFIG.initialDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt);
  const cappedDelay = Math.min(exponentialDelay, RETRY_CONFIG.maxDelayMs);
  // Add jitter (±10%) to prevent thundering herd
  const jitter = cappedDelay * 0.1 * (Math.random() * 2 - 1);
  return Math.round(cappedDelay + jitter);
}

/**
 * Sleep for a specified duration.
 *
 * @param ms - Duration in milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * User-friendly error messages for each error type.
 */
const ERROR_MESSAGES: Record<CreateItemErrorType, string> = {
  offline: 'No internet connection. Please check your network and try again.',
  network: 'Connection error. Please check your network and try again.',
  timeout: 'The request timed out. Please try again.',
  storage: 'Failed to upload image. Please try again.',
  database: 'Failed to save item. Please try again.',
  validation: 'Invalid input. Please check your details and try again.',
  auth: 'Your session has expired. Please log in again.',
  unknown: 'An unexpected error occurred. Please try again.',
};

/**
 * Custom error class for item creation failures.
 *
 * Provides typed error classification for appropriate user messaging
 * and telemetry categorization.
 */
export class CreateItemWithImageError extends Error {
  constructor(
    message: string,
    public readonly errorType: CreateItemErrorType,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'CreateItemWithImageError';
  }
}

/**
 * Input data for item creation.
 */
export interface CreateItemInput {
  /** Local image URI from capture/crop flow */
  imageUri: string;
  /** Image width in pixels (from crop output) */
  imageWidth: number;
  /** Image height in pixels (from crop output) */
  imageHeight: number;
  /** Optional item name (max 80 chars) */
  name: string;
  /** Array of tags (max 20 tags, 30 chars each) */
  tags: string[];
}

/**
 * Result of successful item creation.
 */
export interface CreateItemResult {
  /** Created wardrobe item */
  item: WardrobeItem;
}

/**
 * Response shape from Supabase items table upsert with select().single().
 *
 * This interface represents the exact columns returned by the upsert operation
 * in the retry loop. Using a concrete type instead of `any` enables:
 * - Compile-time validation of property access
 * - IDE autocomplete and IntelliSense support
 * - Early detection of schema mismatches
 *
 * Fields match the columns inserted/selected in the upsert query.
 */
interface ItemUpsertResponse {
  /** Item UUID (UUIDv7 format) */
  id: string;
  /** User ID (foreign key to auth.users) */
  user_id: string;
  /** Optional item name */
  name: string | null;
  /** Optional tags array (lowercased) */
  tags: string[] | null;
  /** Storage path for original image */
  original_key: string;
  /** Image processing pipeline status */
  image_processing_status: string;
  /** AI attribute detection status */
  attribute_status: string;
  /** Creation timestamp (ISO 8601, UTC) */
  created_at: string;
}

/**
 * State returned by the useCreateItemWithImage hook.
 */
export interface UseCreateItemWithImageState {
  /** Whether a save operation is in progress */
  isLoading: boolean;
  /** Current error, if any */
  error: CreateItemWithImageError | null;
  /** The created item after successful save */
  result: CreateItemResult | null;
}

/**
 * Actions returned by the useCreateItemWithImage hook.
 */
export interface UseCreateItemWithImageActions {
  /**
   * Save the item with image upload.
   *
   * Orchestrates the complete save flow with single-flight semantics.
   * Returns the created item on success, throws on failure.
   *
   * @param input - Item data including image URI, name, and tags
   * @returns Created item result
   * @throws CreateItemWithImageError on failure
   */
  save: (input: CreateItemInput) => Promise<CreateItemResult>;

  /**
   * Reset the hook state.
   *
   * Clears error and result state, allowing a fresh save attempt.
   * Does NOT clear the cached itemId - that persists for retry idempotency.
   */
  reset: () => void;
}

/**
 * Hook for orchestrating item creation with image upload.
 *
 * Provides single-flight save semantics with:
 * - Connectivity checking before save
 * - Stable itemId generation (cached for retries)
 * - Structured telemetry events
 * - Error classification for appropriate user messaging
 *
 * @returns State and actions for item creation
 *
 * @example
 * ```tsx
 * function ReviewDetailsScreen() {
 *   const { save, isLoading, error, reset } = useCreateItemWithImage();
 *   const payload = useStore((state) => state.payload);
 *
 *   const handleSave = async () => {
 *     try {
 *       const result = await save({
 *         imageUri: payload.uri,
 *         imageWidth: payload.width,
 *         imageHeight: payload.height,
 *         name: 'My Item',
 *         tags: ['casual', 'summer'],
 *       });
 *       // Navigate to wardrobe on success
 *       router.push('/wardrobe');
 *     } catch (error) {
 *       // Error is available in hook state for display
 *     }
 *   };
 *
 *   return (
 *     <Button onPress={handleSave} disabled={isLoading}>
 *       {isLoading ? 'Saving...' : 'Save'}
 *     </Button>
 *   );
 * }
 * ```
 */
export function useCreateItemWithImage(): UseCreateItemWithImageState &
  UseCreateItemWithImageActions {
  const user = useStore((state) => state.user);
  const queryClient = useQueryClient();
  const router = useRouter();

  // Hook state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<CreateItemWithImageError | null>(null);
  const [result, setResult] = useState<CreateItemResult | null>(null);

  // Refs for single-flight semantics and stable itemId
  const isSavingRef = useRef(false);
  const cachedItemIdRef = useRef<string | null>(null);
  const retryCountRef = useRef(0);

  /**
   * Generate a stable UUIDv7 for the item.
   *
   * The ID is generated once and cached for retry idempotency.
   * This enables idempotent writes - if upload succeeds but DB insert
   * fails, retry will use the same ID and storage path.
   *
   * UUIDv7 format (RFC 9562):
   * - Bits 0-47: Unix timestamp in milliseconds (time-ordered)
   * - Bits 48-51: Version (7)
   * - Bits 52-63: Random data
   * - Bits 64-65: Variant (10)
   * - Bits 66-127: Random data
   *
   * Security Rationale:
   * Uses crypto.getRandomValues() instead of Math.random() for cryptographically
   * secure random number generation. This is critical because:
   *
   * - Threat Model: Item IDs are used in storage paths (user/{userId}/items/{itemId}/...)
   *   which are protected by Supabase RLS policies. If IDs were predictable, an
   *   attacker could enumerate storage paths and attempt unauthorized access.
   *
   * - Math.random() Weakness: JavaScript's Math.random() is NOT cryptographically
   *   secure. It uses a pseudo-random number generator (PRNG) that can be predicted
   *   if the attacker observes enough outputs or knows the seed. This makes IDs
   *   guessable.
   *
   * - crypto.getRandomValues(): Provides cryptographically strong random values
   *   suitable for security-sensitive operations. The random bits in the UUID
   *   are unpredictable, making item IDs non-guessable even if an attacker
   *   knows other item IDs or timing information.
   *
   * - Defense in Depth: While RLS policies prevent unauthorized database access,
   *   non-guessable IDs add an additional security layer by making storage paths
   *   unenumerable, protecting against potential RLS misconfigurations or bugs.
   */
  const getOrCreateItemId = useCallback((): string => {
    if (cachedItemIdRef.current) {
      return cachedItemIdRef.current;
    }

    // Generate UUIDv7 per RFC 9562
    const timestamp = Date.now();

    // Generate 10 bytes of cryptographically secure random data
    // Using crypto.getRandomValues ensures non-guessable IDs for security
    const randomBytes = new Uint8Array(10);
    crypto.getRandomValues(randomBytes);

    // Build the 16-byte UUID
    // Bytes 0-5: timestamp (48 bits, big-endian)
    // Byte 6: version (4 bits) + rand_a high (4 bits)
    // Byte 7: rand_a low (8 bits)
    // Byte 8: variant (2 bits) + rand_b high (6 bits)
    // Bytes 9-15: rand_b (56 bits)

    const bytes = new Uint8Array(16);

    // Timestamp (48 bits, big-endian)
    bytes[0] = (timestamp / 0x10000000000) & 0xff;
    bytes[1] = (timestamp / 0x100000000) & 0xff;
    bytes[2] = (timestamp / 0x1000000) & 0xff;
    bytes[3] = (timestamp / 0x10000) & 0xff;
    bytes[4] = (timestamp / 0x100) & 0xff;
    bytes[5] = timestamp & 0xff;

    // Version 7 (4 bits) + random (4 bits)
    bytes[6] = 0x70 | (randomBytes[0] & 0x0f);

    // Random (8 bits)
    bytes[7] = randomBytes[1];

    // Variant (2 bits = 10) + random (6 bits)
    bytes[8] = 0x80 | (randomBytes[2] & 0x3f);

    // Random (56 bits)
    bytes[9] = randomBytes[3];
    bytes[10] = randomBytes[4];
    bytes[11] = randomBytes[5];
    bytes[12] = randomBytes[6];
    bytes[13] = randomBytes[7];
    bytes[14] = randomBytes[8];
    bytes[15] = randomBytes[9];

    // Convert to hex string with hyphens
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;

    cachedItemIdRef.current = id;
    return id;
  }, []);

  /**
   * Check network connectivity.
   *
   * @returns true if online, false if offline
   */
  const checkConnectivity = useCallback(async (): Promise<boolean> => {
    const state = await NetInfo.fetch();
    return state.isConnected === true && state.isInternetReachable !== false;
  }, []);

  /**
   * Save the item with image upload.
   */
  const save = useCallback(
    async (input: CreateItemInput): Promise<CreateItemResult> => {
      // Single-flight check - prevent concurrent saves
      if (isSavingRef.current) {
        throw new CreateItemWithImageError('Save already in progress', 'validation');
      }

      const startTime = Date.now();

      // Validate user is authenticated
      if (!user?.id) {
        const err = new CreateItemWithImageError('User not authenticated', 'validation');
        setError(err);
        throw err;
      }

      // Start save operation
      isSavingRef.current = true;
      setIsLoading(true);
      setError(null);
      setResult(null);

      try {
        // Step 1: Check connectivity - fail fast if offline
        const isOnline = await checkConnectivity();
        if (!isOnline) {
          throw new CreateItemWithImageError(
            'No internet connection. Please check your connection and try again.',
            'offline'
          );
        }

        // Step 2: Attempt transparent token refresh before any writes (AC13)
        //
        // Security and Reliability Rationale:
        // This explicit pre-save token refresh is critical for preventing orphaned
        // uploads and ensuring data consistency when auth sessions expire during
        // the item creation flow.
        //
        // Problem Without Refresh:
        // - User starts the save flow with a valid session
        // - Session expires between image upload and database insert
        // - Image upload succeeds (storage write uses cached token)
        // - Database insert fails (RLS policy evaluated with expired token)
        // - Result: Orphaned image in storage, no database record, user sees error
        //
        // Solution With Explicit Refresh:
        // - Check and refresh session BEFORE any writes (storage or database)
        // - If refresh fails, route user to login immediately (no partial writes)
        // - If refresh succeeds, proceed with writes using fresh token
        // - All subsequent operations (upload + insert) use valid session
        // - RLS policies evaluate correctly for both storage and database
        //
        // Why This Matters:
        // - Data Consistency: Prevents orphaned files in storage
        // - User Experience: Clear auth failure before work starts, not mid-flow
        // - Security: Ensures all RLS policies evaluate with valid, fresh session
        // - Cost: Avoids wasted bandwidth uploading images that can't be saved
        //
        // Error Classification:
        // Token refresh failures are classified as network/server/user errors
        // based on error message analysis. This enables:
        // - Accurate telemetry for monitoring auth reliability
        // - Appropriate retry strategies (network errors may be transient)
        // - Better debugging of auth infrastructure issues
        //
        // Telemetry:
        // Both success and failure paths emit structured auth events with:
        // - Latency tracking for performance monitoring
        // - Error classification for root cause analysis
        // - Context metadata (operation: pre_save_refresh) for filtering
        // - Centralized error logging via logError() for aggregation
        const refreshStartTime = Date.now();
        try {
          const { data: sessionData, error: refreshError } = await supabase.auth.refreshSession();
          const refreshLatency = Date.now() - refreshStartTime;

          if (refreshError || !sessionData.session) {
            // Refresh failed - session is invalid or expired
            // Classify error type: auth/session vs network vs server
            const isNetworkError =
              refreshError?.message?.toLowerCase().includes('network') ||
              refreshError?.message?.toLowerCase().includes('fetch') ||
              refreshError?.message?.toLowerCase().includes('timeout') ||
              refreshError?.message?.toLowerCase().includes('connection');

            const isServerError =
              refreshError?.message?.toLowerCase().includes('500') ||
              refreshError?.message?.toLowerCase().includes('503') ||
              refreshError?.message?.toLowerCase().includes('502') ||
              refreshError?.message?.toLowerCase().includes('unavailable');

            const errorClassification = isNetworkError
              ? 'network'
              : isServerError
                ? 'server'
                : 'user';

            const authError = new CreateItemWithImageError(
              'Your session has expired. Please log in again.',
              'auth',
              refreshError || new Error('No session returned from refresh')
            );

            // Log auth event for failed refresh during save
            logAuthEvent('token-refresh-failure', {
              userId: user.id,
              errorCode: refreshError?.message || 'session_expired',
              outcome: 'failure',
              latency: refreshLatency,
              metadata: {
                context: 'item_save',
                operation: 'pre_save_refresh',
                errorClassification,
              },
            });

            // Log error for centralized error tracking
            logError(authError, errorClassification, {
              feature: 'wardrobe',
              operation: 'token_refresh_pre_save',
              metadata: {
                userId: user.id,
                context: 'item_save',
                latencyMs: refreshLatency,
              },
            });

            // Route user to login flow
            router.replace('/auth/login');

            throw authError;
          }

          // Refresh succeeded - log success
          logAuthEvent('token-refresh-success', {
            userId: user.id,
            outcome: 'success',
            latency: refreshLatency,
            metadata: {
              context: 'item_save',
              operation: 'pre_save_refresh',
            },
          });
        } catch (refreshError) {
          // Handle refresh attempt failure (network error, etc.)
          if (refreshError instanceof CreateItemWithImageError) {
            // Already wrapped and logged, re-throw
            throw refreshError;
          }

          const refreshLatency = Date.now() - refreshStartTime;

          // Classify unexpected error type
          const errorMessage =
            refreshError instanceof Error ? refreshError.message : String(refreshError);
          const isNetworkError =
            errorMessage.toLowerCase().includes('network') ||
            errorMessage.toLowerCase().includes('fetch') ||
            errorMessage.toLowerCase().includes('timeout') ||
            errorMessage.toLowerCase().includes('connection');

          const errorClassification = isNetworkError ? 'network' : 'server';

          // Wrap unexpected refresh error
          const authError = new CreateItemWithImageError(
            'Unable to verify your session. Please log in again.',
            'auth',
            refreshError
          );

          logAuthEvent('token-refresh-failure', {
            userId: user.id,
            errorCode: 'refresh_attempt_failed',
            outcome: 'failure',
            latency: refreshLatency,
            metadata: {
              context: 'item_save',
              operation: 'pre_save_refresh',
              errorClassification,
            },
          });

          // Log error for centralized error tracking
          logError(authError, errorClassification, {
            feature: 'wardrobe',
            operation: 'token_refresh_pre_save',
            metadata: {
              userId: user.id,
              context: 'item_save',
              latencyMs: refreshLatency,
              errorType: 'unexpected',
            },
          });

          router.replace('/auth/login');
          throw authError;
        }

        // Emit save started telemetry
        logSuccess('wardrobe', 'item_save_started', {
          data: {
            userId: user.id,
            hasName: input.name.trim().length > 0,
            tagCount: input.tags.length,
          },
        });

        // Step 3: Get or create stable itemId
        const itemId = getOrCreateItemId();
        const storagePath = generateStoragePath(user.id, itemId);

        // Steps 4-6 are wrapped in bounded retry logic for transient failures.
        // The retry loop handles network timeouts, connection errors, and storage
        // failures with exponential backoff. Non-retryable errors (auth, validation)
        // are thrown immediately.
        //
        // Idempotency:
        // - Image upload uses upsert (overwrites existing file)
        // - Database insert uses upsert with onConflict: 'id'
        // - Stable itemId (cached) ensures consistent paths across retries
        let lastError: CreateItemWithImageError | null = null;
        let dbData: ItemUpsertResponse | null = null;

        for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
          try {
            // Step 4: Process image (resize, compress, strip EXIF)
            // - Resize to max 1600px on longest edge (no upscaling if smaller)
            // - Compress to JPEG at 0.85 quality (~1.5MB typical)
            // - EXIF metadata stripped automatically by expo-image-manipulator
            const preparedImage = await prepareImageForUpload(
              input.imageUri,
              input.imageWidth,
              input.imageHeight
            );

            // Step 5: Upload image to Supabase Storage
            // - Uses authenticated client with RLS
            // - Upsert enabled for retry idempotency
            // - UploadError thrown with structured error type on failure
            await uploadImageToStorage(preparedImage, storagePath);

            // Step 6: Insert item record to database
            // Using upsert with onConflict: 'id' for retry idempotency
            // This ensures repeated calls with the same itemId are safe
            const trimmedName = input.name.trim();
            const normalizedTags =
              input.tags.length > 0 ? input.tags.map((tag) => tag.toLowerCase()) : null;

            const { data: insertData, error: dbError } = await supabase
              .from('items')
              .upsert(
                {
                  id: itemId,
                  user_id: user.id,
                  name: trimmedName || null,
                  tags: normalizedTags,
                  original_key: storagePath,
                  image_processing_status: 'pending',
                  attribute_status: 'pending',
                },
                { onConflict: 'id' }
              )
              .select()
              .single();

            if (dbError) {
              throw new CreateItemWithImageError(
                ERROR_MESSAGES.database,
                'database',
                dbError
              );
            }

            // Success - break out of retry loop
            dbData = insertData;
            retryCountRef.current = 0;
            break;
          } catch (retryError) {
            // Classify the error to determine if it's retryable
            let errorType: CreateItemErrorType = 'unknown';

            if (retryError instanceof CreateItemWithImageError) {
              errorType = retryError.errorType;
              lastError = retryError;
            } else if (retryError instanceof UploadError) {
              const errorTypeMap: Record<string, CreateItemErrorType> = {
                processing: 'storage',
                file_read: 'storage',
                network: 'network',
                storage: 'storage',
                permission: 'storage',
                unknown: 'unknown',
              };
              errorType = errorTypeMap[retryError.errorType] || 'unknown';
              lastError = new CreateItemWithImageError(
                ERROR_MESSAGES[errorType],
                errorType,
                retryError
              );
            } else if (retryError instanceof Error) {
              const lowerMessage = retryError.message.toLowerCase();
              if (isTimeoutError(retryError.message)) {
                errorType = 'timeout';
              } else if (
                lowerMessage.includes('network') ||
                lowerMessage.includes('fetch') ||
                lowerMessage.includes('connection')
              ) {
                errorType = 'network';
              } else if (
                lowerMessage.includes('storage') ||
                lowerMessage.includes('upload')
              ) {
                errorType = 'storage';
              }
              lastError = new CreateItemWithImageError(
                ERROR_MESSAGES[errorType],
                errorType,
                retryError
              );
            } else {
              lastError = new CreateItemWithImageError(
                ERROR_MESSAGES.unknown,
                'unknown',
                retryError
              );
            }

            // Check if error is retryable and we have attempts remaining
            const isRetryable = isRetryableError(errorType);
            const hasAttemptsRemaining = attempt < RETRY_CONFIG.maxRetries;

            if (isRetryable && hasAttemptsRemaining) {
              // Log retry attempt
              const delayMs = calculateRetryDelay(attempt);
              retryCountRef.current = attempt + 1;

              trackCaptureEvent('item_save_failed', {
                userId: user.id,
                errorType: lastError.errorType,
                metadata: {
                  retryAttempt: attempt + 1,
                  maxRetries: RETRY_CONFIG.maxRetries,
                  delayMs,
                  willRetry: true,
                },
              });

              // Wait before retrying
              await sleep(delayMs);
              continue;
            }

            // Non-retryable error or max retries exhausted - throw
            throw lastError;
          }
        }

        // If we exited the loop without dbData, throw the last error
        if (!dbData) {
          throw lastError || new CreateItemWithImageError(ERROR_MESSAGES.unknown, 'unknown');
        }

        // Construct created item from database response
        // Map database fields to WardrobeItem interface for UI consistency
        const item: WardrobeItem = {
          id: dbData.id,
          userId: dbData.user_id,
          photos: [storagePath],
          type: ItemType.Top, // Default type - will be set by classification pipeline
          colour: [], // Will be set by classification pipeline
          name: dbData.name || null,
          tags: dbData.tags || null,
          createdAt: dbData.created_at || new Date().toISOString(),
        };

        // Step 7: Trigger background processing pipelines (AC9)
        // Both pipelines are fire-and-forget: invoke Edge Functions but don't await.
        // Errors are caught and logged but don't fail the save operation.
        // Each pipeline has its own retry mechanisms and the item remains visible
        // in the Wardrobe library even if these pipelines fail or are delayed.
        //
        // Pipeline 1: Image cleanup and thumbnail generation (Story #229)
        // - Cleans up the original image
        // - Generates optimized thumbnails for the wardrobe grid
        // - Updates image_processing_status when complete
        //
        // Pipeline 2: AI attribute detection (Story #235)
        // - Detects item type, colours, patterns, fabric, etc.
        // - Updates attribute_status and item metadata when complete
        //
        // Edge Function Name Constants:
        // Function names are defined in EDGE_FUNCTIONS constant (see constants.ts)
        // instead of hardcoded strings. This provides:
        // - Single source of truth for all Edge Function references
        // - Type safety and autocompletion in IDEs
        // - Safe refactoring (rename propagates across codebase)
        // - Clear documentation of available functions and their purposes
        // - Reduced risk of typos causing runtime failures

        // Generate correlation IDs for pipeline tracing
        const imageProcessingCorrelationId = generateCorrelationId();
        const classificationCorrelationId = generateCorrelationId();

        // Trigger image processing pipeline
        supabase.functions
          .invoke(EDGE_FUNCTIONS.PROCESS_ITEM_IMAGE, {
            body: { itemId },
            headers: getCorrelationHeaders(imageProcessingCorrelationId),
          })
          .catch((pipelineError) => {
            // Log but don't fail the save - pipeline can retry internally
            logError(pipelineError, 'server', {
              feature: 'wardrobe',
              operation: 'trigger_image_processing_pipeline',
              metadata: { itemId, userId: user.id, correlationId: imageProcessingCorrelationId },
            });
          });

        // Trigger attribute classification pipeline
        supabase.functions
          .invoke(EDGE_FUNCTIONS.CLASSIFY_ITEM, {
            body: { itemId },
            headers: getCorrelationHeaders(classificationCorrelationId),
          })
          .catch((pipelineError) => {
            // Log but don't fail the save - pipeline can retry internally
            logError(pipelineError, 'server', {
              feature: 'wardrobe',
              operation: 'trigger_classification_pipeline',
              metadata: { itemId, userId: user.id, correlationId: classificationCorrelationId },
            });
          });

        // Step 8: Invalidate React Query caches for wardrobe
        // This ensures the wardrobe grid refetches and shows the new item
        queryClient.invalidateQueries({ queryKey: ['wardrobe', 'items', user.id] });
        queryClient.invalidateQueries({ queryKey: ['onboarding', 'hasWardrobeItems', user.id] });

        // Calculate latency and emit success telemetry
        const latency = Date.now() - startTime;
        logSuccess('wardrobe', 'item_save_succeeded', {
          latency,
          data: {
            itemId,
            userId: user.id,
            hasName: input.name.trim().length > 0,
            tagCount: input.tags.length,
            latencyMs: latency,
          },
        });

        // User story #241 spec-compliant event: item_created
        // Emitted when item creation successfully completes (DB row committed and item visible)
        // Properties per spec: has_name (boolean), tags_count (integer), save_latency_ms (optional)
        trackCaptureEvent('item_created', {
          userId: user.id,
          has_name: input.name.trim().length > 0,
          tags_count: input.tags.length,
          save_latency_ms: latency,
        });

        // Update state with result
        const createResult: CreateItemResult = { item };
        setResult(createResult);

        // Clear cached itemId on success (next save gets fresh ID)
        cachedItemIdRef.current = null;

        return createResult;
      } catch (err) {
        // Classify and wrap error if not already typed
        let typedError: CreateItemWithImageError;

        if (err instanceof CreateItemWithImageError) {
          typedError = err;
        } else if (err instanceof UploadError) {
          // Map UploadError types to CreateItemErrorType
          const errorTypeMap: Record<string, CreateItemErrorType> = {
            processing: 'storage',
            file_read: 'storage',
            network: 'network',
            storage: 'storage',
            permission: 'storage',
            unknown: 'unknown',
          };
          const errorType = errorTypeMap[err.errorType] || 'unknown';
          typedError = new CreateItemWithImageError(err.message, errorType, err);
        } else if (err instanceof Error) {
          // Classify error based on message patterns
          let errorType: CreateItemErrorType = 'unknown';
          const lowerMessage = err.message.toLowerCase();

          // Check timeout first (more specific than network)
          if (isTimeoutError(err.message)) {
            errorType = 'timeout';
          } else if (
            lowerMessage.includes('network') ||
            lowerMessage.includes('fetch') ||
            lowerMessage.includes('connection') ||
            lowerMessage.includes('dns') ||
            lowerMessage.includes('econnrefused') ||
            lowerMessage.includes('enotfound')
          ) {
            errorType = 'network';
          } else if (
            lowerMessage.includes('storage') ||
            lowerMessage.includes('upload') ||
            lowerMessage.includes('bucket')
          ) {
            errorType = 'storage';
          } else if (
            lowerMessage.includes('database') ||
            lowerMessage.includes('insert') ||
            lowerMessage.includes('rls') ||
            lowerMessage.includes('policy') ||
            lowerMessage.includes('permission denied')
          ) {
            errorType = 'database';
          }

          typedError = new CreateItemWithImageError(ERROR_MESSAGES[errorType], errorType, err);
        } else {
          typedError = new CreateItemWithImageError('An unexpected error occurred', 'unknown', err);
        }

        // Calculate latency and emit failure telemetry
        const latency = Date.now() - startTime;
        logError(typedError, typedError.errorType === 'offline' ? 'network' : 'server', {
          feature: 'wardrobe',
          operation: 'item_save',
          metadata: {
            errorType: typedError.errorType,
            userId: user.id,
            latencyMs: latency,
          },
        });

        // Emit structured failure event using trackCaptureEvent for semantic correctness
        trackCaptureEvent('item_save_failed', {
          userId: user.id,
          errorType: typedError.errorType,
          latencyMs: latency,
        });

        // User story #241 spec-compliant event: item_creation_failed
        // Emitted when item creation fails in a way visible to the user
        // Properties per spec: error_type (enum), has_name (optional), tags_count (optional)
        // Maps internal errorType to spec-compliant error_type enum
        const specErrorType = mapErrorTypeToSpecEnum(typedError.errorType);
        trackCaptureEvent('item_creation_failed', {
          userId: user.id,
          errorType: specErrorType,
          hasName: input.name.trim().length > 0,
          tagCount: input.tags.length,
        });

        // Update state with error
        setError(typedError);

        // Re-throw for caller handling
        throw typedError;
      } finally {
        // Always reset loading state and single-flight flag
        isSavingRef.current = false;
        setIsLoading(false);
      }
    },
    [user, queryClient, router, checkConnectivity, getOrCreateItemId]
  );

  /**
   * Reset hook state for fresh save attempt.
   */
  const reset = useCallback(() => {
    setError(null);
    setResult(null);
    // Note: We do NOT clear cachedItemIdRef here.
    // The cached ID persists for retry idempotency.
    // It's only cleared on successful save.
  }, []);

  return {
    isLoading,
    error,
    result,
    save,
    reset,
  };
}
