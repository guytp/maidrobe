/**
 * Wardrobe screen component for viewing and managing wardrobe items.
 *
 * This is the main wardrobe view implementing Story #217 requirements:
 * - Responsive 2-3 column grid using FlatList
 * - Search input with 300ms debounce
 * - Empty state with "Add your first item" CTA
 * - No results state for empty search results
 * - FAB for adding items when wardrobe has items
 * - Infinite scroll pagination
 * - Loading and error states with retry
 * - Item cards with image fallback chain
 * - State persistence across navigation (search query, scroll position)
 * - Navigation to item detail route
 * - Telemetry for screen views and interactions
 *
 * @module features/wardrobe/components/WardrobeScreen
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Button } from '../../../core/components/Button';
import { trackCaptureEvent } from '../../../core/telemetry';
import { useStore } from '../../../core/state/store';
import { useWardrobeItems } from '../api';
import { useDebounce } from '../hooks';
import { WardrobeItemCard } from './WardrobeItemCard';
import { SearchHeader } from './SearchHeader';
import { NAVIGATION_DEBOUNCE_MS } from '../constants';
import { MIN_CARD_WIDTH, GRID_GAP, SEARCH_DEBOUNCE_MS } from '../types';
import type { WardrobeGridItem } from '../types';

/**
 * Content horizontal padding (matches spacing.md from theme).
 */
const CONTENT_PADDING = 16;

/**
 * FAB size for add item button.
 */
const FAB_SIZE = 56;

/**
 * FAB margin from screen edges.
 */
const FAB_MARGIN = 16;

/**
 * Throttle interval for scroll position updates (ms).
 * Prevents excessive state updates during scrolling.
 */
const SCROLL_THROTTLE_MS = 100;

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
 * - Search input with 300ms debounce at top
 * - Responsive grid layout (2-3 columns based on screen width)
 * - Infinite scroll pagination with automatic page loading
 * - Empty wardrobe state with "Add your first item" CTA
 * - No results state when search yields no matches
 * - FAB button when items exist for quick add
 * - Loading indicator during initial load
 * - Error state with retry button
 * - Pagination loading indicator at bottom
 * - State persistence: search query and scroll position preserved across navigation
 * - Navigation to item detail on card press
 * - Telemetry for screen views and interactions
 *
 * @returns Wardrobe screen component
 */
