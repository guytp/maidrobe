/**
 * Real-time synchronization hook for wardrobe item updates.
 *
 * Subscribes to Supabase real-time changes on the user's wardrobe items,
 * automatically invalidating React Query caches when the backend updates
 * image processing fields (clean_key, thumb_key, image_processing_status).
 *
 * This enables seamless UI updates when background image processing completes,
 * without requiring manual refresh or navigation.
 *
 * Design decisions:
 * - Uses Supabase Realtime Postgres Changes for efficient server-push updates
 * - Filters by user_id to respect RLS and minimize bandwidth
 * - Only invalidates cache on relevant field changes (image processing fields)
 * - Gracefully handles subscription failures (logs error, continues working)
 * - Cleans up subscription on unmount to prevent memory leaks
 *
 * Security considerations:
 * - Subscription respects RLS policies (user only sees their own items)
 * - No sensitive data logged (only item IDs and status changes)
 * - Uses authenticated Supabase client with secure token handling
 *
 * @module features/wardrobe/api/useWardrobeRealtimeSync
 */

import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '../../../services/supabase';
import { useStore } from '../../../core/state/store';
import { logError, logSuccess } from '../../../core/telemetry';
import { wardrobeItemsQueryKey } from './useWardrobeItems';
import type { ImageProcessingStatus } from '../types';

/**
 * Payload structure for item updates from Supabase Realtime.
 *
 * Contains only the fields we care about for cache invalidation decisions.
 * The actual data refresh happens via React Query refetch, not from this payload.
 */
interface ItemUpdatePayload {
  id: string;
  user_id: string;
  image_processing_status: ImageProcessingStatus | null;
  clean_key: string | null;
  thumb_key: string | null;
}

/**
 * Fields that trigger cache invalidation when changed.
 *
 * We only care about image processing field updates, not name/tag changes
 * (those are handled by the mutation hooks with optimistic updates).
 */
const IMAGE_PROCESSING_FIELDS = ['image_processing_status', 'clean_key', 'thumb_key'] as const;

/**
 * Checks if an update payload contains changes to image processing fields.
 *
 * @param newRecord - The updated record from Supabase
 * @param oldRecord - The previous record state (may be partial)
 * @returns True if any image processing field changed
 */
function hasImageProcessingChanges(
  newRecord: ItemUpdatePayload,
  oldRecord: Partial<ItemUpdatePayload> | undefined
): boolean {
  if (!oldRecord) {
    // INSERT event - always refresh if it has image processing data
    return !!(newRecord.clean_key || newRecord.thumb_key);
  }

  // UPDATE event - check if any image processing field changed
  return IMAGE_PROCESSING_FIELDS.some((field) => {
    const newValue = newRecord[field];
    const oldValue = oldRecord[field];
    return newValue !== oldValue;
  });
}

/**
 * Parameters for the useWardrobeRealtimeSync hook.
 */
export interface UseWardrobeRealtimeSyncParams {
  /**
   * Whether the subscription should be active.
   * Set to false to temporarily pause real-time updates (e.g., when app is backgrounded).
   * @default true
   */
  enabled?: boolean;
}

/**
 * Result from the useWardrobeRealtimeSync hook.
 */
export interface UseWardrobeRealtimeSyncResult {
  /**
   * Whether the real-time subscription is currently active and connected.
   */
  isConnected: boolean;

  /**
   * Manually trigger a reconnection attempt.
   * Useful after network recovery or subscription errors.
   */
  reconnect: () => void;
}

/**
 * Hook for real-time synchronization of wardrobe item updates.
 *
 * Subscribes to Supabase Realtime changes on the items table, filtered by
 * the current user's ID. When image processing fields are updated by the
 * backend, automatically invalidates the relevant React Query caches to
 * trigger a refetch with fresh data.
 *
 * @param params - Hook parameters
 * @returns Subscription status and control methods
 *
 * @example
 * ```tsx
 * function WardrobeScreen() {
 *   // Enable real-time sync for this screen
 *   const { isConnected } = useWardrobeRealtimeSync();
 *
 *   // The wardrobe items query will automatically refresh
 *   // when backend updates clean_key/thumb_key
 *   const { items } = useWardrobeItems({ userId });
 *
 *   return (
 *     <View>
 *       {!isConnected && <Text>Syncing...</Text>}
 *       <WardrobeGrid items={items} />
 *     </View>
 *   );
 * }
 * ```
 */
