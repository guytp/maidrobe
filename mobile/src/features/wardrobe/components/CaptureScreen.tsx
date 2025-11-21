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
 * - Step 5: Gallery integration and image validation ✓
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
import { isCaptureOrigin, CaptureOrigin, CaptureImagePayload } from '../../../core/types/capture';
import { trackCaptureEvent } from '../../../core/telemetry';
import { useStore } from '../../../core/state/store';
import { useCapturePermissions } from '../hooks/useCapturePermissions';
import { useGalleryPicker } from '../hooks/useGalleryPicker';
import { getValidationErrorMessage } from '../../../core/utils/imageValidation';

/**
 * Capture screen - initial choice between camera and gallery.
 *
 * Accepts origin param from navigation to determine back behavior.
 * Protected route: requires authenticated user (enforced by route wrapper).
 *
 * @returns Capture screen component with camera/gallery choice
 */
export function CaptureScreen(): React.JSX.Element {
  const { colors, colorScheme, spacing, fontSize } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ origin?: string }>();
  const user = useStore((state) => state.user);
  const setOrigin = useStore((state) => state.setOrigin);
  const setSource = useStore((state) => state.setSource);
  const isNavigating = useStore((state) => state.isNavigating);
  const setIsNavigating = useStore((state) => state.setIsNavigating);
  const setPayload = useStore((state) => state.setPayload);
  const resetCapture = useStore((state) => state.resetCapture);

  // Validate and extract origin param
  const origin: CaptureOrigin | null = isCaptureOrigin(params.origin) ? params.origin : null;

  // Permissions hook
  const permissions = useCapturePermissions(origin);

  // Gallery picker hook
  const galleryPicker = useGalleryPicker(origin);

  // Initialize origin in store and track flow opened
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
      // Set origin in store for access throughout capture flow
      setOrigin(origin);

      // Track successful capture flow opened
      trackCaptureEvent('capture_flow_opened', {
        userId: user?.id,
        origin,
      });
    }

    // Cleanup on unmount - reset capture state
    return () => {
      resetCapture();
    };
  }, [origin, user?.id, router, setOrigin, resetCapture]);

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
      setSource('camera');
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
              const newStatus = await permissions.camera.request();
              // After request, if granted, proceed to camera
              if (newStatus === 'granted') {
                setIsNavigating(true);
                setSource('camera');
                trackCaptureEvent('capture_source_selected', {
                  userId: user?.id,
                  origin: origin || undefined,
                  source: 'camera',
                });

                // Navigate to camera screen
                router.push(`/capture/camera?origin=${origin || 'wardrobe'}`);
                setTimeout(() => setIsNavigating(false), 500);
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
   * and requests permission if needed. Launches gallery picker and
   * handles result with validation and payload construction.
   */
  const handleChooseGallery = async () => {
    if (isNavigating || permissions.isLoading || galleryPicker.isLoading) {
      return;
    }

    // Handle based on permission status
    if (permissions.gallery.status === 'granted') {
      // Permission already granted - proceed to gallery
      setIsNavigating(true);
      setSource('gallery');
      trackCaptureEvent('capture_source_selected', {
        userId: user?.id,
        origin: origin || undefined,
        source: 'gallery',
      });

      // Launch gallery picker
      const result = await galleryPicker.pickImage();

      // Handle picker result
      if (result.success) {
        // Construct payload with validated image
        const payload: CaptureImagePayload = {
          uri: result.uri,
          width: result.width,
          height: result.height,
          origin: origin || 'wardrobe',
          source: 'gallery',
          createdAt: new Date().toISOString(),
        };

        // Store payload and navigate to crop
        setPayload(payload);
        router.push('/crop');

        // Reset navigation state after navigation
        setTimeout(() => setIsNavigating(false), 500);
      } else if (result.reason === 'cancelled') {
        // User cancelled picker - just reset navigation state
        setIsNavigating(false);
      } else if (result.reason === 'invalid') {
        // Image validation failed - show error with retry option
        setIsNavigating(false);
        Alert.alert(
          t('screens.capture.errors.invalidImage'),
          result.error || getValidationErrorMessage('invalid_dimensions'),
          [
            {
              text: t('screens.capture.errors.tryAgain'),
              onPress: () => handleChooseGallery(),
            },
            {
              text: t('screens.capture.errors.cancel'),
              style: 'cancel',
            },
          ]
        );
      } else {
        // Other errors (permission_denied, error)
        setIsNavigating(false);
        Alert.alert(
          t('screens.capture.errors.galleryError'),
          result.error || t('screens.capture.errors.galleryErrorMessage'),
          [
            {
              text: t('screens.capture.errors.tryAgain'),
              onPress: () => handleChooseGallery(),
            },
            {
              text: t('screens.capture.errors.cancel'),
              style: 'cancel',
            },
          ]
        );
      }
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
              const newStatus = await permissions.gallery.request();
              // After request, if granted, launch gallery picker
              if (newStatus === 'granted') {
                setIsNavigating(true);
                setSource('gallery');
                trackCaptureEvent('capture_source_selected', {
                  userId: user?.id,
                  origin: origin || undefined,
                  source: 'gallery',
                });

                // Launch gallery picker
                const result = await galleryPicker.pickImage();

                // Handle picker result
                if (result.success) {
                  // Construct payload with validated image
                  const payload: CaptureImagePayload = {
                    uri: result.uri,
                    width: result.width,
                    height: result.height,
                    origin: origin || 'wardrobe',
                    source: 'gallery',
                    createdAt: new Date().toISOString(),
                  };

                  // Store payload and navigate to crop
                  setPayload(payload);
                  router.push('/crop');

                  // Reset navigation state after navigation
                  setTimeout(() => setIsNavigating(false), 500);
                } else if (result.reason === 'cancelled') {
                  // User cancelled picker - just reset navigation state
                  setIsNavigating(false);
                } else if (result.reason === 'invalid') {
                  // Image validation failed - show error with retry option
                  setIsNavigating(false);
                  Alert.alert(
                    t('screens.capture.errors.invalidImage'),
                    result.error || getValidationErrorMessage('invalid_dimensions'),
                    [
                      {
                        text: t('screens.capture.errors.tryAgain'),
                        onPress: () => handleChooseGallery(),
                      },
                      {
                        text: t('screens.capture.errors.cancel'),
                        style: 'cancel',
                      },
                    ]
                  );
                } else {
                  // Other errors (permission_denied, error)
                  setIsNavigating(false);
                  Alert.alert(
                    t('screens.capture.errors.galleryError'),
                    result.error || t('screens.capture.errors.galleryErrorMessage'),
                    [
                      {
                        text: t('screens.capture.errors.tryAgain'),
                        onPress: () => handleChooseGallery(),
                      },
                      {
                        text: t('screens.capture.errors.cancel'),
                        style: 'cancel',
                      },
                    ]
                  );
                }
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
          fontSize: fontSize['3xl'],
          fontWeight: '700',
          color: colors.textPrimary,
          marginBottom: spacing.sm,
          textAlign: 'center',
        },
        guidance: {
          fontSize: fontSize.base,
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
    [colors, spacing, fontSize]
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
            {t('screens.capture.takePhoto')}
          </Button>
          <Button
            onPress={handleChooseGallery}
            variant="secondary"
            disabled={permissions.isLoading || isNavigating || galleryPicker.isLoading}
            accessibilityLabel={t('screens.capture.accessibility.galleryButton')}
            accessibilityHint={t('screens.capture.accessibility.galleryHint')}
          >
            {t('screens.capture.chooseGallery')}
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
