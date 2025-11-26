/**
 * Wardrobe item card component for grid display.
 *
 * Renders a single wardrobe item in the grid with:
 * - Thumbnail image with fallback chain (thumb_key -> clean_key -> original_key -> placeholder)
 * - Item name with truncation and Unicode support
 * - Touch feedback and accessibility labels
 * - WCAG AA compliant touch targets (44px minimum)
 *
 * @module features/wardrobe/components/WardrobeItemCard
 */

import React, { memo, useCallback, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageErrorEventData,
  type NativeSyntheticEvent,
} from 'react-native';
import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { getItemImageUrl } from '../utils/getItemImageUrl';
import type { WardrobeGridItem } from '../types';

/**
 * Props for WardrobeItemCard component.
 */
export interface WardrobeItemCardProps {
  /**
   * The wardrobe item to display.
   */
  item: WardrobeGridItem;

  /**
   * Width of the card in pixels.
   * Calculated by parent based on available width and column count.
   */
  cardWidth: number;

  /**
   * Callback when the card is pressed.
   * Receives the item for navigation to detail view.
   */
  onPress?: (item: WardrobeGridItem) => void;

  /**
   * Test ID for testing purposes.
   */
  testID?: string;
}

/**
 * Aspect ratio for card images (4:5 portrait orientation).
 * Matches the ReviewDetailsScreen image container aspect ratio.
 */
const CARD_ASPECT_RATIO = 4 / 5;

/**
 * Wardrobe item card for grid display.
 *
 * Features:
 * - Image with fallback chain per AC12
 * - Name truncation with ellipsis (2 lines max)
 * - Unicode text support
 * - Neutral placeholder for missing images
 * - Touch feedback with opacity change
 * - WCAG AA touch target compliance
 *
 * @param props - Component props
 * @returns Rendered card component
 *
 * @example
 * ```tsx
 * <WardrobeItemCard
 *   item={wardrobeItem}
 *   cardWidth={160}
 *   onPress={(item) => router.push(`/wardrobe/${item.id}`)}
 * />
 * ```
 */
function WardrobeItemCardComponent({
  item,
  cardWidth,
  onPress,
  testID,
}: WardrobeItemCardProps): React.JSX.Element {
  const { colors, spacing, radius, fontSize } = useTheme();
  const [imageError, setImageError] = useState(false);

  // Get image URL using fallback chain
  const imageUrl = useMemo(() => getItemImageUrl(item), [item]);

  // Calculate image height based on aspect ratio
  const imageHeight = cardWidth / CARD_ASPECT_RATIO;

  // Display name with fallback to placeholder
  const displayName = item.name?.trim() || t('screens.wardrobe.grid.itemName');

  // Handle press event
  const handlePress = useCallback(() => {
    onPress?.(item);
  }, [item, onPress]);

  // Handle image load error - show placeholder
  const handleImageError = useCallback(
    (_event: NativeSyntheticEvent<ImageErrorEventData>) => {
      setImageError(true);
    },
    []
  );

  // Determine if we should show the placeholder
  const showPlaceholder = !imageUrl || imageError;

  // Build styles with dynamic card width
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          width: cardWidth,
          backgroundColor: colors.background,
          borderRadius: radius.md,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: colors.textSecondary + '15', // ~5% opacity
        },
        pressable: {
          flex: 1,
        },
        imageContainer: {
          width: cardWidth,
          height: imageHeight,
          backgroundColor: colors.textSecondary + '10', // ~4% opacity for placeholder bg
          justifyContent: 'center',
          alignItems: 'center',
        },
        image: {
          width: cardWidth,
          height: imageHeight,
          resizeMode: 'cover',
        },
        placeholderIcon: {
          fontSize: fontSize['2xl'],
          color: colors.textSecondary,
          opacity: 0.5,
        },
        nameContainer: {
          padding: spacing.sm,
          minHeight: 44, // WCAG AA touch target
        },
        name: {
          fontSize: fontSize.sm,
          fontWeight: '500',
          color: colors.textPrimary,
          lineHeight: fontSize.sm * 1.4,
        },
      }),
    [cardWidth, imageHeight, colors, spacing, radius, fontSize]
  );

  // Accessibility label includes item name
  const accessibilityLabel = t('screens.wardrobe.accessibility.gridItem') + ': ' + displayName;
  const accessibilityHint = t('screens.wardrobe.accessibility.gridItemHint');

  return (
    <View style={styles.container} testID={testID}>
      <Pressable
        style={({ pressed }) => [styles.pressable, pressed && { opacity: 0.7 }]}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
      >
        <View style={styles.imageContainer}>
          {showPlaceholder ? (
            <Text
              style={styles.placeholderIcon}
              role="img"
              aria-label="Wardrobe item placeholder"
            >
              👔
            </Text>
          ) : (
            <Image
              source={{ uri: imageUrl }}
              style={styles.image}
              onError={handleImageError}
              accessibilityIgnoresInvertColors
            />
          )}
        </View>
        <View style={styles.nameContainer}>
          <Text
            style={styles.name}
            numberOfLines={2}
            ellipsizeMode="tail"
            allowFontScaling
            maxFontSizeMultiplier={1.5}
          >
            {displayName}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

/**
 * Memoized wardrobe item card component.
 *
 * Memoization prevents unnecessary re-renders when scrolling
 * through the wardrobe grid. Only re-renders when item data,
 * card width, or press handler changes.
 */
export const WardrobeItemCard = memo(WardrobeItemCardComponent);
