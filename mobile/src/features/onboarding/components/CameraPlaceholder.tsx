import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../../core/components';
import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';

/**
 * Camera placeholder component for first item onboarding.
 *
 * PLACEHOLDER IMPLEMENTATION:
 * This is a temporary placeholder until Feature #3 (Wardrobe Item Capture &
 * Management) provides the actual camera functionality. This component simulates
 * the camera flow to allow testing the complete onboarding experience.
 *
 * Features:
 * - Displays "camera coming soon" message
 * - Provides button to simulate photo capture
 * - Fires appropriate analytics when shown
 * - Returns to onboarding with mock image data
 *
 * TODO: Replace with real camera component from Feature #3.
 * Expected integration:
 * ```typescript
 * import { CameraCapture } from '../../wardrobe/components/CameraCapture';
 * ```
 *
 * @param props - Component props
 * @returns Camera placeholder component
 */

export interface CameraPlaceholderProps {
  /** Callback when photo is captured (placeholder returns mock data) */
  onCapture: (image: { uri: string }) => void;
  /** Callback when user cancels */
  onCancel: () => void;
}

export function CameraPlaceholder({
  onCapture,
  onCancel,
}: CameraPlaceholderProps): React.JSX.Element {
  const { colors, spacing } = useTheme();

  const handleCapture = () => {
    // Return mock image data
    // Real implementation will return actual captured photo
    onCapture({
      uri: 'placeholder://mock-image.jpg',
    });
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing.lg,
        },
        title: {
          fontSize: 24,
          fontWeight: 'bold',
          color: colors.textPrimary,
          textAlign: 'center',
          marginBottom: spacing.md,
        },
        subtitle: {
          fontSize: 16,
          color: colors.textSecondary,
          textAlign: 'center',
          marginBottom: spacing.xl,
          lineHeight: 24,
        },
        guidance: {
          fontSize: 14,
          color: colors.textSecondary,
          textAlign: 'center',
          marginBottom: spacing.xl,
          fontStyle: 'italic',
        },
        buttonContainer: {
          width: '100%',
          gap: spacing.md,
        },
      }),
    [colors, spacing]
  );

  return (
    <View
      style={styles.container}
      accessibilityLabel={t('screens.onboarding.firstItem.accessibility.cameraPlaceholder')}
    >
      <Text
        style={styles.title}
        accessibilityRole="header"
        allowFontScaling={true}
        maxFontSizeMultiplier={3}
      >
        {t('screens.onboarding.firstItem.camera.placeholder')}
      </Text>

      <Text style={styles.subtitle} allowFontScaling={true} maxFontSizeMultiplier={3}>
        {t('screens.onboarding.firstItem.camera.placeholderHint')}
      </Text>

      <Text style={styles.guidance} allowFontScaling={true} maxFontSizeMultiplier={3}>
        {t('screens.onboarding.firstItem.guidance')}
      </Text>

      <View style={styles.buttonContainer}>
        <Button
          onPress={handleCapture}
          variant="primary"
          accessibilityLabel={t('screens.onboarding.firstItem.accessibility.usePlaceholderButton')}
          accessibilityHint="Simulates capturing a photo and proceeds with placeholder image data"
        >
          {t('screens.onboarding.firstItem.camera.captureButton')}
        </Button>

        <Button
          onPress={onCancel}
          variant="text"
          accessibilityLabel={t('screens.onboarding.firstItem.accessibility.doThisLaterButton')}
          accessibilityHint="Returns to onboarding step without capturing"
        >
          {t('screens.onboarding.firstItem.permissions.doThisLater')}
        </Button>
      </View>
    </View>
  );
}
