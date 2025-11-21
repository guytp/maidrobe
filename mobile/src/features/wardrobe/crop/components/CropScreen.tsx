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
 * - Step 2: Visual layout (frame, grid, mask) ✓
 * - Step 3: Gesture handling (pinch, pan, zoom) ✓
 * - Step 4: Image processing (crop, resize, compress) ✓
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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  PanResponder,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { t } from '../../../../core/i18n';
import { useTheme } from '../../../../core/theme';
import { Button } from '../../../../core/components/Button';
import { useStore } from '../../../../core/state/store';
import { isCaptureImagePayload } from '../../../../core/types/capture';
import { trackCaptureEvent } from '../../../../core/telemetry';
import { computeCropRectangle, cropAndProcessImage } from '../utils/imageProcessing';

/**
 * Icon constants for crop screen.
 *
 * Using emoji for temporary placeholder - will be replaced with proper
 * icon components in future iterations for better cross-platform consistency.
 */
const ICON_ERROR = '⚠️';

/**
 * Crop frame aspect ratio (width / height).
 * Fixed at 4:5 portrait ratio for consistent wardrobe item framing.
 */
const CROP_ASPECT_RATIO = 4 / 5; // 0.8

/**
 * Padding around the crop frame to ensure it sits within safe bounds.
 */
const FRAME_PADDING_HORIZONTAL = 24; // spacing.lg
const FRAME_PADDING_VERTICAL = 32; // spacing.xl

/**
 * Height reserved for control buttons at the bottom of the screen.
 * Includes button height, padding, and margins.
 */
const CONTROLS_HEIGHT = 100;

/**
 * Mask overlay opacity for dimming areas outside the crop frame.
 * Adjusted for light and dark modes to maintain visibility.
 */
const MASK_OPACITY_LIGHT = 0.5;
const MASK_OPACITY_DARK = 0.7;

/**
 * Grid overlay opacity for the rule-of-thirds composition guide.
 */
const GRID_OPACITY = 0.5;

/**
 * Grid line thickness in pixels.
 */
const GRID_LINE_WIDTH = 1;

/**
 * Maximum zoom scale factor.
 * Allows users to zoom in for detail while preventing excessive zoom.
 */
const MAX_SCALE = 4.0;

/**
 * Calculates optimal crop frame dimensions that fit within available space
 * while maintaining the 4:5 aspect ratio.
 *
 * @param screenWidth - Screen width in pixels
 * @param screenHeight - Screen height in pixels
 * @param topInset - Safe area top inset
 * @param bottomInset - Safe area bottom inset
 * @returns Object containing frame width, height, and position
 */
function calculateFrameDimensions(
  screenWidth: number,
  screenHeight: number,
  topInset: number,
  bottomInset: number
): { width: number; height: number; top: number; left: number } {
  // Calculate available space
  const availableWidth = screenWidth - FRAME_PADDING_HORIZONTAL * 2;
  const availableHeight =
    screenHeight - topInset - bottomInset - CONTROLS_HEIGHT - FRAME_PADDING_VERTICAL * 2;

  // Calculate frame dimensions maintaining 4:5 aspect ratio
  // Try width-constrained first
  let frameWidth = availableWidth;
  let frameHeight = frameWidth / CROP_ASPECT_RATIO;

  // If height exceeds available space, constrain by height instead
  if (frameHeight > availableHeight) {
    frameHeight = availableHeight;
    frameWidth = frameHeight * CROP_ASPECT_RATIO;
  }

  // Calculate centered position
  const left = (screenWidth - frameWidth) / 2;
  const contentHeight = screenHeight - topInset - bottomInset - CONTROLS_HEIGHT;
  const top = topInset + (contentHeight - frameHeight) / 2;

  return { width: frameWidth, height: frameHeight, top, left };
}

/**
 * Calculates the minimum scale factor needed to ensure the image fully covers the crop frame.
 *
 * @param imageWidth - Original image width in pixels
 * @param imageHeight - Original image height in pixels
 * @param frameWidth - Crop frame width in pixels
 * @param frameHeight - Crop frame height in pixels
 * @returns Minimum scale factor
 */
function calculateMinScale(
  imageWidth: number,
  imageHeight: number,
  frameWidth: number,
  frameHeight: number
): number {
  const scaleToFillWidth = frameWidth / imageWidth;
  const scaleToFillHeight = frameHeight / imageHeight;
  return Math.max(scaleToFillWidth, scaleToFillHeight);
}

