/**
 * Crop & Adjust screen component for wardrobe item image cropping.
 *
 * This screen provides image cropping and adjustment capabilities for captured
 * wardrobe item photos. It displays the selected image with a fixed 4:5 portrait
 * crop frame, allows zoom and pan gestures, and processes the cropped image for
 * handoff to the item creation flow.
 *
 * Implementation status:
 * - Step 1: Route setup, navigation contract, back handling ✓
 * - Step 2: Visual layout (frame, grid, mask) - TODO
 * - Step 3: Gesture handling (pinch, pan, zoom) - TODO
 * - Step 4: Image processing (crop, resize, compress) - TODO
 * - Step 5: Integration and error handling - TODO
 *
 * Navigation contract:
 * - Receives CaptureImagePayload from Zustand store
 * - Validates payload with isCaptureImagePayload type guard
 * - Navigates back to capture/gallery on Back/Retake
 * - Navigates to item creation on Confirm/Next (Step 4+)
 *
 * @module features/wardrobe/crop/components/CropScreen
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { t } from '../../../../core/i18n';
import { useTheme } from '../../../../core/theme';
import { Button } from '../../../../core/components/Button';
import { useStore } from '../../../../core/state/store';
import { isCaptureImagePayload } from '../../../../core/types/capture';
import { trackCaptureEvent } from '../../../../core/telemetry';

/**
 * Icon constants for crop screen.
 *
 * Using emoji for temporary placeholder - will be replaced with proper
 * icon components in future iterations for better cross-platform consistency.
 */
const ICON_ERROR = '⚠️';
const ICON_CROP = '✂️';

/**
 * Crop & Adjust screen component.
 *
 * Displays the captured/selected image with cropping controls and navigation.
 * Protected route: requires authenticated user (enforced by route wrapper).
 *
 * @returns Crop screen component with image adjustment UI
 */
