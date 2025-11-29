/**
 * Suggestions section component for outfit recommendations.
 *
 * Renders different states based on React Query status:
 * - Empty: Initial state before any request
 * - Loading: Spinner with status text during fetch
 * - Success: Scrollable list of outfit cards with resolved items
 * - Error: Inline error with retry button (preserves previous results)
 *
 * ITEM RESOLUTION:
 * This component integrates with useResolvedOutfitItems to resolve
 * raw itemIds to view-models with thumbnails and display names.
 * Items are resolved in batch for efficiency.
 *
 * PERFORMANCE:
 * - Uses FlatList for efficient rendering of up to 10 cards
 * - Memoized callbacks to prevent unnecessary re-renders
 * - No full-screen blocking modals
 *
 * ACCESSIBILITY:
 * - Proper semantic roles
 * - Screen reader announcements for state changes
 * - Font scaling support
 *
 * @module features/recommendations/components/SuggestionsSection
 */

import React, { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ListRenderItemInfo,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTheme } from '../../../core/theme';
import { t } from '../../../core/i18n';
import { checkFeatureFlagSync } from '../../../core/featureFlags';
import { Button } from '../../../core/components/Button';
import { OutfitSuggestionCard } from './OutfitSuggestionCard';
import { useResolvedOutfitItems } from '../hooks';
import type { OutfitSuggestion, OutfitItemViewModel } from '../types';
import type { RecommendationErrorType } from '../hooks';

/**
 * Props for SuggestionsSection component.
 */
export interface SuggestionsSectionProps {
  /** Current outfit suggestions */
  outfits: OutfitSuggestion[];
  /** Whether a fetch is in progress */
  isLoading: boolean;
  /** Whether an error occurred */
  isError: boolean;
  /** Classified error type */
  errorType: RecommendationErrorType;
  /** User-friendly error message */
  errorMessage: string | null;
  /** Whether data has been fetched at least once */
  hasData: boolean;
  /** Callback to retry fetch */
  onRetry: () => void;
}

/**
 * Empty state shown before any request is made.
 */
function EmptyState(): React.JSX.Element {
  const { colors, spacing, fontSize } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          alignItems: 'center',
          paddingVertical: spacing.xl,
        },
        icon: {
          fontSize: fontSize['4xl'],
          marginBottom: spacing.sm,
        },
        text: {
          fontSize: fontSize.sm,
          color: colors.textSecondary,
          textAlign: 'center',
        },
      }),
    [colors, spacing, fontSize]
  );

  return (
    <View style={styles.container} accessibilityRole="text">
      <Text style={styles.icon}>✨</Text>
      <Text style={styles.text} allowFontScaling={true} maxFontSizeMultiplier={2}>
        {t('screens.home.recommendations.emptyState')}
      </Text>
    </View>
  );
}

/**
 * Loading state with spinner and status text.
 */
function LoadingState(): React.JSX.Element {
  const { colors, spacing, fontSize } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          alignItems: 'center',
          paddingVertical: spacing.xl,
        },
        text: {
          fontSize: fontSize.sm,
          color: colors.textSecondary,
          marginTop: spacing.md,
        },
      }),
    [colors, spacing, fontSize]
  );

  return (
    <View
      style={styles.container}
      accessibilityRole="progressbar"
      accessibilityLabel={t('screens.home.recommendations.loading')}
    >
      <ActivityIndicator size="large" color={colors.textPrimary} />
      <Text style={styles.text} allowFontScaling={true} maxFontSizeMultiplier={2}>
        {t('screens.home.recommendations.loading')}
      </Text>
    </View>
  );
}

/**
 * Error state with message and retry button.
 */
function ErrorState({
  errorType,
  errorMessage,
  onRetry,
}: {
  errorType: RecommendationErrorType;
  errorMessage: string | null;
  onRetry: () => void;
}): React.JSX.Element {
  const { colors, spacing, radius, fontSize } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          backgroundColor: colors.error + '10',
          borderRadius: radius.md,
          padding: spacing.md,
          marginBottom: spacing.md,
        },
        icon: {
          fontSize: fontSize.xl,
          textAlign: 'center',
          marginBottom: spacing.xs,
        },
        message: {
          fontSize: fontSize.sm,
          color: colors.textPrimary,
          textAlign: 'center',
          marginBottom: spacing.md,
        },
        buttonContainer: {
          alignItems: 'center',
        },
      }),
    [colors, spacing, radius, fontSize]
  );

  // Choose icon based on error type
  const icon = errorType === 'offline' ? '📡' : '⚠️';

  return (
    <View style={styles.container} accessibilityRole="alert">
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.message} allowFontScaling={true} maxFontSizeMultiplier={2}>
        {errorMessage || t('screens.home.recommendations.errorGeneric')}
      </Text>
      <View style={styles.buttonContainer}>
        <Button
          onPress={onRetry}
          variant="secondary"
          accessibilityHint={t('screens.home.recommendations.retryHint')}
        >
          {t('screens.home.recommendations.retry')}
        </Button>
      </View>
    </View>
  );
}

