import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { ProfileScreen } from '../../src/features/profile';
import { useProtectedRoute } from '../../src/features/auth/hooks/useProtectedRoute';
import { useTheme } from '../../src/core/theme';

/**
 * Profile route for accessing user profile and settings.
 *
 * This route wraps the ProfileScreen component and applies auth protection
 * to ensure only authenticated users can access their profile.
 *
 * Protected route: requires authenticated user with verified email.
 *
 * @returns Profile route component
 */
export default function ProfileRoute(): React.JSX.Element {
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
          accessibilityLabel="Loading profile"
        />
      </View>
    );
  }

  return <ProfileScreen />;
}
