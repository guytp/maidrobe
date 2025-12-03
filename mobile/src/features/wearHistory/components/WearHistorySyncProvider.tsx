/**
 * Provider component for wear history background sync.
 *
 * Integrates the sync hook and failure banner at the app root level.
 * This component:
 * - Runs background sync on app foreground and network reconnect
 * - Shows a non-blocking banner when sync failures occur
 * - Provides retry functionality for permanently failed events
 *
 * @module features/wearHistory/components/WearHistorySyncProvider
 */

import React, { useState, useCallback, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { usePendingWearEventsSync } from '../hooks/usePendingWearEventsSync';
import { SyncFailureBanner } from './SyncFailureBanner';

/**
 * Props for WearHistorySyncProvider component.
 */
export interface WearHistorySyncProviderProps {
  /** Child components to render */
  children: React.ReactNode;
}

/**
 * WearHistorySyncProvider - Manages wear history background sync and error display.
 *
 * This provider should be placed high in the component tree (typically at app root)
 * to ensure sync runs regardless of navigation state.
 *
 * BANNER BEHAVIOR:
 * - Appears when events permanently fail (exceed MAX_SYNC_ATTEMPTS)
 * - Can be dismissed by user (hidden until new failures occur)
 * - "Try again" re-queues all failed events for another sync cycle
 * - Banner reappears if new failures occur after dismissal
 *
 * SYNC TRIGGERS:
 * - Network connectivity restored
 * - App comes to foreground
 * - On mount if there are pending events
 *
 * @example
 * ```tsx
 * // In app root layout
 * function RootLayout() {
 *   return (
 *     <WearHistorySyncProvider>
 *       <Stack screenOptions={{ headerShown: false }} />
 *     </WearHistorySyncProvider>
 *   );
 * }
 * ```
 */
export function WearHistorySyncProvider({
  children,
}: WearHistorySyncProviderProps): React.JSX.Element {
  // Initialize sync hook - this runs background sync automatically
  const { hasFailedEvents, failedCount, retryFailedEvents } = usePendingWearEventsSync();

  // Track whether user has dismissed the banner
  const [isDismissed, setIsDismissed] = useState(false);

  // Reset dismissed state when new failures occur
  // This ensures banner shows again if sync fails after dismissal
  const [lastFailedCount, setLastFailedCount] = useState(0);
  if (hasFailedEvents && failedCount > lastFailedCount) {
    setIsDismissed(false);
    setLastFailedCount(failedCount);
  } else if (!hasFailedEvents && lastFailedCount > 0) {
    setLastFailedCount(0);
  }

  const handleRetry = useCallback(() => {
    retryFailedEvents();
    setIsDismissed(false);
  }, [retryFailedEvents]);

  const handleDismiss = useCallback(() => {
    setIsDismissed(true);
  }, []);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
        },
      }),
    []
  );

  // Show banner if there are failed events and user hasn't dismissed
  const showBanner = hasFailedEvents && !isDismissed;

  return (
    <View style={styles.container}>
      <SyncFailureBanner
        visible={showBanner}
        failedCount={failedCount}
        onRetry={handleRetry}
        onDismiss={handleDismiss}
        testID="sync-failure-banner"
      />
      {children}
    </View>
  );
}
