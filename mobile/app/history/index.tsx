import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { WearHistoryScreen } from '../../src/features/wearHistory';
import { useProtectedRoute } from '../../src/features/auth/hooks/useProtectedRoute';
import { useTheme } from '../../src/core/theme';

/**
 * Wear History route for viewing wear history timeline.
 *
 * This route wraps the WearHistoryScreen component and applies auth protection
 * to ensure only authenticated users can access their wear history.
 *
 * Protected route: requires authenticated user with verified email.
 *
 * @returns Wear History route component
 */
export default function HistoryRoute(): React.JSX.Element {
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
          accessibilityLabel="Loading wear history"
        />
      </View>
    );
  }

  return <WearHistoryScreen />;
}
