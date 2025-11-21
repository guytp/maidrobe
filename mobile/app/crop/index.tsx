/**
 * Crop route for image adjustment and cropping.
 *
 * INTERIM IMPLEMENTATION (Story #199):
 * This is a placeholder screen that validates the capture payload and provides
 * navigation scaffolding. The full crop UI with image editing capabilities
 * will be implemented in Story #205.
 *
 * Current functionality:
 * - Reads CaptureImagePayload from Zustand store
 * - Validates payload with type guard
 * - Shows error if payload is missing or invalid
 * - Provides safe back navigation to origin
 * - Development-only debug output (gated with __DEV__)
 *
 * TODO (Story #205):
 * - Replace placeholder with actual image cropping UI
 * - Add rotation and adjustment controls
 * - Implement image quality optimization
 * - Add hand-off to item metadata form
 *
 * @module app/crop
 */

import React, { useEffect, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { t } from '../../src/core/i18n';
import { useTheme } from '../../src/core/theme';
import { Button } from '../../src/core/components/Button';
import { useProtectedRoute } from '../../src/features/auth/hooks/useProtectedRoute';
import { useStore } from '../../src/core/state/store';
import { isCaptureImagePayload } from '../../src/core/types/capture';

/**
 * Icon constants for crop screen placeholder.
 *
 * Using emoji for temporary placeholder - Story #205 will replace with
 * proper icon components for better cross-platform consistency.
 */
const ICON_ERROR = '⚠️';
const ICON_CROP = '✂️';

/**
 * Crop screen placeholder component.
 *
 * Protected route: requires authenticated user with verified email.
 *
 * @returns Crop route component
 */
export default function CropRoute(): React.JSX.Element {
  const isAuthorized = useProtectedRoute();
  const { colors, colorScheme, spacing } = useTheme();
  const router = useRouter();
  const payload = useStore((state) => state.payload);
  const clearPayload = useStore((state) => state.clearPayload);

  // Validate payload on mount
  const isValid = isCaptureImagePayload(payload);

  useEffect(() => {
    // If payload is invalid, we can't proceed with crop
    // User should go back to capture flow
    if (!isValid) {
      // Clear any stale payload
      clearPayload();
    }
  }, [isValid, clearPayload]);

  /**
   * Handles back navigation based on payload origin.
   *
   * Returns user to the capture screen or appropriate parent.
   */
  const handleGoBack = () => {
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
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        loadingContainer: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
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
      }),
    [colors, spacing]
  );

  // Show loading while auth is checking
  if (!isAuthorized) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator
          size="large"
          color={colors.textPrimary}
          accessibilityLabel="Loading crop screen"
        />
      </View>
    );
  }

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
            onPress={handleGoBack}
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

  // Show placeholder if payload is valid
  // TODO (Story #205): Replace with actual crop UI implementation
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
        {__DEV__ && (
          <Text
            style={styles.debugInfo}
            accessibilityLabel={t('screens.crop.accessibility.debugInfo')}
          >
            Origin: {payload.origin} | Source: {payload.source}
          </Text>
        )}
        <Button
          onPress={handleGoBack}
          variant="secondary"
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
