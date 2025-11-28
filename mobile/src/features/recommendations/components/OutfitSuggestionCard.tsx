/**
 * Outfit suggestion card component.
 *
 * Displays a single outfit recommendation with:
 * - Context label (occasion/setting)
 * - Row of item placeholder chips
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
 *
 * @module features/recommendations/components/OutfitSuggestionCard
 */

import React, { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../core/theme';
import type { OutfitSuggestion } from '../types';

/**
 * Props for OutfitSuggestionCard component.
 */
export interface OutfitSuggestionCardProps {
  /** The outfit suggestion to display */
  suggestion: OutfitSuggestion;
  /** Optional test ID for testing */
  testID?: string;
}

/**
 * Renders a single item chip placeholder.
 *
 * Displays a shortened item ID as a chip, representing an item
 * in the outfit. In production, this would show actual item
 * thumbnails or names.
 */
function ItemChip({ itemId, index }: { itemId: string; index: number }): React.JSX.Element {
  const { colors, spacing, radius, fontSize } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        chip: {
          backgroundColor: colors.textSecondary + '20',
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.xs,
          borderRadius: radius.sm,
          marginRight: spacing.xs,
          marginBottom: spacing.xs,
        },
        chipText: {
          fontSize: fontSize.xs,
          color: colors.textSecondary,
        },
      }),
    [colors, spacing, radius, fontSize]
  );

  // Display shortened item ID or "Item N" for readability
  const displayLabel = `Item ${index + 1}`;

  return (
    <View style={styles.chip}>
      <Text
        style={styles.chipText}
        allowFontScaling={true}
        maxFontSizeMultiplier={1.5}
        numberOfLines={1}
      >
        {displayLabel}
      </Text>
    </View>
  );
}

/**
 * Outfit suggestion card displaying context, items, and reason.
 *
 * Layout:
 * ┌─────────────────────────────────┐
 * │ CONTEXT LABEL                   │
 * │ [Item 1] [Item 2] [Item 3] ...  │
 * │ Reason text explaining why this │
 * │ outfit was suggested...         │
 * └─────────────────────────────────┘
 *
 * @param props - Component props
 * @returns Memoized card component
 */
function OutfitSuggestionCardComponent({
  suggestion,
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
        },
        reasonText: {
          fontSize: fontSize.sm,
          color: colors.textPrimary,
          lineHeight: fontSize.sm * 1.5,
        },
      }),
    [colors, spacing, radius, fontSize]
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
      <View style={styles.itemsRow} accessibilityLabel={`${suggestion.itemIds.length} items`}>
        {suggestion.itemIds.map((itemId, index) => (
          <ItemChip key={itemId} itemId={itemId} index={index} />
        ))}
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
