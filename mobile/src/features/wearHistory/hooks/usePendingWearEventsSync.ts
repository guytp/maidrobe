/**
 * Hook for syncing pending wear events when online.
 *
 * Provides automatic background sync of queued wear events when:
 * - Network connectivity is restored
 * - App resumes from background
 * - On mount if there are pending events
 *
 * @module features/wearHistory/hooks/usePendingWearEventsSync
 */

import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useStore } from '../../../core/state/store';
import { useNetworkStatus } from '../../recommendations/hooks/useNetworkStatus';
import { logError, trackCaptureEvent } from '../../../core/telemetry';
import {
  createOrUpdateWearEventForClient,
  wearHistoryQueryKey,
  WearHistoryClientError,
} from '../api/wearHistoryClient';
import type { PendingWearEvent } from '../types';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of the sync hook.
 */
export interface UsePendingWearEventsSyncResult {
  /** Whether a sync is currently in progress */
  isSyncing: boolean;
  /** Number of events waiting to be synced */
  pendingCount: number;
  /** Manually trigger a sync attempt */
  triggerSync: () => Promise<void>;
}

// ============================================================================
// Constants
// ============================================================================

/** Minimum delay between sync attempts in milliseconds */
const SYNC_DEBOUNCE_MS = 2000;

/** Delay before retrying failed events in milliseconds */
const RETRY_DELAY_MS = 5000;

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for syncing pending wear events when online.
 *
 * This hook monitors network connectivity and pending events queue,
 * automatically syncing events when the device comes online.
 *
 * SYNC BEHAVIOR:
 * - Syncs events sequentially to avoid overwhelming the server
 * - Retries failed events with exponential backoff
 * - Removes successfully synced events from the queue
 * - Invalidates React Query cache on successful sync
 *
 * TRIGGERS:
 * - Network connectivity restored
 * - App comes to foreground
 * - Manual trigger via triggerSync()
 * - On mount if there are pending events and device is online
 *
 * @returns Object with sync state and manual trigger function
 *
 * @example
 * ```tsx
 * function App() {
 *   const { isSyncing, pendingCount, triggerSync } = usePendingWearEventsSync();
 *
 *   return (
 *     <View>
 *       {pendingCount > 0 && (
 *         <Banner>
 *           {isSyncing ? 'Syncing...' : `${pendingCount} events pending`}
 *           <Button onPress={triggerSync}>Retry</Button>
 *         </Banner>
 *       )}
 *     </View>
 *   );
 * }
 * ```
 */