/**
 * Calculates the distance between two touch points.
 *
 * @param touch1 - First touch point
 * @param touch2 - Second touch point
 * @returns Distance in pixels
 */
function getDistance(
  touch1: { pageX: number; pageY: number },
  touch2: { pageX: number; pageY: number }
): number {
  const dx = touch1.pageX - touch2.pageX;
  const dy = touch1.pageY - touch2.pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculates the midpoint between two touch points.
 *
 * @param touch1 - First touch point
 * @param touch2 - Second touch point
 * @returns Midpoint coordinates
 */
function getMidpoint(
  touch1: { pageX: number; pageY: number },
  touch2: { pageX: number; pageY: number }
): { x: number; y: number } {
  return {
    x: (touch1.pageX + touch2.pageX) / 2,
    y: (touch1.pageY + touch2.pageY) / 2,
  };
}

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
  const setPayload = useStore((state) => state.setPayload);
  const clearPayload = useStore((state) => state.clearPayload);
  const user = useStore((state) => state.user);

  // Get screen dimensions and safe area insets
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);

  // Validate payload on mount
  const isValid = isCaptureImagePayload(payload);

  // Calculate crop frame dimensions
  const frameDimensions = useMemo(
    () => calculateFrameDimensions(screenWidth, screenHeight, insets.top, insets.bottom),
    [screenWidth, screenHeight, insets.top, insets.bottom]
  );

  // Animated values for image transform
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  // Current transform values (track separately to avoid accessing private _value)
  const currentTransform = useRef({
    scale: 1,
    translateX: 0,
    translateY: 0,
  });

  // Gesture state refs
  const gestureState = useRef({
    initialScale: 1,
    initialTranslateX: 0,
    initialTranslateY: 0,
    initialDistance: 0,
    initialMidpoint: { x: 0, y: 0 },
  });

  /**
   * Calculates pan bounds for the current scale to prevent empty space in frame.
   *
   * @param currentScale - Current scale factor
   * @returns Pan bounds (minX, maxX, minY, maxY)
   */
  const calculatePanBounds = useCallback(
    (currentScale: number) => {
      if (!payload || !isValid) {
        return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
      }

      const scaledWidth = payload.width * currentScale;
      const scaledHeight = payload.height * currentScale;

      return {
        minX: frameDimensions.left + frameDimensions.width - scaledWidth,
        maxX: frameDimensions.left,
        minY: frameDimensions.top + frameDimensions.height - scaledHeight,
        maxY: frameDimensions.top,
      };
    },
    [payload, isValid, frameDimensions]
  );

  /**
   * Initialize transform values when frame dimensions or payload changes.
   */
  useEffect(() => {
    if (!payload || !isValid) return;

    // Calculate minimum scale to fill frame
    const minScale = calculateMinScale(
      payload.width,
      payload.height,
      frameDimensions.width,
      frameDimensions.height
    );

    // Set initial scale
    scale.setValue(minScale);
    currentTransform.current.scale = minScale;
    gestureState.current.initialScale = minScale;

    // Center image in frame
    const scaledWidth = payload.width * minScale;
    const scaledHeight = payload.height * minScale;
    const centerX = frameDimensions.left + (frameDimensions.width - scaledWidth) / 2;
    const centerY = frameDimensions.top + (frameDimensions.height - scaledHeight) / 2;

    translateX.setValue(centerX);
    translateY.setValue(centerY);
    currentTransform.current.translateX = centerX;
    currentTransform.current.translateY = centerY;
    gestureState.current.initialTranslateX = centerX;
    gestureState.current.initialTranslateY = centerY;
  }, [payload, isValid, frameDimensions, scale, translateX, translateY]);

  /**
   * PanResponder for handling pinch-to-zoom and pan gestures.
   */
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;

        // Store initial values from current transform
        gestureState.current.initialScale = currentTransform.current.scale;
        gestureState.current.initialTranslateX = currentTransform.current.translateX;
        gestureState.current.initialTranslateY = currentTransform.current.translateY;

        // If pinch gesture (2+ fingers), store initial distance and midpoint
        if (touches.length >= 2) {
          gestureState.current.initialDistance = getDistance(touches[0], touches[1]);
          gestureState.current.initialMidpoint = getMidpoint(touches[0], touches[1]);
        }
      },

      onPanResponderMove: (evt, gestState) => {
        if (!payload || !isValid) return;

        const touches = evt.nativeEvent.touches;
        let newScale = gestureState.current.initialScale;
        let newTranslateX = gestureState.current.initialTranslateX + gestState.dx;
        let newTranslateY = gestureState.current.initialTranslateY + gestState.dy;

        // Handle pinch-to-zoom (2+ fingers)
        if (touches.length >= 2) {
          const currentDistance = getDistance(touches[0], touches[1]);
          const scaleChange = currentDistance / gestureState.current.initialDistance;
          newScale = gestureState.current.initialScale * scaleChange;

          // Adjust translation to zoom toward pinch center
          const currentMidpoint = getMidpoint(touches[0], touches[1]);
          const midpointDeltaX = currentMidpoint.x - gestureState.current.initialMidpoint.x;
          const midpointDeltaY = currentMidpoint.y - gestureState.current.initialMidpoint.y;
          newTranslateX += midpointDeltaX;
          newTranslateY += midpointDeltaY;
        }

        // Apply scale constraints
        const minScale = calculateMinScale(
          payload.width,
          payload.height,
          frameDimensions.width,
          frameDimensions.height
        );
        const clampedScale = Math.max(minScale, Math.min(MAX_SCALE, newScale));

        // Apply pan constraints
        const bounds = calculatePanBounds(clampedScale);
        const clampedX = Math.max(bounds.minX, Math.min(bounds.maxX, newTranslateX));
        const clampedY = Math.max(bounds.minY, Math.min(bounds.maxY, newTranslateY));

        // Update animated values and tracking refs
        scale.setValue(clampedScale);
        translateX.setValue(clampedX);
        translateY.setValue(clampedY);
        currentTransform.current.scale = clampedScale;
        currentTransform.current.translateX = clampedX;
        currentTransform.current.translateY = clampedY;
      },

      onPanResponderRelease: () => {
        // Gesture ended - values are already stored in currentTransform
        // Store final values for next gesture
        gestureState.current.initialScale = currentTransform.current.scale;
        gestureState.current.initialTranslateX = currentTransform.current.translateX;
        gestureState.current.initialTranslateY = currentTransform.current.translateY;
      },
    })
  ).current;

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
   * Disabled during image processing.
   */
  const handleBackRetake = useCallback(() => {
    // Block navigation during processing
    if (isProcessing) return;

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
  }, [payload, user, clearPayload, router, isProcessing]);

  /**
   * Handles Confirm/Next action with async image processing pipeline.
   *
   * Processes the cropped image through:
   * 1. Compute crop rectangle from transform state
   * 2. Apply crop, resize, and compress
   * 3. Update payload with processed image
   * 4. Navigate to item creation
   *
   * Buttons are disabled during processing to prevent duplicate operations.
   * Shows error UI if processing fails.
   */
  const handleConfirm = useCallback(async () => {
    // Guard: prevent processing if already running or invalid payload
    if (isProcessing || !payload || !isValid) return;

    try {
      setIsProcessing(true);
      setProcessingError(null);

      // Track processing start
      trackCaptureEvent('crop_processing_started', {
        userId: user?.id,
        origin: payload.origin,
        source: payload.source,
      });

      if (__DEV__) {
        console.log('[CropScreen] Processing started');
        console.log('[CropScreen] Payload:', payload);
        console.log('[CropScreen] Transform:', currentTransform.current);
      }

      // Step 1: Compute crop rectangle from transform state
      const cropRect = computeCropRectangle(
        payload.width,
        payload.height,
        currentTransform.current.scale,
        currentTransform.current.translateX,
        currentTransform.current.translateY,
        frameDimensions
      );

      if (__DEV__) {
        console.log('[CropScreen] Crop rectangle:', cropRect);
      }

      // Step 2: Process image (crop, resize, compress)
      const result = await cropAndProcessImage(payload.uri, cropRect, payload.source);

      if (__DEV__) {
        console.log('[CropScreen] Processing completed:', result);
      }

      // Step 3: Update payload with processed image
      setPayload({
        uri: result.uri,
        width: result.width,
        height: result.height,
        origin: payload.origin,
        source: result.source,
        createdAt: new Date().toISOString(),
      });

      // Step 4: Track success
      trackCaptureEvent('crop_processing_completed', {
        userId: user?.id,
        origin: payload.origin,
        source: payload.source,
        width: result.width,
        height: result.height,
      });

      // Step 5: Navigate to item creation based on origin
      if (payload.origin === 'wardrobe') {
        // TODO: Update to actual wardrobe item creation route when available
        router.push('/onboarding/first-item');
      } else if (payload.origin === 'onboarding') {
        router.push('/onboarding/first-item');
      } else {
        // Fallback
        router.push('/onboarding/first-item');
      }
    } catch (error) {
      console.error('[CropScreen] Processing failed:', error);

      // Track error
      trackCaptureEvent('crop_processing_failed', {
        userId: user?.id,
        origin: payload?.origin,
        source: payload?.source,
        errorMessage: error instanceof Error ? error.message : 'unknown',
      });

      // Show error to user
      setProcessingError(t('processing_failed'));
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, payload, isValid, user, currentTransform, frameDimensions, setPayload, router]);

  /**
   * Android hardware back button handler.
   *
   * Intercepts hardware back press and delegates to Back/Retake behavior.
   * Blocked during image processing to prevent navigation mid-operation.
   * Returns true to prevent default back navigation.
   */
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isProcessing) {
        return true; // Block back during processing
      }
      handleBackRetake();
      return true; // Prevent default back behavior
    });

    // Clean up listener on unmount
    return () => backHandler.remove();
  }, [handleBackRetake, isProcessing]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        errorContent: {
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
        imageContainer: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        },
        image: {
          position: 'absolute',
          top: 0,
          left: 0,
        },
        maskOverlay: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        },
        maskTop: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          backgroundColor:
            'rgba(0, 0, 0, ' +
            (colorScheme === 'dark' ? MASK_OPACITY_DARK : MASK_OPACITY_LIGHT) +
            ')',
        },
        maskBottom: {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor:
            'rgba(0, 0, 0, ' +
            (colorScheme === 'dark' ? MASK_OPACITY_DARK : MASK_OPACITY_LIGHT) +
            ')',
        },
        maskLeft: {
          position: 'absolute',
          left: 0,
          backgroundColor:
            'rgba(0, 0, 0, ' +
            (colorScheme === 'dark' ? MASK_OPACITY_DARK : MASK_OPACITY_LIGHT) +
            ')',
        },
        maskRight: {
          position: 'absolute',
          right: 0,
          backgroundColor:
            'rgba(0, 0, 0, ' +
            (colorScheme === 'dark' ? MASK_OPACITY_DARK : MASK_OPACITY_LIGHT) +
            ')',
        },
        cropFrame: {
          position: 'absolute',
          borderWidth: 2,
          borderColor: 'rgba(255, 255, 255, 0.8)',
        },
        gridContainer: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        },
        gridLine: {
          position: 'absolute',
          backgroundColor: `rgba(255, 255, 255, ${GRID_OPACITY})`,
        },
        gridLineVertical: {
          width: GRID_LINE_WIDTH,
          top: 0,
          bottom: 0,
        },
        gridLineHorizontal: {
          height: GRID_LINE_WIDTH,
          left: 0,
          right: 0,
        },
        controlsContainer: {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: insets.bottom,
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          gap: spacing.md,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.lg,
        },
        processingOverlay: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
        },
        processingContent: {
          alignItems: 'center',
          padding: spacing.xl,
        },
        processingText: {
          color: colors.textPrimary,
          fontSize: 16,
          marginTop: spacing.md,
          textAlign: 'center',
        },
        errorOverlay: {
          position: 'absolute',
          left: spacing.md,
          right: spacing.md,
          bottom: insets.bottom + 100,
          backgroundColor: colors.error,
          padding: spacing.md,
          borderRadius: 8,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          zIndex: 999,
        },
        errorOverlayText: {
          flex: 1,
          color: '#FFFFFF',
          fontSize: 14,
        },
        errorRetryButton: {
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.xs,
          backgroundColor: 'rgba(255, 255, 255, 0.2)',
          borderRadius: 4,
        },
        errorRetryButtonText: {
          color: '#FFFFFF',
          fontSize: 14,
          fontWeight: '600',
        },
      }),
    [colors, colorScheme, spacing, insets.bottom]
  );

  // Show error if payload is invalid
  if (!isValid) {
    return (
      <View
        style={styles.container}
        accessibilityLabel={t('screens.crop.accessibility.screenLabel')}
      >
        <View style={styles.errorContent}>
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

  // Render crop interface with image, frame, grid, and mask
  return (
    <View
      style={styles.container}
      accessibilityLabel={t('screens.crop.accessibility.screenLabel')}
      accessibilityHint={t('screens.crop.accessibility.screenHint')}
    >
      {/* Image display with gesture handling */}
      <View style={styles.imageContainer} {...panResponder.panHandlers}>
        <Animated.Image
          source={{ uri: payload.uri }}
          style={[
            styles.image,
            {
              width: payload.width,
              height: payload.height,
              transform: [{ scale }, { translateX }, { translateY }],
            },
          ]}
          accessibilityLabel="Captured wardrobe item image"
        />
      </View>

      {/* Mask overlay - dims area outside crop frame */}
      <View style={styles.maskOverlay} pointerEvents="none">
        {/* Top mask */}
        <View
          style={[
            styles.maskTop,
            {
              height: frameDimensions.top,
            },
          ]}
        />
        {/* Bottom mask */}
        <View
          style={[
            styles.maskBottom,
            {
              top: frameDimensions.top + frameDimensions.height,
            },
          ]}
        />
        {/* Left mask */}
        <View
          style={[
            styles.maskLeft,
            {
              top: frameDimensions.top,
              width: frameDimensions.left,
              height: frameDimensions.height,
            },
          ]}
        />
        {/* Right mask */}
        <View
          style={[
            styles.maskRight,
            {
              top: frameDimensions.top,
              width: screenWidth - frameDimensions.left - frameDimensions.width,
              height: frameDimensions.height,
            },
          ]}
        />
      </View>

      {/* Crop frame with border and grid */}
      <View
        style={[
          styles.cropFrame,
          {
            top: frameDimensions.top,
            left: frameDimensions.left,
            width: frameDimensions.width,
            height: frameDimensions.height,
          },
        ]}
        pointerEvents="none"
        accessibilityLabel="Crop frame - 4 by 5 portrait"
        accessibilityRole="image"
      >
        {/* Grid overlay - 3x3 rule of thirds */}
        <View style={styles.gridContainer}>
          {/* Vertical line 1 (at 33.33%) */}
          <View
            style={[
              styles.gridLine,
              styles.gridLineVertical,
              {
                left: frameDimensions.width * (1 / 3),
              },
            ]}
          />
          {/* Vertical line 2 (at 66.67%) */}
          <View
            style={[
              styles.gridLine,
              styles.gridLineVertical,
              {
                left: frameDimensions.width * (2 / 3),
              },
            ]}
          />
          {/* Horizontal line 1 (at 33.33%) */}
          <View
            style={[
              styles.gridLine,
              styles.gridLineHorizontal,
              {
                top: frameDimensions.height * (1 / 3),
              },
            ]}
          />
          {/* Horizontal line 2 (at 66.67%) */}
          <View
            style={[
              styles.gridLine,
              styles.gridLineHorizontal,
              {
                top: frameDimensions.height * (2 / 3),
              },
            ]}
          />
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controlsContainer}>
        <Button
          onPress={handleBackRetake}
          variant="secondary"
          disabled={isProcessing}
          accessibilityLabel={t('screens.crop.accessibility.retakeButton')}
          accessibilityHint={t('screens.crop.accessibility.retakeHint')}
        >
          {t('screens.crop.retake')}
        </Button>
        <Button
          onPress={handleConfirm}
          variant="primary"
          disabled={isProcessing}
          accessibilityLabel={t('screens.crop.accessibility.confirmButton')}
          accessibilityHint={t('screens.crop.accessibility.confirmHint')}
        >
          {t('screens.crop.confirm')}
        </Button>
      </View>

      {/* Processing overlay */}
      {isProcessing && (
        <View style={styles.processingOverlay}>
          <View style={styles.processingContent}>
            <ActivityIndicator size="large" color={colors.textPrimary} />
            <Text style={styles.processingText}>{t('processing_image')}</Text>
          </View>
        </View>
      )}

      {/* Error overlay */}
      {processingError && !isProcessing && (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorOverlayText}>{processingError}</Text>
          <Text
            style={styles.errorRetryButton}
            onPress={() => {
              setProcessingError(null);
              handleConfirm();
            }}
            accessibilityRole="button"
            accessibilityLabel="Retry processing"
          >
            <Text style={styles.errorRetryButtonText}>{t('retry')}</Text>
          </Text>
        </View>
      )}

      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}
