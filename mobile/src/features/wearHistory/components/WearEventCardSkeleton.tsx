/**
 * Skeleton loading placeholder for WearEventCard.
 *
 * Displays a shimmer-style placeholder that matches the layout of
 * WearEventCard, providing visual continuity during initial data load.
 *
 * Features:
 * - Matches WearEventCard dimensions and structure
 * - Shows placeholder thumbnails, text blocks
 * - Memoized for scroll performance
 * - Supports multiple instances for list loading state
 *
 * @module features/wearHistory/components/WearEventCardSkeleton
 */

import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../../core/theme';

/**
 * Props for WearEventCardSkeleton component.
 */
export interface WearEventCardSkeletonProps {
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
 * Thumbnail size in pixels (matches WearEventCard).
 */
const THUMBNAIL_SIZE = 40;

/**
 * Number of placeholder thumbnails to show.
 */
const PLACEHOLDER_THUMBNAIL_COUNT = 3;

/**
 * Skeleton loading placeholder for wear event cards.
 *
 * Renders a card-shaped placeholder with:
 * - Row of thumbnail placeholders
 * - Text line placeholders for context and metadata
 *
 * @param props - Component props
 * @returns Skeleton placeholder component
 */
function WearEventCardSkeletonComponent({
  testID,
}: WearEventCardSkeletonProps): React.JSX.Element {
  const { colors, spacing, radius } = useTheme();

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
        content: {
          minHeight: TOUCH_TARGET_SIZE,
          padding: spacing.md,
        },
        thumbnailsRow: {
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: spacing.sm,
        },
        thumbnail: {
          width: THUMBNAIL_SIZE,
          height: THUMBNAIL_SIZE,
          borderRadius: radius.sm,
          marginRight: spacing.xs,
          backgroundColor: colors.textSecondary + '10',
        },
        contextLine: {
          height: 20,
          width: '60%',
          borderRadius: radius.sm,
          backgroundColor: colors.textSecondary + '10',
          marginBottom: spacing.sm,
        },
        bottomRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        },
        sourceLine: {
          height: 14,
          width: 60,
          borderRadius: radius.sm,
          backgroundColor: colors.textSecondary + '10',
        },
        timeLine: {
          height: 14,
          width: 50,
          borderRadius: radius.sm,
          backgroundColor: colors.textSecondary + '10',
        },
      }),
    [colors, spacing, radius]
  );

  return (
    <View
      style={styles.container}
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.content}>
        {/* Thumbnail placeholders */}
        <View style={styles.thumbnailsRow}>
          {Array.from({ length: PLACEHOLDER_THUMBNAIL_COUNT }).map((_, index) => (
            <View key={index} style={styles.thumbnail} />
          ))}
        </View>

        {/* Context line placeholder */}
        <View style={styles.contextLine} />

        {/* Bottom row placeholders */}
        <View style={styles.bottomRow}>
          <View style={styles.sourceLine} />
          <View style={styles.timeLine} />
        </View>
      </View>
    </View>
  );
}

/**
 * Memoized skeleton component.
 */
export const WearEventCardSkeleton = memo(WearEventCardSkeletonComponent);
