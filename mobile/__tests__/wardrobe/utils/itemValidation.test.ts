/**
 * Unit tests for item validation utilities.
 *
 * Tests the Zod-based validation schemas and helper functions for wardrobe item
 * name and tags fields:
 * - Name validation: required, max 100 characters
 * - Tag validation: max 30 characters per tag
 * - Tags array validation: max 20 tags, case-insensitive uniqueness
 * - Helper functions: normalization, duplicate checking
 *
 * @module __tests__/wardrobe/utils/itemValidation
 */

import {
  MAX_NAME_LENGTH,
  NAME_OVERFLOW_BUFFER,
  MAX_TAG_LENGTH,
  MAX_TAGS_COUNT,
  hasUniqueTags,
  tagExists,
  normalizeTag,
  validateItemName,
  validateNewTag,
  validateTags,
  validateItemFields,
  ItemNameSchema,
  SingleTagSchema,
  TagsArraySchema,
  ItemEditableFieldsSchema,
} from '../../../src/features/wardrobe/utils/itemValidation';

describe('itemValidation utilities', () => {
  describe('constants', () => {
    it('has expected MAX_NAME_LENGTH', () => {
      expect(MAX_NAME_LENGTH).toBe(100);
    });

    it('has expected NAME_OVERFLOW_BUFFER', () => {
      expect(NAME_OVERFLOW_BUFFER).toBe(10);
    });

    it('has expected MAX_TAG_LENGTH', () => {
      expect(MAX_TAG_LENGTH).toBe(30);
    });

    it('has expected MAX_TAGS_COUNT', () => {
      expect(MAX_TAGS_COUNT).toBe(20);
    });
  });

  describe('hasUniqueTags', () => {
    it('returns true for empty array', () => {
      expect(hasUniqueTags([])).toBe(true);
    });

    it('returns true for single tag', () => {
      expect(hasUniqueTags(['casual'])).toBe(true);
    });

    it('returns true for unique tags', () => {
      expect(hasUniqueTags(['casual', 'summer', 'cotton'])).toBe(true);
    });

    it('returns false for duplicate tags (exact match)', () => {
      expect(hasUniqueTags(['casual', 'casual'])).toBe(false);
    });

    it('returns false for duplicate tags (case-insensitive)', () => {
      expect(hasUniqueTags(['Casual', 'casual'])).toBe(false);
    });

    it('returns false for duplicate tags (mixed case)', () => {
      expect(hasUniqueTags(['SUMMER', 'Summer', 'summer'])).toBe(false);
    });

    it('handles whitespace in tags', () => {
      expect(hasUniqueTags(['  casual  ', 'casual'])).toBe(false);
    });
  });

  describe('tagExists', () => {
    it('returns false for empty array', () => {
      expect(tagExists('casual', [])).toBe(false);
    });

    it('returns true for exact match', () => {
      expect(tagExists('casual', ['casual', 'summer'])).toBe(true);
    });

    it('returns true for case-insensitive match', () => {
      expect(tagExists('CASUAL', ['casual', 'summer'])).toBe(true);
    });

    it('returns false when tag not found', () => {
      expect(tagExists('winter', ['casual', 'summer'])).toBe(false);
    });

    it('handles whitespace in tag', () => {
      expect(tagExists('  casual  ', ['casual', 'summer'])).toBe(true);
    });

    it('handles whitespace in existing tags', () => {
      expect(tagExists('casual', ['  casual  ', 'summer'])).toBe(true);
    });
  });

  describe('normalizeTag', () => {
    it('trims whitespace', () => {
      expect(normalizeTag('  casual  ')).toBe('casual');
    });

    it('converts to lowercase', () => {
      expect(normalizeTag('CASUAL')).toBe('casual');
    });

    it('handles mixed case and whitespace', () => {
      expect(normalizeTag('  Summer Dress  ')).toBe('summer dress');
    });

    it('returns empty string for whitespace only', () => {
      expect(normalizeTag('   ')).toBe('');
    });
  });

  describe('ItemNameSchema', () => {
    it('validates valid name', () => {
      const result = ItemNameSchema.safeParse('Blue Shirt');
      expect(result.success).toBe(true);
    });

    it('trims whitespace', () => {
      const result = ItemNameSchema.safeParse('  Blue Shirt  ');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('Blue Shirt');
      }
    });

    it('rejects empty string', () => {
      const result = ItemNameSchema.safeParse('');
      expect(result.success).toBe(false);
    });

    it('rejects whitespace only', () => {
      const result = ItemNameSchema.safeParse('   ');
      expect(result.success).toBe(false);
    });

    it('accepts name at max length', () => {
      const name = 'a'.repeat(MAX_NAME_LENGTH);
      const result = ItemNameSchema.safeParse(name);
      expect(result.success).toBe(true);
    });

    it('rejects name exceeding max length', () => {
      const name = 'a'.repeat(MAX_NAME_LENGTH + 1);
      const result = ItemNameSchema.safeParse(name);
      expect(result.success).toBe(false);
    });

    it('returns correct error key for empty name', () => {
      const result = ItemNameSchema.safeParse('');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('wardrobe.itemDetail.nameRequired');
      }
    });

    it('returns correct error key for name too long', () => {
      const name = 'a'.repeat(MAX_NAME_LENGTH + 1);
      const result = ItemNameSchema.safeParse(name);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('wardrobe.itemDetail.nameTooLong');
      }
    });
  });

  describe('SingleTagSchema', () => {
    it('validates valid tag', () => {
      const result = SingleTagSchema.safeParse('casual');
      expect(result.success).toBe(true);
    });

    it('trims whitespace', () => {
      const result = SingleTagSchema.safeParse('  casual  ');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('casual');
      }
    });

    it('accepts tag at max length', () => {
      const tag = 'a'.repeat(MAX_TAG_LENGTH);
      const result = SingleTagSchema.safeParse(tag);
      expect(result.success).toBe(true);
    });

    it('rejects tag exceeding max length', () => {
      const tag = 'a'.repeat(MAX_TAG_LENGTH + 1);
      const result = SingleTagSchema.safeParse(tag);
      expect(result.success).toBe(false);
    });

    it('returns correct error key for tag too long', () => {
      const tag = 'a'.repeat(MAX_TAG_LENGTH + 1);
      const result = SingleTagSchema.safeParse(tag);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('wardrobe.itemDetail.tagTooLong');
      }
    });
  });

  describe('TagsArraySchema', () => {
    it('validates empty array', () => {
      const result = TagsArraySchema.safeParse([]);
      expect(result.success).toBe(true);
    });

    it('validates valid tags array', () => {
      const result = TagsArraySchema.safeParse(['casual', 'summer', 'cotton']);
      expect(result.success).toBe(true);
    });

    it('accepts array at max count', () => {
      const tags = Array.from({ length: MAX_TAGS_COUNT }, (_, i) => `tag${i}`);
      const result = TagsArraySchema.safeParse(tags);
      expect(result.success).toBe(true);
    });

    it('rejects array exceeding max count', () => {
      const tags = Array.from({ length: MAX_TAGS_COUNT + 1 }, (_, i) => `tag${i}`);
      const result = TagsArraySchema.safeParse(tags);
      expect(result.success).toBe(false);
    });

    it('rejects duplicate tags', () => {
      const result = TagsArraySchema.safeParse(['casual', 'casual']);
      expect(result.success).toBe(false);
    });

    it('rejects case-insensitive duplicates', () => {
      const result = TagsArraySchema.safeParse(['Casual', 'casual']);
      expect(result.success).toBe(false);
    });

    it('returns correct error key for too many tags', () => {
      const tags = Array.from({ length: MAX_TAGS_COUNT + 1 }, (_, i) => `tag${i}`);
      const result = TagsArraySchema.safeParse(tags);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('wardrobe.itemDetail.tagLimitReached');
      }
    });
  });

  describe('ItemEditableFieldsSchema', () => {
    it('validates valid fields', () => {
      const result = ItemEditableFieldsSchema.safeParse({
        name: 'Blue Shirt',
        tags: ['casual', 'summer'],
      });
      expect(result.success).toBe(true);
    });

    it('validates with empty tags', () => {
      const result = ItemEditableFieldsSchema.safeParse({
        name: 'Blue Shirt',
        tags: [],
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty name', () => {
      const result = ItemEditableFieldsSchema.safeParse({
        name: '',
        tags: ['casual'],
      });
      expect(result.success).toBe(false);
    });

    it('rejects too many tags', () => {
      const tags = Array.from({ length: MAX_TAGS_COUNT + 1 }, (_, i) => `tag${i}`);
      const result = ItemEditableFieldsSchema.safeParse({
        name: 'Blue Shirt',
        tags,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('validateItemName', () => {
    it('returns valid for valid name', () => {
      const result = validateItemName('Blue Shirt');
      expect(result.isValid).toBe(true);
      expect(result.errorKey).toBeUndefined();
    });

    it('returns invalid for empty name', () => {
      const result = validateItemName('');
      expect(result.isValid).toBe(false);
      expect(result.errorKey).toBe('wardrobe.itemDetail.nameRequired');
    });

    it('returns invalid for whitespace only', () => {
      const result = validateItemName('   ');
      expect(result.isValid).toBe(false);
      expect(result.errorKey).toBe('wardrobe.itemDetail.nameRequired');
    });

    it('returns invalid for name too long', () => {
      const name = 'a'.repeat(MAX_NAME_LENGTH + 1);
      const result = validateItemName(name);
      expect(result.isValid).toBe(false);
      expect(result.errorKey).toBe('wardrobe.itemDetail.nameTooLong');
    });

    it('returns valid for name at max length', () => {
      const name = 'a'.repeat(MAX_NAME_LENGTH);
      const result = validateItemName(name);
      expect(result.isValid).toBe(true);
    });
  });

  describe('validateNewTag', () => {
    it('returns valid for valid new tag', () => {
      const result = validateNewTag('summer', ['casual']);
      expect(result.isValid).toBe(true);
      expect(result.errorKey).toBeUndefined();
    });

    it('returns invalid for empty tag', () => {
      const result = validateNewTag('', []);
      expect(result.isValid).toBe(false);
    });

    it('returns invalid for whitespace only', () => {
      const result = validateNewTag('   ', []);
      expect(result.isValid).toBe(false);
    });

    it('returns invalid for tag too long', () => {
      const tag = 'a'.repeat(MAX_TAG_LENGTH + 1);
      const result = validateNewTag(tag, []);
      expect(result.isValid).toBe(false);
      expect(result.errorKey).toBe('wardrobe.itemDetail.tagTooLong');
    });

    it('returns invalid for duplicate tag', () => {
      const result = validateNewTag('casual', ['casual', 'summer']);
      expect(result.isValid).toBe(false);
      expect(result.errorKey).toBe('wardrobe.itemDetail.tagAlreadyAdded');
    });

    it('returns invalid for case-insensitive duplicate', () => {
      const result = validateNewTag('CASUAL', ['casual', 'summer']);
      expect(result.isValid).toBe(false);
      expect(result.errorKey).toBe('wardrobe.itemDetail.tagAlreadyAdded');
    });

    it('returns invalid when at max tags', () => {
      const existingTags = Array.from({ length: MAX_TAGS_COUNT }, (_, i) => `tag${i}`);
      const result = validateNewTag('newTag', existingTags);
      expect(result.isValid).toBe(false);
      expect(result.errorKey).toBe('wardrobe.itemDetail.tagLimitReached');
    });

    it('returns valid when under max tags', () => {
      const existingTags = Array.from({ length: MAX_TAGS_COUNT - 1 }, (_, i) => `tag${i}`);
      const result = validateNewTag('newTag', existingTags);
      expect(result.isValid).toBe(true);
    });
  });

  describe('validateTags', () => {
    it('returns valid for empty array', () => {
      const result = validateTags([]);
      expect(result.isValid).toBe(true);
    });

    it('returns valid for valid tags', () => {
      const result = validateTags(['casual', 'summer', 'cotton']);
      expect(result.isValid).toBe(true);
    });

    it('returns invalid for too many tags', () => {
      const tags = Array.from({ length: MAX_TAGS_COUNT + 1 }, (_, i) => `tag${i}`);
      const result = validateTags(tags);
      expect(result.isValid).toBe(false);
      expect(result.errorKey).toBe('wardrobe.itemDetail.tagLimitReached');
    });

    it('returns invalid for duplicate tags', () => {
      const result = validateTags(['casual', 'casual']);
      expect(result.isValid).toBe(false);
      expect(result.errorKey).toBe('wardrobe.itemDetail.tagAlreadyAdded');
    });
  });

  describe('validateItemFields', () => {
    it('returns valid for valid fields', () => {
      const result = validateItemFields({
        name: 'Blue Shirt',
        tags: ['casual', 'summer'],
      });
      expect(result.isValid).toBe(true);
      expect(result.fields.name.isValid).toBe(true);
      expect(result.fields.tags.isValid).toBe(true);
    });

    it('returns invalid for empty name', () => {
      const result = validateItemFields({
        name: '',
        tags: ['casual'],
      });
      expect(result.isValid).toBe(false);
      expect(result.fields.name.isValid).toBe(false);
      expect(result.fields.name.errorKey).toBe('wardrobe.itemDetail.nameRequired');
      expect(result.fields.tags.isValid).toBe(true);
    });

    it('returns invalid for duplicate tags', () => {
      const result = validateItemFields({
        name: 'Blue Shirt',
        tags: ['casual', 'casual'],
      });
      expect(result.isValid).toBe(false);
      expect(result.fields.name.isValid).toBe(true);
      expect(result.fields.tags.isValid).toBe(false);
      expect(result.fields.tags.errorKey).toBe('wardrobe.itemDetail.tagAlreadyAdded');
    });

    it('returns invalid for both name and tags errors', () => {
      const tags = Array.from({ length: MAX_TAGS_COUNT + 1 }, (_, i) => `tag${i}`);
      const result = validateItemFields({
        name: '',
        tags,
      });
      expect(result.isValid).toBe(false);
      expect(result.fields.name.isValid).toBe(false);
      expect(result.fields.tags.isValid).toBe(false);
    });
  });
});
