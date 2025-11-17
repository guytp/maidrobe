/**
 * Camera permission utilities for onboarding first item capture.
 *
 * PLACEHOLDER IMPLEMENTATION:
 * This is a stub/placeholder implementation until Feature #3 (Wardrobe Item
 * Capture & Management) is implemented. Feature #3 will provide the real camera
 * infrastructure, and these functions will delegate to that shared implementation.
 *
 * Current behavior:
 * - Simulates permission checks with mock responses
 * - Returns 'granted' status to allow flow testing
 * - Can be configured to simulate denied/error states for testing
 *
 * TODO: Replace with real implementation when Feature #3 is available.
 * Expected integration:
 * ```typescript
 * import { checkCameraPermission, requestCameraPermission } from '../../wardrobe/utils/cameraPermissions';
 * export { checkCameraPermission, requestCameraPermission };
 * ```
 *
 * @module features/onboarding/utils/cameraPermissions
 */

/**
 * Camera permission status.
 */
export type CameraPermissionStatus = 'granted' | 'denied' | 'undetermined';

/**
 * Check current camera permission status.
 *
 * PLACEHOLDER: Always returns 'granted' to allow flow testing.
 * Real implementation will use expo-camera or expo-image-picker permissions API.
 *
 * @returns Promise resolving to permission status
 */
export async function checkCameraPermission(): Promise<CameraPermissionStatus> {
  // Placeholder implementation - simulate granted permission
  // Real implementation will use Camera.getCameraPermissionsAsync() or similar
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve('granted');
    }, 100);
  });
}

/**
 * Request camera permission from the user.
 *
 * PLACEHOLDER: Always returns 'granted' to allow flow testing.
 * Real implementation will show OS permission prompt.
 *
 * @returns Promise resolving to permission status after request
 */
export async function requestCameraPermission(): Promise<CameraPermissionStatus> {
  // Placeholder implementation - simulate granted permission
  // Real implementation will use Camera.requestCameraPermissionsAsync() or similar
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve('granted');
    }, 100);
  });
}
