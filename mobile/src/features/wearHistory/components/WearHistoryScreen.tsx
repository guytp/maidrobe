/**
 * Wear History screen component for viewing outfit wear timeline.
 *
 * This screen displays a reverse-chronological list of wear events,
 * grouped by date with sticky headers, and supports infinite scroll pagination.
 *
 * Features:
 * - Date-grouped list with sticky headers ("Today", "Yesterday", or formatted date)
 * - Wear event cards showing context, source, and time
 * - Infinite scroll pagination
 * - Empty state with guidance
 * - Loading and error states with retry
 * - Telemetry tracking
 *
 * @module features/wearHistory/components/WearHistoryScreen
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
  type SectionListData,
  type SectionListRenderItemInfo,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Button } from '../../../core/components/Button';
import { trackCaptureEvent } from '../../../core/telemetry';
import { useStore } from '../../../core/state/store';
import { useWearHistoryInfiniteQuery } from '../hooks';
import { groupWearEventsByDate, type WearHistorySection } from '../utils';
import { WearEventCard } from './WearEventCard';
import { WearEventCardSkeleton } from './WearEventCardSkeleton';
import type { WearHistoryRow } from '../types';

/**
 * Minimum touch target size for accessibility (WCAG 2.1 AA).
 */
const TOUCH_TARGET_SIZE = 44;

/**
 * Threshold for triggering pagination (50% from bottom).
 */
const END_REACHED_THRESHOLD = 0.5;

/**
 * Number of skeleton cards to show during initial load.
 */
const SKELETON_COUNT = 4;

/**
 * Icon size for empty state illustration.
 * Larger than typical icons for visual prominence in centered layout.
 */
const EMPTY_STATE_ICON_SIZE = 48;

/**
 * Wear History screen - displays timeline of worn outfits.
 *
 * Protected route: requires authenticated user (enforced by route wrapper).
 *
 * @returns Wear History screen component
 */
