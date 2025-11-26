/**
 * Item detail route for viewing and editing a single wardrobe item.
 *
 * This route displays the full details of a wardrobe item identified by its ID,
 * including image, editable name and tags, AI attributes summary, and actions
 * for saving changes or deleting the item.
 *
 * Route: /wardrobe/[id]
 * Example: /wardrobe/abc123
 *
 * Protected route: requires authenticated user with verified email.
 *
 * @module app/wardrobe/[id]
 */

import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useProtectedRoute } from '../../src/features/auth/hooks/useProtectedRoute';
import { useTheme } from '../../src/core/theme';
import { ItemDetailScreen } from '../../src/features/wardrobe/components/ItemDetailScreen';

/**
 * Item detail route component.
 *
 * Wraps the ItemDetailScreen component with auth protection and handles
 * the route parameter extraction.
 *
 * @returns Item detail route component
 */
export default function ItemDetailRoute(): React.JSX.Element {
  const isAuthorized = useProtectedRoute();
  const { colors, colorScheme } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

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
          accessibilityLabel="Loading item details"
        />
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </View>
    );
  }

  // Handle missing ID - ItemDetailScreen will show error state
  // which auto-navigates back to the wardrobe grid
  if (!id) {
    return <ItemDetailScreen itemId="" />;
  }

  return <ItemDetailScreen itemId={id} />;
}
