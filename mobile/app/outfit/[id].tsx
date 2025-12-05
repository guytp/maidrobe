/**
 * Outfit detail route for viewing outfit information and wear history context.
 *
 * This route displays the full details of an outfit, including:
 * - The items that comprise the outfit
 * - Wear-specific metadata (date, context, source) when navigated from history
 * - AI explanation if the outfit was an AI recommendation
 *
 * Route: /outfit/[id]
 * Example: /outfit/abc123?wearHistoryId=def456&wornDate=2024-01-15
 * Example with itemIds: /outfit/abc123?itemIds=item1,item2,item3
 *
 * Query Parameters (optional, from wear history navigation):
 * - wearHistoryId: The specific wear event ID
 * - wornDate: The date the outfit was worn (YYYY-MM-DD)
 * - source: How the outfit was created ('ai_recommendation' | 'saved_outfit' | 'manual_outfit')
 * - context: The occasion description
 * - itemIds: Comma-separated list of item IDs (fallback for never-worn outfits)
 *
 * Protected route: requires authenticated user with verified email.
 *
 * @module app/outfit/[id]
 */

import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useProtectedRoute } from '../../src/features/auth/hooks/useProtectedRoute';
import { useTheme } from '../../src/core/theme';
import { OutfitDetailScreen } from '../../src/features/outfits/components/OutfitDetailScreen';
import type { WearHistorySource } from '../../src/features/wearHistory/types';

/**
 * Outfit detail route component.
 *
 * Wraps the OutfitDetailScreen component with auth protection and handles
 * route parameter extraction including optional wear history context.
 *
 * @returns Outfit detail route component
 */
export default function OutfitDetailRoute(): React.JSX.Element {
  const isAuthorized = useProtectedRoute();
  const { colors, colorScheme } = useTheme();

  // Extract route params - all values come as strings from Expo Router
  const params = useLocalSearchParams<{
    id: string;
    wearHistoryId?: string;
    wornDate?: string;
    source?: string;
    context?: string;
    itemIds?: string;
  }>();

  // Cast source to WearHistorySource type (validated in component)
  const source = params.source as WearHistorySource | undefined;

  // Parse itemIds from comma-separated string to array
  // This enables passing outfit item IDs for never-worn outfits from recommendations
  const itemIds = params.itemIds ? params.itemIds.split(',').filter(Boolean) : undefined;

  // Show loading state while checking auth
  if (!isAuthorized) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ActivityIndicator
          size="large"
          color={colors.textPrimary}
          accessibilityLabel="Loading outfit details"
        />
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </View>
    );
  }

  // Handle missing ID - OutfitDetailScreen will show error state
  if (!params.id) {
    return <OutfitDetailScreen outfitId="" />;
  }

  return (
    <OutfitDetailScreen
      outfitId={params.id}
      wearHistoryId={params.wearHistoryId}
      itemIds={itemIds}
      wornDate={params.wornDate}
      source={source}
      context={params.context}
    />
  );
}
