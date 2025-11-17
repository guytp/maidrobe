/**
 * @fileoverview Zod validation schemas for preferences domain types.
 *
 * Provides runtime validation for:
 * - Database responses (PrefsRow)
 * - UI form data (PrefsFormData)
 * - Update payloads (PrefsUpdatePayload)
 * - Individual field types
 *
 * All schemas are exported for use in:
 * - API layer (validate Supabase responses)
 * - Mutation hooks (validate request payloads)
 * - Form validation (validate user input)
 *
 * Type guards provide narrowing at runtime for safe type assertions.
 *
 * @module features/onboarding/utils/prefsValidation
 */

import { z } from 'zod';
import { EXCLUSION_TAGS, COLOUR_TAGS } from './prefsTypes';
import type {
  PrefsRow,
  PrefsFormData,
  PrefsUpdatePayload,
  ExclusionTag,
  ColourTag,
} from './prefsTypes';

/**
 * Maximum length for comfort notes field.
 *
 * Enforced at:
 * - Schema validation (PrefsFormDataSchema)
 * - UI input (maxLength prop)
 * - Database constraint (if added)
 */
export const MAX_COMFORT_NOTES_LENGTH = 500;

/**
 * Schema for exclusion tag validation.
 *
 * Validates that a string is one of the canonical exclusion tags.
 * Used for checklist validation in ExclusionsDataSchema.
 */
export const ExclusionTagSchema = z.enum(EXCLUSION_TAGS);

/**
 * Schema for colour tag validation.
 *
 * Validates that a string is one of the canonical colour tags.
 * Does not include 'not_sure' (that's UI-only, not stored in DB).
 */
export const ColourTagSchema = z.enum(COLOUR_TAGS);

/**
 * Schema for colour tendency validation.
 *
 * Validates UI colour tendency options including 'not_sure'.
 */
export const ColourTendencySchema = z.enum(['neutrals', 'some_colour', 'bold_colours', 'not_sure']);

/**
 * Schema for no-repeat window validation.
 *
 * Validates that value is one of the three buckets or null.
 * Rejects any other numbers (intermediate values should be mapped first).
 */
export const NoRepeatWindowSchema = z.union([z.literal(0), z.literal(7), z.literal(14), z.null()]);

/**
 * Schema for exclusions data structure.
 *
 * Validates:
 * - checklist: Array of valid ExclusionTag values
 * - freeText: String (any length, will be split by newlines)
 *
 * Note: Individual free-text line length not validated here.
 * Validation happens in mapping layer when converting to database format.
 */
export const ExclusionsDataSchema = z.object({
  checklist: z.array(ExclusionTagSchema),
  freeText: z.string(),
});

/**
 * Schema for UI form data validation.
 *
 * Validates complete PrefsFormData structure with all constraints:
 * - colourTendency: One of four options
 * - exclusions: Valid structure with known tags
 * - noRepeatWindow: One of three buckets or null
 * - comfortNotes: String with max length
 *
 * Use this schema when:
 * - Validating form submission
 * - Validating deserialized state
 * - Type-guarding unknown data
 */
export const PrefsFormDataSchema = z.object({
  colourTendency: ColourTendencySchema,
  exclusions: ExclusionsDataSchema,
  noRepeatWindow: NoRepeatWindowSchema,
  comfortNotes: z.string().max(MAX_COMFORT_NOTES_LENGTH, {
    message: `Comfort notes must be ${MAX_COMFORT_NOTES_LENGTH} characters or less`,
  }),
});

/**
 * Schema for database prefs row validation.
 *
 * Validates Supabase response structure with snake_case naming.
 *
 * Field constraints:
 * - user_id: Non-empty string (UUID format not enforced for simplicity)
 * - no_repeat_days: Integer or null
 * - colour_prefs: Array of strings (tags not validated - graceful degradation)
 * - exclusions: Array of strings (tags not validated - graceful degradation)
 * - comfort_notes: String or null
 * - created_at: Optional ISO string
 * - updated_at: Optional ISO string
 *
 * Rationale for lax tag validation:
 * - Unknown tags might exist from future schema evolution
 * - Mapping layer handles unknown tags gracefully (ignores them)
 * - Prevents schema coupling between database and client
 *
 * Use this schema when:
 * - Validating Supabase query responses
 * - Type-guarding database row data
 * - Ensuring response matches expected structure
 */
