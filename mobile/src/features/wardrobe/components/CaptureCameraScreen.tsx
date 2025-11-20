/**
 * Camera capture screen component for the wardrobe item capture flow.
 *
 * This screen provides a live camera preview with controls for capturing photos.
 * It handles camera initialization, flash controls, error states, and passes
 * captured images to the crop screen via Zustand store.
 *
 * Implementation features:
 * - Live camera preview with expo-camera CameraView
 * - Shutter button with debouncing to prevent double-capture
 * - Flash/torch control (hidden if device doesn't support)
 * - Framing guide and guidance text overlay
 * - Error handling with retry and fallback options
 * - Origin-based cancel navigation
 * - Processing state during capture
 *
 * @module features/wardrobe/components/CaptureCameraScreen
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CameraView, CameraType, FlashMode } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { isCaptureOrigin, CaptureOrigin, CaptureSource } from '../../../core/types/capture';
import { trackCaptureEvent } from '../../../core/telemetry';
import { useStore } from '../../../core/state/store';

/**
 * Camera capture screen - live preview and photo capture.
 *
 * Accepts origin param from navigation to determine back behavior.
 * Assumes camera permission is already granted (enforced by parent screen).
 *
 * @returns Camera capture screen component
 */
export function CaptureCameraScreen(): React.JSX.Element {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ origin?: string }>();
  const user = useStore((state) => state.user);
  const captureOrigin = useStore((state) => state.origin);
  const captureSource = useStore((state) => state.source);
  const setPayload = useStore((state) => state.setPayload);
  const errorMessage = useStore((state) => state.errorMessage);
  const setErrorMessage = useStore((state) => state.setErrorMessage);
  const setIsNavigating = useStore((state) => state.setIsNavigating);

  // Refs
  const cameraRef = useRef<CameraView>(null);

  // Validate and extract origin param (fallback to store origin)
  const origin: CaptureOrigin | null = isCaptureOrigin(params.origin)
    ? params.origin
    : captureOrigin;

  // State
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [flashMode, setFlashMode] = useState<FlashMode>('off');
  const [facing] = useState<CameraType>('back');

  // Derived state
  const hasError = errorMessage !== null;

  // Track camera opened
  useEffect(() => {
    trackCaptureEvent('camera_opened', {
      userId: user?.id,
      origin: origin || undefined,
    });
  }, [origin, user?.id]);

  /**
   * Handles cancel/back navigation based on origin.
   */
  const handleCancel = () => {
    trackCaptureEvent('capture_cancelled', {
      userId: user?.id,
      origin: origin || undefined,
      source: 'camera',
    });

    if (origin === 'wardrobe') {
      router.push('/wardrobe');
    } else if (origin === 'onboarding') {
      router.push('/onboarding/first-item');
    } else {
      router.push('/capture');
    }
  };

  /**
   * Handles camera initialization ready state.
   */
  const handleCameraReady = () => {
    setIsCameraReady(true);
    setErrorMessage(null);
  };

  /**
   * Handles camera mounting errors.
   */
  const handleCameraError = () => {
    setErrorMessage(t('screens.captureCamera.errors.initFailed'));
    trackCaptureEvent('camera_error', {
      userId: user?.id,
      origin: origin || undefined,
      errorCode: 'camera_init_failed',
    });
  };

  /**
   * Toggles flash mode between off, on, and auto.
   */
  const handleFlashToggle = () => {
    setFlashMode((current) => {
      if (current === 'off') return 'on';
      if (current === 'on') return 'auto';
      return 'off';
    });
  };

  /**
   * Handles shutter button press to capture photo.
   */
  const handleCapture = async () => {
    if (isCapturing || !isCameraReady || hasError) {
      return;
    }

    setIsCapturing(true);
    setIsNavigating(true);

    try {
      if (!cameraRef.current) {
        throw new Error('Camera ref not available');
      }

      // Capture photo
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: false,
      });

      if (!photo || !photo.uri) {
        throw new Error('No photo URI returned');
      }

      // Create payload using stored origin and source (fallback to params/defaults)
      const payload = {
        uri: photo.uri,
        origin: origin || 'wardrobe',
        source: (captureSource || 'camera') as CaptureSource,
        createdAt: new Date().toISOString(),
      };

      // Store in Zustand
      setPayload(payload);

      // Track success
      trackCaptureEvent('capture_handoff_to_crop', {
        userId: user?.id,
        origin: origin || undefined,
        source: 'camera',
      });

      // Navigate to crop
      router.push('/crop');

      // Clear navigation flag after a delay
      setTimeout(() => setIsNavigating(false), 500);
    } catch {
      // Handle capture error
      setIsCapturing(false);
      setIsNavigating(false);
      setErrorMessage(t('screens.captureCamera.errors.captureFailed'));
      trackCaptureEvent('camera_error', {
        userId: user?.id,
        origin: origin || undefined,
        errorCode: 'capture_failed',
      });
    }
  };

  /**
   * Handles retry after error.
   */
  const handleRetry = () => {
    setErrorMessage(null);
    setIsCameraReady(false);
  };

  /**
   * Handles switch to gallery fallback.
   */
  const handleSwitchToGallery = () => {
    trackCaptureEvent('capture_cancelled', {
      userId: user?.id,
      origin: origin || undefined,
      source: 'camera',
    });

    router.push(`/capture?origin=${origin || 'wardrobe'}`);
  };

  /**
   * Gets flash mode display text.
   */
  const getFlashModeText = () => {
    if (flashMode === 'off') return t('screens.captureCamera.flashOff');
    if (flashMode === 'on') return t('screens.captureCamera.flashOn');
    return t('screens.captureCamera.flashAuto');
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: '#000',
        },
        camera: {
          flex: 1,
        },
        controlsContainer: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          justifyContent: 'space-between',
        },
        topControls: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingTop: Platform.OS === 'ios' ? 60 : 40,
          paddingHorizontal: spacing.md,
        },
        controlButton: {
          minWidth: 44,
          minHeight: 44,
          padding: spacing.sm,
          borderRadius: 22,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          justifyContent: 'center',
          alignItems: 'center',
        },
        controlButtonText: {
          color: '#fff',
          fontSize: 14,
          fontWeight: '600',
        },
        framingGuide: {
          position: 'absolute',
          top: '25%',
          left: '10%',
          right: '10%',
          height: '40%',
          borderWidth: 2,
          borderColor: 'rgba(255, 255, 255, 0.5)',
          borderRadius: 8,
        },
        guidanceContainer: {
          position: 'absolute',
          bottom: 180,
          left: 0,
          right: 0,
          alignItems: 'center',
        },
        guidanceText: {
          color: '#fff',
          fontSize: 16,
          fontWeight: '500',
          textAlign: 'center',
          textShadowColor: 'rgba(0, 0, 0, 0.75)',
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 3,
        },
        bottomControls: {
          paddingBottom: Platform.OS === 'ios' ? 40 : 20,
          paddingHorizontal: spacing.md,
          alignItems: 'center',
        },
        shutterButton: {
          width: 70,
          height: 70,
          borderRadius: 35,
          backgroundColor: '#fff',
          justifyContent: 'center',
          alignItems: 'center',
          borderWidth: 4,
          borderColor: 'rgba(255, 255, 255, 0.3)',
        },
        shutterButtonDisabled: {
          opacity: 0.5,
        },
        shutterButtonInner: {
          width: 60,
          height: 60,
          borderRadius: 30,
          backgroundColor: '#fff',
        },
        errorOverlay: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: spacing.lg,
        },
        errorText: {
          color: '#fff',
          fontSize: 18,
          fontWeight: '600',
          textAlign: 'center',
          marginBottom: spacing.xl,
        },
        errorButtons: {
          gap: spacing.md,
          width: '100%',
          maxWidth: 300,
        },
        errorButton: {
          backgroundColor: colors.textPrimary,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          borderRadius: 8,
          alignItems: 'center',
          minHeight: 44,
        },
        errorButtonSecondary: {
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderColor: colors.textPrimary,
        },
        errorButtonText: {
          color: colors.background,
          fontSize: 16,
          fontWeight: '600',
        },
        errorButtonTextSecondary: {
          color: colors.textPrimary,
        },
        processingOverlay: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          justifyContent: 'center',
          alignItems: 'center',
        },
        processingText: {
          color: '#fff',
          fontSize: 18,
          fontWeight: '600',
          marginTop: spacing.md,
        },
      }),
    [colors, spacing]
  );

  // Render error overlay
  if (hasError) {
    return (
      <View
        style={styles.errorOverlay}
        accessibilityLabel={t('screens.captureCamera.accessibility.errorOverlay')}
        accessibilityHint={t('screens.captureCamera.accessibility.errorHint')}
      >
        <Text style={styles.errorText}>{errorMessage}</Text>
        <View style={styles.errorButtons}>
          <Pressable
            style={styles.errorButton}
            onPress={handleRetry}
            accessibilityLabel={t('screens.captureCamera.errors.retry')}
            accessibilityRole="button"
          >
            <Text style={styles.errorButtonText}>{t('screens.captureCamera.errors.retry')}</Text>
          </Pressable>
          <Pressable
            style={[styles.errorButton, styles.errorButtonSecondary]}
            onPress={handleSwitchToGallery}
            accessibilityLabel={t('screens.captureCamera.errors.switchToGallery')}
            accessibilityRole="button"
          >
            <Text style={[styles.errorButtonText, styles.errorButtonTextSecondary]}>
              {t('screens.captureCamera.errors.switchToGallery')}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.errorButton, styles.errorButtonSecondary]}
            onPress={handleCancel}
            accessibilityLabel={t('screens.captureCamera.cancel')}
            accessibilityRole="button"
          >
            <Text style={[styles.errorButtonText, styles.errorButtonTextSecondary]}>
              {t('screens.captureCamera.cancel')}
            </Text>
          </Pressable>
        </View>
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <View
      style={styles.container}
      accessibilityLabel={t('screens.captureCamera.accessibility.screenLabel')}
      accessibilityHint={t('screens.captureCamera.accessibility.screenHint')}
    >
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        flash={flashMode}
        onCameraReady={handleCameraReady}
        onMountError={handleCameraError}
      />

      <View style={styles.controlsContainer}>
        {/* Top controls */}
        <View style={styles.topControls}>
          <Pressable
            style={styles.controlButton}
            onPress={handleCancel}
            accessibilityLabel={t('screens.captureCamera.accessibility.cancelButton')}
            accessibilityHint={t('screens.captureCamera.accessibility.cancelHint')}
            accessibilityRole="button"
          >
            <Text style={styles.controlButtonText}>{t('screens.captureCamera.cancel')}</Text>
          </Pressable>

          <Pressable
            style={styles.controlButton}
            onPress={handleFlashToggle}
            accessibilityLabel={t('screens.captureCamera.accessibility.flashToggle')}
            accessibilityHint={t('screens.captureCamera.accessibility.flashHint')}
            accessibilityRole="button"
          >
            <Text style={styles.controlButtonText}>{getFlashModeText()}</Text>
          </Pressable>
        </View>

        {/* Framing guide */}
        <View style={styles.framingGuide} pointerEvents="none" />

        {/* Guidance text */}
        <View style={styles.guidanceContainer} pointerEvents="none">
          <Text style={styles.guidanceText}>{t('screens.captureCamera.guidance')}</Text>
        </View>

        {/* Bottom controls */}
        <View style={styles.bottomControls}>
          <Pressable
            style={[styles.shutterButton, !isCameraReady && styles.shutterButtonDisabled]}
            onPress={handleCapture}
            disabled={!isCameraReady || isCapturing}
            accessibilityLabel={t('screens.captureCamera.accessibility.shutterButton')}
            accessibilityHint={t('screens.captureCamera.accessibility.shutterHint')}
            accessibilityRole="button"
          >
            <View style={styles.shutterButtonInner} />
          </Pressable>
        </View>
      </View>

      {/* Processing overlay */}
      {isCapturing && (
        <View style={styles.processingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.processingText}>{t('screens.captureCamera.processing')}</Text>
        </View>
      )}

      <StatusBar style="light" />
    </View>
  );
}
