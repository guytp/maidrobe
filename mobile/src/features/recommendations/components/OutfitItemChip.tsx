/**
 * Outfit item chip component.
 *
 * Displays a single item within an outfit suggestion as a chip with:
 * - Optimised thumbnail image with caching (using React Native Image)
 * - Fallback placeholder for missing/failed images
 * - Display name with ellipsis truncation
 * - Visual indicator for missing/deleted items
 *
 * IMAGE LOADING:
 * - Uses React Native's built-in Image component with automatic caching
 * - Lazy loading coordinated via parent FlatList virtualisation settings
 * - Images only loaded when chips scroll into the render window
 * - onError handler switches to placeholder on 404/timeout/network errors
 *
 * PERFORMANCE:
 * - Memoized to prevent unnecessary re-renders in lists
 * - Static styles extracted where possible
 * - Image error state tracked via useState for fallback rendering
 *
 * ACCESSIBILITY:
 * - Comprehensive labels including name, type, colour, and outfit context
 * - Clear indication when items are missing/unavailable
 * - WCAG AA compliant touch targets (minimum 44px height)
 * - Font scaling support with maximum multiplier
 * - Sufficient colour contrast for all states
 *
 * @module features/recommendations/components/OutfitItemChip
 */

import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  View,
  type ImageErrorEventData,
  type NativeSyntheticEvent,
} from 'react-native';
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

/** Thumbnail size in pixels - optimised for chip display */
const THUMBNAIL_SIZE = 32;

/** Minimum chip height for WCAG AA touch target compliance */
const MIN_CHIP_HEIGHT = 44;

/** Placeholder emoji for items without images */
const PLACEHOLDER_ICON = '👔';

/** Warning icon for missing/deleted items */
const MISSING_ICON = '⚠️';

/**
 * Builds a comprehensive accessibility label for an item chip.
 *
 * For resolved items, includes:
 * - Item display name
 * - Item type (if available)
 * - Primary colour (if available)
 * - Context that item is part of a suggested outfit
 *
 * For missing items, clearly states:
 * - Item is no longer available
 * - Was previously part of the wardrobe
 *
 * @param item - Item view-model
 * @returns Accessibility label string
 */
function buildAccessibilityLabel(item: OutfitItemViewModel): string {
  if (item.status === 'missing') {
    return t('screens.home.recommendations.itemChip.accessibility.missingItem');
  }

  // Build label with available information
  const parts: string[] = [];

  // Always include the display name
  parts.push(item.displayName || t('screens.home.recommendations.itemChip.unnamedItem'));

  // Add type if available
  if (item.type) {
    parts.push(item.type);
  }

  // Add primary colour if available
  if (item.colour && item.colour.length > 0) {
    parts.push(item.colour[0]);
  }

  // Add outfit context
  parts.push(t('screens.home.recommendations.itemChip.accessibility.outfitContext'));

  return parts.join(', ');
}

/**
 * Renders a single outfit item as a chip with thumbnail and name.
 *
 * Layout for resolved items with thumbnail:
 * ┌──────────────────────────────┐
 * │ [IMG] Display Name           │  ← min height 44px
 * └──────────────────────────────┘
 *
 * Layout for resolved items without thumbnail (placeholder):
 * ┌──────────────────────────────┐
 * │ [👔] Display Name            │  ← neutral placeholder
 * └──────────────────────────────┘
 *
 * Layout for missing/deleted items:
 * ┌──────────────────────────────┐
 * │ [⚠️] Item unavailable        │  ← error styling
 * └──────────────────────────────┘
 *
 * @param props - Component props
 * @returns Memoized chip component
 */
function OutfitItemChipComponent({ item, testID }: OutfitItemChipProps): React.JSX.Element {
  const { colors, spacing, radius, fontSize } = useTheme();

  // Track image load errors to show placeholder fallback
  const [imageError, setImageError] = useState(false);

  // Reset error state when thumbnail URL changes, allowing retry with new URL.
  // This handles the case where an item initially has no thumbnail (placeholder shown),
  // then later receives a valid URL after batch resolution completes.
  useEffect(() => {
    setImageError(false);
  }, [item.thumbnailUrl]);

  const isMissing = item.status === 'missing';

  // Determine if we should show the placeholder instead of the image
  const showPlaceholder = !item.thumbnailUrl || imageError || isMissing;

  // Handle image load error - switch to placeholder
  const handleImageError = useCallback((_event: NativeSyntheticEvent<ImageErrorEventData>) => {
    setImageError(true);
  }, []);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        chip: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: isMissing ? colors.error + '15' : colors.textSecondary + '15',
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.sm,
          borderRadius: radius.sm,
          marginRight: spacing.xs,
          marginBottom: spacing.xs,
          minHeight: MIN_CHIP_HEIGHT,
          borderWidth: isMissing ? 1 : 0,
          borderColor: isMissing ? colors.error + '30' : 'transparent',
        },
        thumbnail: {
          width: THUMBNAIL_SIZE,
          height: THUMBNAIL_SIZE,
          borderRadius: radius.sm,
          marginRight: spacing.sm,
          backgroundColor: colors.textSecondary + '20',
        },
        thumbnailPlaceholder: {
          width: THUMBNAIL_SIZE,
          height: THUMBNAIL_SIZE,
          borderRadius: radius.sm,
          marginRight: spacing.sm,
          backgroundColor: colors.textSecondary + '15',
          justifyContent: 'center',
          alignItems: 'center',
        },
        placeholderIcon: {
          fontSize: fontSize.base,
          opacity: 0.6,
        },
        missingPlaceholder: {
          width: THUMBNAIL_SIZE,
          height: THUMBNAIL_SIZE,
          borderRadius: radius.sm,
          marginRight: spacing.sm,
          backgroundColor: colors.error + '15',
          justifyContent: 'center',
          alignItems: 'center',
        },
        missingIcon: {
          fontSize: fontSize.xs,
        },
        chipText: {
          fontSize: fontSize.xs,
          fontWeight: '500',
          color: isMissing ? colors.error : colors.textPrimary,
          maxWidth: 100,
          flexShrink: 1,
        },
      }),
    [colors, spacing, radius, fontSize, isMissing]
  );

  const accessibilityLabel = useMemo(() => buildAccessibilityLabel(item), [item]);

  // Determine display text
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
      {/* Thumbnail, placeholder, or missing indicator */}
      {isMissing ? (
        // Missing item - show warning icon
        <View style={styles.missingPlaceholder}>
          <Text style={styles.missingIcon} accessibilityElementsHidden={true}>
            {MISSING_ICON}
          </Text>
        </View>
      ) : showPlaceholder ? (
        // No image available or failed to load - show neutral placeholder
        <View style={styles.thumbnailPlaceholder}>
          <Text style={styles.placeholderIcon} accessibilityElementsHidden={true}>
            {PLACEHOLDER_ICON}
          </Text>
        </View>
      ) : (
        // Image available - render with error handling
        <Image
          source={{ uri: item.thumbnailUrl! }}
          style={styles.thumbnail}
          resizeMode="cover"
          onError={handleImageError}
          accessibilityIgnoresInvertColors={true}
          accessibilityElementsHidden={true}
        />
      )}

      {/* Display text with truncation */}
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
 * Uses shallow comparison of props to prevent unnecessary re-renders
 * when scrolling through the outfit suggestions list. Only re-renders
 * when the item object reference or testID changes.
 *
 * Note: Image loading errors are handled internally and don't cause
 * parent components to re-render.
 */
export const OutfitItemChip = memo(OutfitItemChipComponent);
