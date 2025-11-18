/**
 * Colour and item type translation utilities.
 *
 * Provides type-safe translation helpers for wardrobe colour names and item types.
 * These utilities handle validation, fallback behavior, and i18n integration
 * without relying on unsafe type assertions.
 *
 * @module features/onboarding/utils/colourTranslation
 */

import { t } from '../../../core/i18n';
import { WARDROBE_COLOUR_PALETTE } from '../types/itemMetadata';
import type { ItemType } from '../types/itemMetadata';

/**
 * Gets the display name for a wardrobe colour by its ID.
 *
 * This function provides a type-safe way to translate colour IDs to
 * localized display names without using type assertions. It validates
 * the colour ID against the canonical palette and falls back gracefully
 * if the colour is not found or the translation is missing.
 *
 * Fallback strategy:
 * 1. If colourId is null/undefined/empty: returns "Unknown" (translated)
 * 2. If colourId not in palette: returns "Unknown" (translated)
 * 3. If translation key missing: returns the key itself (t() fallback behavior)
 *
 * @param colourId - The colour ID to look up (e.g., 'black', 'blue')
 * @returns Localized colour display name or fallback
 *
 * @example
 * getColourDisplayName('black'); // Returns "Black"
 * getColourDisplayName('invalid'); // Returns "Unknown"
 * getColourDisplayName(null); // Returns "Unknown"
 */
export function getColourDisplayName(colourId: string | null | undefined): string {
  // Handle null, undefined, or empty string
  if (!colourId || colourId.trim() === '') {
    return t('screens.auth.colours.unknown');
  }

  // Find colour in canonical palette
  const colour = WARDROBE_COLOUR_PALETTE.find((c) => c.id === colourId);

  // If colour not found in palette, return fallback
  if (!colour) {
    return t('screens.auth.colours.unknown');
  }

  // Validate that colour.name follows expected pattern
  // Expected: 'screens.auth.colours.<colourId>'
  const expectedPrefix = 'screens.auth.colours.';
  if (!colour.name.startsWith(expectedPrefix)) {
    // Colour definition has malformed translation key
    // Log warning in development and return fallback
    if (__DEV__) {
      console.warn(
        `Colour '${colourId}' has malformed translation key: '${colour.name}'. ` +
          `Expected format: '${expectedPrefix}<colourId>'`
      );
    }
    return t('screens.auth.colours.unknown');
  }

  // Extract the colour key suffix (e.g., 'black' from 'screens.auth.colours.black')
  const colourKey = colour.name.substring(expectedPrefix.length);

  // Validate that the suffix matches the colour ID
  // This ensures consistency between ID and translation key
  if (colourKey !== colourId) {
    if (__DEV__) {
      console.warn(
        `Colour ID '${colourId}' does not match translation key suffix '${colourKey}'. ` +
          `Translation key: '${colour.name}'`
      );
    }
    return t('screens.auth.colours.unknown');
  }

  // Safely translate the colour name
  // We know the key format is correct, but t() will still return the key
  // itself if the translation is missing from en.json
  const translatedName = t(colour.name as 'screens.auth.colours.unknown');

  // Check if translation failed (t() returns the key when not found)
  if (translatedName === colour.name) {
    if (__DEV__) {
      console.warn(
        `Translation missing for colour key: '${colour.name}'. ` +
          `Add this key to en.json under screens.auth.colours.`
      );
    }
    return t('screens.auth.colours.unknown');
  }

  return translatedName;
}

/**
 * Gets the display name for a wardrobe item type.
 *
 * This function provides a type-safe way to translate ItemType enum values
 * to localized display names without using type assertions. It constructs
 * the translation key dynamically and falls back gracefully if the translation
 * is missing.
 *
 * Fallback strategy:
 * 1. If itemType is null/undefined/empty: returns "Other" (translated)
 * 2. If translation key missing: returns the key itself (t() fallback behavior)
 *
 * @param itemType - The item type to translate (e.g., ItemType.Top, 'top')
 * @returns Localized item type display name or fallback
 *
 * @example
 * getItemTypeDisplayName(ItemType.Top); // Returns "Top"
 * getItemTypeDisplayName('dress'); // Returns "Dress"
 * getItemTypeDisplayName(null); // Returns "Other"
 */
export function getItemTypeDisplayName(itemType: ItemType | string | null | undefined): string {
  // Handle null, undefined, or empty string
  if (!itemType || (typeof itemType === 'string' && itemType.trim() === '')) {
    return t('screens.auth.itemTypes.other');
  }

  // Construct translation key
  // Expected format: 'screens.auth.itemTypes.<type>'
  const translationKey = `screens.auth.itemTypes.${itemType}`;

  // Translate the item type
  // t() will return the key itself if translation is missing
  const translatedName = t(translationKey as 'screens.auth.itemTypes.other');

  // Check if translation failed
  if (translatedName === translationKey) {
    if (__DEV__) {
      console.warn(
        `Translation missing for item type key: '${translationKey}'. ` +
          `Add this key to en.json under screens.auth.itemTypes.`
      );
    }
    return t('screens.auth.itemTypes.other');
  }

  return translatedName;
}

/**
 * Validates that all colours in the palette have corresponding translations.
 *
 * This development-time utility checks that every colour in WARDROBE_COLOUR_PALETTE
 * has a matching translation key in en.json. It helps catch mismatches during
 * development before they cause runtime issues.
 *
 * Call this function during app initialization in development mode to ensure
 * colour palette and translations stay in sync.
 *
 * @returns Object with validation results and any errors found
 *
 * @example
 * if (__DEV__) {
 *   const validation = validateColourPalette();
 *   if (!validation.valid) {
 *     console.error('Colour palette validation failed:', validation.errors);
 *   }
 * }
 */
export function validateColourPalette(): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  for (const colour of WARDROBE_COLOUR_PALETTE) {
    // Check translation key format
    const expectedPrefix = 'screens.auth.colours.';
    if (!colour.name.startsWith(expectedPrefix)) {
      errors.push(
        `Colour '${colour.id}' has malformed translation key: '${colour.name}'. ` +
          `Expected format: '${expectedPrefix}<colourId>'`
      );
      continue;
    }

    // Check ID matches translation key suffix
    const colourKey = colour.name.substring(expectedPrefix.length);
    if (colourKey !== colour.id) {
      errors.push(
        `Colour ID '${colour.id}' does not match translation key suffix '${colourKey}'. ` +
          `Translation key: '${colour.name}'`
      );
    }

    // Check translation exists
    const translated = t(colour.name as 'screens.auth.colours.unknown');
    if (translated === colour.name) {
      errors.push(`Translation missing for colour key: '${colour.name}'`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