export function WearHistoryScreen(): React.JSX.Element {
  const { colors, colorScheme, spacing, fontSize } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const hasTrackedScreenView = useRef(false);

  // Global state
  const user = useStore((state) => state.user);

  // Fetch wear history with infinite scroll
  const {
    events,
    totalCount,
    isLoading,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useWearHistoryInfiniteQuery();

  // Group events by date for SectionList
  const sections = useMemo(() => groupWearEventsByDate(events), [events]);

  // Determine UI states
  const isEmpty = !isLoading && !isError && events.length === 0;

  /**
   * Track screen view on mount (once per session).
   */
  useEffect(() => {
    if (!hasTrackedScreenView.current && user?.id) {
      hasTrackedScreenView.current = true;
      trackCaptureEvent('wear_history_screen_viewed', {
        userId: user.id,
      });
    }
  }, [user?.id]);

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
   * Handles wear event card press - tracks telemetry and navigates to outfit detail.
   *
   * Passes the outfit ID as a route parameter and wear event context as query params
   * so the outfit detail screen can display wear-specific metadata.
   */
  const handleEventPress = useCallback(
    (event: WearHistoryRow) => {
      trackCaptureEvent('wear_history_event_tapped', {
        userId: user?.id,
        metadata: {
          eventId: event.id,
          outfitId: event.outfit_id,
          source: event.source,
        },
      });

      // Navigate to outfit detail with wear event context
      router.push({
        pathname: '/outfit/[id]',
        params: {
          id: event.outfit_id,
          wearHistoryId: event.id,
          wornDate: event.worn_date,
          source: event.source,
          context: event.context ?? undefined,
        },
      });
    },
    [user?.id, router]
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
   * Renders a single wear event card.
   */
  const renderItem = useCallback(
    ({ item }: SectionListRenderItemInfo<WearHistoryRow, WearHistorySection>) => (
      <WearEventCard event={item} onPress={handleEventPress} testID={`wear-event-${item.id}`} />
    ),
    [handleEventPress]
  );

  /**
   * Renders a section header (date label).
   */
  const renderSectionHeader = useCallback(
    ({ section }: { section: SectionListData<WearHistoryRow, WearHistorySection> }) => (
      <View
        style={{
          backgroundColor: colors.background,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderBottomWidth: 1,
          borderBottomColor: colors.textSecondary + '15',
        }}
      >
        <Text
          style={{
            fontSize: fontSize.base,
            fontWeight: '600',
            color: colors.textPrimary,
          }}
          allowFontScaling
          maxFontSizeMultiplier={1.5}
          accessibilityRole="header"
        >
          {section.title}
        </Text>
      </View>
    ),
    [colors, spacing, fontSize]
  );

  /**
   * Key extractor for SectionList items.
   */
  const keyExtractor = useCallback((item: WearHistoryRow) => item.id, []);

  /**
   * Renders the list footer (pagination loading indicator).
   */
  const renderFooter = useCallback(() => {
    if (!isFetchingNextPage) return null;

    return (
      <View
        style={{
          paddingVertical: spacing.lg,
          alignItems: 'center',
        }}
      >
        <ActivityIndicator
          size="small"
          color={colors.textPrimary}
          accessibilityLabel={t('screens.history.loading')}
        />
      </View>
    );
  }, [isFetchingNextPage, spacing, colors]);

  /**
   * Handles CTA button press in empty state - navigates to home.
   */
  const handleEmptyCta = useCallback(() => {
    trackCaptureEvent('wear_history_empty_cta_tapped', {
      userId: user?.id,
    });
    router.replace('/home');
  }, [user?.id, router]);

  /**
   * Renders the empty state.
   */
  const renderEmpty = useCallback(() => {
    if (isLoading || isError) return null;

    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: spacing.xl,
        }}
      >
        <View
          style={{ marginBottom: spacing.md }}
          accessibilityLabel={t('screens.history.empty.iconLabel')}
          accessibilityRole="image"
        >
          <MaterialIcons name="event" size={EMPTY_STATE_ICON_SIZE} color={colors.textSecondary} />
        </View>
        <Text
          style={{
            fontSize: fontSize.lg,
            fontWeight: '600',
            color: colors.textPrimary,
            textAlign: 'center',
            marginBottom: spacing.sm,
          }}
          allowFontScaling
          maxFontSizeMultiplier={1.5}
        >
          {t('screens.history.empty.title')}
        </Text>
        <Text
          style={{
            fontSize: fontSize.base,
            color: colors.textSecondary,
            textAlign: 'center',
            marginBottom: spacing.lg,
          }}
          allowFontScaling
          maxFontSizeMultiplier={2}
        >
          {t('screens.history.empty.subtitle')}
        </Text>
        <Button
          onPress={handleEmptyCta}
          variant="primary"
          accessibilityLabel={t('screens.history.empty.ctaButton')}
          accessibilityHint={t('screens.history.empty.ctaButtonHint')}
        >
          {t('screens.history.empty.ctaButton')}
        </Button>
      </View>
    );
  }, [isLoading, isError, spacing, fontSize, colors, handleEmptyCta]);

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
        headerSubtitle: {
          fontSize: fontSize.sm,
          color: colors.textSecondary,
          marginTop: 2,
        },
        sectionList: {
          flex: 1,
        },
        sectionListContent: {
          paddingTop: spacing.sm,
          paddingBottom: insets.bottom + spacing.lg,
        },
        skeletonContainer: {
          flex: 1,
          paddingTop: spacing.md,
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
        inlineErrorBanner: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: colors.error + '15',
          borderWidth: 1,
          borderColor: colors.error + '30',
          marginHorizontal: spacing.md,
          marginTop: spacing.sm,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderRadius: 8,
          minHeight: TOUCH_TARGET_SIZE,
        },
        inlineErrorText: {
          fontSize: fontSize.sm,
          color: colors.error,
          flex: 1,
        },
        inlineErrorRetry: {
          fontSize: fontSize.sm,
          fontWeight: '600',
          color: colors.error,
          marginLeft: spacing.sm,
        },
      }),
    [colors, spacing, fontSize, insets.top, insets.bottom]
  );

  // Render loading state with skeleton cards
  if (isLoading) {
    return (
      <View
        style={styles.container}
        accessibilityLabel={t('screens.history.accessibility.screenLabel')}
      >
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
            onPress={handleBack}
            accessibilityLabel={t('screens.history.accessibility.backButton')}
            accessibilityHint={t('screens.history.accessibility.backButtonHint')}
            accessibilityRole="button"
          >
            <Text style={styles.backIcon}>←</Text>
          </Pressable>
          <View style={styles.headerTitleContainer}>
            <Text
              style={styles.headerTitle}
              accessibilityRole="header"
              allowFontScaling
              maxFontSizeMultiplier={1.5}
            >
              {t('screens.history.title')}
            </Text>
          </View>
        </View>
        <View style={styles.skeletonContainer} accessibilityLabel={t('screens.history.loading')}>
          {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
            <WearEventCardSkeleton key={`skeleton-${index}`} testID={`skeleton-${index}`} />
          ))}
        </View>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </View>
    );
  }

  // Render full-screen error only when we have no data
  if (isError && events.length === 0) {
    return (
      <View
        style={styles.container}
        accessibilityLabel={t('screens.history.accessibility.screenLabel')}
      >
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
            onPress={handleBack}
            accessibilityLabel={t('screens.history.accessibility.backButton')}
            accessibilityHint={t('screens.history.accessibility.backButtonHint')}
            accessibilityRole="button"
          >
            <Text style={styles.backIcon}>←</Text>
          </Pressable>
          <View style={styles.headerTitleContainer}>
            <Text
              style={styles.headerTitle}
              accessibilityRole="header"
              allowFontScaling
              maxFontSizeMultiplier={1.5}
            >
              {t('screens.history.title')}
            </Text>
          </View>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText} allowFontScaling maxFontSizeMultiplier={2}>
            {t('screens.history.error.loadFailed')}
          </Text>
          <Button
            onPress={handleRetry}
            variant="secondary"
            accessibilityLabel={t('screens.history.error.retry')}
            accessibilityHint={t('screens.history.accessibility.retryHint')}
          >
            {t('screens.history.error.retry')}
          </Button>
        </View>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </View>
    );
  }

  // Determine if we should show inline error banner (error with existing data)
  const showInlineError = isError && events.length > 0;

  return (
    <View
      style={styles.container}
      accessibilityLabel={t('screens.history.accessibility.screenLabel')}
      accessibilityHint={t('screens.history.accessibility.screenHint')}
    >
      {/* Header with back button and title */}
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          onPress={handleBack}
          accessibilityLabel={t('screens.history.accessibility.backButton')}
          accessibilityHint={t('screens.history.accessibility.backButtonHint')}
          accessibilityRole="button"
        >
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <View style={styles.headerTitleContainer}>
          <Text
            style={styles.headerTitle}
            accessibilityRole="header"
            allowFontScaling
            maxFontSizeMultiplier={1.5}
          >
            {t('screens.history.title')}
          </Text>
          {totalCount > 0 && (
            <Text style={styles.headerSubtitle} allowFontScaling maxFontSizeMultiplier={1.5}>
              {t('screens.history.eventCount').replace('{count}', String(totalCount))}
            </Text>
          )}
        </View>
      </View>

      {/* Inline error banner (shown when error occurs but we have cached data) */}
      {showInlineError && (
        <Pressable
          style={styles.inlineErrorBanner}
          onPress={handleRetry}
          accessibilityRole="button"
          accessibilityLabel={t('screens.history.error.loadMoreFailed')}
          accessibilityHint={t('screens.history.accessibility.retryHint')}
        >
          <Text style={styles.inlineErrorText} allowFontScaling maxFontSizeMultiplier={1.5}>
            {t('screens.history.error.loadMoreFailed')}
          </Text>
          <Text style={styles.inlineErrorRetry} allowFontScaling maxFontSizeMultiplier={1.5}>
            {t('screens.history.error.retry')}
          </Text>
        </Pressable>
      )}

      {/* Content - SectionList or Empty State */}
      {isEmpty ? (
        renderEmpty()
      ) : (
        <SectionList<WearHistoryRow, WearHistorySection>
          style={styles.sectionList}
          contentContainerStyle={styles.sectionListContent}
          sections={sections}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          ListFooterComponent={renderFooter}
          stickySectionHeadersEnabled
          onEndReached={handleEndReached}
          onEndReachedThreshold={END_REACHED_THRESHOLD}
          // Performance optimizations
          removeClippedSubviews
          maxToRenderPerBatch={10}
          windowSize={5}
          initialNumToRender={10}
          // Accessibility
          accessibilityLabel={t('screens.history.accessibility.listLabel').replace(
            '{count}',
            String(events.length)
          )}
        />
      )}

      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}
