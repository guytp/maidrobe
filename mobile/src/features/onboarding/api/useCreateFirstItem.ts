import { useMutation } from '@tanstack/react-query';
import { logSuccess, logError } from '../../../core/telemetry';
import { useStore } from '../../../core/state/store';
import {
  CreateItemRequest,
  CreateItemResponse,
  WardrobeItem,
  WARDROBE_STORAGE_CONFIG,
} from '../types/wardrobeItem';
import { processItemImage } from '../utils/imageProcessing';

/**
 * Error types for first item creation.
 */
export type CreateItemErrorType = 'network' | 'storage' | 'database' | 'validation' | 'unknown';

/**
 * Custom error class for item creation failures.
 */
export class CreateItemError extends Error {
  constructor(
    message: string,
    public errorType: CreateItemErrorType,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'CreateItemError';
  }
}

/**
 * React Query mutation hook for creating first wardrobe item during onboarding.
 *
 * PLACEHOLDER IMPLEMENTATION:
 * This hook provides a complete item creation flow that will be replaced
 * by Feature #3 (Wardrobe Item Capture & Management) when available.
 *
 * Flow:
 * 1. Process image (EXIF stripping, compression) - MOCKED
 * 2. Upload to Supabase Storage - MOCKED
 * 3. Insert item record to database - MOCKED
 * 4. Return created item
 *
 * Features:
 * - Retry logic with exponential backoff with jitter (3 attempts)
 * - Error classification (network, storage, database)
 * - Telemetry logging for all operations
 * - Idempotent behavior via mutation tracking
 * - Architecture ready for optimistic updates with rollback
 *
 * Optimistic Update Architecture:
 * The mutation is structured with placeholder handlers (onMutate, onError,
 * onSuccess, onSettled) to support optimistic updates when Feature #3
 * implements real wardrobe state management. This architecture ensures:
 * - Clear integration points for cache manipulation
 * - Rollback paths for failed operations (per code-guidelines.md)
 * - Consistent cache invalidation strategy
 * - Separation of concerns between mutation logic and cache updates
 *
 * TODO: Replace with real implementation when Feature #3 is available.
 * Expected integration:
 * ```typescript
 * import { useCreateWardrobeItem } from '../../wardrobe/api/useCreateWardrobeItem';
 * export { useCreateWardrobeItem as useCreateFirstItem };
 * ```
 *
 * @returns React Query mutation object
 */
