/**
 * Calendar Integration Route
 *
 * Provides navigation route for the Calendar Integration screen.
 * Applies authentication protection to ensure only authenticated users
 * can access their calendar integration settings.
 *
 * @module app/profile/calendar-integration
 */

import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { CalendarIntegrationScreen } from '@/features/profile';
import { useProtectedRoute } from '@/features/auth/hooks/useProtectedRoute';
import { useTheme } from '@/core/theme';

/**
 * Calendar Integration route for managing Google Calendar connection.
 *
 * This route wraps the CalendarIntegrationScreen component and applies auth protection
 * to ensure only authenticated users can access their calendar settings.
 *
 * Protected route: requires authenticated user.
 *
 * @returns Calendar Integration route component
 */
export default function CalendarIntegrationRoute(): React.JSX.Element {
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
          accessibilityLabel="Loading calendar integration"
        />
      </View>
    );
  }

  return <CalendarIntegrationScreen />;
}
