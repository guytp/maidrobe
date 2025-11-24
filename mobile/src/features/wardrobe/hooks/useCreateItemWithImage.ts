/**
 * Item creation orchestration hook for wardrobe feature.
 *
 * This hook orchestrates the complete item creation flow:
 * 1. Connectivity check - fail fast if offline
 * 2. Generate stable itemId (cached for retries)
 * 3. Image preparation (resize to max 1600px, JPEG compression, EXIF stripping)
 * 4. Image upload to Supabase Storage (private bucket with RLS)
 * 5. Item record insertion to database (placeholder - Step 5)
 * 6. Background pipeline trigger (placeholder - Step 5)
 *
 * Key Design Decisions:
 * - Single-flight semantics: Only one save operation at a time
 * - Stable itemId: Generated once, cached for retries to enable idempotent writes
 * - Fail fast offline: Check connectivity before starting any work
 * - Telemetry: Structured events for monitoring save success/failure rates
 * - Error classification: Typed errors for appropriate user messaging
 * - Non-guessable storage path: user/{userId}/items/{itemId}/original.jpg
 *
 * @module features/wardrobe/hooks/useCreateItemWithImage
 */

import { useCallback, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import { useStore } from '../../../core/state/store';
import { logSuccess, logError } from '../../../core/telemetry';
import { supabase } from '../../../services/supabase';
import { WardrobeItem } from '../../onboarding/types/wardrobeItem';
import { ItemType } from '../../onboarding/types/itemMetadata';
import {
  prepareImageForUpload,
  uploadImageToStorage,
  generateStoragePath,
  UploadError,
} from '../utils/imageUpload';

/**
 * Error types for item creation failures.
 *
 * Used for error classification and appropriate user messaging:
 * - offline: Device has no network connectivity
 * - network: Network error during operation (timeout, connection reset)
 * - storage: Failed to upload image to Supabase Storage
 * - database: Failed to insert item record
 * - validation: Invalid input data
 * - unknown: Unexpected error
 */
export type CreateItemErrorType =
  | 'offline'
  | 'network'
  | 'storage'
  | 'database'
  | 'validation'
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
   * Note: This mock implementation uses the v7 version identifier but
   * does not include actual timestamp ordering. Real implementation
   * should use a proper UUIDv7 library.
   */
  const getOrCreateItemId = useCallback((): string => {
    if (cachedItemIdRef.current) {
      return cachedItemIdRef.current;
    }

    // Generate UUIDv7-like ID
    // Real implementation would use: import { v7 as uuidv7 } from 'uuid';
    const id = 'xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });

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

        // Emit save started telemetry
        logSuccess('wardrobe', 'item_save_started', {
          data: {
            userId: user.id,
            hasName: input.name.trim().length > 0,
            tagCount: input.tags.length,
          },
        });

        // Step 2: Get or create stable itemId
        const itemId = getOrCreateItemId();
        const storagePath = generateStoragePath(user.id, itemId);

        // Step 3: Process image (resize, compress, strip EXIF)
        // - Resize to max 1600px on longest edge (no upscaling if smaller)
        // - Compress to JPEG at 0.85 quality (~1.5MB typical)
        // - EXIF metadata stripped automatically by expo-image-manipulator
        const preparedImage = await prepareImageForUpload(
          input.imageUri,
          input.imageWidth,
          input.imageHeight
        );

        // Step 4: Upload image to Supabase Storage
        // - Uses authenticated client with RLS
        // - Upsert enabled for retry idempotency
        // - UploadError thrown with structured error type on failure
        await uploadImageToStorage(preparedImage, storagePath);

        // Step 5: Insert item record to database
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
          createdAt: dbData.created_at || new Date().toISOString(),
        };

        // Step 6: Trigger background classification pipeline
        // Fire-and-forget: invoke Edge Function but don't await
        // Errors are caught and logged but don't fail the save operation
        // The pipeline has its own retry mechanisms
        supabase.functions
          .invoke('classify-item', {
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

        // Step 7: Invalidate React Query caches for wardrobe
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

        // Emit structured failure event
        logSuccess('wardrobe', 'item_save_failed', {
          latency,
          data: {
            userId: user.id,
            errorType: typedError.errorType,
            latencyMs: latency,
          },
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
    [user, queryClient, checkConnectivity, getOrCreateItemId]
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
