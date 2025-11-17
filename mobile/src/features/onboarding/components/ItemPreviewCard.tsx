import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { WardrobeItem } from '../types/wardrobeItem';
import { WARDROBE_COLOUR_PALETTE } from '../types/itemMetadata';

/**
 * Item preview card component props.
 */
export interface ItemPreviewCardProps {
  /** Wardrobe item to display */
  item: WardrobeItem;
}

/**
 * Item preview card component.
 *
 * Displays a preview of a successfully created wardrobe item.
 * Shows placeholder image representation, type, colour, and name.
 *
 * PLACEHOLDER IMPLEMENTATION:
 * This component provides a simple preview until Feature #3 (Wardrobe Item
 * Capture & Management) provides the full item card UI with real image display.
 *
 * TODO: Replace with real implementation when Feature #3 is available.
 * Expected integration:
 * ```typescript
 * import { WardrobeItemCard } from '../../wardrobe/components/WardrobeItemCard';
 * ```
 *
 * Features:
 * - Displays item type and colour
 * - Shows optional name
 * - Matches main wardrobe UI style (placeholder)
 * - Accessibility support
 *
 * @param props - Component props
 * @returns Item preview card component
 */
export function ItemPreviewCard({ item }: ItemPreviewCardProps): React.JSX.Element {
  const { colors, spacing, radius } = useTheme();

  // Get colour info
  const colour = WARDROBE_COLOUR_PALETTE.find((c) => c.id === item.colour[0]);
  const colourName = colour ? t(colour.name as Parameters<typeof t>[0]) : 'Unknown';
  const colourHex = colour?.hex || '#CCCCCC';

  // Get type label
  const typeLabel = t(`screens.auth.itemTypes.${item.type}` as Parameters<typeof t>[0]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          backgroundColor: colors.background,
          borderRadius: radius.md,
          padding: spacing.lg,
          borderWidth: 1,
          borderColor: colors.textSecondary + '30',
          alignItems: 'center',
        },
        title: {
          fontSize: 18,
          fontWeight: '600',
          color: colors.textPrimary,
          marginBottom: spacing.md,
        },
        imageContainer: {
          width: 120,
          height: 120,
          borderRadius: radius.md,
          backgroundColor: colors.textSecondary + '10',
          marginBottom: spacing.md,
          justifyContent: 'center',
          alignItems: 'center',
          overflow: 'hidden',
        },
        colourSwatch: {
          width: 60,
          height: 60,
          borderRadius: 30,
          borderWidth: 2,
          borderColor: colors.textSecondary,
        },
        details: {
          alignItems: 'center',
          gap: spacing.xs,
        },
        typeText: {
          fontSize: 16,
          fontWeight: '600',
          color: colors.textPrimary,
        },
        colourText: {
          fontSize: 14,
          color: colors.textSecondary,
        },
        nameText: {
          fontSize: 14,
          color: colors.textSecondary,
          fontStyle: 'italic',
          marginTop: spacing.xs,
        },
      }),
    [colors, spacing, radius]
  );

  return (
    <View
      style={styles.container}
      accessibilityLabel={`${typeLabel} item preview`}
      accessibilityHint="Preview of your newly created wardrobe item"
    >
      <Text
        style={styles.title}
        accessibilityRole="header"
        allowFontScaling={true}
        maxFontSizeMultiplier={2}
      >
        {t('screens.onboarding.firstItem.success.previewTitle')}
      </Text>

      {/* Placeholder image - shows colour swatch */}
      <View style={styles.imageContainer}>
        <View
          style={[styles.colourSwatch, { backgroundColor: colourHex }]}
          accessibilityLabel={`${colourName} colour swatch`}
        />
      </View>

      {/* Item details */}
      <View style={styles.details}>
        <Text style={styles.typeText} allowFontScaling={true} maxFontSizeMultiplier={2}>
          {typeLabel}
        </Text>
        <Text style={styles.colourText} allowFontScaling={true} maxFontSizeMultiplier={2}>
          {colourName}
        </Text>
        {item.name && (
          <Text style={styles.nameText} allowFontScaling={true} maxFontSizeMultiplier={2}>
            &quot;{item.name}&quot;
          </Text>
        )}
      </View>
    </View>
  );
}
