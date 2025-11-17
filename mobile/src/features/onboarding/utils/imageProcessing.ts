/**
 * Image processing utilities for onboarding first item creation.
 *
 * PLACEHOLDER IMPLEMENTATION:
 * These utilities provide mock image preprocessing including EXIF stripping
 * until Feature #3 (Wardrobe Item Capture & Management) provides the real
 * image processing pipeline.
 *
 * Real implementation will require:
 * - expo-image-picker (for EXIF stripping)
 * - expo-image-manipulator (for compression/resizing)
 * - expo-file-system (for file operations)
 *
 * TODO: Replace with real implementation when Feature #3 is available.
 * Expected integration:
 * ```typescript
 * import { processItemImage } from '../../wardrobe/utils/imageProcessing';
 * export { processItemImage };
 * ```
 *
 * @module features/onboarding/utils/imageProcessing
 */

/**
 * Processed image result.
 */
export interface ProcessedImage {
  /** Local URI to processed image */
  uri: string;
  /** File size in bytes */
  size: number;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
}

/**
 * Process an item image for upload.
 *
 * PLACEHOLDER: Returns the original URI without processing.
 * Real implementation will:
 * - Strip EXIF metadata (privacy/security)
 * - Compress to reasonable quality (reduce storage/bandwidth)
 * - Resize to max dimensions (e.g., 1920x1920)
 * - Convert to JPEG format
 * - Return processed image URI
 *
 * @param imageUri - Local image URI from camera
 * @returns Processed image metadata
 */
export async function processItemImage(imageUri: string): Promise<ProcessedImage> {
  // Placeholder implementation - returns original URI
  // Real implementation would use expo-image-manipulator:
  //
  // import * as ImageManipulator from 'expo-image-manipulator';
  //
  // const result = await ImageManipulator.manipulateAsync(
  //   imageUri,
  //   [{ resize: { width: 1920 } }],
  //   {
  //     compress: 0.8,
  //     format: ImageManipulator.SaveFormat.JPEG,
  //     // EXIF stripping happens automatically with expo-image-picker
  //   }
  // );
  //
  // return {
  //   uri: result.uri,
  //   size: await getFileSize(result.uri),
  //   width: result.width,
  //   height: result.height,
  // };

  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        uri: imageUri,
        size: 1024 * 500, // Mock 500KB
        width: 1920,
        height: 1920,
      });
    }, 100);
  });
}

/**
 * Convert image URI to blob for upload.
 *
 * PLACEHOLDER: Returns mock blob.
 * Real implementation will read file and convert to blob.
 *
 * @param imageUri - Local image URI
 * @returns Blob ready for upload
 */
export async function imageUriToBlob(imageUri: string): Promise<Blob> {
  // Placeholder implementation - returns mock blob
  // Real implementation would use expo-file-system:
  //
  // import * as FileSystem from 'expo-file-system';
  //
  // const base64 = await FileSystem.readAsStringAsync(imageUri, {
  //   encoding: FileSystem.EncodingType.Base64,
  // });
  //
  // const binary = atob(base64);
  // const array = new Uint8Array(binary.length);
  // for (let i = 0; i < binary.length; i++) {
  //   array[i] = binary.charCodeAt(i);
  // }
  //
  // return new Blob([array], { type: 'image/jpeg' });

  return new Promise((resolve) => {
    setTimeout(() => {
      // Mock blob
      const mockData = new Uint8Array(1024);
      resolve(new Blob([mockData], { type: 'image/jpeg' }));
    }, 50);
  });
}