export function useWardrobeRealtimeSync(
  params: UseWardrobeRealtimeSyncParams = {}
): UseWardrobeRealtimeSyncResult {
  const { enabled = true } = params;

  const user = useStore((state) => state.user);
  const queryClient = useQueryClient();

  // Track subscription state
  const channelRef = useRef<RealtimeChannel | null>(null);
  const isConnectedRef = useRef(false);

  /**
   * Handles an item update event from Supabase Realtime.
   *
   * Checks if the update affects image processing fields, and if so,
   * invalidates the relevant React Query caches.
   */
  const handleItemUpdate = useCallback(
    (payload: RealtimePostgresChangesPayload<ItemUpdatePayload>) => {
      const { eventType, new: newRecord, old: oldRecord } = payload;

      // Skip DELETE events - handled by delete mutation hook
      if (eventType === 'DELETE' || !newRecord) {
        return;
      }

      // Check if this update is relevant (image processing fields changed)
      if (!hasImageProcessingChanges(newRecord, oldRecord)) {
        return;
      }

      const itemId = newRecord.id;
      const userId = newRecord.user_id;

      // Log the sync event for observability
      logSuccess('wardrobe', 'realtime_item_updated', {
        data: {
          itemId,
          userId,
          eventType,
          newStatus: newRecord.image_processing_status,
          hasCleanKey: !!newRecord.clean_key,
          hasThumbKey: !!newRecord.thumb_key,
        },
      });

      // Invalidate the specific item's detail cache
      queryClient.invalidateQueries({
        queryKey: wardrobeItemsQueryKey.detail(userId, itemId),
      });

      // Invalidate the grid cache to refresh thumbnails
      queryClient.invalidateQueries({
        queryKey: wardrobeItemsQueryKey.user(userId),
        // Don't invalidate the detail query we just invalidated
        predicate: (query) => {
          const queryKey = query.queryKey;
          // Skip if this is the detail query (has 'detail' in the key)
          return !queryKey.includes('detail');
        },
      });
    },
    [queryClient]
  );

  /**
   * Creates and subscribes to the Supabase Realtime channel.
   */
  const subscribe = useCallback(() => {
    if (!user?.id) {
      return;
    }

    // Clean up any existing subscription
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    // Create a new channel with a unique name per user
    const channelName = `wardrobe-items-${user.id}`;

    const channel = supabase
      .channel(channelName)
      .on<ItemUpdatePayload>(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'items',
          filter: `user_id=eq.${user.id}`,
        },
        handleItemUpdate
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          isConnectedRef.current = true;
          logSuccess('wardrobe', 'realtime_subscribed', {
            data: { userId: user.id, channel: channelName },
          });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          isConnectedRef.current = false;
          logError(err || new Error(`Realtime subscription ${status}`), 'network', {
            feature: 'wardrobe',
            operation: 'realtime_subscribe',
            metadata: { userId: user.id, channel: channelName, status },
          });
        } else if (status === 'CLOSED') {
          isConnectedRef.current = false;
        }
      });

    channelRef.current = channel;
  }, [user?.id, handleItemUpdate]);

  /**
   * Unsubscribes and cleans up the Supabase Realtime channel.
   */
  const unsubscribe = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
      isConnectedRef.current = false;
    }
  }, []);

  /**
   * Reconnects to the Supabase Realtime channel.
   * Useful for manual recovery after network issues.
   */
  const reconnect = useCallback(() => {
    unsubscribe();
    if (enabled && user?.id) {
      subscribe();
    }
  }, [enabled, user?.id, subscribe, unsubscribe]);

  // Set up subscription on mount, clean up on unmount
  useEffect(() => {
    if (enabled && user?.id) {
      subscribe();
    }

    return () => {
      unsubscribe();
    };
  }, [enabled, user?.id, subscribe, unsubscribe]);

  return {
    isConnected: isConnectedRef.current,
    reconnect,
  };
}
