/**
 * @fileoverview Unit tests for prefs validation schemas and utilities.
 *
 * Tests Zod schema validation for:
 * - PrefsFormDataSchema
 * - PrefsRowSchema
 * - PrefsUpdatePayloadSchema
 * - Individual field schemas
 * - Type guard functions
 *
 * Coverage includes:
 * - Valid data passes validation
 * - Invalid data fails with appropriate errors
 * - Edge cases and boundary conditions
 * - Type narrowing with type guards
 *
 * @module __tests__/onboarding/prefsValidation
 */

import { ZodError } from 'zod';
import {
  PrefsFormDataSchema,
  PrefsRowSchema,
  PrefsUpdatePayloadSchema,
  ExclusionTagSchema,
  ColourTagSchema,
  ColourTendencySchema,
  NoRepeatWindowSchema,
  ExclusionsDataSchema,
  isValidExclusionTag,
  isValidColourTag,
  validateFormData,
  validatePrefsRow,
  validateUpdatePayload,
  MAX_COMFORT_NOTES_LENGTH,
} from '../../src/features/onboarding/utils/prefsValidation';
import type {
  PrefsFormData,
  PrefsRow,
} from '../../src/features/onboarding/utils/prefsTypes';

describe('prefsValidation', () => {
  describe('ExclusionTagSchema', () => {
    it('validates known exclusion tags', () => {
      const validTags = ['skirts', 'shorts', 'crop_tops', 'heels', 'suits_blazers', 'sleeveless_tops'];
      validTags.forEach((tag) => {
        expect(() => ExclusionTagSchema.parse(tag)).not.toThrow();
      });
    });

    it('rejects unknown tags', () => {
      expect(() => ExclusionTagSchema.parse('unknown')).toThrow(ZodError);
    });

    it('rejects non-string values', () => {
      expect(() => ExclusionTagSchema.parse(123)).toThrow(ZodError);
      expect(() => ExclusionTagSchema.parse(null)).toThrow(ZodError);
      expect(() => ExclusionTagSchema.parse(undefined)).toThrow(ZodError);
    });
  });

  describe('ColourTagSchema', () => {
    it('validates known colour tags', () => {
      const validTags = ['neutrals', 'some_colour', 'bold_colours'];
      validTags.forEach((tag) => {
        expect(() => ColourTagSchema.parse(tag)).not.toThrow();
      });
    });

    it('rejects not_sure (UI-only value)', () => {
      expect(() => ColourTagSchema.parse('not_sure')).toThrow(ZodError);
    });

    it('rejects unknown tags', () => {
      expect(() => ColourTagSchema.parse('unknown')).toThrow(ZodError);
    });
  });

  describe('ColourTendencySchema', () => {
    it('validates all tendency options including not_sure', () => {
      const validOptions = ['neutrals', 'some_colour', 'bold_colours', 'not_sure'];
      validOptions.forEach((option) => {
        expect(() => ColourTendencySchema.parse(option)).not.toThrow();
      });
    });

    it('rejects unknown values', () => {
      expect(() => ColourTendencySchema.parse('unknown')).toThrow(ZodError);
    });
  });

  describe('NoRepeatWindowSchema', () => {
    it('validates exact bucket values', () => {
      const validWindows = [0, 7, 14, null];
      validWindows.forEach((window) => {
        expect(() => NoRepeatWindowSchema.parse(window)).not.toThrow();
      });
    });

    it('rejects other numbers', () => {
      const invalidWindows = [1, 5, 10, 15, 21, 30, -5];
      invalidWindows.forEach((window) => {
        expect(() => NoRepeatWindowSchema.parse(window)).toThrow(ZodError);
      });
    });

    it('rejects strings', () => {
      expect(() => NoRepeatWindowSchema.parse('7')).toThrow(ZodError);
    });
  });

  describe('ExclusionsDataSchema', () => {
    it('validates valid exclusions data', () => {
      const validData = {
        checklist: ['skirts', 'heels'],
        freeText: 'no wool',
      };
      expect(() => ExclusionsDataSchema.parse(validData)).not.toThrow();
    });

    it('validates empty exclusions', () => {
      const emptyData = {
        checklist: [],
        freeText: '',
      };
      expect(() => ExclusionsDataSchema.parse(emptyData)).not.toThrow();
    });

    it('rejects invalid checklist tags', () => {
      const invalidData = {
        checklist: ['skirts', 'unknown'],
        freeText: '',
      };
      expect(() => ExclusionsDataSchema.parse(invalidData)).toThrow(ZodError);
    });

    it('rejects non-array checklist', () => {
      const invalidData = {
        checklist: 'not-an-array',
        freeText: '',
      };
      expect(() => ExclusionsDataSchema.parse(invalidData)).toThrow(ZodError);
    });

    it('rejects non-string freeText', () => {
      const invalidData = {
        checklist: [],
        freeText: 123,
      };
      expect(() => ExclusionsDataSchema.parse(invalidData)).toThrow(ZodError);
    });

    it('rejects missing fields', () => {
      expect(() => ExclusionsDataSchema.parse({ checklist: [] })).toThrow(ZodError);
      expect(() => ExclusionsDataSchema.parse({ freeText: '' })).toThrow(ZodError);
    });
  });

  describe('PrefsFormDataSchema', () => {
    const validFormData: PrefsFormData = {
      colourTendency: 'neutrals',
      exclusions: {
        checklist: ['skirts'],
        freeText: 'no wool',
      },
      noRepeatWindow: 7,
      noRepeatDays: 7,
      noRepeatMode: 'item',
      comfortNotes: 'test notes',
    };

    it('validates complete valid form data', () => {
      expect(() => PrefsFormDataSchema.parse(validFormData)).not.toThrow();
    });

    it('validates form data with defaults', () => {
      const defaultData: PrefsFormData = {
        colourTendency: 'not_sure',
        exclusions: {
          checklist: [],
          freeText: '',
        },
        noRepeatWindow: null,
        noRepeatDays: 7,
        noRepeatMode: 'item',
        comfortNotes: '',
      };
      expect(() => PrefsFormDataSchema.parse(defaultData)).not.toThrow();
    });

    it('rejects comfort notes over max length', () => {
      const longNotes = 'a'.repeat(MAX_COMFORT_NOTES_LENGTH + 1);
      const invalidData = {
        ...validFormData,
        comfortNotes: longNotes,
      };
      expect(() => PrefsFormDataSchema.parse(invalidData)).toThrow(ZodError);
    });

    it('accepts comfort notes at exactly max length', () => {
      const maxNotes = 'a'.repeat(MAX_COMFORT_NOTES_LENGTH);
      const validData = {
        ...validFormData,
        comfortNotes: maxNotes,
      };
      expect(() => PrefsFormDataSchema.parse(validData)).not.toThrow();
    });

    it('rejects invalid colour tendency', () => {
      const invalidData = {
        ...validFormData,
        colourTendency: 'invalid',
      };
      expect(() => PrefsFormDataSchema.parse(invalidData)).toThrow(ZodError);
    });

    it('rejects invalid no-repeat window', () => {
      const invalidData = {
        ...validFormData,
        noRepeatWindow: 5,
      };
      expect(() => PrefsFormDataSchema.parse(invalidData)).toThrow(ZodError);
    });

    it('rejects missing fields', () => {
      const incomplete = {
        colourTendency: 'neutrals',
        exclusions: {
          checklist: [],
          freeText: '',
        },
        // missing noRepeatWindow and comfortNotes
      };
      expect(() => PrefsFormDataSchema.parse(incomplete)).toThrow(ZodError);
    });
  });

  describe('PrefsRowSchema', () => {
    const validRow: PrefsRow = {
      user_id: 'test-user-123',
      colour_prefs: ['neutrals'],
      exclusions: ['skirts', 'free:no wool'],
      no_repeat_days: 7,
      no_repeat_mode: 'item',
      comfort_notes: 'test notes',
    };

    it('validates complete valid row', () => {
      expect(() => PrefsRowSchema.parse(validRow)).not.toThrow();
    });

    it('validates row with optional timestamps', () => {
      const rowWithTimestamps = {
        ...validRow,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      expect(() => PrefsRowSchema.parse(rowWithTimestamps)).not.toThrow();
    });

    it('validates row with null fields', () => {
      const rowWithNulls: PrefsRow = {
        user_id: 'test-user-123',
        colour_prefs: [],
        exclusions: [],
        no_repeat_days: null,
        no_repeat_mode: 'item',
        comfort_notes: null,
      };
      expect(() => PrefsRowSchema.parse(rowWithNulls)).not.toThrow();
    });

    it('accepts unknown tags in colour_prefs (graceful degradation)', () => {
      const rowWithUnknown = {
        ...validRow,
        colour_prefs: ['unknown_tag'],
      };
      expect(() => PrefsRowSchema.parse(rowWithUnknown)).not.toThrow();
    });

    it('accepts unknown tags in exclusions (graceful degradation)', () => {
      const rowWithUnknown = {
        ...validRow,
        exclusions: ['unknown_tag', 'free:custom'],
      };
      expect(() => PrefsRowSchema.parse(rowWithUnknown)).not.toThrow();
    });

    it('rejects empty user_id', () => {
      const invalidRow = {
        ...validRow,
        user_id: '',
      };
      expect(() => PrefsRowSchema.parse(invalidRow)).toThrow(ZodError);
    });

    it('rejects non-integer no_repeat_days', () => {
      const invalidRow = {
        ...validRow,
        no_repeat_days: 7.5,
      };
      expect(() => PrefsRowSchema.parse(invalidRow)).toThrow(ZodError);
    });

    it('rejects non-array colour_prefs', () => {
      const invalidRow = {
        ...validRow,
        colour_prefs: 'not-an-array',
      };
      expect(() => PrefsRowSchema.parse(invalidRow)).toThrow(ZodError);
    });

    it('rejects non-array exclusions', () => {
      const invalidRow = {
        ...validRow,
        exclusions: 'not-an-array',
      };
      expect(() => PrefsRowSchema.parse(invalidRow)).toThrow(ZodError);
    });

    it('rejects missing required fields', () => {
      const incomplete = {
        user_id: 'test-user-123',
        // missing other required fields
      };
      expect(() => PrefsRowSchema.parse(incomplete)).toThrow(ZodError);
    });
  });

  describe('PrefsUpdatePayloadSchema', () => {
    it('validates complete payload', () => {
      const payload = {
        colour_prefs: ['neutrals'],
        exclusions: ['skirts'],
        no_repeat_days: 7,
        no_repeat_mode: 'item',
        comfort_notes: 'test notes',
      };
      expect(() => PrefsUpdatePayloadSchema.parse(payload)).not.toThrow();
    });

    it('validates partial payload', () => {
      const payload = {
        colour_prefs: ['some_colour'],
      };
      expect(() => PrefsUpdatePayloadSchema.parse(payload)).not.toThrow();
    });

    it('validates empty payload', () => {
      const payload = {};
      expect(() => PrefsUpdatePayloadSchema.parse(payload)).not.toThrow();
    });

    it('validates payload with null values', () => {
      const payload = {
        no_repeat_days: null,
        no_repeat_mode: 'item',
        comfort_notes: null,
      };
      expect(() => PrefsUpdatePayloadSchema.parse(payload)).not.toThrow();
    });

    it('rejects non-integer no_repeat_days', () => {
      const payload = {
        no_repeat_days: 7.5,
      };
      expect(() => PrefsUpdatePayloadSchema.parse(payload)).toThrow(ZodError);
    });

    it('does not include user_id', () => {
      // Schema doesn't validate user_id (not part of update payload)
      // Real usage should not include user_id in the payload
      const parsed = PrefsUpdatePayloadSchema.parse({ colour_prefs: ['neutrals'] });
      expect(parsed).not.toHaveProperty('user_id');
    });
  });

  describe('isValidExclusionTag', () => {
    it('returns true for valid exclusion tags', () => {
      const validTags = ['skirts', 'shorts', 'crop_tops', 'heels', 'suits_blazers', 'sleeveless_tops'];
      validTags.forEach((tag) => {
        expect(isValidExclusionTag(tag)).toBe(true);
      });
    });

    it('returns false for unknown tags', () => {
      expect(isValidExclusionTag('unknown')).toBe(false);
      expect(isValidExclusionTag('free:no wool')).toBe(false);
    });

    it('returns false for non-string values', () => {
      expect(isValidExclusionTag(123 as never)).toBe(false);
      expect(isValidExclusionTag(null as never)).toBe(false);
      expect(isValidExclusionTag(undefined as never)).toBe(false);
    });

    it('narrows type correctly', () => {
      const tag: string = 'skirts';
      if (isValidExclusionTag(tag)) {
        // Type should be narrowed to ExclusionTag here
        const typed: import('../../src/features/onboarding/utils/prefsTypes').ExclusionTag = tag;
        expect(typed).toBe('skirts');
      }
    });
  });

  describe('isValidColourTag', () => {
    it('returns true for valid colour tags', () => {
      const validTags = ['neutrals', 'some_colour', 'bold_colours'];
      validTags.forEach((tag) => {
        expect(isValidColourTag(tag)).toBe(true);
      });
    });

    it('returns false for not_sure (UI-only)', () => {
      expect(isValidColourTag('not_sure')).toBe(false);
    });

    it('returns false for unknown tags', () => {
      expect(isValidColourTag('unknown')).toBe(false);
    });

    it('narrows type correctly', () => {
      const tag: string = 'neutrals';
      if (isValidColourTag(tag)) {
        // Type should be narrowed to ColourTag here
        const typed: import('../../src/features/onboarding/utils/prefsTypes').ColourTag = tag;
        expect(typed).toBe('neutrals');
      }
    });
  });

  describe('validateFormData', () => {
    const validData: PrefsFormData = {
      colourTendency: 'neutrals',
      exclusions: {
        checklist: [],
        freeText: '',
      },
      noRepeatWindow: null,
      noRepeatDays: 7,
      noRepeatMode: 'item',
      comfortNotes: '',
    };

    it('returns parsed data for valid input', () => {
      const result = validateFormData(validData);
      expect(result).toEqual(validData);
    });

    it('throws ZodError for invalid input', () => {
      const invalidData = {
        ...validData,
        colourTendency: 'invalid',
      };
      expect(() => validateFormData(invalidData)).toThrow(ZodError);
    });
  });

  describe('validatePrefsRow', () => {
    const validRow: PrefsRow = {
      user_id: 'test-user-123',
      colour_prefs: [],
      exclusions: [],
      no_repeat_days: null,
      no_repeat_mode: 'item',
      comfort_notes: null,
    };

    it('returns parsed data for valid input', () => {
      const result = validatePrefsRow(validRow);
      expect(result).toEqual(validRow);
    });

    it('throws ZodError for invalid input', () => {
      const invalidRow = {
        ...validRow,
        user_id: '',
      };
      expect(() => validatePrefsRow(invalidRow)).toThrow(ZodError);
    });
  });

  describe('validateUpdatePayload', () => {
    it('returns parsed data for valid input', () => {
      const payload = {
        colour_prefs: ['neutrals'],
        no_repeat_days: 7,
        no_repeat_mode: 'item',
      };
      const result = validateUpdatePayload(payload);
      expect(result).toEqual(payload);
    });

    it('throws ZodError for invalid input', () => {
      const invalidPayload = {
        no_repeat_days: 7.5, // non-integer
      };
      expect(() => validateUpdatePayload(invalidPayload)).toThrow(ZodError);
    });

    it('accepts empty payload', () => {
      const result = validateUpdatePayload({});
      expect(result).toEqual({});
    });
  });
});
