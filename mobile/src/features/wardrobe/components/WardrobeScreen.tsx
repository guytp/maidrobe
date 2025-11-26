/**
 * Wardrobe screen component for viewing and managing wardrobe items.
 *
 * This is the main wardrobe view implementing Story #217 requirements:
 * - Responsive 2-3 column grid using FlatList
 * - Empty state with "Add item" CTA
 * - Infinite scroll pagination
 * - Loading and error states with retry
 * - Item cards with image fallback chain
 *
 * @module features/wardrobe/components/WardrobeScreen
 */

import React, { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Button } from '../../../core/components/Button';
import { trackCaptureEvent } from '../../../core/telemetry';
import { useStore } from '../../../core/state/store';
import { useWardrobeItems } from '../api';
import { WardrobeItemCard } from './WardrobeItemCard';
import { NAVIGATION_DEBOUNCE_MS } from '../constants';
import { MIN_CARD_WIDTH, GRID_GAP } from '../types';
import type { WardrobeGridItem } from '../types';

/**
 * Content horizontal padding (matches spacing.md from theme).
 */
const CONTENT_PADDING = 16;

/**
 * Calculates the number of grid columns based on available width.
 *
 * Ensures cards are at least MIN_CARD_WIDTH (150px) while maximizing
 * screen usage. Returns 2-3 columns for phones/tablets.
 *
 * @param availableWidth - Width available for the grid in pixels
 * @returns Number of columns (minimum 2)
 */
function calculateNumColumns(availableWidth: number): number {
  // Available width for cards (minus padding and gaps)
  const gridWidth = availableWidth - CONTENT_PADDING * 2;

  // Calculate how many columns fit with minimum card width
  // Formula: numColumns * minWidth + (numColumns - 1) * gap <= gridWidth
  // Solved: numColumns <= (gridWidth + gap) / (minWidth + gap)
  const maxColumns = Math.floor((gridWidth + GRID_GAP) / (MIN_CARD_WIDTH + GRID_GAP));

  // Clamp to 2-3 columns
  return Math.max(2, Math.min(3, maxColumns));
}

/**
 * Calculates the width of each card based on available space and column count.
 *
 * @param availableWidth - Width available for the grid in pixels
 * @param numColumns - Number of columns in the grid
 * @returns Card width in pixels
 */
function calculateCardWidth(availableWidth: number, numColumns: number): number {
  const gridWidth = availableWidth - CONTENT_PADDING * 2;
  const totalGapWidth = (numColumns - 1) * GRID_GAP;
  return (gridWidth - totalGapWidth) / numColumns;
}

/**
 * Wardrobe screen - main view for managing wardrobe items.
 *
 * Protected route: requires authenticated user (enforced by route wrapper).
 *
 * Features:
 * - Responsive grid layout (2-3 columns based on screen width)
 * - Infinite scroll pagination with automatic page loading
 * - Empty state with add item CTA
 * - Loading indicator during initial load
 * - Error state with retry button
 * - Pagination loading indicator at bottom
 *
 * @returns Wardrobe screen component
 */
