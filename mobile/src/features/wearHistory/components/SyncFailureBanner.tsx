/**
 * Banner component for displaying sync failure notifications.
 *
 * Shows a non-blocking banner when wear events have permanently failed
 * to sync after multiple retry attempts. Includes a "Try again" action
 * that re-queues the failed events for another sync attempt.
 *
 * @module features/wearHistory/components/SyncFailureBanner
 */

import React, { useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../../core/theme';
import { t } from '../../../core/i18n';

/**
 * Props for SyncFailureBanner component.
 */
export interface SyncFailureBannerProps {
  /** Number of permanently failed events */
  failedCount: number;
  /** Whether there are failed events to display */
  visible: boolean;
  /** Callback when "Try again" is pressed */
  onRetry: () => void;
  /** Callback when dismiss (X) is pressed */
  onDismiss?: () => void;
  /** Optional test ID for testing */
  testID?: string;
}

/**
 * SyncFailureBanner - Displays sync failure notifications with retry action.
 *
 * This banner appears when wear events have permanently failed to sync
 * after exceeding the maximum retry attempts. It provides:
 * - Clear message about the sync failure
 * - Count of failed items
 * - "Try again" action button
 * - Optional dismiss button
 *
 * The banner is non-blocking and appears at a fixed position (typically
 * at the top of the screen content area).
 *
 * ACCESSIBILITY:
 * - Role: alert (announces to screen readers)
 * - Buttons have proper accessibility labels and hints
 * - Minimum touch target sizes (44x44)
 * - Font scaling support
 *
 * @example
 * ```tsx
 * function HomeScreen() {
 *   const { hasFailedEvents, failedCount, retryFailedEvents } = usePendingWearEventsSync();
 *   const [dismissed, setDismissed] = useState(false);
 *
 *   return (
 *     <View>
 *       <SyncFailureBanner
 *         visible={hasFailedEvents && !dismissed}
 *         failedCount={failedCount}
 *         onRetry={retryFailedEvents}
 *         onDismiss={() => setDismissed(true)}
 *       />
 *       <Content />
 *     </View>
 *   );
 * }
 * ```
 */
export function SyncFailureBanner({
  failedCount,
  visible,
  onRetry,
  onDismiss,
  testID,
}: SyncFailureBannerProps): React.JSX.Element | null {
  const { colors, spacing, fontSize, radius } = useTheme();

  const handleRetry = useCallback(() => {
    onRetry();
  }, [onRetry]);

  const handleDismiss = useCallback(() => {
    onDismiss?.();
  }, [onDismiss]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          backgroundColor: colors.error + '15', // 15% opacity
          borderWidth: 1,
          borderColor: colors.error + '30',
          borderRadius: radius.md,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          marginHorizontal: spacing.md,
          marginBottom: spacing.md,
        },
        contentRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
        textContainer: {
          flex: 1,
          marginRight: spacing.sm,
        },
        message: {
          color: colors.textPrimary,
          fontSize: fontSize.sm,
          fontWeight: '500',
        },
        subMessage: {
          color: colors.textSecondary,
          fontSize: fontSize.xs,
          marginTop: spacing.xs / 2,
        },
        actionsRow: {
          flexDirection: 'row',
          alignItems: 'center',
        },
        retryButton: {
          backgroundColor: colors.error,
          paddingVertical: spacing.xs,
          paddingHorizontal: spacing.sm,
          borderRadius: radius.sm,
          minHeight: 44,
          minWidth: 44,
          justifyContent: 'center',
          alignItems: 'center',
        },
        retryText: {
          color: colors.errorText,
          fontSize: fontSize.xs,
          fontWeight: '600',
        },
        dismissButton: {
          padding: spacing.xs,
          marginLeft: spacing.xs,
          minWidth: 44,
          minHeight: 44,
          justifyContent: 'center',
          alignItems: 'center',
        },
        dismissText: {
          color: colors.textSecondary,
          fontSize: fontSize.lg,
          fontWeight: 'bold',
        },
      }),
    [colors, spacing, fontSize, radius]
  );

  // Don't render if not visible
  if (!visible) {
    return null;
  }

  // Build message with count
  const message = t('screens.wearHistory.syncFailure.message');
  const subMessage =
    failedCount === 1
      ? t('screens.wearHistory.syncFailure.itemCount.one')
      : t('screens.wearHistory.syncFailure.itemCount.other').replace(
          '{count}',
          failedCount.toString()
        );

  return (
    <View style={styles.container} accessibilityRole="alert" testID={testID}>
      <View style={styles.contentRow}>
        <View style={styles.textContainer}>
          <Text style={styles.message} allowFontScaling={true} maxFontSizeMultiplier={1.5}>
            {message}
          </Text>
          <Text style={styles.subMessage} allowFontScaling={true} maxFontSizeMultiplier={1.5}>
            {subMessage}
          </Text>
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={handleRetry}
            accessibilityRole="button"
            accessibilityLabel={t('screens.wearHistory.syncFailure.accessibility.retryButton')}
            accessibilityHint={t('screens.wearHistory.syncFailure.accessibility.retryHint')}
            testID={testID ? `${testID}-retry` : undefined}
          >
            <Text style={styles.retryText} allowFontScaling={true} maxFontSizeMultiplier={1.5}>
              {t('screens.wearHistory.syncFailure.retry')}
            </Text>
          </TouchableOpacity>

          {onDismiss && (
            <TouchableOpacity
              style={styles.dismissButton}
              onPress={handleDismiss}
              accessibilityRole="button"
              accessibilityLabel={t('screens.wearHistory.syncFailure.accessibility.dismissButton')}
              accessibilityHint={t('screens.wearHistory.syncFailure.accessibility.dismissHint')}
              testID={testID ? `${testID}-dismiss` : undefined}
            >
              <Text style={styles.dismissText} allowFontScaling={true} maxFontSizeMultiplier={1.5}>
                ×
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}
