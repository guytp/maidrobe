/**
 * Gallery selection hook for capture flow.
 *
 * Encapsulates shared gallery selection logic used by CaptureScreen and
 * CaptureCameraScreen. Handles permission checks, gallery picker launch,
 * result processing, payload construction, and navigation to crop screen.
 *
 * This hook eliminates duplication between the two capture screens while
 * preserving screen-specific customization through the options pattern.
 *
 * @module features/wardrobe/hooks/useGallerySelection
 */

import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { t } from '../../../core/i18n';
import { trackCaptureEvent } from '../../../core/telemetry';
import { checkFeatureFlagSync } from '../../../core/featureFlags';
import { getValidationErrorMessage } from '../../../core/utils/imageValidation';
import {
  CaptureOrigin,
  CaptureSource,
  CaptureImagePayload,
} from '../../../core/types/capture';
import { CapturePermissions } from './useCapturePermissions';
import { UseGalleryPickerReturn } from './useGalleryPicker';
import { NAVIGATION_DEBOUNCE_MS } from '../constants';

/**
 * User interface for type safety.
 */
interface User {
  id: string;
}

/**
 * Options for configuring gallery selection behavior.
 */
export interface UseGallerySelectionOptions {
  /** Capture flow origin (wardrobe or onboarding) */
  origin: CaptureOrigin | null;

  /** Permission management hook */
  permissions: CapturePermissions;

  /** Gallery picker hook */
  galleryPicker: UseGalleryPickerReturn;

  /** Current navigation state */
  isNavigating: boolean;

  /** Set navigation state */
  setIsNavigating: (value: boolean) => void;

  /** Set capture source */
  setSource: (source: CaptureSource) => void;

  /** Set capture payload */
  setPayload: (payload: CaptureImagePayload) => void;

  /** Router instance */
  router: ReturnType<typeof useRouter>;

  /** Current user */
  user: User | null;

  /** Optional additional guard condition (e.g., isCapturing for camera screen) */
  additionalGuardCondition?: boolean;

  /** Optional camera fallback handler (for CaptureScreen) */
  onCameraFallback?: () => void;
}

/**
 * Return type for the gallery selection hook.
 */
export interface UseGallerySelectionReturn {
  /** Handle gallery selection with permission checks and result processing */
  handleGallerySelection: () => Promise<void>;
}

/**
 * Hook for handling gallery selection flow with permission management.
 *
 * Provides a unified interface for selecting images from the gallery,
 * handling permissions, validation, and navigation to the crop screen.
 *
 * @param options - Configuration options
 * @returns Gallery selection handler
 *
 * @example
 * ```tsx
 * const gallerySelection = useGallerySelection({
 *   origin,
 *   permissions,
 *   galleryPicker,
 *   isNavigating,
 *   setIsNavigating,
 *   setSource,
 *   setPayload,
 *   router,
 *   user,
 *   onCameraFallback: handleTakePhoto, // CaptureScreen only
 * });
 *
 * // Use in button handler
 * <Button onPress={gallerySelection.handleGallerySelection}>
 *   Choose from Gallery
 * </Button>
 * ```
 */
