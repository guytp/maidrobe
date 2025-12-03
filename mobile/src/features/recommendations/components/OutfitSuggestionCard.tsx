/**
 * Outfit suggestion card component.
 *
 * Displays a single outfit recommendation with:
 * - Context label (occasion/setting)
 * - Row of resolved item chips (with thumbnails)
 * - Natural-language reason text
 *
 * PERFORMANCE:
 * - Memoized to prevent unnecessary re-renders in lists
 * - Uses static styles where possible
 *
 * ACCESSIBILITY:
 * - Proper semantic structure
 * - Font scaling support
 * - Sufficient color contrast
 * - Item availability announced via accessibility label
 *
 * @module features/recommendations/components/OutfitSuggestionCard
 */

import React, { memo, useCallback, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../core/theme';
import { t } from '../../../core/i18n';
import { Button } from '../../../core/components/Button';
import { OutfitItemChip, MIN_CHIP_HEIGHT } from './OutfitItemChip';
import type { OutfitSuggestion, OutfitItemViewModel } from '../types';

/**
 * Props for OutfitSuggestionCard component.
 */
export interface OutfitSuggestionCardProps {
  /** The outfit suggestion to display */
  suggestion: OutfitSuggestion;
  /** Resolved item view-models for this outfit */
  items: OutfitItemViewModel[];
  /** Whether items are currently being resolved */
  isLoadingItems?: boolean;
  /** Optional test ID for testing */
  testID?: string;
  /** Callback when "Wear this today" is tapped */
  onWearToday?: (suggestion: OutfitSuggestion) => void;
  /** Whether the wear mutation is in progress for this card */
  isMarkingAsWorn?: boolean;
  /** Whether this outfit is already marked as worn today */
  isWornToday?: boolean;
}

/**
 * Builds accessibility label for items row.
 *
 * @param items - Array of item view-models
 * @returns Accessibility label describing item availability
 */
function buildItemsAccessibilityLabel(items: OutfitItemViewModel[]): string {
  const total = items.length;
  const resolved = items.filter((item) => item.status === 'resolved').length;

  return t('screens.home.recommendations.itemChip.accessibility.itemCount')
    .replace('{resolved}', resolved.toString())
    .replace('{total}', total.toString());
}

/**
 * Gets the display context with fallback for missing/empty values.
 *
 * @param context - Context from the outfit suggestion (may be undefined, null, or empty)
 * @returns Display-safe context string
 */
function getDisplayContext(context: string | undefined | null): string {
  if (context && context.trim().length > 0) {
    return context;
  }
  return t('screens.home.recommendations.fallbackContext');
}

/**
 * Builds accessibility label for the outfit card with null-safe context handling.
 *
 * @param context - Context from the outfit suggestion
 * @param reason - Reason explanation from the outfit suggestion
 * @returns Accessibility label for the card
 */
function buildCardAccessibilityLabel(context: string | undefined | null, reason: string): string {
  if (context && context.trim().length > 0) {
    return t('screens.home.recommendations.accessibility.cardLabel')
      .replace('{context}', context)
      .replace('{reason}', reason);
  }
  return t('screens.home.recommendations.accessibility.cardLabelNoContext').replace(
    '{reason}',
    reason
  );
}

/**
 * Outfit suggestion card displaying context, items, and reason.
 *
 * Layout:
 * ┌─────────────────────────────────────────────┐
 * │ CONTEXT LABEL                               │
 * │ [Thumb] Name  [Thumb] Name  [!] Missing...  │
 * │ Reason text explaining why this outfit      │
 * │ was suggested...                            │
 * └─────────────────────────────────────────────┘
 *
 * @param props - Component props
 * @returns Memoized card component
 */
function OutfitSuggestionCardComponent({
  suggestion,
  items,
  isLoadingItems = false,
  testID,
  onWearToday,
  isMarkingAsWorn = false,
  isWornToday = false,
}: OutfitSuggestionCardProps): React.JSX.Element {
  const { colors, spacing, radius, fontSize } = useTheme();

  // Memoized callback to handle wear today button press
  const handleWearToday = useCallback(() => {
    onWearToday?.(suggestion);
  }, [onWearToday, suggestion]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          backgroundColor: colors.background,
          borderWidth: 1,
          borderColor: colors.textSecondary + '30',
          borderRadius: radius.md,
          padding: spacing.md,
          marginBottom: spacing.md,
        },
        contextLabel: {
          fontSize: fontSize.xs,
          fontWeight: '600',
          color: colors.textSecondary,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: spacing.sm,
        },
        itemsRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          marginBottom: spacing.sm,
          minHeight: 40,
        },
        loadingContainer: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: spacing.xs,
        },
        loadingText: {
          fontSize: fontSize.xs,
          color: colors.textSecondary,
          marginLeft: spacing.xs,
        },
        reasonText: {
          fontSize: fontSize.sm,
          color: colors.textPrimary,
          lineHeight: fontSize.sm * 1.5,
        },
        placeholderChip: {
          backgroundColor: colors.textSecondary + '20',
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.xs,
          borderRadius: radius.sm,
          marginRight: spacing.xs,
          marginBottom: spacing.xs,
          minHeight: MIN_CHIP_HEIGHT,
          justifyContent: 'center',
        },
        placeholderText: {
          fontSize: fontSize.xs,
          color: colors.textSecondary,
        },
        actionArea: {
          marginTop: spacing.md,
          paddingTop: spacing.sm,
          borderTopWidth: 1,
          borderTopColor: colors.textSecondary + '20',
        },
        wornIndicator: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: spacing.sm,
        },
        wornCheckmark: {
          fontSize: fontSize.base,
          marginRight: spacing.xs,
        },
        wornText: {
          fontSize: fontSize.sm,
          fontWeight: '600',
          color: colors.textSecondary,
        },
      }),
    [colors, spacing, radius, fontSize]
  );

  const itemsAccessibilityLabel = useMemo(
    () => (items.length > 0 ? buildItemsAccessibilityLabel(items) : undefined),
    [items]
  );

  // Get display-safe context with fallback
  const displayContext = getDisplayContext(suggestion.context);
  const cardAccessibilityLabel = buildCardAccessibilityLabel(suggestion.context, suggestion.reason);

  return (
    <View
      style={styles.card}
      testID={testID}
      accessible={true}
      accessibilityLabel={cardAccessibilityLabel}
    >
      {/* Context label */}
      <Text
        style={styles.contextLabel}
        allowFontScaling={true}
        maxFontSizeMultiplier={1.5}
        numberOfLines={1}
      >
        {displayContext}
      </Text>

      {/* Item chips row */}
      <View style={styles.itemsRow} accessibilityLabel={itemsAccessibilityLabel}>
        {isLoadingItems ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.textSecondary} />
            <Text style={styles.loadingText} allowFontScaling={true} maxFontSizeMultiplier={1.5}>
              {t('screens.home.recommendations.itemChip.loadingItems')}
            </Text>
          </View>
        ) : items.length > 0 ? (
          items.map((item) => (
            <OutfitItemChip key={item.id} item={item} testID={`${testID}-item-${item.id}`} />
          ))
        ) : (
          // Fallback to showing item count if no items resolved yet
          suggestion.itemIds.map((itemId, index) => (
            <View key={itemId} style={styles.placeholderChip}>
              <Text
                style={styles.placeholderText}
                allowFontScaling={true}
                maxFontSizeMultiplier={1.5}
              >
                {t('screens.home.recommendations.itemChip.placeholderItem').replace(
                  '{number}',
                  (index + 1).toString()
                )}
              </Text>
            </View>
          ))
        )}
      </View>

      {/* Reason text */}
      <Text style={styles.reasonText} allowFontScaling={true} maxFontSizeMultiplier={2}>
        {suggestion.reason}
      </Text>

      {/* Action area - button or worn indicator */}
      {onWearToday && (
        <View style={styles.actionArea} testID={`${testID}-action-area`}>
          {isWornToday ? (
            <View
              style={styles.wornIndicator}
              testID={`${testID}-worn-indicator`}
              accessibilityRole="text"
              accessibilityLabel={t('screens.wearHistory.accessibility.wornIndicator').replace(
                '{date}',
                t('screens.wearHistory.wornToday')
              )}
            >
              <Text style={styles.wornCheckmark}>✓</Text>
              <Text
                style={styles.wornText}
                allowFontScaling={true}
                maxFontSizeMultiplier={1.5}
              >
                {t('screens.wearHistory.wornToday')}
              </Text>
            </View>
          ) : (
            <Button
              onPress={handleWearToday}
              variant="primary"
              loading={isMarkingAsWorn}
              disabled={isMarkingAsWorn}
              accessibilityLabel={t('screens.wearHistory.accessibility.wearTodayButton')}
              accessibilityHint={t('screens.wearHistory.accessibility.wearTodayHint')}
            >
              {t('screens.wearHistory.wearThisToday')}
            </Button>
          )}
        </View>
      )}
    </View>
  );
}

/**
 * Memoized outfit suggestion card.
 *
 * Only re-renders when the suggestion object reference changes.
 */
export const OutfitSuggestionCard = memo(OutfitSuggestionCardComponent);
