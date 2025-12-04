/**
 * Wear event card component for displaying individual wear history entries.
 *
 * Renders a single wear event in the history list with:
 * - Context/occasion description if available
 * - Source indicator (AI recommendation, saved outfit, etc.)
 * - Time of wear
 * - Touch feedback and accessibility labels
 * - WCAG AA compliant touch targets (44px minimum)
 *
 * @module features/wearHistory/components/WearEventCard
 */

import React, { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import type { WearHistoryRow, WearHistorySource } from '../types';

/**
 * Props for WearEventCard component.
 */
export interface WearEventCardProps {
  /**
   * The wear event to display.
   */
  event: WearHistoryRow;

  /**
   * Callback when the card is pressed.
   * Receives the event for navigation to outfit details.
   */
  onPress?: (event: WearHistoryRow) => void;

  /**
   * Test ID for testing purposes.
   */
  testID?: string;
}

/**
 * Minimum touch target size for accessibility (WCAG 2.1 AA).
 */
const TOUCH_TARGET_SIZE = 44;

/**
 * Maps wear history source to user-friendly display string.
 *
 * @param source - The source of the wear event
 * @returns Localized display string for the source
 */
function getSourceLabel(source: WearHistorySource): string {
  switch (source) {
    case 'ai_recommendation':
      return t('screens.history.event.fromRecommendation');
    case 'saved_outfit':
      return t('screens.history.event.fromSavedOutfit');
    case 'manual_outfit':
      return t('screens.history.event.manualOutfit');
    case 'imported':
      return t('screens.history.event.imported');
    default:
      return '';
  }
}

/**
 * Formats the time portion of a wear event for display.
 *
 * @param wornAt - ISO 8601 timestamp
 * @returns Formatted time string (e.g., "2:30 PM")
 */
function formatWearTime(wornAt: string): string {
  const date = new Date(wornAt);
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Wear event card for history list display.
 *
 * Features:
 * - Context/occasion display with fallback
 * - Source indicator (AI recommendation, saved outfit, etc.)
 * - Time of wear
 * - Touch feedback with opacity change
 * - WCAG AA touch target compliance
 * - Memoized for scroll performance
 *
 * @param props - Component props
 * @returns Rendered card component
 *
 * @example
 * ```tsx
 * <WearEventCard
 *   event={wearEvent}
 *   onPress={(event) => router.push(`/outfit/${event.outfit_id}`)}
 * />
 * ```
 */
function WearEventCardComponent({
  event,
  onPress,
  testID,
}: WearEventCardProps): React.JSX.Element {
  const { colors, spacing, radius, fontSize } = useTheme();

  // Get source label
  const sourceLabel = useMemo(() => getSourceLabel(event.source), [event.source]);

  // Format time
  const timeLabel = useMemo(() => formatWearTime(event.worn_at), [event.worn_at]);

  // Display context with fallback
  const displayContext = event.context?.trim() || t('screens.history.event.defaultContext');

  // Item count for display
  const itemCount = event.item_ids.length;

  // Handle press event
  const handlePress = useCallback(() => {
    onPress?.(event);
  }, [event, onPress]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          backgroundColor: colors.background,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.textSecondary + '20',
          marginHorizontal: spacing.md,
          marginBottom: spacing.sm,
          overflow: 'hidden',
        },
        pressable: {
          minHeight: TOUCH_TARGET_SIZE,
          padding: spacing.md,
        },
        topRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: spacing.xs,
        },
        contextText: {
          flex: 1,
          fontSize: fontSize.base,
          fontWeight: '500',
          color: colors.textPrimary,
          marginRight: spacing.sm,
        },
        timeText: {
          fontSize: fontSize.sm,
          color: colors.textSecondary,
        },
        bottomRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        },
        sourceText: {
          fontSize: fontSize.sm,
          color: colors.textSecondary,
        },
        itemCountText: {
          fontSize: fontSize.sm,
          color: colors.textSecondary,
        },
      }),
    [colors, spacing, radius, fontSize]
  );

  // Accessibility label combines context and time
  const accessibilityLabel = `${displayContext}, ${t('screens.history.event.at').replace('{time}', timeLabel)}`;
  const accessibilityHint = t('screens.history.accessibility.eventCardHint');

  return (
    <View style={styles.container} testID={testID}>
      <Pressable
        style={({ pressed }) => [styles.pressable, pressed && { opacity: 0.7 }]}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
      >
        <View style={styles.topRow}>
          <Text
            style={styles.contextText}
            numberOfLines={2}
            ellipsizeMode="tail"
            allowFontScaling
            maxFontSizeMultiplier={1.5}
          >
            {displayContext}
          </Text>
          <Text
            style={styles.timeText}
            allowFontScaling
            maxFontSizeMultiplier={1.5}
          >
            {timeLabel}
          </Text>
        </View>
        <View style={styles.bottomRow}>
          {sourceLabel ? (
            <Text
              style={styles.sourceText}
              allowFontScaling
              maxFontSizeMultiplier={1.5}
            >
              {sourceLabel}
            </Text>
          ) : (
            <View />
          )}
          <Text
            style={styles.itemCountText}
            allowFontScaling
            maxFontSizeMultiplier={1.5}
          >
            {t('screens.history.event.itemCount').replace('{count}', String(itemCount))}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

/**
 * Memoized wear event card component.
 *
 * Memoization prevents unnecessary re-renders when scrolling
 * through the wear history list. Only re-renders when event data
 * or press handler changes.
 */
export const WearEventCard = memo(WearEventCardComponent);
