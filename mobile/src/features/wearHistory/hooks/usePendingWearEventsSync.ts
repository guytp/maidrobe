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

import { useEffect, useRef, useCallback, useState } from 'react';
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
import { MAX_SYNC_ATTEMPTS } from '../types';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of the sync hook.
 */
export interface UsePendingWearEventsSyncResult {
  /** Whether a sync is currently in progress */
  isSyncing: boolean;
  /** Number of events waiting to be synced (excluding permanently failed) */
  pendingCount: number;
  /** Number of permanently failed events */
  failedCount: number;
  /** Whether there are permanently failed events */
  hasFailedEvents: boolean;
  /** Manually trigger a sync attempt */
  triggerSync: () => Promise<void>;
  /** Retry all permanently failed events */
  retryFailedEvents: () => void;
}

// ============================================================================
// Constants
// ============================================================================

/** Minimum delay between sync attempts in milliseconds */
const SYNC_DEBOUNCE_MS = 2000;

/** Delay between syncing individual events in milliseconds */
const INTER_EVENT_DELAY_MS = 500;

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
 * - Increments attemptCount on each sync attempt
 * - Removes events from queue on success (treats conflicts as success)
 * - Marks events as permanently failed after MAX_SYNC_ATTEMPTS
 * - Invalidates React Query cache on successful sync
 *
 * ANALYTICS:
 * - Emits `wear_history_marked` event on successful sync (same as direct marking)
 * - Includes outfitId, source, itemCount, wornDate, and context
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
 *   const { isSyncing, pendingCount, hasFailedEvents, retryFailedEvents } = usePendingWearEventsSync();
 *
 *   return (
 *     <View>
 *       {hasFailedEvents && (
 *         <Banner onRetry={retryFailedEvents}>
 *           Some items failed to sync
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
  const hasPermanentlyFailedEvents = useStore((state) => state.hasPermanentlyFailedEvents);
  const getPermanentlyFailedEvents = useStore((state) => state.getPermanentlyFailedEvents);
  const retryPermanentlyFailedEvents = useStore((state) => state.retryPermanentlyFailedEvents);

  // Sync state - use useState for reactivity
  const [isSyncing, setIsSyncing] = useState(false);
  const lastSyncAttemptRef = useRef(0);

  /**
   * Sync a single pending event to the server.
   * Returns true on success (including conflict/already-exists scenarios).
   */
  const syncEvent = useCallback(
    async (event: PendingWearEvent): Promise<boolean> => {
      if (!user?.id) {
        return false;
      }

      // Mark as syncing (this also increments attemptCount)
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
          // Remove from queue - success includes conflict/already-exists (isUpdate=true)
          removePendingEvent(event.localId);

          // Invalidate relevant queries to refresh wear history lists
          queryClient.invalidateQueries({
            queryKey: wearHistoryQueryKey.user(user.id),
          });

          // Also invalidate window queries to ensure no duplicates in lists
          queryClient.invalidateQueries({
            queryKey: [...wearHistoryQueryKey.all, user.id, 'window'],
            exact: false,
          });

          // Set the specific outfit+date query data for immediate lookups
          queryClient.setQueryData(
            wearHistoryQueryKey.forOutfitDate(user.id, event.outfitId, event.wornDate),
            result.data
          );

          // Emit wear_history_marked event (same as direct marking)
          // This ensures analytics consistency whether synced immediately or via background
          trackCaptureEvent('wear_history_marked', {
            userId: user.id,
            itemId: event.outfitId,
            latencyMs: Date.now() - new Date(event.createdAt).getTime(),
            metadata: {
              outfitId: event.outfitId,
              source: event.source,
              itemCount: event.itemIds.length,
              wornDate: event.wornDate,
              hasContext: !!event.context,
              isUpdate: result.isUpdate,
              syncedFromQueue: true,
              attemptCount: event.attemptCount + 1,
            },
          });

          return true;
        }

        // Handle failure - check if it's a validation error that shouldn't retry
        const errorMessage = result.error.message;

        // Validation and auth errors are permanent - don't keep retrying
        if (result.error.code === 'validation' || result.error.code === 'auth') {
          // Mark as failed with max attempts to make it permanently failed
          markEventFailed(event.localId, errorMessage);

          logError(result.error, 'user', {
            feature: 'wearHistory',
            operation: 'syncPendingEvent',
            metadata: {
              localId: event.localId,
              outfitId: event.outfitId,
              errorCode: result.error.code,
              isPermanent: true,
            },
          });
        } else {
          // Transient error - mark as failed for retry
          markEventFailed(event.localId, errorMessage);

          logError(result.error, 'server', {
            feature: 'wearHistory',
            operation: 'syncPendingEvent',
            metadata: {
              localId: event.localId,
              outfitId: event.outfitId,
              errorCode: result.error.code,
              attemptCount: event.attemptCount + 1,
            },
          });
        }

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
    if (isSyncing) return;
    if (!isOnline) return;
    if (!user?.id) return;

    const retryableEvents = getRetryableEvents();
    if (retryableEvents.length === 0) return;

    setIsSyncing(true);

    try {
      // Sync events sequentially
      for (let i = 0; i < retryableEvents.length; i++) {
        const event = retryableEvents[i];

        // Check if still online before each sync
        if (!isOnline) break;

        await syncEvent(event);

        // Small delay between events to avoid overwhelming the server
        if (i < retryableEvents.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, INTER_EVENT_DELAY_MS));
        }
      }
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, isSyncing, user?.id, getRetryableEvents, syncEvent]);

  /**
   * Retry all permanently failed events.
   */
  const retryFailedEvents = useCallback(() => {
    // Reset all permanently failed events
    retryPermanentlyFailedEvents();

    // Trigger sync if online
    if (isOnline) {
      // Small delay to allow state to update
      setTimeout(() => {
        syncAllPending();
      }, 100);
    }
  }, [retryPermanentlyFailedEvents, isOnline, syncAllPending]);

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

  // Calculate counts
  const failedEvents = getPermanentlyFailedEvents();
  const failedCount = failedEvents.length;
  const hasFailedEvents = hasPermanentlyFailedEvents();

  // Pending count excludes permanently failed events
  const pendingCount = pendingEvents.filter(
    (event) => !(event.status === 'failed' && event.attemptCount >= MAX_SYNC_ATTEMPTS)
  ).length;

  return {
    isSyncing,
    pendingCount,
    failedCount,
    hasFailedEvents,
    triggerSync: syncAllPending,
    retryFailedEvents,
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