export function useCreateFirstItem() {
  const user = useStore((state) => state.user);

  return useMutation<CreateItemResponse, CreateItemError, CreateItemRequest>({
    mutationKey: ['onboarding', 'createFirstItem', user?.id],
    // PLACEHOLDER: Optimistic update setup for Feature #3
    // When Feature #3 implements real wardrobe state, this will:
    // 1. Cancel outgoing queries to prevent race conditions
    // 2. Snapshot current wardrobe items for rollback
    // 3. Optimistically add new item to cache
    // Example implementation:
    // onMutate: async (request) => {
    //   await queryClient.cancelQueries({ queryKey: ['wardrobe', 'items', user?.id] });
    //   const previousItems = queryClient.getQueryData(['wardrobe', 'items', user?.id]);
    //   queryClient.setQueryData(['wardrobe', 'items', user?.id], (old) => [...old, optimisticItem]);
    //   return { previousItems };
    // },
    mutationFn: async (request: CreateItemRequest) => {
      const startTime = Date.now();

      if (!user?.id) {
        throw new CreateItemError('User not authenticated', 'validation');
      }

      try {
        // Step 1: Process image (EXIF stripping, compression)
        // PLACEHOLDER: Mock processing
        await processItemImage(request.imageUri);

        // Step 2: Upload to Supabase Storage
        // PLACEHOLDER: Mock upload
        const itemId = generateUUID();
        const storagePath = WARDROBE_STORAGE_CONFIG.pathTemplate(user.id, itemId);

        // Real implementation would upload blob to storage:
        // const blob = await imageUriToBlob(processedImage.uri);
        // const { error: uploadError } = await supabase.storage
        //   .from(WARDROBE_STORAGE_CONFIG.bucketName)
        //   .upload(storagePath, blob, {
        //     contentType: 'image/jpeg',
        //     upsert: false, // Prevent overwriting
        //   });
        //
        // if (uploadError) {
        //   throw new CreateItemError(
        //     'Failed to upload image',
        //     'storage',
        //     uploadError
        //   );
        // }

        // Mock upload delay
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Step 3: Insert item record to database
        // PLACEHOLDER: Mock database insert
        const item: WardrobeItem = {
          id: itemId,
          userId: user.id,
          photos: [storagePath],
          type: request.type,
          colour: [request.colourId],
          name: request.name || null,
          tags: null,
          createdAt: new Date().toISOString(),
        };

        // Real implementation would insert to database:
        // const { data, error: dbError } = await supabase
        //   .from('items')
        //   .insert({
        //     id: itemId,
        //     user_id: user.id,
        //     photos: [storagePath],
        //     type: request.type,
        //     colour: [request.colourId],
        //     name: request.name || null,
        //   })
        //   .select()
        //   .single();
        //
        // if (dbError) {
        //   throw new CreateItemError(
        //     'Failed to create item record',
        //     'database',
        //     dbError
        //   );
        // }

        // Mock database delay
        await new Promise((resolve) => setTimeout(resolve, 300));

        // Log success with latency
        const latency = Date.now() - startTime;
        logSuccess('onboarding', 'first_item_created', {
          data: {
            itemId,
            type: request.type,
            colourId: request.colourId,
            hasName: !!request.name,
            latencyMs: latency,
          },
        });

        return { item };
      } catch (error) {
        // Classify error type
        let errorType: CreateItemErrorType = 'unknown';
        let errorMessage = 'Failed to create item';

        if (error instanceof CreateItemError) {
          throw error;
        }

        // Check for network errors
        if (
          error instanceof Error &&
          (error.message.includes('network') ||
            error.message.includes('fetch') ||
            error.message.includes('timeout'))
        ) {
          errorType = 'network';
          errorMessage = 'Network error while creating item';
        }
        // Check for storage errors
        else if (error instanceof Error && error.message.includes('storage')) {
          errorType = 'storage';
          errorMessage = 'Failed to upload image';
        }
        // Check for database errors
        else if (error instanceof Error && error.message.includes('database')) {
          errorType = 'database';
          errorMessage = 'Failed to save item';
        }

        // Map errorType to telemetry classification
        let telemetryClassification: 'user' | 'network' | 'server' = 'server';
        if (errorType === 'network') {
          telemetryClassification = 'network';
        }
        // storage, database, and unknown map to 'server'

        // Log error
        logError(error as Error, telemetryClassification, {
          feature: 'onboarding_first_item',
          operation: 'createItem',
          metadata: {
            errorType,
            userId: user.id,
          },
        });

        throw new CreateItemError(errorMessage, errorType, error);
      }
    },
    // PLACEHOLDER: Rollback logic for Feature #3
    // When optimistic updates are implemented, this will restore previous state on error.
    // Example implementation:
    // onError: (error, request, context) => {
    //   if (context?.previousItems) {
    //     queryClient.setQueryData(['wardrobe', 'items', user?.id], context.previousItems);
    //   }
    //   // Error logging is already handled in mutationFn
    // },
    // PLACEHOLDER: Cache update with server data for Feature #3
    // When real API is available, update cache with confirmed server response.
    // Example implementation:
    // onSuccess: (data, request, context) => {
    //   // Update cache with server-confirmed item (may have server-generated fields)
    //   queryClient.setQueryData(['wardrobe', 'items', user?.id], (old) => {
    //     return old.map(item => item.id === data.item.id ? data.item : item);
    //   });
    // },
    // PLACEHOLDER: Cleanup and cache invalidation for Feature #3
    // Ensures cache is synchronized after mutation completes (success or error).
    // Example implementation:
    // onSettled: () => {
    //   // Invalidate queries to trigger refetch and ensure cache consistency
    //   queryClient.invalidateQueries({ queryKey: ['wardrobe', 'items', user?.id] });
    //   queryClient.invalidateQueries({ queryKey: ['wardrobe', 'count', user?.id] });
    // },
    retry: (failureCount, error) => {
      // Retry network and storage errors up to 3 times
      if (error.errorType === 'network' || error.errorType === 'storage') {
        return failureCount < 3;
      }
      // Don't retry validation or database errors
      return false;
    },
    retryDelay: (attemptIndex) => {
      // Exponential backoff with jitter to avoid thundering herd
      return Math.min(1000 * 2 ** attemptIndex * (0.5 + Math.random()), 30000);
    },
  });
}

/**
 * Generate a UUID v7.
 * PLACEHOLDER: Mock UUID v7 generation.
 * Real implementation would use uuid v7 package (e.g., uuidv7() from 'uuid').
 *
 * Note: This mock implementation uses the v7 version identifier but does not
 * include actual timestamp ordering. Feature #3 will provide proper UUIDv7
 * generation with time-ordered properties for database performance.
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
