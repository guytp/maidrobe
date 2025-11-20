import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { CaptureScreen } from '../../src/features/wardrobe';
import { useProtectedRoute } from '../../src/features/auth/hooks/useProtectedRoute';
import { useTheme } from '../../src/core/theme';

/**
 * Capture flow route for wardrobe item image capture.
 *
 * This route wraps the CaptureScreen component and applies auth protection
 * to ensure only authenticated users can access the capture flow.
 *
 * The capture flow is reused from:
 * - Wardrobe screen (origin=wardrobe)
 * - Onboarding Step 3 (origin=onboarding)
 *
 * Route parameters:
 * - origin: "wardrobe" | "onboarding" (required)
 *
 * Protected route: requires authenticated user with verified email.
 *
 * @returns Capture route component
 */
export default function CaptureRoute(): React.JSX.Element {
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
          accessibilityLabel="Loading capture screen"
        />
      </View>
    );
  }

  return <CaptureScreen />;
}
