import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '../../../services/supabase';
import { logError, logSuccess, getUserFriendlyMessage, type ErrorClassification } from '../../../core/telemetry';
import type { PrefsRow, PrefsFormData } from '../utils/prefsTypes';
import { PrefsRowSchema, PrefsUpdatePayloadSchema } from '../utils/prefsValidation';
import { toPrefsRow, getChangedFields } from '../utils/prefsMapping';

/**
 * Request type for saving preferences.
 *
 * Includes:
 * - userId: The user ID to save preferences for
 * - data: The form data to save
 * - existingData: Optional existing form data for computing delta (PATCH semantics)
 */
export interface SavePrefsRequest {
  userId: string;
  data: PrefsFormData;
  existingData?: PrefsFormData | null;
}

/**
 * Mutation context for latency tracking and cache invalidation.
 */
interface SavePrefsMutationContext {
  startTime: number;
  userId: string;
}

/**
 * Classifies Supabase errors for telemetry and user messaging.
 *
 * @param error - The error to classify
 * @returns Error classification (user, network, server, or schema)
 */
function classifyPrefsError(error: unknown): ErrorClassification {
  if (error instanceof z.ZodError) {
    return 'schema';
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // User validation errors
    if (message.includes('invalid') || message.includes('check your input')) {
      return 'user';
    }

    // Network errors
    if (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('connection') ||
      message.includes('timeout') ||
      message.includes('offline')
    ) {
      return 'network';
    }

    // Schema validation errors
    if (message.includes('validation') || message.includes('parse') || message.includes('schema')) {
      return 'schema';
    }

    // Default to server error for unknown errors
    return 'server';
  }

  return 'server';
}

/**
 * React Query mutation hook for creating or updating user preferences.
 *
 * This hook:
 * - Supports both INSERT (new row) and UPDATE (partial update) operations
 * - Uses Supabase upsert for atomic insert-or-update semantics
 * - Computes changed fields when existingData is provided (PATCH-like)
 * - Validates request payload and response with Zod schemas
 * - Invalidates query cache on success
 * - Logs success with privacy-safe metadata (no free-text content)
 * - Retries network/server errors with exponential backoff
 * - Does NOT retry validation errors (permanent failures)
 * - Tracks and logs latency for observability
 *
 * Privacy Compliance:
 * - Free-text values (comfortNotes, exclusions.freeText) are NEVER logged
 * - Only boolean flags indicating presence/absence are logged
 * - Complies with GDPR and privacy requirements
 *
 * Retry Strategy:
 * - Retries up to 3 times for network/server errors
 * - Does NOT retry user validation or schema errors (permanent failures)
 * - Uses exponential backoff: 1s, 2s, 4s (plus jitter)
 * - Jitter (0-1000ms) prevents thundering herd problem
 * - Max delay capped at 30 seconds
 *
 * @returns React Query mutation result with mutate function and state
 *
 * @example
 * ```typescript
 * function PrefsScreen() {
 *   const { data: existingPrefs } = useUserPrefs();
 *   const { mutate: savePrefs, isPending } = useSavePrefs();
 *
 *   const handleSave = (formData: PrefsFormData) => {
 *     savePrefs(
 *       {
 *         userId: currentUserId,
 *         data: formData,
 *         existingData: existingPrefs ? toFormData(existingPrefs) : null,
 *       },
 *       {
 *         onSuccess: () => {
 *           Toast.show('Preferences saved!');
 *           navigateNext();
 *         },
 *         onError: (error) => {
 *           Toast.show(error.message);
 *         },
 *       }
 *     );
 *   };
 * }
 * ```
 */
export function useSavePrefs(): UseMutationResult<
  PrefsRow,
  Error,
  SavePrefsRequest,
  SavePrefsMutationContext
