/**
 * Crop route for image adjustment and cropping.
 *
 * This route wraps the CropScreen component and applies auth protection
 * to ensure only authenticated users can access the crop flow.
 *
 * The crop screen is used after image capture or gallery selection
 * to allow users to adjust and frame their wardrobe item photos.
 *
 * Route parameters: None (uses Zustand store for payload)
 *
 * Protected route: requires authenticated user with verified email.
 *
 * @module app/crop
 */

import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { CropScreen } from '../../src/features/wardrobe';
import { useProtectedRoute } from '../../src/features/auth/hooks/useProtectedRoute';
import { useTheme } from '../../src/core/theme';

/**
 * Crop route component.
 *
 * Protected route: requires authenticated user with verified email.
 *
 * @returns Crop route component
 */
export default function CropRoute(): React.JSX.Element {
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
          accessibilityLabel="Loading crop screen"
        />
      </View>
    );
  }

  return <CropScreen />;
}
