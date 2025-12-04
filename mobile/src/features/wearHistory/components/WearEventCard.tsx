/**
 * Wear event card component for displaying individual wear history entries.
 *
 * Renders a single wear event in the history list with:
 * - Up to 3 item thumbnails with "+N" overflow badge
 * - Context chip/pill when occasion text is present
 * - Compact source label ("AI pick" or "Your outfit")
 * - Time of wear
 * - Touch feedback and accessibility labels
 * - WCAG AA compliant touch targets (44px minimum)
 *
 * @module features/wearHistory/components/WearEventCard
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
import { MaterialIcons } from '@expo/vector-icons';
import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { useBatchWardrobeItems } from '../../wardrobe/api';
import { getItemImageUrl } from '../../wardrobe/utils/getItemImageUrl';
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
 * Maximum number of visible thumbnails before showing overflow badge.
 */
const MAX_VISIBLE_THUMBNAILS = 3;

/**
 * Thumbnail size in pixels.
 */
const THUMBNAIL_SIZE = 40;

/**
 * Placeholder icon size for missing images.
 */
const PLACEHOLDER_ICON_SIZE = 18;

/**
 * Resolved item data for thumbnail display.
 */
interface ResolvedThumbnail {
  id: string;
  imageUrl: string | null;
}

/**
 * Maps wear history source to compact user-friendly display string.
 *
 * @param source - The source of the wear event
 * @returns Localized compact display string for the source
 */
