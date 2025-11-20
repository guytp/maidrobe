/**
 * Capture permissions hook for managing camera and gallery permissions.
 *
 * This hook provides a unified interface for checking and requesting permissions
 * in the capture flow. It manages loading states, caches permission status, and
 * exposes helpers for requesting permissions and opening settings.
 *
 * @module features/wardrobe/hooks/useCapturePermissions
 */

import { useState, useEffect, useCallback } from 'react';
import {
  PermissionStatus,
  isCameraAvailable,
  checkCameraPermission,
  requestCameraPermission,
  checkGalleryPermission,
  requestGalleryPermission,
  openAppSettings,
} from '../../../core/utils/permissions';
import { trackCaptureEvent } from '../../../core/telemetry';
import { useStore } from '../../../core/state/store';

/**
 * Camera permission state.
 */
interface CameraPermissionState {
  /** Current camera permission status */
  status: PermissionStatus;
  /** Whether camera hardware is available on device */
  isAvailable: boolean;
  /** Request camera permission */
  request: () => Promise<void>;
  /** Open app settings for permission change */
  openSettings: () => Promise<void>;
}

/**
 * Gallery permission state.
 */
interface GalleryPermissionState {
  /** Current gallery permission status */
  status: PermissionStatus;
  /** Request gallery permission */
  request: () => Promise<void>;
  /** Open app settings for permission change */
  openSettings: () => Promise<void>;
}

/**
 * Combined capture permissions state.
 */
export interface CapturePermissions {
  /** Camera permission state */
  camera: CameraPermissionState;
  /** Gallery permission state */
  gallery: GalleryPermissionState;
  /** Whether permissions are being loaded/requested */
  isLoading: boolean;
}

/**
 * Hook for managing capture flow permissions.
 *
 * Checks camera and gallery permissions on mount, provides request functions,
 * and tracks permission events for analytics.
 *
 * @param origin - Capture origin for telemetry
 * @returns Capture permissions state and helpers
 *
 * @example
 * ```tsx
 * const permissions = useCapturePermissions('wardrobe');
 *
 * // Check if camera is available and granted
 * if (permissions.camera.isAvailable && permissions.camera.status === 'granted') {
 *   // Open camera
 * }
 *
 * // Request camera permission
 * await permissions.camera.request();
 *
 * // Open settings if blocked
 * if (permissions.camera.status === 'blocked') {
 *   await permissions.camera.openSettings();
 * }
 * ```
 */
export function useCapturePermissions(
  origin: 'wardrobe' | 'onboarding' | null
): CapturePermissions {
  const user = useStore((state) => state.user);

  // Permission states
  const [cameraStatus, setCameraStatus] = useState<PermissionStatus>('undetermined');
  const [cameraAvailable, setCameraAvailable] = useState<boolean>(true);
  const [galleryStatus, setGalleryStatus] = useState<PermissionStatus>('undetermined');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  /**
   * Checks initial permission statuses on mount.
   */
  useEffect(() => {
    let mounted = true;

    async function checkPermissions() {
      setIsLoading(true);

      try {
        // Check camera availability and permission
        const [available, cameraStatus, galleryStatus] = await Promise.all([
          isCameraAvailable(),
          checkCameraPermission(),
          checkGalleryPermission(),
        ]);

        if (mounted) {
          setCameraAvailable(available);
          setCameraStatus(cameraStatus);
          setGalleryStatus(galleryStatus);
        }
      } catch {
        // On error, assume defaults
        if (mounted) {
          setCameraAvailable(false);
          setCameraStatus('undetermined');
          setGalleryStatus('undetermined');
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    checkPermissions();

    return () => {
      mounted = false;
    };
  }, []);

  /**
   * Requests camera permission and tracks telemetry.
   */
  const requestCamera = useCallback(async () => {
    setIsLoading(true);

    try {
      trackCaptureEvent('camera_permission_requested', {
        userId: user?.id,
        origin: origin || undefined,
      });

      const newStatus = await requestCameraPermission();
      setCameraStatus(newStatus);

      // Track result
      if (newStatus === 'granted') {
        trackCaptureEvent('camera_permission_granted', {
          userId: user?.id,
          origin: origin || undefined,
        });
      } else if (newStatus === 'denied') {
        trackCaptureEvent('camera_permission_denied', {
          userId: user?.id,
          origin: origin || undefined,
        });
      } else if (newStatus === 'blocked') {
        trackCaptureEvent('camera_permission_blocked', {
          userId: user?.id,
          origin: origin || undefined,
        });
      }
    } catch {
      // On error, assume denied
      setCameraStatus('denied');
      trackCaptureEvent('camera_permission_denied', {
        userId: user?.id,
        origin: origin || undefined,
        errorCode: 'permission_request_failed',
      });
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, origin]);

  /**
   * Requests gallery permission and tracks telemetry.
   */
  const requestGallery = useCallback(async () => {
    setIsLoading(true);

    try {
      trackCaptureEvent('gallery_permission_requested', {
        userId: user?.id,
        origin: origin || undefined,
      });

      const newStatus = await requestGalleryPermission();
      setGalleryStatus(newStatus);

      // Track result
      if (newStatus === 'granted') {
        trackCaptureEvent('gallery_permission_granted', {
          userId: user?.id,
          origin: origin || undefined,
        });
      } else if (newStatus === 'denied') {
        trackCaptureEvent('gallery_permission_denied', {
          userId: user?.id,
          origin: origin || undefined,
        });
      } else if (newStatus === 'blocked') {
        trackCaptureEvent('gallery_permission_blocked', {
          userId: user?.id,
          origin: origin || undefined,
        });
      }
    } catch {
      // On error, assume denied
      setGalleryStatus('denied');
      trackCaptureEvent('gallery_permission_denied', {
        userId: user?.id,
        origin: origin || undefined,
        errorCode: 'permission_request_failed',
      });
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, origin]);

  /**
   * Opens app settings and tracks telemetry.
   */
  const handleOpenSettings = useCallback(async () => {
    trackCaptureEvent('settings_opened', {
      userId: user?.id,
      origin: origin || undefined,
    });

    await openAppSettings();

    // After returning from settings, re-check permissions
    // User might have changed them
    setTimeout(async () => {
      const [newCameraStatus, newGalleryStatus] = await Promise.all([
        checkCameraPermission(),
        checkGalleryPermission(),
      ]);

      setCameraStatus(newCameraStatus);
      setGalleryStatus(newGalleryStatus);
    }, 500);
  }, [user?.id, origin]);

  return {
    camera: {
      status: cameraStatus,
      isAvailable: cameraAvailable,
      request: requestCamera,
      openSettings: handleOpenSettings,
    },
    gallery: {
      status: galleryStatus,
      request: requestGallery,
      openSettings: handleOpenSettings,
    },
    isLoading,
  };
}
