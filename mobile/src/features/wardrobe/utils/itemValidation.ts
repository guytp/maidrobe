/**
 * Item validation schemas and utilities.
 *
 * Provides Zod-based validation for wardrobe item name and tags fields.
 * Used by ItemDetailScreen for client-side validation before save.
 *
 * Validation rules:
 * - Name: required, max 100 characters
 * - Tags: max 20 tags, max 30 characters per tag, case-insensitive uniqueness
 *
 * @module features/wardrobe/utils/itemValidation
 */

import { z } from 'zod';

// ============================================================================
// Constants
// ============================================================================

/** Maximum length for item name field */
export const MAX_NAME_LENGTH = 100;

/** Buffer for name input (allows typing beyond max before showing error) */
export const NAME_OVERFLOW_BUFFER = 10;

/** Maximum length for a single tag */
export const MAX_TAG_LENGTH = 30;

/** Maximum number of tags allowed per item */
export const MAX_TAGS_COUNT = 20;

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Checks if tags array has case-insensitive duplicates.
 *
 * @param tags - Array of tag strings to check
 * @returns true if all tags are unique (case-insensitive), false if duplicates exist
 */
export function hasUniqueTags(tags: string[]): boolean {
  const lowercaseTags = tags.map((tag) => tag.toLowerCase().trim());
  const uniqueTags = new Set(lowercaseTags);
  return uniqueTags.size === lowercaseTags.length;
}

/**
 * Checks if a tag already exists in the tags array (case-insensitive).
 *
 * @param tag - Tag to check
 * @param existingTags - Array of existing tags
 * @returns true if tag already exists, false otherwise
 */
export function tagExists(tag: string, existingTags: string[]): boolean {
  const normalizedTag = tag.toLowerCase().trim();
  return existingTags.some((t) => t.toLowerCase().trim() === normalizedTag);
}

/**
 * Normalizes a tag by trimming whitespace and converting to lowercase.
 *
 * @param tag - Tag to normalize
 * @returns Normalized tag string
 */
export function normalizeTag(tag: string): string {
  return tag.toLowerCase().trim();
}

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Schema for validating item name.
 *
 * Validates that name is:
 * - A string (required)
 * - At least 1 character after trimming (not empty)
 * - At most MAX_NAME_LENGTH characters
 *
 * Error keys reference i18n paths in wardrobe.itemDetail namespace.
 */
export const ItemNameSchema = z
  .string()
  .trim()
  .min(1, 'wardrobe.itemDetail.nameRequired')
  .max(MAX_NAME_LENGTH, 'wardrobe.itemDetail.nameTooLong');

/**
 * Schema for validating a single tag.
 *
 * Validates that each tag is:
 * - A string
 * - At most MAX_TAG_LENGTH characters after trimming
 *
 * Error keys reference i18n paths in wardrobe.itemDetail namespace.
 */
export const SingleTagSchema = z
  .string()
  .trim()
  .max(MAX_TAG_LENGTH, 'wardrobe.itemDetail.tagTooLong');

/**
 * Schema for validating tags array.
 *
 * Validates that tags array:
 * - Contains at most MAX_TAGS_COUNT tags
 * - Each tag passes SingleTagSchema validation
 * - All tags are unique (case-insensitive)
 *
 * Error keys reference i18n paths in wardrobe.itemDetail namespace.
 */
export const TagsArraySchema = z
  .array(SingleTagSchema)
  .max(MAX_TAGS_COUNT, 'wardrobe.itemDetail.tagLimitReached')
  .refine(hasUniqueTags, 'wardrobe.itemDetail.tagAlreadyAdded');

/**
 * Schema for validating item editable fields.
 *
 * Combined schema for validating all editable item fields together.
 * Used for form-level validation before save.
 */
export const ItemEditableFieldsSchema = z.object({
  name: ItemNameSchema,
  tags: TagsArraySchema,
});

// ============================================================================
// Type Exports
// ============================================================================

/** Type for validated item name */
export type ValidatedItemName = z.infer<typeof ItemNameSchema>;

/** Type for validated single tag */
export type ValidatedTag = z.infer<typeof SingleTagSchema>;

/** Type for validated tags array */
export type ValidatedTagsArray = z.infer<typeof TagsArraySchema>;

/** Type for validated editable item fields */
export type ValidatedItemEditableFields = z.infer<typeof ItemEditableFieldsSchema>;

// ============================================================================
// Validation Result Types
// ============================================================================

/**
 * Result of validating a single field.
 */
export interface FieldValidationResult {
  /** Whether the field is valid */
  isValid: boolean;
  /** Error message key (i18n key) if invalid, undefined if valid */
  errorKey?: string;
}

/**
 * Result of validating item editable fields.
 */
export interface ItemValidationResult {
  /** Whether all fields are valid */
  isValid: boolean;
  /** Field-specific validation results */
  fields: {
    name: FieldValidationResult;
    tags: FieldValidationResult;
  };
}

// ============================================================================
// Validation Helper Functions
// ============================================================================

/**
 * Validates item name field.
 *
 * @param name - Name value to validate
 * @returns Validation result with isValid flag and optional error key
 */
export function validateItemName(name: string): FieldValidationResult {
  const result = ItemNameSchema.safeParse(name);
  if (result.success) {
    return { isValid: true };
  }
  return {
    isValid: false,
    errorKey: result.error.issues[0]?.message,
  };
}

/**
 * Validates a single tag before adding to tags array.
 *
 * Checks both the tag itself and whether it would create a duplicate.
 *
 * @param tag - Tag to validate
 * @param existingTags - Current tags array to check for duplicates
 * @returns Validation result with isValid flag and optional error key
 */
export function validateNewTag(tag: string, existingTags: string[]): FieldValidationResult {
  // Check tag length
  const tagResult = SingleTagSchema.safeParse(tag);
  if (!tagResult.success) {
    return {
      isValid: false,
      errorKey: tagResult.error.issues[0]?.message,
    };
  }

  // Check for empty tag after trim
  if (tag.trim().length === 0) {
    return { isValid: false };
  }

  // Check tags count limit
  if (existingTags.length >= MAX_TAGS_COUNT) {
    return {
      isValid: false,
      errorKey: 'wardrobe.itemDetail.tagLimitReached',
    };
  }

  // Check for duplicates
  if (tagExists(tag, existingTags)) {
    return {
      isValid: false,
      errorKey: 'wardrobe.itemDetail.tagAlreadyAdded',
    };
  }

  return { isValid: true };
}

/**
 * Validates tags array.
 *
 * @param tags - Tags array to validate
 * @returns Validation result with isValid flag and optional error key
 */
export function validateTags(tags: string[]): FieldValidationResult {
  const result = TagsArraySchema.safeParse(tags);
  if (result.success) {
    return { isValid: true };
  }
  return {
    isValid: false,
    errorKey: result.error.issues[0]?.message,
  };
}

/**
 * Validates all editable item fields.
 *
 * @param fields - Object containing name and tags to validate
 * @returns Comprehensive validation result for all fields
 */
export function validateItemFields(fields: { name: string; tags: string[] }): ItemValidationResult {
  const nameResult = validateItemName(fields.name);
  const tagsResult = validateTags(fields.tags);

  return {
    isValid: nameResult.isValid && tagsResult.isValid,
    fields: {
      name: nameResult,
      tags: tagsResult,
    },
  };
}
