/**
 * Utility function for constructing wardrobe item image URLs.
 *
 * Provides image URL construction with fallback chain for the wardrobe grid
 * and item detail views. Image priority follows AC12 specification:
 * 1. thumb_key - Optimized thumbnail (~200x200)
 * 2. clean_key - Background-removed version
 * 3. original_key - Original uploaded image
 * 4. null if no valid image exists
 *
 * @module features/wardrobe/utils/getItemImageUrl
 */

import { WARDROBE_BUCKET_NAME } from './imageUpload';
import type { BatchWardrobeItem, ItemDetail, WardrobeGridItem } from '../types';

/**
 * Supabase project URL from environment.
 *
 * Used to construct public storage URLs for images.
 * Falls back to empty string if not set (will result in null URLs).
 */
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

/**
 * Item with image storage keys.
 *
 * Minimal interface for any item type that contains the image storage keys
 * needed for the fallback chain. Supports both WardrobeGridItem and ItemDetail.
 */
interface ItemWithImageKeys {
  thumb_key: string | null;
  clean_key: string | null;
  original_key: string | null;
}

/**
 * Gets the storage key from a wardrobe item using the fallback chain.
 *
 * Returns the first available key from:
 * 1. thumb_key - Preferred for grid display
 * 2. clean_key - Background-removed fallback
 * 3. original_key - Original image fallback
 *
 * @param item - Wardrobe grid item or item detail
 * @returns Storage key or null if no image available
 */
export function getItemStorageKey(item: ItemWithImageKeys): string | null {
  return item.thumb_key || item.clean_key || item.original_key || null;
}

/**
 * Constructs a public URL for a Supabase storage object.
 *
 * URL format: {supabaseUrl}/storage/v1/object/public/{bucket}/{path}
 *
 * @param storagePath - Path to the storage object within the bucket
 * @param bucketName - Storage bucket name (defaults to wardrobe-items)
 * @returns Public URL string or null if path is empty
 */
export function getStoragePublicUrl(
  storagePath: string,
  bucketName: string = WARDROBE_BUCKET_NAME
): string | null {
  if (!storagePath || !SUPABASE_URL) {
    return null;
  }

  // Remove trailing slash from base URL if present
  const baseUrl = SUPABASE_URL.replace(/\/$/, '');

  return `${baseUrl}/storage/v1/object/public/${bucketName}/${storagePath}`;
}

/**
 * Gets the image URL for a wardrobe item using the fallback chain.
 *
 * Returns a public URL for the first available image in priority order:
 * 1. thumb_key - Optimized thumbnail (preferred for grid display)
 * 2. clean_key - Background-removed version
 * 3. original_key - Original uploaded image
 * 4. null if no valid image exists
 *
 * This follows the AC12 specification for image fallback order.
 *
 * @param item - Wardrobe item containing image storage keys (grid, batch, or detail)
 * @returns Public image URL or null if no image available
 *
 * @example
 * ```tsx
 * const imageUrl = getItemImageUrl(item);
 * if (imageUrl) {
 *   return <Image source={{ uri: imageUrl }} />;
 * }
 * return <PlaceholderImage />;
 * ```
 */
export function getItemImageUrl(
  item: WardrobeGridItem | ItemDetail | BatchWardrobeItem
): string | null {
  const storageKey = getItemStorageKey(item);

  if (!storageKey) {
    return null;
  }

  return getStoragePublicUrl(storageKey);
}

/**
 * Gets the best available image URL for detail view display.
 *
 * For detail views, prefers the higher-quality clean or original image
 * over the thumbnail for better visual presentation:
 * 1. clean_key - Background-removed version (preferred for detail)
 * 2. original_key - Original uploaded image
 * 3. thumb_key - Thumbnail fallback
 * 4. null if no valid image exists
 *
 * @param item - Item detail containing image storage keys
 * @returns Public image URL or null if no image available
 *
 * @example
 * ```tsx
 * const imageUrl = getDetailImageUrl(item);
 * if (imageUrl) {
 *   return <Image source={{ uri: imageUrl }} style={styles.largeImage} />;
 * }
 * return <PlaceholderImage />;
 * ```
 */
export function getDetailImageUrl(item: ItemDetail): string | null {
  // Prefer higher quality images for detail view
  const storageKey = item.clean_key || item.original_key || item.thumb_key || null;

  if (!storageKey) {
    return null;
  }

  return getStoragePublicUrl(storageKey);
}
