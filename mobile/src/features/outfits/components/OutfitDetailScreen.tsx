/**
 * Outfit Detail screen component for viewing outfit information and wear history context.
 *
 * This screen displays the full details of an outfit, including:
 * - The items that comprise the outfit (fetched from wardrobe)
 * - Wear-specific metadata (date, context, source) - "Last worn" section
 * - Grid of item thumbnails with navigation to item detail
 *
 * Entry points and data loading:
 * - From WearHistoryScreen: includes wearHistoryId, uses useWearHistoryEvent to fetch
 *   the specific wear event that was tapped
 * - From saved outfits/recommendations: only outfitId, uses useLatestWearEventForOutfit
 *   to fetch the most recent wear event for this outfit (if any)
 *
 * The "Last worn" section displays when wear event data is available from either source.
 * If the outfit has never been worn, no wear context is shown.
 *
 * @module features/outfits/components/OutfitDetailScreen
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Button } from '../../../core/components/Button';
import { Toast } from '../../../core/components/Toast';
import { trackCaptureEvent } from '../../../core/telemetry';
import { useStore } from '../../../core/state/store';
import { useBatchWardrobeItems } from '../../wardrobe/api/useBatchWardrobeItems';
import { getItemImageUrl } from '../../wardrobe/utils/getItemImageUrl';
import { useWearHistoryEvent } from '../../wearHistory/hooks/useWearHistoryEvent';
import { useLatestWearEventForOutfit } from '../../wearHistory/hooks/useLatestWearEventForOutfit';
import { useCreateWearEvent } from '../../wearHistory/hooks/useCreateWearEvent';
import { MarkAsWornSheet } from '../../wearHistory/components/MarkAsWornSheet';
import type { WearHistorySource } from '../../wearHistory/types';
import type { BatchWardrobeItem } from '../../wardrobe/types';

/**
 * Minimum touch target size for accessibility (WCAG 2.1 AA).
 */
const TOUCH_TARGET_SIZE = 44;

/**
 * Number of columns in the item grid.
 */
const GRID_COLUMNS = 3;

/**
 * Placeholder icon size for missing item images.
 * Proportionally larger than WearEventCard (18px) since grid items are larger.
 */
const PLACEHOLDER_ICON_SIZE = 32;

/**
 * Props for OutfitDetailScreen component.
 *
 * Note: The wornDate, source, and context props are kept for backwards compatibility
 * with existing navigation flows but are no longer used for display. The "Last worn"
 * section is now driven entirely by wear event data fetched via hooks.
 */
export interface OutfitDetailScreenProps {
  /** Outfit ID from route path */
  outfitId: string;
  /** Optional wear history event ID for context */
  wearHistoryId?: string;
  /** @deprecated Use wearHistoryId instead - kept for navigation compatibility */
  wornDate?: string;
  /** @deprecated Use wearHistoryId instead - kept for navigation compatibility */
  source?: WearHistorySource;
  /** @deprecated Use wearHistoryId instead - kept for navigation compatibility */
  context?: string;
}

/**
 * Formats a date string for display.
 *
 * @param dateString - Date in YYYY-MM-DD format
 * @returns Formatted date string (e.g., "Mon, Dec 2, 2024")
 */
