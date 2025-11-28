/**
 * Outfit item chip component.
 *
 * Displays a single item within an outfit suggestion as a chip with:
 * - Thumbnail image (if available)
 * - Display name
 * - Visual indicator for missing items
 *
 * PERFORMANCE:
 * - Memoized to prevent unnecessary re-renders in lists
 * - Uses static styles where possible
 * - Image loading handled efficiently by React Native
 *
 * ACCESSIBILITY:
 * - Proper semantic roles
 * - Descriptive labels including type and status
 * - Font scaling support
 *
 * @module features/recommendations/components/OutfitItemChip
 */

import React, { memo, useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../core/theme';
import { t } from '../../../core/i18n';
import type { OutfitItemViewModel } from '../types';

/**
 * Props for OutfitItemChip component.
 */
export interface OutfitItemChipProps {
  /** The item view-model to display */
  item: OutfitItemViewModel;
  /** Optional test ID for testing */
  testID?: string;
}

/** Thumbnail size in pixels */
const THUMBNAIL_SIZE = 32;

/**
 * Builds accessibility label for an item chip.
 *
 * @param item - Item view-model
 * @returns Accessibility label string
 */
function buildAccessibilityLabel(item: OutfitItemViewModel): string {
  if (item.status === 'missing') {
    return t('screens.home.recommendations.itemChip.accessibility.missingItem');
  }

  if (item.type) {
    return t('screens.home.recommendations.itemChip.accessibility.resolvedItem')
      .replace('{name}', item.displayName)
      .replace('{type}', item.type);
  }

  return t('screens.home.recommendations.itemChip.accessibility.resolvedItemNoType').replace(
    '{name}',
    item.displayName
  );
}

/**
 * Renders a single outfit item as a chip.
 *
 * Layout for resolved items with thumbnail:
 * ┌──────────────────────────┐
 * │ [IMG] Display Name       │
 * └──────────────────────────┘
 *
 * Layout for missing items:
 * ┌──────────────────────────┐
 * │ ⚠ Item unavailable       │
 * └──────────────────────────┘
 *
 * @param props - Component props
 * @returns Memoized chip component
 */
function OutfitItemChipComponent({ item, testID }: OutfitItemChipProps): React.JSX.Element {
  const { colors, spacing, radius, fontSize } = useTheme();

  const isMissing = item.status === 'missing';

  const styles = useMemo(
    () =>
      StyleSheet.create({
        chip: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: isMissing ? colors.error + '15' : colors.textSecondary + '15',
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.xs,
          borderRadius: radius.sm,
          marginRight: spacing.xs,
          marginBottom: spacing.xs,
          borderWidth: isMissing ? 1 : 0,
          borderColor: isMissing ? colors.error + '30' : 'transparent',
        },
        thumbnail: {
          width: THUMBNAIL_SIZE,
          height: THUMBNAIL_SIZE,
          borderRadius: radius.xs,
          marginRight: spacing.xs,
          backgroundColor: colors.textSecondary + '20',
        },
        thumbnailPlaceholder: {
          width: THUMBNAIL_SIZE,
          height: THUMBNAIL_SIZE,
          borderRadius: radius.xs,
          marginRight: spacing.xs,
          backgroundColor: colors.textSecondary + '20',
          justifyContent: 'center',
          alignItems: 'center',
        },
        missingIcon: {
          fontSize: fontSize.sm,
        },
        chipText: {
          fontSize: fontSize.xs,
          color: isMissing ? colors.error : colors.textSecondary,
          maxWidth: 100,
        },
      }),
    [colors, spacing, radius, fontSize, isMissing]
  );

  const accessibilityLabel = useMemo(() => buildAccessibilityLabel(item), [item]);

  // Determine what to display
  const displayText = isMissing
    ? t('screens.home.recommendations.itemChip.missingItem')
    : item.displayName || t('screens.home.recommendations.itemChip.unnamedItem');

  return (
    <View
      style={styles.chip}
      testID={testID}
      accessible={true}
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
    >
      {/* Thumbnail or placeholder */}
      {item.thumbnailUrl && !isMissing ? (
        <Image
          source={{ uri: item.thumbnailUrl }}
          style={styles.thumbnail}
          resizeMode="cover"
          accessibilityElementsHidden={true}
        />
      ) : isMissing ? (
        <View style={styles.thumbnailPlaceholder}>
          <Text style={styles.missingIcon} accessibilityElementsHidden={true}>
            !
          </Text>
        </View>
      ) : (
        <View style={styles.thumbnailPlaceholder} accessibilityElementsHidden={true} />
      )}

      {/* Display text */}
      <Text
        style={styles.chipText}
        allowFontScaling={true}
        maxFontSizeMultiplier={1.5}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {displayText}
      </Text>
    </View>
  );
}

/**
 * Memoized outfit item chip.
 *
 * Only re-renders when the item object reference changes.
 */
export const OutfitItemChip = memo(OutfitItemChipComponent);
