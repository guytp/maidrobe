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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useCreateWearEvent, useHasPendingWearEvent, MarkAsWornSheet } from '../../wearHistory';
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
 * Hook to track the previous value of a state/prop.
 * Useful for detecting state transitions.
 *
 * @param value - Current value to track
 * @returns Previous value (undefined on first render)
 */
function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

/**
 * Wrapper for OutfitSuggestionCard that adds pending sync status.
 *
 * This wrapper exists because useHasPendingWearEvent is a hook that
 * needs to be called per outfit to check if it has pending events.
 */
interface OutfitCardWithPendingSyncProps {
  suggestion: OutfitSuggestion;
  items: OutfitItemViewModel[];
  isLoadingItems: boolean;
  testID: string;
  onWearToday: (suggestion: OutfitSuggestion) => void;
  onMarkAsWorn: (suggestion: OutfitSuggestion) => void;
  isMarkingAsWorn: boolean;
  isWornToday: boolean;
}

function OutfitCardWithPendingSync({
  suggestion,
  items,
  isLoadingItems,
  testID,
  onWearToday,
  onMarkAsWorn,
  isMarkingAsWorn,
  isWornToday,
}: OutfitCardWithPendingSyncProps): React.JSX.Element {
  const isPendingSync = useHasPendingWearEvent(suggestion.id);

  return (
    <OutfitSuggestionCard
      suggestion={suggestion}
      items={items}
      isLoadingItems={isLoadingItems}
      testID={testID}
      onWearToday={onWearToday}
      onMarkAsWorn={onMarkAsWorn}
      isMarkingAsWorn={isMarkingAsWorn}
      isWornToday={isWornToday}
      isPendingSync={isPendingSync}
    />
  );
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
 * WEAR HISTORY INTEGRATION:
 * Each outfit card has two wear options:
 * - "Wear this today" button for quick marking as worn today
 * - "Mark as worn..." button to open date picker for past dates (last 30 days)
 * The component tracks:
 * - Which outfit is currently being marked (for loading state)
 * - Which outfits have been marked as worn today (for "Worn today" indicator)
 * - The MarkAsWornSheet modal state for date selection
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

  // Check if item resolution feature is enabled.
  // DESIGN NOTE: The empty dependency array deliberately evaluates this flag only
  // once on component mount. This matches current requirements where feature flags
  // are static for the duration of a user session. If future work requires real-time
  // flag updates (e.g., remote config push), this pattern would need to change to
  // either remove the useMemo or subscribe to flag changes via a context/event mechanism.
  const itemResolutionEnabled = useMemo(
    () => checkFeatureFlagSync('recommendations.itemResolution').enabled,
    []
  );

  // Resolve outfit items to view-models (only if feature flag enabled)
  const { resolvedOutfits, isLoading: isResolvingItems } = useResolvedOutfitItems({
    outfits,
    enabled: itemResolutionEnabled && outfits.length > 0,
  });

  // Wear event mutation hook
  const { createWearEvent, isPending: isWearPending } = useCreateWearEvent();

  // Track which outfit is currently being marked as worn
  const [markingOutfitId, setMarkingOutfitId] = useState<string | null>(null);

  // Track outfits that have been successfully marked as worn today
  // Using a Set stored in state for efficient lookups
  const [wornTodayIds, setWornTodayIds] = useState<Set<string>>(() => new Set());

  // State for Mark As Worn sheet
  const [sheetVisible, setSheetVisible] = useState(false);
  const [selectedOutfit, setSelectedOutfit] = useState<OutfitSuggestion | null>(null);

  // Handler for "Wear this today" button press
  const handleWearToday = useCallback(
    (suggestion: OutfitSuggestion) => {
      // Skip if already worn or currently marking
      if (wornTodayIds.has(suggestion.id) || markingOutfitId) {
        return;
      }

      setMarkingOutfitId(suggestion.id);

      createWearEvent({
        outfitId: suggestion.id,
        itemIds: suggestion.itemIds,
        source: 'ai_recommendation',
        context: suggestion.context ?? undefined,
        // wornDate and wornAt default to today/now in the hook
      });
    },
    [createWearEvent, wornTodayIds, markingOutfitId]
  );

  // Handler for "Mark as worn..." button press - opens the date picker sheet
  const handleMarkAsWorn = useCallback(
    (suggestion: OutfitSuggestion) => {
      // Skip if currently marking
      if (markingOutfitId) {
        return;
      }
      setSelectedOutfit(suggestion);
      setSheetVisible(true);
    },
    [markingOutfitId]
  );

  // Handler for closing the sheet
  const handleSheetClose = useCallback(() => {
    setSheetVisible(false);
    setSelectedOutfit(null);
  }, []);

  // Handler for sheet submission
  const handleSheetSubmit = useCallback(
    (date: string, context?: string) => {
      if (!selectedOutfit) return;

      setMarkingOutfitId(selectedOutfit.id);
      setSheetVisible(false);

      createWearEvent({
        outfitId: selectedOutfit.id,
        itemIds: selectedOutfit.itemIds,
        source: 'ai_recommendation',
        wornDate: date,
        context: context ?? selectedOutfit.context ?? undefined,
      });

      setSelectedOutfit(null);
    },
    [createWearEvent, selectedOutfit]
  );

  // Track the previous pending state to detect transitions
  const prevIsPending = usePrevious(isWearPending);

  // Effect to handle mutation completion - update worn status on success.
  // This effect runs when the pending state or marking outfit changes.
  // It detects the transition from pending (true) to not pending (false)
  // with a valid markingOutfitId, indicating a completed wear action.
  useEffect(() => {
    if (prevIsPending && !isWearPending && markingOutfitId) {
      // Mutation completed - mark as worn and clear marking state
      setWornTodayIds((prev) => new Set(prev).add(markingOutfitId));
      setMarkingOutfitId(null);
    }
  }, [isWearPending, markingOutfitId, prevIsPending]);

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
        <OutfitCardWithPendingSync
          suggestion={item}
          items={items}
          isLoadingItems={isResolvingItems && items.length === 0}
          testID={`outfit-suggestion-${item.id}`}
          onWearToday={handleWearToday}
          onMarkAsWorn={handleMarkAsWorn}
          isMarkingAsWorn={markingOutfitId === item.id && isWearPending}
          isWornToday={wornTodayIds.has(item.id)}
        />
      );
    },
    [resolvedOutfits, isResolvingItems, handleWearToday, handleMarkAsWorn, markingOutfitId, isWearPending, wornTodayIds]
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
          // Force re-render when items resolve or worn status changes
          extraData={{ resolvedOutfits, wornTodayIds, markingOutfitId }}
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

      {/* Mark as worn sheet */}
      <MarkAsWornSheet
        visible={sheetVisible}
        onClose={handleSheetClose}
        onSubmit={handleSheetSubmit}
        isPending={isWearPending}
        testID="mark-as-worn-sheet"
      />
    </View>
  );
}