> {
  const queryClient = useQueryClient();

  return useMutation({
    // Retry configuration with exponential backoff and jitter
    // Only retry on network/server errors, not validation errors
    retry: (failureCount, error) => {
      // Don't retry user validation errors or schema errors
      // These are permanent failures that won't succeed on retry
      const message = error.message;
      if (
        message.includes('Invalid request') ||
        message.includes('unexpected response') ||
        message.includes('check your input') ||
        message.includes('Validation failed')
      ) {
        return false;
      }

      // Retry up to 3 times for transient network/server errors
      return failureCount < 3;
    },

    // Exponential backoff with jitter to avoid thundering herd
    // Formula: min(baseDelay * 2^attempt + random jitter, maxDelay)
    retryDelay: (attemptIndex) => {
      const baseDelay = 1000; // 1 second base
      const exponentialDelay = baseDelay * Math.pow(2, attemptIndex);
      const jitter = Math.random() * 1000; // 0-1000ms jitter
      const totalDelay = exponentialDelay + jitter;
      const maxDelay = 30000; // Cap at 30 seconds
      return Math.min(totalDelay, maxDelay);
    },

    onMutate: (request) => {
      // Capture start timestamp for latency tracking
      return {
        startTime: Date.now(),
        userId: request.userId,
      };
    },

    mutationFn: async (request: SavePrefsRequest): Promise<PrefsRow> => {
      try {
        const { userId, data, existingData } = request;

        // Determine if this is an update with existing data
        const isUpdate = !!existingData;

        // Build payload based on operation type
        let payload: Partial<PrefsRow>;

        if (isUpdate) {
          // Compute only changed fields for PATCH-like semantics
          // getChangedFields already returns PrefsUpdatePayload (database format)
          payload = getChangedFields(data, existingData);

          // Validate partial update payload
          try {
            PrefsUpdatePayloadSchema.parse(payload);
          } catch (validationError) {
            logError(validationError, 'schema', {
              feature: 'onboarding',
              operation: 'savePrefs',
              metadata: { userId, isUpdate: true },
            });
            throw new Error('Validation failed: Invalid update payload');
          }
        } else {
          // Create complete row for insert
          payload = toPrefsRow(data, userId);

          // Validate complete row
          try {
            PrefsRowSchema.parse(payload);
          } catch (validationError) {
            logError(validationError, 'schema', {
              feature: 'onboarding',
              operation: 'savePrefs',
              metadata: { userId, isUpdate: false },
            });
            throw new Error('Validation failed: Invalid preferences data');
          }
        }

        // Use upsert for atomic insert-or-update
        // This handles both cases automatically based on user_id primary key
        const { data: responseData, error } = await supabase
          .from('prefs')
          .upsert({ ...payload, user_id: userId })
          .select()
          .single();

        // Handle Supabase errors
        if (error) {
          const classification = classifyPrefsError(error);
          logError(error, classification, {
            feature: 'onboarding',
            operation: 'savePrefs',
            metadata: { userId, isUpdate },
          });
          throw new Error(getUserFriendlyMessage(classification));
        }

        // Validate response
        if (!responseData) {
          const schemaError = new Error('No data returned from save operation');
          logError(schemaError, 'schema', {
            feature: 'onboarding',
            operation: 'savePrefs',
            metadata: { userId, isUpdate },
          });
          throw new Error(getUserFriendlyMessage('schema'));
        }

        // Validate response with Zod schema
        try {
          const validatedResponse = PrefsRowSchema.parse(responseData);
          return validatedResponse;
        } catch (validationError) {
          logError(validationError, 'schema', {
            feature: 'onboarding',
            operation: 'savePrefs',
            metadata: { userId, isUpdate, hasData: !!responseData },
          });
          throw new Error(getUserFriendlyMessage('schema'));
        }
      } catch (error) {
        // Re-throw if already an Error with user-friendly message
        if (error instanceof Error) {
          throw error;
        }

        // Handle unknown errors
        const unknownError = new Error('Unknown error saving preferences');
        const classification = classifyPrefsError(unknownError);
        logError(unknownError, classification, {
          feature: 'onboarding',
          operation: 'savePrefs',
          metadata: { userId: request.userId },
        });
        throw new Error(getUserFriendlyMessage(classification));
      }
    },

    onSuccess: (data, _variables, context) => {
      // Calculate request latency for performance monitoring
      const latency = context?.startTime ? Date.now() - context.startTime : undefined;
      const userId = context?.userId;

      // Invalidate query cache to refetch latest data
      if (userId) {
        queryClient.invalidateQueries({ queryKey: ['prefs', userId] });
      }

      // Log success with privacy-safe metadata
      // CRITICAL: Never log free-text content (comfortNotes, exclusions.freeText)
      // Only log boolean flags indicating presence/absence of data
      logSuccess('onboarding', 'savePrefs', {
        latency,
        data: {
          noRepeatSet: data.no_repeat_days !== null,
          colourTendencySelected: data.colour_prefs.length > 0,
          exclusionsSelected: data.exclusions.length > 0,
          notesPresent: data.comfort_notes !== null && data.comfort_notes.length > 0,
          // NEVER include:
          // - comfort_notes: string (PII/free-text)
          // - exclusions content (may contain free-text with "free:" prefix)
          // - any actual user text
        },
      });
    },

    onError: (_error, _variables, context) => {
      // Calculate request latency for performance monitoring in error path
      const latency = context?.startTime ? Date.now() - context.startTime : undefined;

      // Log error latency for observability
      // Note: Detailed error logging is already handled in mutationFn
      // This captures the latency metric for failed requests
      // eslint-disable-next-line no-console
      console.log('[Telemetry]', {
        feature: 'onboarding',
        operation: 'savePrefs',
        status: 'error',
        latency,
        timestamp: new Date().toISOString(),
      });
    },
  });
}
