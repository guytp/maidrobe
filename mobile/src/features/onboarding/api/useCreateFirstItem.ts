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
 * - Retry logic with exponential backoff (3 attempts)
 * - Error classification (network, storage, database)
 * - Telemetry logging for all operations
 * - Idempotent behavior via mutation tracking
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
        const timestamp = Date.now();
        const storagePath = WARDROBE_STORAGE_CONFIG.pathTemplate(user.id, itemId, timestamp);

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

        // Log error
        logError(error as Error, 'schema', {
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
    retry: (failureCount, error) => {
      // Retry network and storage errors up to 3 times
      if (error.errorType === 'network' || error.errorType === 'storage') {
        return failureCount < 3;
      }
      // Don't retry validation or database errors
      return false;
    },
    retryDelay: (attemptIndex) => {
      // Exponential backoff: 1s, 2s, 4s
      return Math.min(1000 * 2 ** attemptIndex, 30000);
    },
  });
}

/**
 * Generate a UUID v4.
 * PLACEHOLDER: Mock UUID generation.
 * Real implementation would use crypto.randomUUID() or uuid package.
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