export function WardrobeScreen(): React.JSX.Element {
  const { colors, colorScheme, spacing, fontSize } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const flatListRef = useRef<FlatList<WardrobeGridItem>>(null);
  const hasTrackedScreenView = useRef(false);
  const lastScrollUpdate = useRef(0);

  // Global state
  const user = useStore((state) => state.user);
  const isNavigating = useStore((state) => state.isNavigating);
  const setIsNavigating = useStore((state) => state.setIsNavigating);

  // Wardrobe UI state (persisted across navigation)
  const wardrobeSearchQuery = useStore((state) => state.wardrobeSearchQuery);
  const wardrobeScrollOffset = useStore((state) => state.wardrobeScrollOffset);
  const setWardrobeSearchQuery = useStore((state) => state.setWardrobeSearchQuery);
  const setWardrobeScrollOffset = useStore((state) => state.setWardrobeScrollOffset);

  // Use persisted search query
  const debouncedSearchQuery = useDebounce(wardrobeSearchQuery, SEARCH_DEBOUNCE_MS);

  // Track if user has an active search query
  const hasActiveSearch = debouncedSearchQuery.trim().length > 0;

  // Fetch wardrobe items with infinite scroll and search
  const { items, isLoading, isError, hasNextPage, isFetchingNextPage, fetchNextPage, refetch } =
    useWardrobeItems({ searchQuery: debouncedSearchQuery });

  // Calculate grid dimensions
  const numColumns = useMemo(() => calculateNumColumns(screenWidth), [screenWidth]);
  const cardWidth = useMemo(
    () => calculateCardWidth(screenWidth, numColumns),
    [screenWidth, numColumns]
  );

  // Determine UI states
  const isEmptyWardrobe = !isLoading && !isError && items.length === 0 && !hasActiveSearch;
  const isNoResults = !isLoading && !isError && items.length === 0 && hasActiveSearch;
  const hasItems = items.length > 0;

  /**
   * Track screen view on mount (once per session).
   */
  useEffect(() => {
    if (!hasTrackedScreenView.current && user?.id) {
      hasTrackedScreenView.current = true;
      trackCaptureEvent('wardrobe_screen_viewed', {
        userId: user.id,
        origin: 'wardrobe',
      });
    }
  }, [user?.id]);

  /**
   * Restore scroll position when items are loaded.
   */
  useEffect(() => {
    if (items.length > 0 && wardrobeScrollOffset > 0 && flatListRef.current) {
      // Small delay to ensure FlatList has rendered
      const timeoutId = setTimeout(() => {
        flatListRef.current?.scrollToOffset({
          offset: wardrobeScrollOffset,
          animated: false,
        });
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [items.length, wardrobeScrollOffset]);

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
        origin: 'wardrobe',
      });

      // Navigate to item detail route
      router.push(`/wardrobe/${item.id}`);

      // Reset navigation state after a delay to allow navigation to complete
      setTimeout(() => {
        setIsNavigating(false);
      }, NAVIGATION_DEBOUNCE_MS);
    },
    [isNavigating, setIsNavigating, user?.id, router]
  );

  /**
   * Handles search input text change.
   * Persists search query to Zustand store.
   */
  const handleSearchChange = useCallback(
    (text: string) => {
      setWardrobeSearchQuery(text);
    },
    [setWardrobeSearchQuery]
  );

  /**
   * Handles clearing the search input.
   */
  const handleClearSearch = useCallback(() => {
    setWardrobeSearchQuery('');
  }, [setWardrobeSearchQuery]);

  /**
   * Handles scroll events to persist scroll position.
   * Throttled to prevent excessive state updates.
   */
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const now = Date.now();
      if (now - lastScrollUpdate.current >= SCROLL_THROTTLE_MS) {
        lastScrollUpdate.current = now;
        const offset = event.nativeEvent.contentOffset.y;
        setWardrobeScrollOffset(offset);
      }
    },
    [setWardrobeScrollOffset]
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
        // Loading styles
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
        // Error styles
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
        // Empty state styles
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
        // No results styles
        noResultsContainer: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing.lg,
        },
        noResultsIcon: {
          fontSize: fontSize['5xl'],
          marginBottom: spacing.md,
        },
        noResultsText: {
          fontSize: fontSize.base,
          color: colors.textSecondary,
          textAlign: 'center',
          maxWidth: 300,
        },
        // Grid styles
        gridContentContainer: {
          padding: CONTENT_PADDING,
          paddingTop: 0, // Search header provides top padding
          paddingBottom: FAB_SIZE + FAB_MARGIN * 2 + spacing.xl, // Space for FAB
        },
        columnWrapper: {
          gap: GRID_GAP,
          marginBottom: GRID_GAP,
        },
        footerContainer: {
          paddingVertical: spacing.lg,
          alignItems: 'center',
        },
        // FAB styles
        fab: {
          position: 'absolute',
          right: FAB_MARGIN,
          bottom: FAB_MARGIN + insets.bottom,
          width: FAB_SIZE,
          height: FAB_SIZE,
          borderRadius: FAB_SIZE / 2,
          backgroundColor: colors.textPrimary,
          justifyContent: 'center',
          alignItems: 'center',
          // Shadow for iOS
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.25,
          shadowRadius: 4,
          // Elevation for Android
          elevation: 4,
        },
        fabPressed: {
          opacity: 0.8,
          transform: [{ scale: 0.95 }],
        },
        fabIcon: {
          fontSize: fontSize['2xl'],
          color: colors.background,
          fontWeight: '300',
        },
      }),
    [colors, spacing, fontSize, insets.bottom]
  );

  /**
   * Renders the search header component.
   */
  const renderSearchHeader = useCallback(
    () => (
      <SearchHeader
        value={wardrobeSearchQuery}
        onChangeText={handleSearchChange}
        onClear={handleClearSearch}
      />
    ),
    [wardrobeSearchQuery, handleSearchChange, handleClearSearch]
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
   * Renders FAB for adding items.
   */
  const renderFab = useCallback(
    () => (
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={handleAddItem}
        disabled={isNavigating}
        accessibilityLabel={t('screens.wardrobe.accessibility.addItemButton')}
        accessibilityHint={t('screens.wardrobe.accessibility.addItemHint')}
        accessibilityRole="button"
      >
        <Text style={styles.fabIcon}>+</Text>
      </Pressable>
    ),
    [styles, handleAddItem, isNavigating]
  );

  /**
   * Renders empty wardrobe state (no items, no search).
   */
  const renderEmptyWardrobe = useCallback(
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

  /**
   * Renders no results state (search with no matches).
   */
  const renderNoResults = useCallback(
    () => (
      <View style={styles.noResultsContainer}>
        <Text
          style={styles.noResultsIcon}
          role="img"
          aria-label="No results"
          accessibilityLabel="No results icon"
        >
          🔍
        </Text>
        <Text style={styles.noResultsText} allowFontScaling maxFontSizeMultiplier={2}>
          {t('screens.wardrobe.search.noResults').replace('{query}', debouncedSearchQuery)}
        </Text>
      </View>
    ),
    [styles, debouncedSearchQuery]
  );

  // Initial loading state (no search header shown during initial load)
  if (isLoading && !hasActiveSearch) {
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
        {renderSearchHeader()}
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

  // Empty wardrobe state (no items, no search query)
  if (isEmptyWardrobe) {
    return (
      <View
        style={styles.container}
        accessibilityLabel={t('screens.wardrobe.accessibility.screenLabel')}
        accessibilityHint={t('screens.wardrobe.accessibility.screenHint')}
      >
        {renderEmptyWardrobe()}
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </View>
    );
  }

  // No results state (search with no matches)
  if (isNoResults) {
    return (
      <View
        style={styles.container}
        accessibilityLabel={t('screens.wardrobe.accessibility.screenLabel')}
        accessibilityHint={t('screens.wardrobe.accessibility.screenHint')}
      >
        {renderSearchHeader()}
        {renderNoResults()}
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
        ref={flatListRef}
        data={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        numColumns={numColumns}
        key={`grid-${numColumns}`} // Force re-render when column count changes
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={styles.gridContentContainer}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        ListHeaderComponent={renderSearchHeader}
        ListFooterComponent={renderFooter}
        stickyHeaderIndices={[0]}
        showsVerticalScrollIndicator={false}
        // Performance optimizations
        removeClippedSubviews
        maxToRenderPerBatch={10}
        windowSize={5}
        initialNumToRender={numColumns * 4}
        // Accessibility
        accessibilityRole="list"
      />
      {hasItems && renderFab()}
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}
