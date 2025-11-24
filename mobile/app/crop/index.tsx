/**
 * Crop route for image adjustment and cropping.
 *
 * This route wraps the CropScreen component and applies auth protection
 * to ensure only authenticated users can access the crop flow.
 *
 * The crop screen is used after image capture or gallery selection
 * to allow users to adjust and frame their wardrobe item photos.
 *
 * NAVIGATION CONTRACT:
 * --------------------
 * Route Path: /crop
 * Data Passing: Zustand store (captureSlice.payload)
 *
 * Required Payload (CaptureImagePayload):
 *   - uri: string        - Local file URI (file:/// scheme)
 *   - width: number      - Image width in pixels (> 0)
 *   - height: number     - Image height in pixels (> 0)
 *   - origin: string     - 'wardrobe' | 'onboarding'
 *   - source: string     - 'camera' | 'gallery'
 *   - createdAt: string  - ISO 8601 timestamp
 *
 * Feature Flag: capture.cropScreen
 *   - When enabled: Screen renders normally
 *   - When disabled: Redirects to /onboarding/first-item
 *
 * Entry Points:
 *   - CaptureCameraScreen (after camera capture)
 *   - useGallerySelection hook (after gallery pick)
 *
 * Exit Points:
 *   - Confirm/Next -> /onboarding/first-item (with processed image)
 *   - Back/Retake -> /wardrobe or /onboarding/first-item (based on origin)
 *
 * Protected route: requires authenticated user with verified email.
 *
 * See: src/features/wardrobe/crop/NAVIGATION_CONTRACT.md for full details.
 *
 * @module app/crop
 */

import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CropScreen } from '../../src/features/wardrobe';
import { useProtectedRoute } from '../../src/features/auth/hooks/useProtectedRoute';
import { checkFeatureFlagSync } from '../../src/core/featureFlags';
import { useTheme } from '../../src/core/theme';

/**
 * Crop route component.
 *
 * Protected route: requires authenticated user with verified email.
 * Feature-flagged: redirects to item creation if crop screen is disabled.
 *
 * @returns Crop route component
 */
export default function CropRoute(): React.JSX.Element {
  const isAuthorized = useProtectedRoute();
  const { colors } = useTheme();
  const router = useRouter();

  // Check feature flag and redirect if disabled
  useEffect(() => {
    const cropScreenFlag = checkFeatureFlagSync('capture.cropScreen');
    const cropEnabled = cropScreenFlag.enabled && !cropScreenFlag.requiresUpdate;

    if (!cropEnabled) {
      // Feature is disabled - redirect to item creation to prevent dead navigation
      router.replace('/onboarding/first-item');
    }
  }, [router]);

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
