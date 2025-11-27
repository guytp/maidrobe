/**
 * Wardrobe feature utility exports.
 *
 * @module features/wardrobe/utils
 */

export {
  prepareImageForUpload,
  uploadImageToStorage,
  generateStoragePath,
  UploadError,
  MAX_UPLOAD_DIMENSION,
  JPEG_UPLOAD_QUALITY,
  WARDROBE_BUCKET_NAME,
} from './imageUpload';
export type { UploadErrorType, PreparedImage } from './imageUpload';

export { getItemImageUrl, getItemStorageKey, getStoragePublicUrl } from './getItemImageUrl';

export {
  // Constants
  MAX_NAME_LENGTH,
  NAME_OVERFLOW_BUFFER,
  MAX_TAG_LENGTH,
  MAX_TAGS_COUNT,
  // Validation functions
  hasUniqueTags,
  tagExists,
  normalizeTag,
  validateItemName,
  validateNewTag,
  validateTags,
  validateItemFields,
  // Schemas
  ItemNameSchema,
  SingleTagSchema,
  TagsArraySchema,
  ItemEditableFieldsSchema,
} from './itemValidation';
export type {
  ValidatedItemName,
  ValidatedTag,
  ValidatedTagsArray,
  ValidatedItemEditableFields,
  FieldValidationResult,
  ItemValidationResult,
} from './itemValidation';
