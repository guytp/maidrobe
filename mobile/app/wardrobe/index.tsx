import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { WardrobeScreen } from '../../src/features/wardrobe';
import { useProtectedRoute } from '../../src/features/auth/hooks/useProtectedRoute';
import { useTheme } from '../../src/core/theme';

/**
 * Wardrobe route for viewing and managing wardrobe items.
 *
 * This route wraps the WardrobeScreen component and applies auth protection
 * to ensure only authenticated users can access their wardrobe.
 *
 * This is a placeholder implementation for Story #199 Step 2. The full
 * wardrobe grid implementation will be delivered in Story #217.
 *
 * Protected route: requires authenticated user with verified email.
 *
 * @returns Wardrobe route component
 */
export default function WardrobeRoute(): React.JSX.Element {
  const isAuthorized = useProtectedRoute();
  const { colors } = useTheme();

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
          accessibilityLabel="Loading wardrobe"
        />
      </View>
    );
  }

  return <WardrobeScreen />;
}
