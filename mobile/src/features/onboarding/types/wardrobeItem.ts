/**
 * Wardrobe item types for onboarding first item creation.
 *
 * PLACEHOLDER IMPLEMENTATION:
 * These types define the expected schema for wardrobe items that will be
 * created during onboarding. They mirror the expected structure from
 * Feature #3 (Wardrobe Item Capture & Management).
 *
 * When Feature #3 is implemented, these types should be replaced with
 * imports from the shared wardrobe feature.
 *
 * TODO: Replace with real implementation when Feature #3 is available.
 * Expected integration:
 * ```typescript
 * import { WardrobeItem, CreateItemRequest, CreateItemResponse } from '../../wardrobe/types';
 * export { WardrobeItem, CreateItemRequest, CreateItemResponse };
 * ```
 *
 * @module features/onboarding/types/wardrobeItem
 */

import { ItemType } from './itemMetadata';

/**
 * Wardrobe item database record.
 *
 * Represents a wardrobe item as stored in the items table.
 * Matches expected Supabase schema structure.
 */
export interface WardrobeItem {
  /** Unique item identifier (UUID) */
  id: string;
  /** User who owns this item (UUID foreign key to auth.users) */
  userId: string;
  /** Array of storage paths to item photos */
  photos: string[];
  /** Item type (top, bottom, dress, etc.) */
  type: ItemType;
  /** Array of colour IDs, first element is dominant colour */
  colour: string[];
  /** Optional user-provided name/label */
  name: string | null;
  /** Item creation timestamp */
  createdAt: string;
}

/**
 * Request payload for creating a new wardrobe item.
 *
 * Contains all data needed to create an item during onboarding.
 */
export interface CreateItemRequest {
  /** Local image URI from camera capture */
  imageUri: string;
  /** Item type */
  type: ItemType;
  /** Dominant colour ID */
  colourId: string;
  /** Optional item name */
  name: string;
}

/**
 * Response from item creation mutation.
 *
 * Contains the created item record.
 */
export interface CreateItemResponse {
  /** Created wardrobe item */
  item: WardrobeItem;
}

/**
 * Storage bucket configuration for wardrobe items.
 *
 * PLACEHOLDER: Defines expected bucket name and path convention.
 * Will be replaced with Feature #3 configuration.
 */
export const WARDROBE_STORAGE_CONFIG = {
  /** Supabase Storage bucket name */
  bucketName: 'wardrobe-items',
  /** Path template: {userId}/items/{itemId}/{timestamp}.jpg */
  pathTemplate: (userId: string, itemId: string, timestamp: number) =>
    `${userId}/items/${itemId}/${timestamp}.jpg`,
} as const;
