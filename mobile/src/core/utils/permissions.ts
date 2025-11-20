/**
 * Permissions utility for camera and gallery access.
 *
 * Provides normalized permission status and helpers for the capture flow.
 * Wraps expo-camera and expo-image-picker permission APIs with consistent
 * status values and settings navigation support.
 *
 * @module core/utils/permissions
 */

import { Camera } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

/**
 * Normalized permission status.
 *
 * - granted: User has granted permission
 * - denied: User denied permission but can be asked again
 * - blocked: User permanently denied (must open settings)
 * - undetermined: Permission not yet requested
 */
export type PermissionStatus = 'granted' | 'denied' | 'blocked' | 'undetermined';

/**
 * Maps expo permission response to normalized status.
 *
 * Expo uses PermissionResponse with status and canAskAgain fields.
 * We normalize to a simpler semantic model:
 * - granted -> 'granted'
 * - denied + canAskAgain=true -> 'denied'
 * - denied + canAskAgain=false -> 'blocked'
 * - undetermined -> 'undetermined'
 *
 * @param response - Expo permission response
 * @returns Normalized permission status
 */
function normalizePermissionStatus(response: {
  status: string;
  canAskAgain: boolean;
}): PermissionStatus {
  if (response.status === 'granted') {
    return 'granted';
  }

  if (response.status === 'denied') {
    return response.canAskAgain ? 'denied' : 'blocked';
  }

  return 'undetermined';
}

/**
 * Checks if camera is available on the device.
 *
 * Note: expo-camera doesn't provide a reliable API to check camera availability.
 * We assume camera is available on physical devices. The permission request
 * will fail gracefully if no camera exists.
 *
 * @returns Promise resolving to true (assumes camera is available)
 */
export async function isCameraAvailable(): Promise<boolean> {
  // expo-camera doesn't provide isAvailableAsync
  // Assume camera is available - permission request will fail if not
  return Promise.resolve(true);
}

/**
 * Checks current camera permission status without requesting.
 *
 * @returns Promise resolving to normalized permission status
 */
export async function checkCameraPermission(): Promise<PermissionStatus> {
  try {
    const response = await Camera.getCameraPermissionsAsync();
    return normalizePermissionStatus(response);
  } catch (error) {
    // If permission check fails, treat as undetermined
    return 'undetermined';
  }
}

/**
 * Requests camera permission from the user.
 *
 * Shows the OS permission dialog if permission is undetermined or denied.
 * Will not show dialog if permission is blocked (user must go to settings).
 *
 * @returns Promise resolving to normalized permission status
 */
export async function requestCameraPermission(): Promise<PermissionStatus> {
  try {
    const response = await Camera.requestCameraPermissionsAsync();
    return normalizePermissionStatus(response);
  } catch (error) {
    // If permission request fails, treat as denied
    return 'denied';
  }
}

/**
 * Checks current gallery/media library permission status without requesting.
 *
 * @returns Promise resolving to normalized permission status
 */
export async function checkGalleryPermission(): Promise<PermissionStatus> {
  try {
    const response = await ImagePicker.getMediaLibraryPermissionsAsync();
    return normalizePermissionStatus(response);
  } catch (error) {
    // If permission check fails, treat as undetermined
    return 'undetermined';
  }
}

/**
 * Requests gallery/media library permission from the user.
 *
 * Shows the OS permission dialog if permission is undetermined or denied.
 * Will not show dialog if permission is blocked (user must go to settings).
 *
 * @returns Promise resolving to normalized permission status
 */
export async function requestGalleryPermission(): Promise<PermissionStatus> {
  try {
    const response = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return normalizePermissionStatus(response);
  } catch (error) {
    // If permission request fails, treat as denied
    return 'denied';
  }
}

/**
 * Opens the app settings page where the user can change permissions.
 *
 * Behavior by platform:
 * - iOS: Opens app-specific settings page
 * - Android: Opens app info/permissions page
 *
 * @returns Promise resolving to true if settings were opened successfully
 */
export async function openAppSettings(): Promise<boolean> {
  try {
    if (Platform.OS === 'ios') {
      // iOS: Open app settings
      await Linking.openSettings();
      return true;
    } else if (Platform.OS === 'android') {
      // Android: Open app info page
      await Linking.openSettings();
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}
