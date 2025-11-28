/**
 * Network status hook for offline detection.
 *
 * Provides reactive network connectivity state using NetInfo.
 * Used by recommendation hooks to fail fast when offline and
 * surface specific offline messaging.
 *
 * @module features/recommendations/hooks/useNetworkStatus
 */

import { useEffect, useState, useCallback } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

/**
 * Network status state.
 */
export interface NetworkStatus {
  /** Whether the device has network connectivity */
  isOnline: boolean;
  /** Whether the network check has completed at least once */
  isInitialized: boolean;
}

/**
 * Hook for monitoring network connectivity status.
 *
 * Uses NetInfo to track online/offline state. Considers the device
 * online if `isConnected === true` AND `isInternetReachable !== false`.
 *
 * The `isInternetReachable` check handles cases where device is connected
 * to WiFi but the network has no internet access (captive portals, etc.).
 *
 * PERFORMANCE:
 * - Subscribes to NetInfo on mount, unsubscribes on unmount
 * - Minimal re-renders (only when connectivity state changes)
 *
 * @returns Network status object with isOnline and isInitialized flags
 *
 * @example
 * ```typescript
 * function MyComponent() {
 *   const { isOnline, isInitialized } = useNetworkStatus();
 *
 *   if (!isInitialized) {
 *     return <Loading />;
 *   }
 *
 *   if (!isOnline) {
 *     return <OfflineMessage />;
 *   }
 *
 *   return <Content />;
 * }
 * ```
 */
export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({
    isOnline: true, // Optimistic default
    isInitialized: false,
  });

  const handleNetworkChange = useCallback((state: NetInfoState) => {
    // Consider online if connected AND internet is reachable (or unknown)
    // isInternetReachable can be null on some platforms/states
    const isOnline = state.isConnected === true && state.isInternetReachable !== false;

    setStatus({
      isOnline,
      isInitialized: true,
    });
  }, []);

  useEffect(() => {
    // Get initial state
    NetInfo.fetch().then(handleNetworkChange);

    // Subscribe to changes
    const unsubscribe = NetInfo.addEventListener(handleNetworkChange);

    return () => {
      unsubscribe();
    };
  }, [handleNetworkChange]);

  return status;
}

/**
 * Synchronously checks if the device appears to be offline.
 *
 * This is a one-shot check useful for pre-flight validation before
 * making network requests. For reactive updates, use useNetworkStatus().
 *
 * @returns Promise resolving to true if offline, false if online
 */
export async function checkIsOffline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return state.isConnected !== true || state.isInternetReachable === false;
}
