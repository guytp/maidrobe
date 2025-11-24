/**
 * Review & Details route for item creation.
 *
 * This route wraps the ReviewDetailsScreen component and applies auth protection
 * to ensure only authenticated users can access the item creation flow.
 *
 * The review-details screen is shown after the crop step completes, allowing
 * users to add optional name and tags before saving the item.
 *
 * NAVIGATION CONTRACT:
 * --------------------
 * Route Path: /review-details
 * Data Passing: Zustand store (captureSlice.payload)
 *
 * Required Payload (CaptureImagePayload):
 *   - uri: string        - Local file URI of cropped image
 *   - width: number      - Image width in pixels
 *   - height: number     - Image height in pixels
 *   - origin: string     - 'wardrobe' | 'onboarding'
 *   - source: string     - 'camera' | 'gallery'
 *   - createdAt: string  - ISO 8601 timestamp
 *
 * Entry Points:
 *   - CropScreen (after crop confirm, for wardrobe origin)
 *
 * Exit Points:
 *   - Save success -> /wardrobe (replaces stack)
 *   - Back/Cancel -> /crop (preserves payload for re-editing)
 *
 * Protected route: requires authenticated user with verified email.
 *
 * @module app/review-details
 */

import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { ReviewDetailsScreen } from '../../src/features/wardrobe/components/ReviewDetailsScreen';
import { useProtectedRoute } from '../../src/features/auth/hooks/useProtectedRoute';
import { useTheme } from '../../src/core/theme';

/**
 * Review & Details route component.
 *
 * Protected route: requires authenticated user with verified email.
 *
 * @returns Review & Details route component
 */
export default function ReviewDetailsRoute(): React.JSX.Element {
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
          accessibilityLabel="Loading review details screen"
        />
      </View>
    );
  }

  return <ReviewDetailsScreen />;
}