export function WardrobeScreen(): React.JSX.Element {
  const { colors, colorScheme, spacing, fontSize } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const router = useRouter();
  const user = useStore((state) => state.user);
  const isNavigating = useStore((state) => state.isNavigating);
  const setIsNavigating = useStore((state) => state.setIsNavigating);

  // Fetch wardrobe items with infinite scroll
  const {
    items,
    isLoading,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useWardrobeItems();

  // Calculate grid dimensions
  const numColumns = useMemo(() => calculateNumColumns(screenWidth), [screenWidth]);
  const cardWidth = useMemo(
    () => calculateCardWidth(screenWidth, numColumns),
    [screenWidth, numColumns]
  );

  /**
   * Handles navigation to capture flow with origin=wardrobe.
   *
   * Debounced to prevent duplicate navigation from multiple rapid taps.
   * Tracks telemetry event for analytics.
   */
  const handleAddItem = useCallback(() => {
    if (isNavigating) {
      return;
    }

    setIsNavigating(true);

    // Track capture flow opened from wardrobe
    trackCaptureEvent('capture_flow_opened', {
      userId: user?.id,
      origin: 'wardrobe',
    });

    // Navigate to capture with origin param
    router.push('/capture?origin=wardrobe');

    // Reset navigation state after a delay to allow navigation to complete
    setTimeout(() => {
      setIsNavigating(false);
    }, NAVIGATION_DEBOUNCE_MS);
  }, [isNavigating, setIsNavigating, user?.id, router]);

  /**
   * Handles item card press - navigates to item detail.
   */
  const handleItemPress = useCallback(
    (item: WardrobeGridItem) => {
      if (isNavigating) {
        return;
      }

      setIsNavigating(true);

      // Track item tap
      trackCaptureEvent('wardrobe_item_tapped', {
        userId: user?.id,
        itemId: item.id,
      });

      // Navigate to item detail (to be implemented in future story)
      // For now, we just log and reset navigation state
      // router.push(`/wardrobe/${item.id}`);

      setTimeout(() => {
        setIsNavigating(false);
      }, NAVIGATION_DEBOUNCE_MS);
    },
    [isNavigating, setIsNavigating, user?.id]
  );

  /**
   * Handles end of list reached - triggers next page fetch.
   */
  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  /**
   * Handles retry button press.
   */
  const handleRetry = useCallback(() => {
    refetch();
  }, [refetch]);

  /**
   * Renders a single item card.
   */
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<WardrobeGridItem>) => (
      <WardrobeItemCard
        item={item}
        cardWidth={cardWidth}
        onPress={handleItemPress}
        testID={`wardrobe-item-${item.id}`}
      />
    ),
    [cardWidth, handleItemPress]
  );

  /**
   * Key extractor for FlatList.
   */
  const keyExtractor = useCallback((item: WardrobeGridItem) => item.id, []);

  // Memoized styles
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        loadingContainer: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing.lg,
        },
        loadingText: {
          marginTop: spacing.md,
          fontSize: fontSize.base,
          color: colors.textSecondary,
        },
        errorContainer: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing.lg,
        },
        errorIcon: {
          fontSize: fontSize['5xl'],
          marginBottom: spacing.md,
        },
        errorText: {
          fontSize: fontSize.base,
          color: colors.textSecondary,
          textAlign: 'center',
          marginBottom: spacing.lg,
          maxWidth: 300,
        },
        emptyContainer: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing.lg,
        },
        emptyIcon: {
          fontSize: fontSize['5xl'],
          marginBottom: spacing.md,
        },
        emptyTitle: {
          fontSize: fontSize['2xl'],
          fontWeight: '600',
          color: colors.textPrimary,
          marginBottom: spacing.sm,
          textAlign: 'center',
        },
        emptyHint: {
          fontSize: fontSize.base,
          color: colors.textSecondary,
          marginBottom: spacing.xl,
          textAlign: 'center',
          maxWidth: 300,
        },
        addButton: {
          minWidth: 200,
        },
        gridContentContainer: {
          padding: CONTENT_PADDING,
          paddingBottom: spacing.xl,
        },
        columnWrapper: {
          gap: GRID_GAP,
          marginBottom: GRID_GAP,
        },
        footerContainer: {
          paddingVertical: spacing.lg,
          alignItems: 'center',
        },
      }),
    [colors, spacing, fontSize]
  );

  /**
   * Renders list footer with pagination loading indicator.
   */
  const renderFooter = useCallback(() => {
    if (!isFetchingNextPage) {
      return null;
    }

    return (
      <View
        style={styles.footerContainer}
        accessibilityLabel={t('screens.wardrobe.accessibility.loadingMore')}
      >
        <ActivityIndicator size="small" color={colors.textPrimary} />
        <Text style={[styles.loadingText, { marginTop: spacing.sm }]}>
          {t('screens.wardrobe.loading.more')}
        </Text>
      </View>
    );
  }, [isFetchingNextPage, styles, colors, spacing]);

  /**
   * Renders empty state when no items exist.
   */
  const renderEmptyState = useCallback(
    () => (
      <View
        style={styles.emptyContainer}
        accessibilityLabel={t('screens.wardrobe.accessibility.emptyState')}
      >
        <Text
          style={styles.emptyIcon}
          role="img"
          aria-label="Wardrobe"
          accessibilityLabel="Wardrobe icon"
        >
          👔
        </Text>
        <Text
          style={styles.emptyTitle}
          allowFontScaling
          maxFontSizeMultiplier={2}
          accessibilityRole="header"
        >
          {t('screens.wardrobe.empty.title')}
        </Text>
        <Text style={styles.emptyHint} allowFontScaling maxFontSizeMultiplier={2}>
          {t('screens.wardrobe.empty.subtitle')}
        </Text>
        <View style={styles.addButton}>
          <Button
            onPress={handleAddItem}
            variant="primary"
            disabled={isNavigating}
            accessibilityLabel={t('screens.wardrobe.accessibility.addFirstItemButton')}
            accessibilityHint={t('screens.wardrobe.accessibility.addFirstItemHint')}
          >
            {t('screens.wardrobe.addFirstItem')}
          </Button>
        </View>
      </View>
    ),
    [styles, handleAddItem, isNavigating]
  );

  // Initial loading state
  if (isLoading) {
    return (
      <View
        style={styles.container}
        accessibilityLabel={t('screens.wardrobe.accessibility.screenLabel')}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.textPrimary} />
          <Text style={styles.loadingText} allowFontScaling maxFontSizeMultiplier={2}>
            {t('screens.wardrobe.loading.initial')}
          </Text>
        </View>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </View>
    );
  }

  // Error state with retry
  if (isError) {
    return (
      <View
        style={styles.container}
        accessibilityLabel={t('screens.wardrobe.accessibility.screenLabel')}
      >
        <View style={styles.errorContainer} accessibilityRole="alert">
          <Text
            style={styles.errorIcon}
            role="img"
            aria-label="Error"
            accessibilityLabel="Error icon"
          >
            ⚠️
          </Text>
          <Text style={styles.errorText} allowFontScaling maxFontSizeMultiplier={2}>
            {t('screens.wardrobe.error.loadFailed')}
          </Text>
          <View style={styles.addButton}>
            <Button
              onPress={handleRetry}
              variant="primary"
              accessibilityLabel={t('screens.wardrobe.accessibility.retryButton')}
              accessibilityHint={t('screens.wardrobe.accessibility.retryHint')}
            >
              {t('screens.wardrobe.error.retry')}
            </Button>
          </View>
        </View>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </View>
    );
  }

  // Empty state (no items)
  if (items.length === 0) {
    return (
      <View
        style={styles.container}
        accessibilityLabel={t('screens.wardrobe.accessibility.screenLabel')}
        accessibilityHint={t('screens.wardrobe.accessibility.screenHint')}
      >
        {renderEmptyState()}
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </View>
    );
  }

  // Grid view with items
  return (
    <View
      style={styles.container}
      accessibilityLabel={t('screens.wardrobe.accessibility.screenLabel')}
      accessibilityHint={t('screens.wardrobe.accessibility.screenHint')}
    >
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        numColumns={numColumns}
        key={`grid-${numColumns}`} // Force re-render when column count changes
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={styles.gridContentContainer}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={renderFooter}
        showsVerticalScrollIndicator={false}
        // Performance optimizations
        removeClippedSubviews
        maxToRenderPerBatch={10}
        windowSize={5}
        initialNumToRender={numColumns * 4}
        // Accessibility
        accessibilityRole="list"
      />
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}
