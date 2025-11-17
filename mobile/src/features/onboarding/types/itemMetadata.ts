/**
 * Item metadata types for onboarding first item capture.
 *
 * PLACEHOLDER IMPLEMENTATION:
 * These types mirror the expected taxonomies from Feature #3 (Wardrobe Item
 * Capture & Management). When Feature #3 is implemented, these types should
 * be replaced with imports from the shared wardrobe feature.
 *
 * TODO: Replace with real implementation when Feature #3 is available.
 * Expected integration:
 * ```typescript
 * import { ItemType, WardrobeColour, ItemMetadata } from '../../wardrobe/types';
 * export { ItemType, WardrobeColour, ItemMetadata };
 * ```
 *
 * @module features/onboarding/types/itemMetadata
 */

/**
 * Wardrobe item type taxonomy.
 *
 * Represents the category of clothing or accessory.
 * Limited to 7 core types for simplified onboarding flow.
 */
export enum ItemType {
  Top = 'top',
  Bottom = 'bottom',
  Dress = 'dress',
  Outerwear = 'outerwear',
  Shoes = 'shoes',
  Accessories = 'accessories',
  Other = 'other',
}

/**
 * Wardrobe colour definition.
 *
 * Represents a colour in the canonical wardrobe colour palette.
 * Each colour has a unique ID, display name, and hex value for rendering.
 */
export interface WardrobeColour {
  /** Unique identifier for the colour */
  id: string;
  /** Display name for the colour (i18n key) */
  name: string;
  /** Hex colour value for visual rendering */
  hex: string;
}

/**
 * Canonical wardrobe colour palette.
 *
 * This palette represents the standard colours used throughout the app
 * for categorizing wardrobe items. Selected to cover common clothing colours
 * while remaining manageable for user selection.
 *
 * Colours are ordered by frequency of use in fashion:
 * - Neutrals (most common)
 * - Primary colours
 * - Secondary colours
 * - Earth tones
 */
export const WARDROBE_COLOUR_PALETTE: readonly WardrobeColour[] = [
  // Neutrals (most common in wardrobes)
  { id: 'black', name: 'screens.auth.colours.black', hex: '#000000' },
  { id: 'white', name: 'screens.auth.colours.white', hex: '#FFFFFF' },
  { id: 'grey', name: 'screens.auth.colours.grey', hex: '#808080' },
  { id: 'beige', name: 'screens.auth.colours.beige', hex: '#D4C5B0' },
  { id: 'brown', name: 'screens.auth.colours.brown', hex: '#8B4513' },

  // Primary colours
  { id: 'red', name: 'screens.auth.colours.red', hex: '#DC143C' },
  { id: 'blue', name: 'screens.auth.colours.blue', hex: '#1E90FF' },
  { id: 'green', name: 'screens.auth.colours.green', hex: '#228B22' },
  { id: 'yellow', name: 'screens.auth.colours.yellow', hex: '#FFD700' },

  // Secondary colours
  { id: 'orange', name: 'screens.auth.colours.orange', hex: '#FF8C00' },
  { id: 'purple', name: 'screens.auth.colours.purple', hex: '#8A2BE2' },
  { id: 'pink', name: 'screens.auth.colours.pink', hex: '#FF69B4' },

  // Additional common colours
  { id: 'navy', name: 'screens.auth.colours.navy', hex: '#000080' },
  { id: 'burgundy', name: 'screens.auth.colours.burgundy', hex: '#800020' },
  { id: 'olive', name: 'screens.auth.colours.olive', hex: '#6B8E23' },
  { id: 'cream', name: 'screens.auth.colours.cream', hex: '#FFFDD0' },
];

/**
 * Item metadata captured during onboarding.
 *
 * Represents the minimal metadata required for a wardrobe item
 * during the onboarding first item capture flow.
 */
export interface ItemMetadata {
  /** Item type (required) */
  type: ItemType | null;
  /** Dominant colour ID (required) */
  colourId: string | null;
  /** Optional user-provided name/label (max 100 characters) */
  name: string;
}

/**
 * Captured item data including image and metadata.
 *
 * Used to temporarily store the captured item during onboarding
 * before final persistence to Supabase.
 */
export interface CapturedItemData {
  /** Image URI from camera capture */
  imageUri: string;
  /** Item metadata */
  metadata: ItemMetadata;
}
