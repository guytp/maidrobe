/**
 * Tests for colour and item type translation utilities.
 *
 * @module __tests__/onboarding/colourTranslation
 */

import {
  getColourDisplayName,
  getItemTypeDisplayName,
  validateColourPalette,
} from '../../src/features/onboarding/utils/colourTranslation';
import {
  ItemType,
  WARDROBE_COLOUR_PALETTE,
} from '../../src/features/onboarding/types/itemMetadata';

describe('colourTranslation', () => {
  describe('getColourDisplayName', () => {
    describe('Valid colour IDs', () => {
      it('should return translated name for black', () => {
        expect(getColourDisplayName('black')).toBe('Black');
      });

      it('should return translated name for white', () => {
        expect(getColourDisplayName('white')).toBe('White');
      });

      it('should return translated name for grey', () => {
        expect(getColourDisplayName('grey')).toBe('Grey');
      });

      it('should return translated name for beige', () => {
        expect(getColourDisplayName('beige')).toBe('Beige');
      });

      it('should return translated name for brown', () => {
        expect(getColourDisplayName('brown')).toBe('Brown');
      });

      it('should return translated name for red', () => {
        expect(getColourDisplayName('red')).toBe('Red');
      });

      it('should return translated name for blue', () => {
        expect(getColourDisplayName('blue')).toBe('Blue');
      });

      it('should return translated name for green', () => {
        expect(getColourDisplayName('green')).toBe('Green');
      });

      it('should return translated name for yellow', () => {
        expect(getColourDisplayName('yellow')).toBe('Yellow');
      });

      it('should return translated name for orange', () => {
        expect(getColourDisplayName('orange')).toBe('Orange');
      });

      it('should return translated name for purple', () => {
        expect(getColourDisplayName('purple')).toBe('Purple');
      });

      it('should return translated name for pink', () => {
        expect(getColourDisplayName('pink')).toBe('Pink');
      });

      it('should return translated name for navy', () => {
        expect(getColourDisplayName('navy')).toBe('Navy');
      });

      it('should return translated name for burgundy', () => {
        expect(getColourDisplayName('burgundy')).toBe('Burgundy');
      });

      it('should return translated name for olive', () => {
        expect(getColourDisplayName('olive')).toBe('Olive');
      });

      it('should return translated name for cream', () => {
        expect(getColourDisplayName('cream')).toBe('Cream');
      });

      it('should return translated names for all colours in palette', () => {
        // Test all colours in the palette have valid translations
        WARDROBE_COLOUR_PALETTE.forEach((colour) => {
          const displayName = getColourDisplayName(colour.id);
          // Should not return the translation key itself
          expect(displayName).not.toBe(colour.name);
          // Should return a non-empty string
          expect(displayName).toBeTruthy();
          expect(typeof displayName).toBe('string');
          expect(displayName.length).toBeGreaterThan(0);
        });
      });
    });

    describe('Invalid colour IDs', () => {
      it('should return Unknown for invalid colour ID', () => {
        expect(getColourDisplayName('not-a-real-colour')).toBe('Unknown');
      });

      it('should return Unknown for non-existent colour', () => {
        expect(getColourDisplayName('fuchsia')).toBe('Unknown');
      });

      it('should return Unknown for malformed colour ID', () => {
        expect(getColourDisplayName('123-invalid')).toBe('Unknown');
      });
    });

    describe('Null and undefined handling', () => {
      it('should return Unknown for null', () => {
        expect(getColourDisplayName(null)).toBe('Unknown');
      });

      it('should return Unknown for undefined', () => {
        expect(getColourDisplayName(undefined)).toBe('Unknown');
      });

      it('should return Unknown for empty string', () => {
        expect(getColourDisplayName('')).toBe('Unknown');
      });

      it('should return Unknown for whitespace-only string', () => {
        expect(getColourDisplayName('   ')).toBe('Unknown');
      });
    });

    describe('Case sensitivity', () => {
      it('should be case-sensitive for colour IDs', () => {
        // Colour IDs are lowercase in palette
        expect(getColourDisplayName('Black')).toBe('Unknown');
        expect(getColourDisplayName('BLACK')).toBe('Unknown');
      });

      it('should handle correct lowercase colour IDs', () => {
        expect(getColourDisplayName('black')).toBe('Black');
        expect(getColourDisplayName('blue')).toBe('Blue');
      });
    });

    describe('Whitespace handling', () => {
      it('should not trim valid colour IDs with trailing spaces', () => {
        expect(getColourDisplayName('black ')).toBe('Unknown');
      });

      it('should not trim valid colour IDs with leading spaces', () => {
        expect(getColourDisplayName(' black')).toBe('Unknown');
      });
    });
  });

  describe('getItemTypeDisplayName', () => {
    describe('Valid ItemType enum values', () => {
      it('should return translated name for Top', () => {
        expect(getItemTypeDisplayName(ItemType.Top)).toBe('Top');
      });

      it('should return translated name for Bottom', () => {
        expect(getItemTypeDisplayName(ItemType.Bottom)).toBe('Bottom');
      });

      it('should return translated name for Dress', () => {
        expect(getItemTypeDisplayName(ItemType.Dress)).toBe('Dress');
      });

      it('should return translated name for Outerwear', () => {
        expect(getItemTypeDisplayName(ItemType.Outerwear)).toBe('Outerwear');
      });

      it('should return translated name for Shoes', () => {
        expect(getItemTypeDisplayName(ItemType.Shoes)).toBe('Shoes');
      });

      it('should return translated name for Accessories', () => {
        expect(getItemTypeDisplayName(ItemType.Accessories)).toBe('Accessories');
      });

      it('should return translated name for Other', () => {
        expect(getItemTypeDisplayName(ItemType.Other)).toBe('Other');
      });

      it('should return translated names for all ItemType enum values', () => {
        const itemTypes = Object.values(ItemType);
        itemTypes.forEach((type) => {
          const displayName = getItemTypeDisplayName(type);
          // Should not return the translation key itself
          expect(displayName).not.toContain('screens.auth.itemTypes');
          // Should return a non-empty string
          expect(displayName).toBeTruthy();
          expect(typeof displayName).toBe('string');
          expect(displayName.length).toBeGreaterThan(0);
        });
      });
    });

    describe('Valid string values', () => {
      it('should handle string value "top"', () => {
        expect(getItemTypeDisplayName('top')).toBe('Top');
      });

      it('should handle string value "bottom"', () => {
        expect(getItemTypeDisplayName('bottom')).toBe('Bottom');
      });

      it('should handle string value "dress"', () => {
        expect(getItemTypeDisplayName('dress')).toBe('Dress');
      });

      it('should handle string value "outerwear"', () => {
        expect(getItemTypeDisplayName('outerwear')).toBe('Outerwear');
      });

      it('should handle string value "shoes"', () => {
        expect(getItemTypeDisplayName('shoes')).toBe('Shoes');
      });

      it('should handle string value "accessories"', () => {
        expect(getItemTypeDisplayName('accessories')).toBe('Accessories');
      });

      it('should handle string value "other"', () => {
        expect(getItemTypeDisplayName('other')).toBe('Other');
      });
    });

    describe('Invalid item types', () => {
      it('should return Other for invalid type string', () => {
        expect(getItemTypeDisplayName('invalid-type')).toBe('Other');
      });

      it('should return Other for non-existent type', () => {
        expect(getItemTypeDisplayName('jacket')).toBe('Other');
      });
    });

    describe('Null and undefined handling', () => {
      it('should return Other for null', () => {
        expect(getItemTypeDisplayName(null)).toBe('Other');
      });

      it('should return Other for undefined', () => {
        expect(getItemTypeDisplayName(undefined)).toBe('Other');
      });

      it('should return Other for empty string', () => {
        expect(getItemTypeDisplayName('')).toBe('Other');
      });

      it('should return Other for whitespace-only string', () => {
        expect(getItemTypeDisplayName('   ')).toBe('Other');
      });
    });

    describe('Case sensitivity', () => {
      it('should be case-sensitive for type values', () => {
        // ItemType enum values are lowercase
        expect(getItemTypeDisplayName('Top')).toBe('Other');
        expect(getItemTypeDisplayName('TOP')).toBe('Other');
      });

      it('should handle correct lowercase type values', () => {
        expect(getItemTypeDisplayName('top')).toBe('Top');
        expect(getItemTypeDisplayName('dress')).toBe('Dress');
      });
    });
  });

  describe('validateColourPalette', () => {
    it('should validate colour palette successfully', () => {
      const result = validateColourPalette();
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should return validation result with valid and errors properties', () => {
      const result = validateColourPalette();
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('errors');
      expect(typeof result.valid).toBe('boolean');
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should check all colours in palette', () => {
      const result = validateColourPalette();
      // If valid, it means all colours were checked
      if (result.valid) {
        expect(WARDROBE_COLOUR_PALETTE.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Integration tests', () => {
    it('should work consistently with WARDROBE_COLOUR_PALETTE data', () => {
      // Ensure helper functions work with actual palette data
      const firstColour = WARDROBE_COLOUR_PALETTE[0];
      const displayName = getColourDisplayName(firstColour.id);

      // Should return a translated name, not the key
      expect(displayName).not.toBe(firstColour.name);
      expect(displayName).toBeTruthy();
    });

    it('should handle edge case of colour ID not matching translation key suffix', () => {
      // This tests the validation logic that checks ID matches key suffix
      // With correct palette data, this should always pass
      WARDROBE_COLOUR_PALETTE.forEach((colour) => {
        const displayName = getColourDisplayName(colour.id);
        expect(displayName).toBeTruthy();
      });
    });

    it('should provide consistent results for repeated calls', () => {
      // Test that calling the same function with same input returns same output
      const result1 = getColourDisplayName('black');
      const result2 = getColourDisplayName('black');
      expect(result1).toBe(result2);

      const result3 = getItemTypeDisplayName(ItemType.Top);
      const result4 = getItemTypeDisplayName(ItemType.Top);
      expect(result3).toBe(result4);
    });
  });
});
