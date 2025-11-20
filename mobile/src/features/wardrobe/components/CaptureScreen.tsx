/**
 * Capture screen component for the wardrobe item capture flow.
 *
 * This screen presents the initial choice between taking a photo with the
 * camera or selecting from the gallery. It handles origin-based navigation
 * and proper back handling.
 *
 * Implementation status:
 * - Step 2: Navigation shell, origin param handling, back navigation (current)
 * - Step 3: Permissions handling (future)
 * - Step 4: Camera integration (future)
 * - Step 5: Gallery integration and image validation (future)
 *
 * @module features/wardrobe/components/CaptureScreen
 */

import React, { useEffect, useMemo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Button } from '../../../core/components/Button';
import { isCaptureOrigin, CaptureOrigin } from '../../../core/types/capture';
import { trackCaptureEvent } from '../../../core/telemetry';
import { useStore } from '../../../core/state/store';

/**
 * Capture screen - initial choice between camera and gallery.
 *
 * Accepts origin param from navigation to determine back behavior.
 * Protected route: requires authenticated user (enforced by route wrapper).
 *
 * @returns Capture screen component with camera/gallery choice
 */
export function CaptureScreen(): React.JSX.Element {
  const { colors, colorScheme, spacing } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ origin?: string }>();
  const user = useStore((state) => state.user);

  // Validate and extract origin param
  const origin: CaptureOrigin | null = isCaptureOrigin(params.origin) ? params.origin : null;

  // Track invalid origin on mount
  useEffect(() => {
    if (!origin) {
      trackCaptureEvent('capture_flow_opened', {
        userId: user?.id,
        errorCode: 'invalid_origin',
      });

      Alert.alert(
        t('screens.capture.errors.invalidOrigin'),
        '',
        [
          {
            text: 'OK',
            onPress: () => {
              // Navigate back to a safe default (home)
              router.replace('/home');
            },
          },
        ],
        { cancelable: false }
      );
    } else {
      // Track successful capture flow opened
      trackCaptureEvent('capture_flow_opened', {
        userId: user?.id,
        origin,
      });
    }
  }, [origin, user?.id, router]);

  /**
   * Handles cancel/back navigation based on origin.
   *
   * Returns user to the correct parent screen:
   * - origin=wardrobe -> /wardrobe
   * - origin=onboarding -> /onboarding/first-item
   */
  const handleCancel = () => {
    trackCaptureEvent('capture_cancelled', {
      userId: user?.id,
      origin: origin || undefined,
    });

    if (origin === 'wardrobe') {
      router.push('/wardrobe');
    } else if (origin === 'onboarding') {
      router.push('/onboarding/first-item');
    } else {
      // Fallback to home if origin is unknown
      router.push('/home');
    }
  };

  /**
   * Placeholder handler for camera option.
   *
   * Will be implemented in Step 4 with actual camera integration.
   */
  const handleTakePhoto = () => {
    trackCaptureEvent('capture_source_selected', {
      userId: user?.id,
      origin: origin || undefined,
      source: 'camera',
    });

    Alert.alert('Camera', 'Camera integration will be implemented in Step 4.', [{ text: 'OK' }]);
  };

  /**
   * Placeholder handler for gallery option.
   *
   * Will be implemented in Step 5 with actual gallery integration.
   */
  const handleChooseGallery = () => {
    trackCaptureEvent('capture_source_selected', {
      userId: user?.id,
      origin: origin || undefined,
      source: 'gallery',
    });

    Alert.alert('Gallery', 'Gallery integration will be implemented in Step 5.', [{ text: 'OK' }]);
  };

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
        },
        title: {
          fontSize: 28,
          fontWeight: '700',
          color: colors.textPrimary,
          marginBottom: spacing.sm,
          textAlign: 'center',
        },
        guidance: {
          fontSize: 16,
          color: colors.textSecondary,
          marginBottom: spacing.xl,
          textAlign: 'center',
        },
        buttonContainer: {
          gap: spacing.md,
          marginBottom: spacing.xl,
        },
        cancelButton: {
          marginTop: spacing.md,
        },
      }),
    [colors, spacing]
  );

  // Don't render if origin is invalid (alert is shown)
  if (!origin) {
    return <View style={styles.container} />;
  }

  return (
    <View
      style={styles.container}
      accessibilityLabel={t('screens.capture.accessibility.screenLabel')}
      accessibilityHint={t('screens.capture.accessibility.screenHint')}
    >
      <View style={styles.content}>
        <Text
          style={styles.title}
          allowFontScaling={true}
          maxFontSizeMultiplier={2}
          accessibilityRole="header"
        >
          {t('screens.capture.choiceTitle')}
        </Text>
        <Text style={styles.guidance} allowFontScaling={true} maxFontSizeMultiplier={2}>
          {t('screens.capture.guidance')}
        </Text>
        <View style={styles.buttonContainer}>
          <Button
            onPress={handleTakePhoto}
            variant="primary"
            accessibilityLabel={t('screens.capture.accessibility.takePhotoButton')}
            accessibilityHint={t('screens.capture.accessibility.takePhotoHint')}
          >
            {`📷 ${t('screens.capture.takePhoto')}`}
          </Button>
          <Button
            onPress={handleChooseGallery}
            variant="secondary"
            accessibilityLabel={t('screens.capture.accessibility.galleryButton')}
            accessibilityHint={t('screens.capture.accessibility.galleryHint')}
          >
            {`🖼️ ${t('screens.capture.chooseGallery')}`}
          </Button>
        </View>
        <View style={styles.cancelButton}>
          <Button
            onPress={handleCancel}
            variant="text"
            accessibilityLabel={t('screens.capture.accessibility.cancelButton')}
            accessibilityHint={t('screens.capture.accessibility.cancelHint')}
          >
            {t('screens.capture.cancel')}
          </Button>
        </View>
      </View>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}
