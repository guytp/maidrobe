/**
 * Capture flow types for wardrobe item image capture.
 *
 * These types define the contract for the reusable capture flow that allows
 * users to add wardrobe items via camera or gallery from multiple entry points
 * (Wardrobe screen, Onboarding Step 3).
 *
 * The capture flow is responsible for:
 * - Handling camera and gallery permissions
 * - Capturing or selecting an image
 * - Validating the image
 * - Passing a typed payload to the crop screen
 *
 * The capture flow does NOT:
 * - Create Item records
 * - Upload images to backend
 * - Perform image editing or cropping
 *
 * @module core/types/capture
 */

/**
 * Origin context for the capture flow.
 *
 * Indicates which feature initiated the capture flow, used to determine
 * navigation behavior (especially cancel/back actions).
 *
 * - "wardrobe": Launched from the main Wardrobe screen
 * - "onboarding": Launched from Onboarding Step 3
 */
export type CaptureOrigin = 'wardrobe' | 'onboarding';

/**
 * Source of the captured image.
 *
 * Indicates whether the image was captured via the device camera or
 * selected from the photo gallery.
 *
 * - "camera": Image captured using device camera
 * - "gallery": Image selected from photo gallery/library
 */
export type CaptureSource = 'camera' | 'gallery';

/**
 * Payload handed off from capture flow to crop screen.
 *
 * Contains all context needed by the crop screen to process the captured
 * image and continue the item creation flow.
 *
 * This payload is passed via navigation params or stored in a shared
 * in-memory store (Zustand) for retrieval by the crop screen.
 *
 * @example
 * ```typescript
 * const payload: CaptureImagePayload = {
 *   uri: 'file:///path/to/temp/image.jpg',
 *   origin: 'wardrobe',
 *   source: 'camera',
 *   createdAt: '2024-01-15T10:30:00.000Z'
 * };
 * ```
 */
export interface CaptureImagePayload {
  /**
   * Local file URI of the captured/selected image.
   *
   * This is a temporary file path in app-scoped storage.
   * Format: file:/// URI on both iOS and Android.
   *
   * @example "file:///path/to/app/cache/image.jpg"
   */
  uri: string;

  /**
   * Origin context - which feature initiated the capture flow.
   *
   * Used to determine navigation behavior, especially for cancel/back actions.
   */
  origin: CaptureOrigin;

  /**
   * Source of the image - camera or gallery.
   *
   * Used for telemetry and potentially for different processing paths.
   */
  source: CaptureSource;

  /**
   * ISO 8601 timestamp when the image was captured/selected.
   *
   * Used for tracking and potentially for organizing temp files.
   *
   * @example "2024-01-15T10:30:00.000Z"
   */
  createdAt: string;
}

/**
 * Type guard to check if a value is a valid CaptureOrigin.
 *
 * @param value - Value to check
 * @returns true if value is a valid CaptureOrigin
 *
 * @example
 * ```typescript
 * if (isCaptureOrigin(params.origin)) {
 *   // Safe to use params.origin as CaptureOrigin
 * }
 * ```
 */
export function isCaptureOrigin(value: unknown): value is CaptureOrigin {
  return value === 'wardrobe' || value === 'onboarding';
}

/**
 * Type guard to check if a value is a valid CaptureSource.
 *
 * @param value - Value to check
 * @returns true if value is a valid CaptureSource
 *
 * @example
 * ```typescript
 * if (isCaptureSource(params.source)) {
 *   // Safe to use params.source as CaptureSource
 * }
 * ```
 */
export function isCaptureSource(value: unknown): value is CaptureSource {
  return value === 'camera' || value === 'gallery';
}

/**
 * Type guard to validate a complete CaptureImagePayload.
 *
 * Checks that all required fields are present and have valid values.
 * Does not validate the URI format or timestamp format - just presence.
 *
 * @param value - Value to check
 * @returns true if value is a valid CaptureImagePayload
 *
 * @example
 * ```typescript
 * const data = getPayloadFromStore();
 * if (isCaptureImagePayload(data)) {
 *   // Safe to use data as CaptureImagePayload
 *   navigateToCrop(data);
 * } else {
 *   // Show error - invalid payload
 * }
 * ```
 */
export function isCaptureImagePayload(value: unknown): value is CaptureImagePayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Record<string, unknown>;

  return (
    typeof payload.uri === 'string' &&
    payload.uri.length > 0 &&
    isCaptureOrigin(payload.origin) &&
    isCaptureSource(payload.source) &&
    typeof payload.createdAt === 'string' &&
    payload.createdAt.length > 0
  );
}
