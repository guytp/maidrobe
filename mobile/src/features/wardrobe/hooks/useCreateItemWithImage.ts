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
 * - Telemetry: Structured events for monitoring save success/failure rates
 * - Error classification: Typed errors for appropriate user messaging
 * - Non-guessable storage path: user/{userId}/items/{itemId}/original.jpg
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

/**
 * Error types for item creation failures.
 *
 * Used for error classification and appropriate user messaging:
 * - offline: Device has no network connectivity
 * - network: Network error during operation (timeout, connection reset)
 * - storage: Failed to upload image to Supabase Storage
 * - database: Failed to insert item record
 * - validation: Invalid input data
 * - auth: Authentication/session expired
 * - unknown: Unexpected error
 */
export type CreateItemErrorType =
  | 'offline'
  | 'network'
  | 'storage'
  | 'database'
  | 'validation'
  | 'auth'
  | 'unknown';

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
   * Security: Uses crypto.getRandomValues() for cryptographically secure
   * random data generation, ensuring item IDs are non-guessable and meet
   * security requirements for private storage paths (user/{userId}/items/{itemId}/...).
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
        // This ensures the session is valid before performing any Supabase
        // storage uploads or database operations, preventing orphaned uploads
        // if the session has expired.
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

        const { data: dbData, error: dbError } = await supabase
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
          throw new CreateItemWithImageError('Failed to save item', 'database', dbError);
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

        // Trigger image processing pipeline
        supabase.functions
          .invoke(EDGE_FUNCTIONS.PROCESS_ITEM_IMAGE, {
            body: { itemId },
          })
          .catch((pipelineError) => {
            // Log but don't fail the save - pipeline can retry internally
            logError(pipelineError, 'server', {
              feature: 'wardrobe',
              operation: 'trigger_image_processing_pipeline',
              metadata: { itemId, userId: user.id },
            });
          });

        // Trigger attribute classification pipeline
        supabase.functions
          .invoke(EDGE_FUNCTIONS.CLASSIFY_ITEM, {
            body: { itemId },
          })
          .catch((pipelineError) => {
            // Log but don't fail the save - pipeline can retry internally
            logError(pipelineError, 'server', {
              feature: 'wardrobe',
              operation: 'trigger_classification_pipeline',
              metadata: { itemId, userId: user.id },
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
          let errorMessage = 'Failed to save item';

          if (
            err.message.includes('network') ||
            err.message.includes('fetch') ||
            err.message.includes('timeout') ||
            err.message.includes('connection')
          ) {
            errorType = 'network';
            errorMessage = 'Network error. Please try again.';
          } else if (err.message.includes('storage') || err.message.includes('upload')) {
            errorType = 'storage';
            errorMessage = 'Failed to upload image. Please try again.';
          } else if (err.message.includes('database') || err.message.includes('insert')) {
            errorType = 'database';
            errorMessage = 'Failed to save item. Please try again.';
          }

          typedError = new CreateItemWithImageError(errorMessage, errorType, err);
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
