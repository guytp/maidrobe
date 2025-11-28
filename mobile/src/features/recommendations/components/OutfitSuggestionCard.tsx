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

import React, { memo, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../core/theme';
import { t } from '../../../core/i18n';
import { OutfitItemChip } from './OutfitItemChip';
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
}: OutfitSuggestionCardProps): React.JSX.Element {
  const { colors, spacing, radius, fontSize } = useTheme();

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
      }),
    [colors, spacing, radius, fontSize]
  );

  const itemsAccessibilityLabel = useMemo(
    () => (items.length > 0 ? buildItemsAccessibilityLabel(items) : undefined),
    [items]
  );

  return (
    <View
      style={styles.card}
      testID={testID}
      accessible={true}
      accessibilityLabel={`Outfit suggestion for ${suggestion.context}. ${suggestion.reason}`}
    >
      {/* Context label */}
      <Text
        style={styles.contextLabel}
        allowFontScaling={true}
        maxFontSizeMultiplier={1.5}
        numberOfLines={1}
      >
        {suggestion.context}
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
            <OutfitItemChip
              key={item.id}
              item={item}
              testID={`${testID}-item-${item.id}`}
            />
          ))
        ) : (
          // Fallback to showing item count if no items resolved yet
          suggestion.itemIds.map((itemId, index) => (
            <View
              key={itemId}
              style={{
                backgroundColor: colors.textSecondary + '20',
                paddingHorizontal: spacing.sm,
                paddingVertical: spacing.xs,
                borderRadius: radius.sm,
                marginRight: spacing.xs,
                marginBottom: spacing.xs,
              }}
            >
              <Text
                style={{ fontSize: fontSize.xs, color: colors.textSecondary }}
                allowFontScaling={true}
                maxFontSizeMultiplier={1.5}
              >
                {`Item ${index + 1}`}
              </Text>
            </View>
          ))
        )}
      </View>

      {/* Reason text */}
      <Text style={styles.reasonText} allowFontScaling={true} maxFontSizeMultiplier={2}>
        {suggestion.reason}
      </Text>
    </View>
  );
}

/**
 * Memoized outfit suggestion card.
 *
 * Only re-renders when the suggestion object reference changes.
 */
export const OutfitSuggestionCard = memo(OutfitSuggestionCardComponent);