export function useGallerySelection(
  options: UseGallerySelectionOptions
): UseGallerySelectionReturn {
  /**
   * Launch gallery picker and handle result.
   * Note: retry handlers reference handleGallerySelection which is defined later.
   * This works because handlers are only called after user interaction, when
   * handleGallerySelection is already defined.
   */
  const launchGalleryPicker = useCallback(async () => {
    // Set navigation state and source
    options.setIsNavigating(true);
    options.setSource('gallery');

    // Track telemetry
    trackCaptureEvent('capture_source_selected', {
      userId: options.user?.id,
      origin: options.origin || undefined,
      source: 'gallery',
    });

    // Launch gallery picker
    const result = await options.galleryPicker.pickImage();

    // Handle picker result
    if (result.success) {
      // Construct payload with validated image
      const payload: CaptureImagePayload = {
        uri: result.uri,
        width: result.width,
        height: result.height,
        origin: options.origin || 'wardrobe',
        source: 'gallery',
        createdAt: new Date().toISOString(),
      };

      // Store payload
      options.setPayload(payload);

      // Check if crop screen feature is enabled
      const cropScreenFlag = checkFeatureFlagSync('capture.cropScreen');
      const cropEnabled = cropScreenFlag.enabled && !cropScreenFlag.requiresUpdate;

      // Navigate based on feature flag
      if (cropEnabled) {
        // Crop screen enabled: navigate to crop
        options.router.push('/crop');
      } else {
        // Crop screen disabled: skip crop, go directly to item creation
        options.router.push('/onboarding/first-item');
      }

      // Reset navigation state after navigation
      setTimeout(() => options.setIsNavigating(false), NAVIGATION_DEBOUNCE_MS);
    } else if (result.reason === 'cancelled') {
      // User cancelled picker - just reset navigation state
      options.setIsNavigating(false);
    } else if (result.reason === 'invalid') {
      // Image validation failed - show error with retry option
      options.setIsNavigating(false);
      Alert.alert(
        t('screens.capture.errors.invalidImage'),
        result.error || getValidationErrorMessage('invalid_dimensions'),
        [
          {
            text: t('screens.capture.errors.tryAgain'),
            onPress: () => void handleGallerySelection(),
          },
          {
            text: t('screens.capture.errors.cancel'),
            style: 'cancel',
          },
        ]
      );
    } else {
      // Other errors (permission_denied, error)
      options.setIsNavigating(false);
      Alert.alert(
        t('screens.capture.errors.galleryError'),
        result.error || t('screens.capture.errors.galleryErrorMessage'),
        [
          {
            text: t('screens.capture.errors.tryAgain'),
            onPress: () => void handleGallerySelection(),
          },
          {
            text: t('screens.capture.errors.cancel'),
            style: 'cancel',
          },
        ]
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  /**
   * Show blocked permission dialog with settings option.
   */
  const showBlockedPermissionDialog = useCallback(() => {
    const actions: Array<{
      text: string;
      onPress?: () => void;
      style?: 'default' | 'cancel' | 'destructive';
    }> = [
      {
        text: t('screens.capture.permissions.actions.openSettings'),
        onPress: async () => {
          await options.permissions.gallery.openSettings();
        },
      },
    ];

    // Add camera fallback button if provided (CaptureScreen only)
    if (options.onCameraFallback) {
      actions.push({
        text: t('screens.capture.permissions.actions.useCamera'),
        onPress: options.onCameraFallback,
        style: 'default',
      });
    }

    actions.push({
      text: t('screens.capture.permissions.actions.cancel'),
      style: 'cancel',
    });

    Alert.alert(
      t('screens.capture.permissions.gallery.blockedTitle'),
      t('screens.capture.permissions.gallery.blockedMessage'),
      actions
    );
  }, [options]);

  /**
   * Show request permission dialog.
   */
  const showRequestPermissionDialog = useCallback(() => {
    Alert.alert(
      t('screens.capture.permissions.gallery.deniedTitle'),
      t('screens.capture.permissions.gallery.deniedMessage'),
      [
        {
          text: t('screens.capture.permissions.actions.allowAccess'),
          onPress: async () => {
            const newStatus = await options.permissions.gallery.request();
            // After request, if granted, launch gallery picker
            if (newStatus === 'granted') {
              await launchGalleryPicker();
            }
          },
        },
        {
          text: t('screens.capture.permissions.actions.cancel'),
          style: 'cancel',
        },
      ]
    );
  }, [options, launchGalleryPicker]);

  /**
   * Main gallery selection handler.
   */
  const handleGallerySelection = useCallback(async () => {
    // Guard check: prevent execution if already navigating or loading
    if (
      options.isNavigating ||
      options.permissions.isLoading ||
      options.galleryPicker.isLoading ||
      options.additionalGuardCondition
    ) {
      return;
    }

    // Branch based on permission status
    if (options.permissions.gallery.status === 'granted') {
      // Permission already granted - proceed to gallery
      await launchGalleryPicker();
    } else if (options.permissions.gallery.status === 'blocked') {
      // Permission permanently denied - show settings dialog
      showBlockedPermissionDialog();
    } else if (
      options.permissions.gallery.status === 'denied' ||
      options.permissions.gallery.status === 'undetermined'
    ) {
      // Permission not yet requested or denied once - show explanation and request
      showRequestPermissionDialog();
    }
  }, [
    options,
    launchGalleryPicker,
    showBlockedPermissionDialog,
    showRequestPermissionDialog,
  ]);

  return {
    handleGallerySelection,
  };
}
