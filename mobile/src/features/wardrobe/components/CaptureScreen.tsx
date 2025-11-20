/**
 * Capture screen component for the wardrobe item capture flow.
 *
 * This screen presents the initial choice between taking a photo with the
 * camera or selecting from the gallery. It handles origin-based navigation,
 * permission management, and proper back handling.
 *
 * Implementation status:
 * - Step 2: Navigation shell, origin param handling, back navigation ✓
 * - Step 3: Permissions handling ✓
 * - Step 4: Camera integration ✓
 * - Step 5: Gallery integration and image validation (future)
 *
 * @module features/wardrobe/components/CaptureScreen
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Button } from '../../../core/components/Button';
import { isCaptureOrigin, CaptureOrigin } from '../../../core/types/capture';
import { trackCaptureEvent } from '../../../core/telemetry';
import { useStore } from '../../../core/state/store';
import { useCapturePermissions } from '../hooks/useCapturePermissions';

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

  // Permissions hook
  const permissions = useCapturePermissions(origin);

  // Navigation debouncing state
  const [isNavigating, setIsNavigating] = useState(false);

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
   * Handles camera button press with permission checks.
   *
   * Checks camera availability and permission status, shows appropriate dialogs,
   * and requests permission if needed.
   */
  const handleTakePhoto = async () => {
    if (isNavigating || permissions.isLoading) {
      return;
    }

    // Check if camera is available on device
    if (!permissions.camera.isAvailable) {
      Alert.alert(
        t('screens.capture.permissions.camera.unavailableTitle'),
        t('screens.capture.permissions.camera.unavailableMessage'),
        [
          {
            text: t('screens.capture.permissions.actions.useGallery'),
            onPress: () => handleChooseGallery(),
          },
          {
            text: t('screens.capture.permissions.actions.cancel'),
            style: 'cancel',
          },
        ]
      );
      return;
    }

    // Handle based on permission status
    if (permissions.camera.status === 'granted') {
      // Permission already granted - proceed to camera
      setIsNavigating(true);
      trackCaptureEvent('capture_source_selected', {
        userId: user?.id,
        origin: origin || undefined,
        source: 'camera',
      });

      // Navigate to camera screen
      router.push(`/capture/camera?origin=${origin || 'wardrobe'}`);
      setTimeout(() => setIsNavigating(false), 500);
    } else if (permissions.camera.status === 'blocked') {
      // Permission permanently denied - show settings dialog
      Alert.alert(
        t('screens.capture.permissions.camera.blockedTitle'),
        t('screens.capture.permissions.camera.blockedMessage'),
        [
          {
            text: t('screens.capture.permissions.actions.openSettings'),
            onPress: async () => {
              await permissions.camera.openSettings();
            },
          },
          {
            text: t('screens.capture.permissions.actions.useGallery'),
            onPress: () => handleChooseGallery(),
          },
          {
            text: t('screens.capture.permissions.actions.cancel'),
            style: 'cancel',
          },
        ]
      );
    } else if (
      permissions.camera.status === 'denied' ||
      permissions.camera.status === 'undetermined'
    ) {
      // Permission not yet requested or denied once - show explanation and request
      Alert.alert(
        t('screens.capture.permissions.camera.deniedTitle'),
        t('screens.capture.permissions.camera.deniedMessage'),
        [
          {
            text: t('screens.capture.permissions.actions.allowAccess'),
            onPress: async () => {
              await permissions.camera.request();
              // After request, if granted, re-trigger camera flow
              if (permissions.camera.status === 'granted') {
                handleTakePhoto();
              }
            },
          },
          {
            text: t('screens.capture.permissions.actions.cancel'),
            style: 'cancel',
          },
        ]
      );
    }
  };

  /**
   * Handles gallery button press with permission checks.
   *
   * Checks gallery permission status, shows appropriate dialogs,
   * and requests permission if needed.
   */
  const handleChooseGallery = async () => {
    if (isNavigating || permissions.isLoading) {
      return;
    }

    // Handle based on permission status
    if (permissions.gallery.status === 'granted') {
      // Permission already granted - proceed to gallery
      setIsNavigating(true);
      trackCaptureEvent('capture_source_selected', {
        userId: user?.id,
        origin: origin || undefined,
        source: 'gallery',
      });

      // Placeholder for Step 5 - actual gallery integration
      Alert.alert('Gallery', 'Gallery integration will be implemented in Step 5.', [
        {
          text: 'OK',
          onPress: () => setIsNavigating(false),
        },
      ]);
    } else if (permissions.gallery.status === 'blocked') {
      // Permission permanently denied - show settings dialog
      Alert.alert(
        t('screens.capture.permissions.gallery.blockedTitle'),
        t('screens.capture.permissions.gallery.blockedMessage'),
        [
          {
            text: t('screens.capture.permissions.actions.openSettings'),
            onPress: async () => {
              await permissions.gallery.openSettings();
            },
          },
          {
            text: t('screens.capture.permissions.actions.useCamera'),
            onPress: () => handleTakePhoto(),
            style: 'default',
          },
          {
            text: t('screens.capture.permissions.actions.cancel'),
            style: 'cancel',
          },
        ]
      );
    } else if (
      permissions.gallery.status === 'denied' ||
      permissions.gallery.status === 'undetermined'
    ) {
      // Permission not yet requested or denied once - show explanation and request
      Alert.alert(
        t('screens.capture.permissions.gallery.deniedTitle'),
        t('screens.capture.permissions.gallery.deniedMessage'),
        [
          {
            text: t('screens.capture.permissions.actions.allowAccess'),
            onPress: async () => {
              await permissions.gallery.request();
              // After request, if granted, re-trigger gallery flow
              if (permissions.gallery.status === 'granted') {
                handleChooseGallery();
              }
            },
          },
          {
            text: t('screens.capture.permissions.actions.cancel'),
            style: 'cancel',
          },
        ]
      );
    }
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
            disabled={!permissions.camera.isAvailable || permissions.isLoading || isNavigating}
            accessibilityLabel={t('screens.capture.accessibility.takePhotoButton')}
            accessibilityHint={t('screens.capture.accessibility.takePhotoHint')}
          >
            {`📷 ${t('screens.capture.takePhoto')}`}
          </Button>
          <Button
            onPress={handleChooseGallery}
            variant="secondary"
            disabled={permissions.isLoading || isNavigating}
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
