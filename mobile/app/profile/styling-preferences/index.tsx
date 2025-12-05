import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StylingPreferencesScreen } from '../../../src/features/profile';
import { useProtectedRoute } from '../../../src/features/auth/hooks/useProtectedRoute';
import { useTheme } from '../../../src/core/theme';

/**
 * Styling Preferences route for managing no-repeat window and mode settings.
 *
 * This route wraps the StylingPreferencesScreen component and applies auth protection
 * to ensure only authenticated users can access their styling preferences.
 *
 * Protected route: requires authenticated user with verified email.
 *
 * @returns Styling Preferences route component
 */
export default function StylingPreferencesRoute(): React.JSX.Element {
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
          accessibilityLabel="Loading styling preferences"
        />
      </View>
    );
  }

  return <StylingPreferencesScreen />;
}
