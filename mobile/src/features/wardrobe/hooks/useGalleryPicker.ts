/**
 * Gallery picker hook for capture flow.
 *
 * Wraps expo-image-picker with validation, error handling, and telemetry.
 * Provides a simple interface for launching the gallery picker and handling
 * the result with proper cancellation and error states.
 *
 * @module features/wardrobe/hooks/useGalleryPicker
 */

import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { CaptureOrigin } from '../../../core/types/capture';
import { trackCaptureEvent } from '../../../core/telemetry';
import { validateCapturedImage } from '../../../core/utils/imageValidation';
import { useStore } from '../../../core/state/store';

/**
 * Gallery picker result - success case.
 */
export interface GalleryPickerSuccess {
  success: true;
  uri: string;
  width: number;
  height: number;
  type?: string;
}

/**
 * Gallery picker result - failure case.
 */
export interface GalleryPickerFailure {
  success: false;
  reason: 'cancelled' | 'invalid' | 'permission_denied' | 'error';
  error?: string;
}

/**
 * Gallery picker result.
 */
export type GalleryPickerResult = GalleryPickerSuccess | GalleryPickerFailure;

/**
 * Gallery picker hook return type.
 */
export interface UseGalleryPickerReturn {
  /** Launch the gallery picker */
  pickImage: () => Promise<GalleryPickerResult>;
  /** Whether picker is currently active */
  isLoading: boolean;
}

/**
 * Hook for launching gallery picker and handling results.
 *
 * Provides:
 * - Gallery picker with sensible defaults
 * - Image validation
 * - Telemetry tracking
 * - Error normalization
 * - Cancellation handling
 *
 * @param origin - Capture flow origin for telemetry
 * @returns Gallery picker function and loading state
 */
export function useGalleryPicker(origin: CaptureOrigin | null): UseGalleryPickerReturn {
  const [isLoading, setIsLoading] = useState(false);
  const user = useStore((state) => state.user);

  /**
   * Launches the gallery picker and handles the result.
   *
   * @returns Gallery picker result
   */
  const pickImage = async (): Promise<GalleryPickerResult> => {
    setIsLoading(true);

    try {
      // Track gallery opened event
      trackCaptureEvent('gallery_opened', {
        userId: user?.id,
        origin: origin || undefined,
      });

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1, // Use original quality - cropping/processing happens later
        exif: false, // Don't include EXIF (privacy)
      });

      // Handle cancellation
      if (result.canceled) {
        trackCaptureEvent('gallery_cancelled', {
          userId: user?.id,
          origin: origin || undefined,
        });

        setIsLoading(false);
        return {
          success: false,
          reason: 'cancelled',
        };
      }

      // Extract first asset (we only allow single selection)
      const asset = result.assets?.[0];
      if (!asset) {
        trackCaptureEvent('gallery_selection_failed', {
          userId: user?.id,
          origin: origin || undefined,
          errorCode: 'no_asset',
        });

        setIsLoading(false);
        return {
          success: false,
          reason: 'error',
          error: 'No image was selected',
        };
      }

      // Validate the selected image
      const validation = validateCapturedImage(
        asset.uri,
        asset.width,
        asset.height,
        asset.type || asset.mimeType
      );

      if (!validation.isValid) {
        trackCaptureEvent('gallery_validation_failed', {
          userId: user?.id,
          origin: origin || undefined,
          errorCode: validation.error,
          errorMessage: validation.errorMessage,
        });

        setIsLoading(false);
        return {
          success: false,
          reason: 'invalid',
          error: validation.errorMessage,
        };
      }

      // Track successful selection
      trackCaptureEvent('gallery_image_selected', {
        userId: user?.id,
        origin: origin || undefined,
        width: asset.width,
        height: asset.height,
        type: asset.type || asset.mimeType,
      });

      setIsLoading(false);
      return {
        success: true,
        uri: asset.uri,
        width: asset.width || 0,
        height: asset.height || 0,
        type: asset.type || asset.mimeType,
      };
    } catch (error) {
      // Handle permission denied errors
      if (error instanceof Error && error.message.includes('permission')) {
        trackCaptureEvent('gallery_permission_error', {
          userId: user?.id,
          origin: origin || undefined,
          errorMessage: error.message,
        });

        setIsLoading(false);
        return {
          success: false,
          reason: 'permission_denied',
          error: 'Gallery access was denied',
        };
      }

      // Handle other errors
      trackCaptureEvent('gallery_error', {
        userId: user?.id,
        origin: origin || undefined,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      setIsLoading(false);
      return {
        success: false,
        reason: 'error',
        error: error instanceof Error ? error.message : 'Failed to access gallery',
      };
    }
  };

  return {
    pickImage,
    isLoading,
  };
}