function formatWornDate(dateString: string): string {
  try {
    // Parse as local date to avoid timezone issues
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
}

/**
 * Gets the display label for a wear history source.
 *
 * @param source - The wear history source type
 * @returns Translated display label
 */
function getSourceLabel(source: WearHistorySource): string {
  switch (source) {
    case 'ai_recommendation':
      return t('screens.outfitDetail.source.aiRecommendation');
    case 'saved_outfit':
      return t('screens.outfitDetail.source.savedOutfit');
    case 'manual_outfit':
      return t('screens.outfitDetail.source.manualOutfit');
    case 'imported':
      return t('screens.outfitDetail.source.imported');
    default:
      return t('screens.outfitDetail.source.manualOutfit');
  }
}

/**
 * Outfit Detail screen component.
 *
 * Displays outfit items and wear context when navigated from wear history.
 *
 * @param props - Component props including outfitId and optional wear context
 * @returns Outfit Detail screen component
 */
export function OutfitDetailScreen({
  outfitId,
  wearHistoryId,
  // Note: wornDate, source, context props are kept for navigation compatibility
  // but the "Last worn" section is now driven entirely by fetched wear event data
}: OutfitDetailScreenProps): React.JSX.Element {
  const { colors, colorScheme, spacing, fontSize, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const hasTrackedScreenView = useRef(false);

  // Global state
  const user = useStore((state) => state.user);

  // Fetch wear history event to get item_ids if we have a wearHistoryId
  // This is used when navigating from WearHistoryScreen
  const {
    event: explicitWearEvent,
    isLoading: isExplicitEventLoading,
    isError: isExplicitEventError,
  } = useWearHistoryEvent(wearHistoryId);

  // Fetch the latest wear event for this outfit when no explicit wearHistoryId is provided
  // This enables showing "Last worn" info when opened from saved outfits or recommendations
  const {
    event: latestWearEvent,
    isLoading: isLatestEventLoading,
    isError: isLatestEventError,
  } = useLatestWearEventForOutfit(wearHistoryId ? undefined : outfitId);

  // Determine which wear event to use:
  // 1. Explicit event from wearHistoryId (navigating from history)
  // 2. Latest event for outfit (navigating from saved outfits/recommendations)
  const wearEvent = explicitWearEvent ?? latestWearEvent;

  // Determine loading state for wear event data
  // Only consider explicit event loading if wearHistoryId was provided
  // Only consider latest event loading if wearHistoryId was NOT provided
  const isEventLoading = wearHistoryId ? isExplicitEventLoading : isLatestEventLoading;
  const isEventError = wearHistoryId ? isExplicitEventError : isLatestEventError;

  // Get item IDs from wear event - memoized to prevent unnecessary re-fetches
  const itemIds = useMemo(() => wearEvent?.item_ids ?? [], [wearEvent?.item_ids]);

  // Fetch wardrobe items for this outfit
  const {
    items: itemsMap,
    isLoading: isItemsLoading,
    isError: isItemsError,
    refetch,
  } = useBatchWardrobeItems({
    itemIds,
    enabled: itemIds.length > 0,
  });

  // Convert map to array preserving order from item_ids
  const items = useMemo(() => {
    return itemIds
      .map((id) => itemsMap.get(id))
      .filter((item): item is BatchWardrobeItem => item !== undefined);
  }, [itemIds, itemsMap]);

  // Determine loading state
  const isLoading = isEventLoading || (itemIds.length > 0 && isItemsLoading);
  const isError = isEventError || isItemsError;

  // Mark as worn again - sheet visibility state
  const [isMarkAsWornSheetVisible, setIsMarkAsWornSheetVisible] = useState(false);

  // Toast state for success/queued feedback
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Mark as worn mutation hook
  const {
    createWearEvent,
    isPending: isWearPending,
    isSuccess: isWearSuccess,
    wasQueued: wasWearQueued,
    wasUpdate: wasWearUpdate,
    reset: resetWearState,
  } = useCreateWearEvent();

  /**
   * Handle success/queued state from wear event creation.
   * Shows toast feedback and resets mutation state.
   */
  useEffect(() => {
    if (isWearSuccess) {
      // Determine the appropriate message based on whether it was an update
      const message = wasWearUpdate
        ? t('screens.outfitDetail.markAsWornAgain.updateMessage')
        : t('screens.outfitDetail.markAsWornAgain.successMessage');
      setToastMessage(message);
      setToastVisible(true);
      resetWearState();
    } else if (wasWearQueued) {
      setToastMessage(t('screens.outfitDetail.markAsWornAgain.queuedMessage'));
      setToastVisible(true);
      resetWearState();
    }
  }, [isWearSuccess, wasWearQueued, wasWearUpdate, resetWearState]);

  /**
   * Handles toast dismissal.
   */
  const handleToastDismiss = useCallback(() => {
    setToastVisible(false);
    setToastMessage('');
  }, []);

  /**
   * Track screen view on mount (once per session).
   */
  useEffect(() => {
    if (!hasTrackedScreenView.current && user?.id && outfitId) {
      hasTrackedScreenView.current = true;
      trackCaptureEvent('outfit_detail_viewed', {
        userId: user.id,
        metadata: {
          outfitId,
          wearHistoryId,
          source: wearEvent?.source,
          hasContext: !!wearEvent?.context,
        },
      });
    }
  }, [user?.id, outfitId, wearHistoryId, wearEvent?.source, wearEvent?.context]);

  /**
   * Handles back navigation.
   */
  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/home');
    }
  }, [router]);

  /**
   * Handles item thumbnail press - navigates to item detail.
   */
  const handleItemPress = useCallback(
    (item: BatchWardrobeItem) => {
      trackCaptureEvent('outfit_detail_item_tapped', {
        userId: user?.id,
        metadata: {
          outfitId,
          itemId: item.id,
        },
      });
      router.push(`/wardrobe/${item.id}`);
    },
    [router, user?.id, outfitId]
  );

  /**
   * Handles retry button press.
   */
  const handleRetry = useCallback(() => {
    refetch();
  }, [refetch]);

  /**
   * Opens the mark-as-worn sheet.
   */
  const handleMarkAsWornAgain = useCallback(() => {
    resetWearState();
    setIsMarkAsWornSheetVisible(true);
    trackCaptureEvent('outfit_detail_mark_worn_again_tapped', {
      userId: user?.id,
      metadata: {
        outfitId,
        hasExistingWearEvent: !!wearEvent,
      },
    });
  }, [resetWearState, user?.id, outfitId, wearEvent]);

  /**
   * Closes the mark-as-worn sheet.
   */
  const handleMarkAsWornSheetClose = useCallback(() => {
    setIsMarkAsWornSheetVisible(false);
  }, []);

  /**
   * Handles mark-as-worn sheet submission.
   * Creates or updates a wear event for the selected date.
   */
  const handleMarkAsWornSheetSubmit = useCallback(
    (date: string, context?: string) => {
      createWearEvent({
        outfitId,
        itemIds,
        wornDate: date,
        source: 'saved_outfit',
        context,
      });
      setIsMarkAsWornSheetVisible(false);
    },
    [createWearEvent, outfitId, itemIds]
  );

  /**
   * Renders a single item thumbnail in the grid.
   */
  const renderItem = useCallback(
    ({ item, index }: { item: BatchWardrobeItem; index: number }) => {
      const imageUrl = getItemImageUrl(item);

      return (
        <Pressable
          style={({ pressed }) => [
            {
              flex: 1 / GRID_COLUMNS,
              aspectRatio: 1,
              margin: spacing.xs,
              borderRadius: radius.md,
              overflow: 'hidden',
              backgroundColor: colors.textSecondary + '10',
              opacity: pressed ? 0.7 : 1,
            },
          ]}
          onPress={() => handleItemPress(item)}
          accessibilityLabel={
            item.name ||
            t('screens.outfitDetail.accessibility.itemThumbnail').replace(
              '{number}',
              String(index + 1)
            )
          }
          accessibilityHint={t('screens.history.accessibility.eventCardHint')}
          accessibilityRole="button"
        >
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View
              style={{
                flex: 1,
                justifyContent: 'center',
                alignItems: 'center',
              }}
              accessibilityElementsHidden
            >
              <MaterialIcons
                name="checkroom"
                size={PLACEHOLDER_ICON_SIZE}
                color={colors.textSecondary}
              />
            </View>
          )}
        </Pressable>
      );
    },
    [colors, spacing, radius, handleItemPress]
  );

  /**
   * Key extractor for FlatList items.
   */
  const keyExtractor = useCallback((item: BatchWardrobeItem) => item.id, []);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: insets.top + spacing.sm,
          paddingHorizontal: spacing.md,
          paddingBottom: spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: colors.textSecondary + '20',
          backgroundColor: colors.background,
        },
        backButton: {
          width: TOUCH_TARGET_SIZE,
          height: TOUCH_TARGET_SIZE,
          justifyContent: 'center',
          alignItems: 'center',
          marginRight: spacing.sm,
        },
        backButtonPressed: {
          opacity: 0.6,
        },
        backIcon: {
          fontSize: fontSize.xl,
          color: colors.textPrimary,
        },
        headerTitleContainer: {
          flex: 1,
        },
        headerTitle: {
          fontSize: fontSize.xl,
          fontWeight: '600',
          color: colors.textPrimary,
        },
        content: {
          flex: 1,
          paddingHorizontal: spacing.md,
        },
        wearContextSection: {
          paddingVertical: spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: colors.textSecondary + '15',
        },
        wearContextTitle: {
          fontSize: fontSize.sm,
          fontWeight: '600',
          color: colors.textSecondary,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: spacing.sm,
        },
        wearContextRow: {
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: spacing.xs,
        },
        wearContextLabel: {
          fontSize: fontSize.sm,
          color: colors.textSecondary,
          marginRight: spacing.xs,
        },
        wearContextValue: {
          fontSize: fontSize.base,
          color: colors.textPrimary,
          fontWeight: '500',
        },
        contextChip: {
          backgroundColor: colors.textSecondary + '15',
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.xs,
          borderRadius: radius.sm,
          marginTop: spacing.xs,
          alignSelf: 'flex-start',
        },
        contextChipText: {
          fontSize: fontSize.sm,
          color: colors.textPrimary,
        },
        sourceChip: {
          backgroundColor: colors.textSecondary + '10',
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.xs,
          borderRadius: radius.sm,
          marginTop: spacing.xs,
          alignSelf: 'flex-start',
        },
        sourceChipText: {
          fontSize: fontSize.xs,
          color: colors.textSecondary,
        },
        notesContainer: {
          marginTop: spacing.sm,
        },
        notesText: {
          fontSize: fontSize.sm,
          color: colors.textSecondary,
          lineHeight: fontSize.sm * 1.5,
        },
        itemsSectionTitle: {
          fontSize: fontSize.sm,
          fontWeight: '600',
          color: colors.textSecondary,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginTop: spacing.lg,
          marginBottom: spacing.sm,
        },
        itemsGrid: {
          flex: 1,
        },
        itemsGridContent: {
          paddingBottom: insets.bottom + spacing.lg,
        },
        loadingContainer: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
        },
        errorContainer: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: spacing.xl,
        },
        errorText: {
          fontSize: fontSize.base,
          color: colors.textSecondary,
          textAlign: 'center',
          marginBottom: spacing.lg,
        },
        emptyContainer: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: spacing.xl,
        },
        emptyTitle: {
          fontSize: fontSize.lg,
          fontWeight: '600',
          color: colors.textPrimary,
          textAlign: 'center',
          marginBottom: spacing.sm,
        },
        emptySubtitle: {
          fontSize: fontSize.base,
          color: colors.textSecondary,
          textAlign: 'center',
          marginBottom: spacing.lg,
        },
        markAsWornButtonContainer: {
          paddingVertical: spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: colors.textSecondary + '15',
        },
      }),
    [colors, spacing, fontSize, radius, insets.top, insets.bottom]
  );

  // Handle empty outfit ID
  if (!outfitId) {
    return (
      <View
        style={styles.container}
        accessibilityLabel={t('screens.outfitDetail.accessibility.screenLabel')}
      >
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
            onPress={handleBack}
            accessibilityLabel={t('screens.outfitDetail.accessibility.backButton')}
            accessibilityHint={t('screens.outfitDetail.accessibility.backButtonHint')}
            accessibilityRole="button"
          >
            <Text style={styles.backIcon}>{'<'}</Text>
          </Pressable>
          <View style={styles.headerTitleContainer}>
            <Text
              style={styles.headerTitle}
              accessibilityRole="header"
              allowFontScaling
              maxFontSizeMultiplier={1.5}
            >
              {t('screens.outfitDetail.title')}
            </Text>
          </View>
        </View>
        <View style={styles.emptyContainer}>
          <Text
            style={styles.emptyTitle}
            allowFontScaling
            maxFontSizeMultiplier={1.5}
          >
            {t('screens.outfitDetail.empty.title')}
          </Text>
          <Text
            style={styles.emptySubtitle}
            allowFontScaling
            maxFontSizeMultiplier={2}
          >
            {t('screens.outfitDetail.empty.subtitle')}
          </Text>
          <Button
            onPress={handleBack}
            variant="primary"
            accessibilityLabel={t('screens.outfitDetail.empty.ctaButton')}
          >
            {t('screens.outfitDetail.empty.ctaButton')}
          </Button>
        </View>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </View>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <View
        style={styles.container}
        accessibilityLabel={t('screens.outfitDetail.accessibility.screenLabel')}
      >
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
            onPress={handleBack}
            accessibilityLabel={t('screens.outfitDetail.accessibility.backButton')}
            accessibilityHint={t('screens.outfitDetail.accessibility.backButtonHint')}
            accessibilityRole="button"
          >
            <Text style={styles.backIcon}>{'<'}</Text>
          </Pressable>
          <View style={styles.headerTitleContainer}>
            <Text
              style={styles.headerTitle}
              accessibilityRole="header"
              allowFontScaling
              maxFontSizeMultiplier={1.5}
            >
              {t('screens.outfitDetail.title')}
            </Text>
          </View>
        </View>
        <View
          style={styles.loadingContainer}
          accessibilityLabel={t('screens.outfitDetail.accessibility.loadingScreen')}
        >
          <ActivityIndicator
            size="large"
            color={colors.textPrimary}
            accessibilityLabel={t('screens.outfitDetail.loading')}
          />
        </View>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </View>
    );
  }

  // Error state
  if (isError) {
    return (
      <View
        style={styles.container}
        accessibilityLabel={t('screens.outfitDetail.accessibility.screenLabel')}
      >
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
            onPress={handleBack}
            accessibilityLabel={t('screens.outfitDetail.accessibility.backButton')}
            accessibilityHint={t('screens.outfitDetail.accessibility.backButtonHint')}
            accessibilityRole="button"
          >
            <Text style={styles.backIcon}>{'<'}</Text>
          </Pressable>
          <View style={styles.headerTitleContainer}>
            <Text
              style={styles.headerTitle}
              accessibilityRole="header"
              allowFontScaling
              maxFontSizeMultiplier={1.5}
            >
              {t('screens.outfitDetail.title')}
            </Text>
          </View>
        </View>
        <View style={styles.errorContainer}>
          <Text
            style={styles.errorText}
            allowFontScaling
            maxFontSizeMultiplier={2}
          >
            {t('screens.outfitDetail.error.loadFailed')}
          </Text>
          <Button
            onPress={handleRetry}
            variant="secondary"
            accessibilityLabel={t('screens.outfitDetail.error.retry')}
          >
            {t('screens.outfitDetail.error.retry')}
          </Button>
        </View>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </View>
    );
  }

  // Success state
  return (
    <View
      style={styles.container}
      accessibilityLabel={t('screens.outfitDetail.accessibility.screenLabel')}
      accessibilityHint={t('screens.outfitDetail.accessibility.screenHint')}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          onPress={handleBack}
          accessibilityLabel={t('screens.outfitDetail.accessibility.backButton')}
          accessibilityHint={t('screens.outfitDetail.accessibility.backButtonHint')}
          accessibilityRole="button"
        >
          <Text style={styles.backIcon}>{'<'}</Text>
        </Pressable>
        <View style={styles.headerTitleContainer}>
          <Text
            style={styles.headerTitle}
            accessibilityRole="header"
            allowFontScaling
            maxFontSizeMultiplier={1.5}
          >
            {t('screens.outfitDetail.title')}
          </Text>
        </View>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Last Worn Section - only shown when we have wear event data */}
        {wearEvent && (
          <View
            style={styles.wearContextSection}
            accessibilityLabel={t('screens.outfitDetail.accessibility.lastWornSection')}
          >
            <Text
              style={styles.wearContextTitle}
              allowFontScaling
              maxFontSizeMultiplier={1.5}
            >
              {t('screens.outfitDetail.lastWorn.title')}
            </Text>

            {/* Worn Date */}
            {wearEvent.worn_date && (
              <View style={styles.wearContextRow}>
                <Text
                  style={styles.wearContextValue}
                  allowFontScaling
                  maxFontSizeMultiplier={1.5}
                  accessibilityLabel={t('screens.outfitDetail.accessibility.wearDate').replace(
                    '{date}',
                    formatWornDate(wearEvent.worn_date)
                  )}
                >
                  {t('screens.outfitDetail.lastWorn.wornOn').replace(
                    '{date}',
                    formatWornDate(wearEvent.worn_date)
                  )}
                </Text>
              </View>
            )}

            {/* Context/Occasion Chip */}
            {wearEvent.context && (
              <View style={styles.contextChip}>
                <Text
                  style={styles.contextChipText}
                  allowFontScaling
                  maxFontSizeMultiplier={1.5}
                >
                  {wearEvent.context}
                </Text>
              </View>
            )}

            {/* Source Label */}
            {wearEvent.source && (
              <View style={styles.sourceChip}>
                <Text
                  style={styles.sourceChipText}
                  allowFontScaling
                  maxFontSizeMultiplier={1.5}
                >
                  {getSourceLabel(wearEvent.source)}
                </Text>
              </View>
            )}

            {/* Notes - displayed as body text when present */}
            {wearEvent.notes && (
              <View style={styles.notesContainer}>
                <Text
                  style={styles.notesText}
                  allowFontScaling
                  maxFontSizeMultiplier={2}
                  accessibilityLabel={t('screens.outfitDetail.accessibility.notesLabel').replace(
                    '{notes}',
                    wearEvent.notes
                  )}
                >
                  {wearEvent.notes}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Mark as worn again button - always visible for any outfit */}
        <View style={styles.markAsWornButtonContainer}>
          <Button
            onPress={handleMarkAsWornAgain}
            variant="secondary"
            disabled={isWearPending || itemIds.length === 0}
            loading={isWearPending}
            accessibilityLabel={t('screens.outfitDetail.accessibility.markAsWornAgainButton')}
            accessibilityHint={t('screens.outfitDetail.accessibility.markAsWornAgainHint')}
          >
            {t('screens.outfitDetail.markAsWornAgain.button')}
          </Button>
        </View>

        {/* Items Section */}
        <Text
          style={styles.itemsSectionTitle}
          allowFontScaling
          maxFontSizeMultiplier={1.5}
        >
          {t('screens.outfitDetail.itemsSection')}
        </Text>

        {items.length > 0 ? (
          <FlatList
            style={styles.itemsGrid}
            contentContainerStyle={styles.itemsGridContent}
            data={items}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            numColumns={GRID_COLUMNS}
            showsVerticalScrollIndicator={false}
            accessibilityLabel={`${items.length} items in this outfit`}
          />
        ) : (
          <View style={styles.emptyContainer}>
            <Text
              style={styles.emptySubtitle}
              allowFontScaling
              maxFontSizeMultiplier={2}
            >
              {t('screens.outfitDetail.empty.subtitle')}
            </Text>
          </View>
        )}
      </View>

      {/* Mark as worn sheet */}
      <MarkAsWornSheet
        visible={isMarkAsWornSheetVisible}
        onClose={handleMarkAsWornSheetClose}
        onSubmit={handleMarkAsWornSheetSubmit}
        isPending={isWearPending}
        initialContext={wearEvent?.context ?? undefined}
        testID="outfit-detail-mark-as-worn-sheet"
      />

      {/* Success/queued feedback toast */}
      <Toast
        visible={toastVisible}
        message={toastMessage}
        type="success"
        onDismiss={handleToastDismiss}
      />

      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}