export function CropScreen(): React.JSX.Element {
  const { colors, colorScheme, spacing } = useTheme();
  const router = useRouter();
  const payload = useStore((state) => state.payload);
  const clearPayload = useStore((state) => state.clearPayload);
  const user = useStore((state) => state.user);

  // Validate payload on mount
  const isValid = isCaptureImagePayload(payload);

  useEffect(() => {
    // Track crop screen opened for valid payloads
    if (isValid && payload) {
      trackCaptureEvent('crop_screen_opened', {
        userId: user?.id,
        origin: payload.origin,
        source: payload.source,
        width: payload.width,
        height: payload.height,
      });
    }

    // If payload is invalid, clear any stale data
    if (!isValid) {
      clearPayload();
    }
  }, [isValid, payload, clearPayload, user?.id]);

  /**
   * Handles Back/Retake navigation based on payload origin.
   *
   * Returns user to the appropriate capture screen or parent screen.
   * Clears the payload to prevent stale state.
   */
  const handleBackRetake = useCallback(() => {
    // Track cancellation
    if (payload && isCaptureImagePayload(payload)) {
      trackCaptureEvent('crop_cancelled', {
        userId: user?.id,
        origin: payload.origin,
        source: payload.source,
      });
    }

    // Clear the payload
    clearPayload();

    // Navigate based on origin if available
    if (payload && isCaptureImagePayload(payload)) {
      const { origin } = payload;
      if (origin === 'wardrobe') {
        router.push('/wardrobe');
      } else if (origin === 'onboarding') {
        router.push('/onboarding/first-item');
      } else {
        router.push('/home');
      }
    } else {
      // Fallback to home if we don't know where to go
      router.push('/home');
    }
  }, [payload, user, clearPayload, router]);

  /**
   * Handles Confirm/Next action (placeholder for Step 4).
   *
   * Will process the crop and navigate to item creation in Step 4.
   * Currently shows debug info in development mode.
   */
  const handleConfirm = useCallback(() => {
    if (__DEV__) {
      console.log('[CropScreen] Confirm pressed - full implementation in Step 4');
      console.log('[CropScreen] Payload:', payload);
    }

    // TODO (Step 4): Implement crop processing pipeline
    // 1. Compute crop rectangle from transform state
    // 2. Apply crop to image
    // 3. Resize to target dimensions (1600px longest edge)
    // 4. Compress to JPEG
    // 5. Navigate to item creation with processed image

    // Track confirm action for telemetry
    if (payload && isCaptureImagePayload(payload)) {
      trackCaptureEvent('crop_confirm_pressed', {
        userId: user?.id,
        origin: payload.origin,
        source: payload.source,
      });
    }
  }, [payload, user]);

  /**
   * Android hardware back button handler.
   *
   * Intercepts hardware back press and delegates to Back/Retake behavior.
   * Returns true to prevent default back navigation.
   */
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBackRetake();
      return true; // Prevent default back behavior
    });

    // Clean up listener on unmount
    return () => backHandler.remove();
  }, [handleBackRetake]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        content: {
          flex: 1,
          padding: spacing.lg,
          justifyContent: 'center',
          alignItems: 'center',
        },
        errorIcon: {
          fontSize: 64,
          marginBottom: spacing.md,
        },
        errorTitle: {
          fontSize: 24,
          fontWeight: '600',
          color: colors.textPrimary,
          marginBottom: spacing.sm,
          textAlign: 'center',
        },
        errorMessage: {
          fontSize: 16,
          color: colors.textSecondary,
          marginBottom: spacing.xl,
          textAlign: 'center',
          maxWidth: 300,
        },
        placeholderIcon: {
          fontSize: 64,
          marginBottom: spacing.md,
        },
        placeholderTitle: {
          fontSize: 24,
          fontWeight: '600',
          color: colors.textPrimary,
          marginBottom: spacing.sm,
          textAlign: 'center',
        },
        placeholderMessage: {
          fontSize: 16,
          color: colors.textSecondary,
          marginBottom: spacing.xl,
          textAlign: 'center',
          maxWidth: 300,
        },
        debugInfo: {
          fontSize: 12,
          color: colors.textSecondary,
          marginTop: spacing.md,
          fontFamily: 'monospace',
        },
        buttonContainer: {
          flexDirection: 'row',
          gap: spacing.md,
          marginTop: spacing.lg,
        },
      }),
    [colors, spacing]
  );

  // Show error if payload is invalid
  if (!isValid) {
    return (
      <View
        style={styles.container}
        accessibilityLabel={t('screens.crop.accessibility.screenLabel')}
      >
        <View style={styles.content}>
          <Text
            style={styles.errorIcon}
            accessibilityLabel={t('screens.crop.accessibility.errorIcon')}
            accessibilityRole="image"
          >
            {ICON_ERROR}
          </Text>
          <Text
            style={styles.errorTitle}
            allowFontScaling={true}
            maxFontSizeMultiplier={2}
            accessibilityRole="header"
          >
            {t('screens.crop.errors.noImage')}
          </Text>
          <Text style={styles.errorMessage} allowFontScaling={true} maxFontSizeMultiplier={2}>
            {t('screens.crop.errors.invalidPayload')}
          </Text>
          <Button
            onPress={handleBackRetake}
            variant="primary"
            accessibilityLabel={t('screens.crop.accessibility.goBackButton')}
            accessibilityHint={t('screens.crop.accessibility.goBackHint')}
          >
            {t('screens.crop.goBack')}
          </Button>
        </View>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </View>
    );
  }

  // Show crop interface placeholder (Steps 2-4 will implement full UI)
  // TODO (Step 2): Replace with actual crop frame, grid, and mask
  // TODO (Step 3): Add gesture handlers for zoom and pan
  // TODO (Step 4): Add image processing on confirm
  return (
    <View
      style={styles.container}
      accessibilityLabel={t('screens.crop.accessibility.screenLabel')}
      accessibilityHint={t('screens.crop.accessibility.screenHint')}
    >
      <View style={styles.content}>
        <Text
          style={styles.placeholderIcon}
          accessibilityLabel={t('screens.crop.accessibility.cropIcon')}
          accessibilityRole="image"
        >
          {ICON_CROP}
        </Text>
        <Text
          style={styles.placeholderTitle}
          allowFontScaling={true}
          maxFontSizeMultiplier={2}
          accessibilityRole="header"
        >
          {t('screens.crop.title')}
        </Text>
        <Text style={styles.placeholderMessage} allowFontScaling={true} maxFontSizeMultiplier={2}>
          {t('screens.crop.placeholder')}
        </Text>
        {__DEV__ && payload && (
          <Text
            style={styles.debugInfo}
            accessibilityLabel={t('screens.crop.accessibility.debugInfo')}
          >
            Origin: {payload.origin} | Source: {payload.source}
            {'\n'}
            Dimensions: {payload.width}x{payload.height}
            {'\n'}
            URI: {payload.uri.substring(0, 50)}...
          </Text>
        )}
        <View style={styles.buttonContainer}>
          <Button
            onPress={handleBackRetake}
            variant="secondary"
            accessibilityLabel={t('screens.crop.accessibility.retakeButton')}
            accessibilityHint={t('screens.crop.accessibility.retakeHint')}
          >
            {t('screens.crop.retake')}
          </Button>
          <Button
            onPress={handleConfirm}
            variant="primary"
            accessibilityLabel={t('screens.crop.accessibility.confirmButton')}
            accessibilityHint={t('screens.crop.accessibility.confirmHint')}
          >
            {t('screens.crop.confirm')}
          </Button>
        </View>
      </View>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}