function getCompactSourceLabel(source: WearHistorySource): string {
  switch (source) {
    case 'ai_recommendation':
      return t('screens.history.event.aiPick');
    default:
      return t('screens.history.event.yourOutfit');
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
 * - Item thumbnails with fallback placeholder
 * - Overflow badge for 4+ items
 * - Context chip/pill when occasion is set
 * - Compact source label
 * - Time display
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

  // Track image errors by item ID
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

  // Fetch item data for thumbnails
  const { items: batchItems, isLoading: isLoadingItems } = useBatchWardrobeItems({
    itemIds: event.item_ids,
    enabled: event.item_ids.length > 0,
  });

  // Resolve items for thumbnail display (maintain original order, limit to max visible)
  const resolvedThumbnails = useMemo((): ResolvedThumbnail[] => {
    return event.item_ids.slice(0, MAX_VISIBLE_THUMBNAILS).map((id) => {
      const item = batchItems.get(id);
      return {
        id,
        imageUrl: item ? getItemImageUrl(item) : null,
      };
    });
  }, [event.item_ids, batchItems]);

  // Calculate overflow count
  const overflowCount = Math.max(0, event.item_ids.length - MAX_VISIBLE_THUMBNAILS);

  // Get compact source label
  const sourceLabel = useMemo(() => getCompactSourceLabel(event.source), [event.source]);

  // Format time
  const timeLabel = useMemo(() => formatWearTime(event.worn_at), [event.worn_at]);

  // Context text (trimmed, may be empty)
  const contextText = event.context?.trim() || '';
  const hasContext = contextText.length > 0;

  // Handle press event
  const handlePress = useCallback(() => {
    onPress?.(event);
  }, [event, onPress]);

  // Handle individual image error
  const handleImageError = useCallback(
    (itemId: string) => (_event: NativeSyntheticEvent<ImageErrorEventData>) => {
      setImageErrors((prev) => new Set(prev).add(itemId));
    },
    []
  );

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
        // Top section: thumbnails row
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
          backgroundColor: colors.textSecondary + '15',
        },
        thumbnailImage: {
          width: THUMBNAIL_SIZE,
          height: THUMBNAIL_SIZE,
          borderRadius: radius.sm,
        },
        thumbnailPlaceholder: {
          width: THUMBNAIL_SIZE,
          height: THUMBNAIL_SIZE,
          borderRadius: radius.sm,
          backgroundColor: colors.textSecondary + '15',
          justifyContent: 'center',
          alignItems: 'center',
        },
        thumbnailLoading: {
          width: THUMBNAIL_SIZE,
          height: THUMBNAIL_SIZE,
          borderRadius: radius.sm,
          backgroundColor: colors.textSecondary + '10',
        },
        overflowBadge: {
          height: THUMBNAIL_SIZE,
          paddingHorizontal: spacing.sm,
          borderRadius: radius.sm,
          backgroundColor: colors.textSecondary + '20',
          justifyContent: 'center',
          alignItems: 'center',
        },
        overflowText: {
          fontSize: fontSize.sm,
          fontWeight: '600',
          color: colors.textSecondary,
        },
        // Middle section: context chip (optional)
        contextChip: {
          alignSelf: 'flex-start',
          backgroundColor: colors.textSecondary + '12',
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.xs,
          borderRadius: radius.sm,
          marginBottom: spacing.sm,
        },
        contextText: {
          fontSize: fontSize.sm,
          color: colors.textPrimary,
        },
        // Bottom section: source and time
        bottomRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        },
        sourceText: {
          fontSize: fontSize.xs,
          color: colors.textSecondary,
        },
        timeText: {
          fontSize: fontSize.xs,
          color: colors.textSecondary,
        },
      }),
    [colors, spacing, radius, fontSize]
  );

  // Build accessibility label
  const accessibilityLabel = useMemo(() => {
    const parts: string[] = [];

    // Add context if present
    if (hasContext) {
      parts.push(contextText);
    }

    // Add item count
    parts.push(
      t('screens.history.event.itemCount').replace('{count}', String(event.item_ids.length))
    );

    // Add source
    parts.push(sourceLabel);

    // Add time
    parts.push(t('screens.history.event.at').replace('{time}', timeLabel));

    return parts.join(', ');
  }, [hasContext, contextText, event.item_ids.length, sourceLabel, timeLabel]);

  const accessibilityHint = t('screens.history.accessibility.eventCardHint');

  /**
   * Renders a single thumbnail with fallback handling.
   */
  const renderThumbnail = useCallback(
    (thumbnail: ResolvedThumbnail, index: number) => {
      const hasError = imageErrors.has(thumbnail.id);
      const showPlaceholder = !thumbnail.imageUrl || hasError;

      if (isLoadingItems && !thumbnail.imageUrl) {
        // Show loading skeleton while batch is fetching
        return (
          <View
            key={thumbnail.id}
            style={styles.thumbnailLoading}
            accessibilityElementsHidden
          />
        );
      }

      if (showPlaceholder) {
        return (
          <View
            key={thumbnail.id}
            style={styles.thumbnailPlaceholder}
            accessibilityElementsHidden
          >
            <MaterialIcons
              name="checkroom"
              size={PLACEHOLDER_ICON_SIZE}
              color={colors.textSecondary}
            />
          </View>
        );
      }

      return (
        <Image
          key={thumbnail.id}
          source={{ uri: thumbnail.imageUrl! }}
          style={styles.thumbnailImage}
          resizeMode="cover"
          onError={handleImageError(thumbnail.id)}
          accessibilityIgnoresInvertColors
          accessibilityElementsHidden
        />
      );
    },
    [
      isLoadingItems,
      imageErrors,
      styles.thumbnailLoading,
      styles.thumbnailPlaceholder,
      styles.thumbnailImage,
      colors.textSecondary,
      handleImageError,
    ]
  );

  return (
    <View style={styles.container} testID={testID}>
      <Pressable
        style={({ pressed }) => [styles.pressable, pressed && { opacity: 0.7 }]}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
      >
        {/* Thumbnails row */}
        <View style={styles.thumbnailsRow}>
          {resolvedThumbnails.map((thumbnail, index) => renderThumbnail(thumbnail, index))}
          {overflowCount > 0 && (
            <View
              style={styles.overflowBadge}
              accessibilityLabel={t('screens.history.event.moreItems').replace(
                '{count}',
                String(overflowCount)
              )}
            >
              <Text
                style={styles.overflowText}
                allowFontScaling
                maxFontSizeMultiplier={1.5}
              >
                +{overflowCount}
              </Text>
            </View>
          )}
        </View>

        {/* Context chip (only when context is present) */}
        {hasContext && (
          <View style={styles.contextChip} accessibilityRole="text">
            <Text
              style={styles.contextText}
              numberOfLines={1}
              ellipsizeMode="tail"
              allowFontScaling
              maxFontSizeMultiplier={1.5}
            >
              {contextText}
            </Text>
          </View>
        )}

        {/* Bottom row: source and time */}
        <View style={styles.bottomRow}>
          <Text
            style={styles.sourceText}
            allowFontScaling
            maxFontSizeMultiplier={1.5}
          >
            {sourceLabel}
          </Text>
          <Text
            style={styles.timeText}
            allowFontScaling
            maxFontSizeMultiplier={1.5}
          >
            {timeLabel}
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