export const PrefsRowSchema = z.object({
  user_id: z.string().min(1),
  no_repeat_days: z.number().int().nullable(),
  colour_prefs: z.array(z.string()),
  exclusions: z.array(z.string()),
  comfort_notes: z.string().nullable(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

/**
 * Schema for update payload validation.
 *
 * All fields are optional (partial update / PATCH semantics).
 * Same field constraints as PrefsRowSchema but everything optional.
 *
 * Use this schema when:
 * - Validating mutation payloads
 * - Validating incremental updates
 * - Type-guarding partial row data
 */
export const PrefsUpdatePayloadSchema = z.object({
  no_repeat_days: z.number().int().nullable().optional(),
  colour_prefs: z.array(z.string()).optional(),
  exclusions: z.array(z.string()).optional(),
  comfort_notes: z.string().nullable().optional(),
});

/**
 * Type guard to check if a string is a valid ExclusionTag.
 *
 * Provides runtime narrowing from string to ExclusionTag.
 *
 * Usage:
 * ```typescript
 * if (isValidExclusionTag(tag)) {
 *   // tag is ExclusionTag here
 *   const checklist: ExclusionTag[] = [tag];
 * }
 * ```
 *
 * @param tag - String to check
 * @returns true if tag is a valid ExclusionTag
 */
export function isValidExclusionTag(tag: string): tag is ExclusionTag {
  return EXCLUSION_TAGS.includes(tag as never);
}

/**
 * Type guard to check if a string is a valid ColourTag.
 *
 * Provides runtime narrowing from string to ColourTag.
 *
 * Note: Does not include 'not_sure' (UI-only, not a database tag).
 *
 * Usage:
 * ```typescript
 * if (isValidColourTag(tag)) {
 *   // tag is ColourTag here
 *   const prefs: ColourTag[] = [tag];
 * }
 * ```
 *
 * @param tag - String to check
 * @returns true if tag is a valid ColourTag
 */
export function isValidColourTag(tag: string): tag is ColourTag {
  return COLOUR_TAGS.includes(tag as never);
}

/**
 * Validates and parses form data with Zod schema.
 *
 * Throws ZodError if validation fails.
 * Use this when you expect valid data and want to fail fast.
 *
 * Usage:
 * ```typescript
 * try {
 *   const formData = validateFormData(unknownData);
 *   // formData is guaranteed to be PrefsFormData
 * } catch (error) {
 *   // Handle ZodError
 * }
 * ```
 *
 * @param data - Unknown data to validate
 * @returns Parsed and validated PrefsFormData
 * @throws ZodError if validation fails
 */
export function validateFormData(data: unknown): PrefsFormData {
  return PrefsFormDataSchema.parse(data);
}

/**
 * Validates and parses prefs row with Zod schema.
 *
 * Throws ZodError if validation fails.
 * Use this for Supabase responses where you expect valid data.
 *
 * Usage:
 * ```typescript
 * const { data } = await supabase.from('prefs').select('*').single();
 * const row = validatePrefsRow(data);
 * // row is guaranteed to be PrefsRow
 * ```
 *
 * @param data - Unknown data to validate
 * @returns Parsed and validated PrefsRow
 * @throws ZodError if validation fails
 */
export function validatePrefsRow(data: unknown): PrefsRow {
  return PrefsRowSchema.parse(data);
}

/**
 * Validates and parses update payload with Zod schema.
 *
 * Throws ZodError if validation fails.
 * Use this for mutation payloads before sending to database.
 *
 * Usage:
 * ```typescript
 * const payload = toUpdatePayload(formData);
 * const validated = validateUpdatePayload(payload);
 * await supabase.from('prefs').update(validated).eq('user_id', userId);
 * ```
 *
 * @param data - Unknown data to validate
 * @returns Parsed and validated PrefsUpdatePayload
 * @throws ZodError if validation fails
 */
export function validateUpdatePayload(data: unknown): PrefsUpdatePayload {
  return PrefsUpdatePayloadSchema.parse(data);
}
