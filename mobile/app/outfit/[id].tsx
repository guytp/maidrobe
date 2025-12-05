/**
 * Outfit detail route for viewing outfit information and wear history context.
 *
 * This route displays the full details of an outfit, including:
 * - The items that comprise the outfit
 * - Wear-specific metadata (date, context, source) when navigated from history
 * - "Mark as worn again" action (works for never-worn outfits when itemIds provided)
 *
 * ## Route Usage by Entry Point
 *
 * **From Wear History:**
 * /outfit/abc123?wearHistoryId=def456
 * - Fetches item IDs from the wear event record
 *
 * **From AI Recommendations (never-worn):**
 * /outfit/abc123?itemIds=item1,item2,item3&source=ai_recommendation
 * - Pass itemIds and source for accurate wear history tracking
 *
 * **From Saved Outfits (previously worn):**
 * /outfit/abc123
 * - Screen fetches latest wear event to get item IDs and source
 *
 * ## Query Parameters
 *
 * - wearHistoryId: The specific wear event ID (from history navigation)
 * - itemIds: Comma-separated item IDs (required for never-worn outfits from recommendations)
 * - source: Origin of outfit ('ai_recommendation' | 'saved_outfit' | 'manual_outfit')
 *           Used when creating wear events to preserve accurate history
 * - wornDate: @deprecated - kept for navigation compatibility
 * - context: @deprecated - kept for navigation compatibility
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