export function usePendingWearEventsSync(): UsePendingWearEventsSyncResult {
  const queryClient = useQueryClient();
  const { isOnline, isInitialized } = useNetworkStatus();

  // Store selectors
  const user = useStore((state) => state.user);
  const pendingEvents = useStore((state) => state.pendingEvents);
  const getRetryableEvents = useStore((state) => state.getRetryableEvents);
  const markEventSyncing = useStore((state) => state.markEventSyncing);
  const markEventFailed = useStore((state) => state.markEventFailed);
  const removePendingEvent = useStore((state) => state.removePendingEvent);

  // Sync state
  const isSyncingRef = useRef(false);
  const lastSyncAttemptRef = useRef(0);

  /**
   * Sync a single pending event to the server.
   */
  const syncEvent = useCallback(
    async (event: PendingWearEvent): Promise<boolean> => {
      if (!user?.id) {
        return false;
      }

      // Mark as syncing
      markEventSyncing(event.localId);

      try {
        const result = await createOrUpdateWearEventForClient({
          userId: user.id,
          outfitId: event.outfitId,
          itemIds: event.itemIds,
          wornDate: event.wornDate,
          source: event.source,
          context: event.context,
        });

        if (result.success) {
          // Remove from queue
          removePendingEvent(event.localId);

          // Invalidate relevant queries
          queryClient.invalidateQueries({
            queryKey: wearHistoryQueryKey.user(user.id),
          });

          // Set the specific outfit+date query data
          queryClient.setQueryData(
            wearHistoryQueryKey.forOutfitDate(user.id, event.outfitId, event.wornDate),
            result.data
          );

          // Track success
          trackCaptureEvent('pending_wear_event_synced', {
            userId: user.id,
            itemId: event.outfitId,
            latencyMs: Date.now() - new Date(event.createdAt).getTime(),
            metadata: {
              localId: event.localId,
              attemptCount: event.attemptCount + 1,
              source: event.source,
              isUpdate: result.isUpdate,
            },
          });

          return true;
        }

        // Handle failure
        const errorMessage = result.error.message;
        markEventFailed(event.localId, errorMessage);

        // Track failure
        trackCaptureEvent('pending_wear_event_sync_failed', {
          userId: user.id,
          itemId: event.outfitId,
          errorCode: result.error.code,
          errorMessage,
          metadata: {
            localId: event.localId,
            attemptCount: event.attemptCount + 1,
            isRetryable: result.error.isRetryable,
          },
        });

        return false;
      } catch (error) {
        const clientError = WearHistoryClientError.fromUnknown(error);
        markEventFailed(event.localId, clientError.message);

        logError(clientError, 'server', {
          feature: 'wearHistory',
          operation: 'syncPendingEvent',
          metadata: {
            localId: event.localId,
            outfitId: event.outfitId,
          },
        });

        return false;
      }
    },
    [user?.id, markEventSyncing, markEventFailed, removePendingEvent, queryClient]
  );

  /**
   * Sync all retryable pending events.
   */
  const syncAllPending = useCallback(async () => {
    // Debounce rapid calls
    const now = Date.now();
    if (now - lastSyncAttemptRef.current < SYNC_DEBOUNCE_MS) {
      return;
    }
    lastSyncAttemptRef.current = now;

    // Guard conditions
    if (isSyncingRef.current) return;
    if (!isOnline) return;
    if (!user?.id) return;

    const retryableEvents = getRetryableEvents();
    if (retryableEvents.length === 0) return;

    isSyncingRef.current = true;

    try {
      // Sync events sequentially
      for (const event of retryableEvents) {
        // Check if still online before each sync
        if (!isOnline) break;

        const success = await syncEvent(event);

        // Add delay between events if there was a failure
        if (!success && retryableEvents.indexOf(event) < retryableEvents.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }
    } finally {
      isSyncingRef.current = false;
    }
  }, [isOnline, user?.id, getRetryableEvents, syncEvent]);

  // Effect: Sync when coming online
  useEffect(() => {
    if (isInitialized && isOnline) {
      syncAllPending();
    }
  }, [isOnline, isInitialized, syncAllPending]);

  // Effect: Sync on app foreground
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && isOnline) {
        syncAllPending();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [isOnline, syncAllPending]);

  // Effect: Initial sync on mount
  useEffect(() => {
    if (isInitialized && isOnline && pendingEvents.length > 0) {
      syncAllPending();
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitialized]);

  return {
    isSyncing: isSyncingRef.current,
    pendingCount: pendingEvents.length,
    triggerSync: syncAllPending,
  };
}

/**
 * Hook to check if a specific outfit has pending sync events.
 *
 * Used by UI components to show syncing indicators.
 *
 * @param outfitId - The outfit ID to check
 * @returns Whether the outfit has pending events
 *
 * @example
 * ```tsx
 * function OutfitCard({ outfit }) {
 *   const hasPending = useHasPendingWearEvent(outfit.id);
 *
 *   return (
 *     <Card>
 *       {hasPending && <SyncingBadge />}
 *       <OutfitContent outfit={outfit} />
 *     </Card>
 *   );
 * }
 * ```
 */
export function useHasPendingWearEvent(outfitId: string): boolean {
  return useStore((state) => state.hasPendingEventsForOutfit(outfitId));
}