/**
 * Suggestions section component.
 *
 * Renders the appropriate state based on loading/error/data status.
 * When an error occurs with existing data, shows error message above
 * the existing results.
 *
 * Integrates with useResolvedOutfitItems to resolve item IDs to
 * view-models with thumbnails and display names.
 *
 * @param props - Component props
 * @returns Suggestions section component
 */
export function SuggestionsSection({
  outfits,
  isLoading,
  isError,
  errorType,
  errorMessage,
  hasData,
  onRetry,
}: SuggestionsSectionProps): React.JSX.Element {
  const { spacing, fontSize, colors } = useTheme();

  // Check if item resolution feature is enabled
  const itemResolutionEnabled = useMemo(
    () => checkFeatureFlagSync('recommendations.itemResolution').enabled,
    []
  );

  // Resolve outfit items to view-models (only if feature flag enabled)
  const { resolvedOutfits, isLoading: isResolvingItems } = useResolvedOutfitItems({
    outfits,
    enabled: itemResolutionEnabled && outfits.length > 0,
  });

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          width: '100%',
        },
        sectionTitle: {
          fontSize: fontSize.lg,
          fontWeight: '600',
          color: colors.textPrimary,
          marginBottom: spacing.md,
        },
        listContent: {
          paddingBottom: spacing.xl,
        },
        refreshIndicator: {
          alignItems: 'center',
          marginBottom: spacing.md,
        },
      }),
    [spacing, fontSize, colors]
  );

  // Render individual outfit card with resolved items
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<OutfitSuggestion>) => {
      const items: OutfitItemViewModel[] = resolvedOutfits.get(item.id) ?? [];
      return (
        <OutfitSuggestionCard
          suggestion={item}
          items={items}
          isLoadingItems={isResolvingItems && items.length === 0}
          testID={`outfit-suggestion-${item.id}`}
        />
      );
    },
    [resolvedOutfits, isResolvingItems]
  );

  // Key extractor for FlatList
  const keyExtractor = useCallback((item: OutfitSuggestion) => item.id, []);

  // Show loading state only when loading with no previous data
  if (isLoading && !hasData) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {t('screens.home.recommendations.sectionTitle')}
        </Text>
        <LoadingState />
      </View>
    );
  }

  // Show empty state when no request has been made yet
  if (!hasData && !isLoading && !isError) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {t('screens.home.recommendations.sectionTitle')}
        </Text>
        <EmptyState />
      </View>
    );
  }

  // Render results (with optional error banner)
  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {t('screens.home.recommendations.sectionTitle')}
      </Text>

      {/* Show error banner if error occurred (but still show previous results below) */}
      {isError && errorType !== 'auth' && (
        <ErrorState errorType={errorType} errorMessage={errorMessage} onRetry={onRetry} />
      )}

      {/* Show loading indicator when refreshing with existing data */}
      {isLoading && hasData && (
        <View style={styles.refreshIndicator}>
          <ActivityIndicator size="small" color={colors.textPrimary} />
        </View>
      )}

      {/* Outfit cards list */}
      {outfits.length > 0 && (
        <FlatList
          data={outfits}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          // Performance optimizations for 30-50 outfit cards
          // windowSize: 11 = 5 screens above + 1 visible + 5 screens below
          // Larger window for smooth scrolling with rich cards
          windowSize={11}
          // maxToRenderPerBatch: Render 8 items per batch for balance between
          // initial render speed and scroll smoothness with rich content
          maxToRenderPerBatch={8}
          // initialNumToRender: Start with 6 items (typical viewport + buffer)
          initialNumToRender={6}
          // removeClippedSubviews: Enable on Android for memory efficiency,
          // disable on iOS where it can cause rendering issues
          removeClippedSubviews={Platform.OS === 'android'}
          // updateCellsBatchingPeriod: 50ms batching for smooth updates
          updateCellsBatchingPeriod={50}
          // Force re-render when items resolve
          extraData={resolvedOutfits}
          // Accessibility
          accessibilityRole="list"
          accessibilityLabel={t('screens.home.recommendations.listLabel').replace(
            '{count}',
            outfits.length.toString()
          )}
        />
      )}

      {/* Show empty state if no outfits after fetch */}
      {!isLoading && outfits.length === 0 && !isError && hasData && <EmptyState />}
    </View>
  );
}
