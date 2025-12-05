/**
 * @fileoverview Unit tests for prefs mapping utilities.
 *
 * Tests bidirectional mapping between database and UI representations:
 * - toFormData (database -> UI)
 * - toPrefsRow (UI -> database, complete row)
 * - toUpdatePayload (UI -> database, partial payload)
 * - hasAnyData (checks if form has meaningful data)
 * - getChangedFields (computes delta between form states)
 *
 * Coverage includes:
 * - Happy path scenarios
 * - Edge cases (null, empty, unknown values)
 * - Round-trip conversions (DB -> UI -> DB)
 * - Data integrity preservation
 *
 * @module __tests__/onboarding/prefsMapping
 */

import {
  toFormData,
  toPrefsRow,
  toUpdatePayload,
  hasAnyData,
  getChangedFields,
} from '../../src/features/onboarding/utils/prefsMapping';
import {
  DEFAULT_PREFS_FORM_DATA,
  type PrefsRow,
  type PrefsFormData,
} from '../../src/features/onboarding/utils/prefsTypes';

describe('prefsMapping', () => {
  const mockUserId = 'test-user-123';

  describe('toFormData', () => {
    describe('null/undefined handling', () => {
      it('returns default form data when row is null', () => {
        const result = toFormData(null);
        expect(result).toEqual(DEFAULT_PREFS_FORM_DATA);
      });
    });

    describe('colour preferences mapping', () => {
      it('maps ["neutrals"] to neutrals tendency', () => {
        const row: PrefsRow = {
          user_id: mockUserId,
          colour_prefs: ['neutrals'],
          exclusions: [],
          no_repeat_days: null,
          no_repeat_mode: 'item',
          comfort_notes: null,
        };
        const result = toFormData(row);
        expect(result.colourTendency).toBe('neutrals');
      });

      it('maps ["some_colour"] to some_colour tendency', () => {
        const row: PrefsRow = {
          user_id: mockUserId,
          colour_prefs: ['some_colour'],
          exclusions: [],
          no_repeat_days: null,
          no_repeat_mode: 'item',
          comfort_notes: null,
        };
        const result = toFormData(row);
        expect(result.colourTendency).toBe('some_colour');
      });

      it('maps ["bold_colours"] to bold_colours tendency', () => {
        const row: PrefsRow = {
          user_id: mockUserId,
          colour_prefs: ['bold_colours'],
          exclusions: [],
          no_repeat_days: null,
          no_repeat_mode: 'item',
          comfort_notes: null,
        };
        const result = toFormData(row);
        expect(result.colourTendency).toBe('bold_colours');
      });

      it('maps empty array to not_sure', () => {
        const row: PrefsRow = {
          user_id: mockUserId,
          colour_prefs: [],
          exclusions: [],
          no_repeat_days: null,
          no_repeat_mode: 'item',
          comfort_notes: null,
        };
        const result = toFormData(row);
        expect(result.colourTendency).toBe('not_sure');
      });

      it('maps unknown tag to not_sure (graceful degradation)', () => {
        const row: PrefsRow = {
          user_id: mockUserId,
          colour_prefs: ['unknown_tag'],
          exclusions: [],
          no_repeat_days: null,
          no_repeat_mode: 'item',
          comfort_notes: null,
        };
        const result = toFormData(row);
        expect(result.colourTendency).toBe('not_sure');
      });

      it('uses first known tag when multiple tags present', () => {
        const row: PrefsRow = {
          user_id: mockUserId,
          colour_prefs: ['neutrals', 'some_colour'],
          exclusions: [],
          no_repeat_days: null,
          no_repeat_mode: 'item',
          comfort_notes: null,
        };
        const result = toFormData(row);
        expect(result.colourTendency).toBe('neutrals');
      });

      it('uses first known tag when unknown tags precede known tags', () => {
        const row: PrefsRow = {
          user_id: mockUserId,
          colour_prefs: ['unknown', 'some_colour', 'neutrals'],
          exclusions: [],
          no_repeat_days: null,
          no_repeat_mode: 'item',
          comfort_notes: null,
        };
        const result = toFormData(row);
        expect(result.colourTendency).toBe('some_colour');
      });
    });

    describe('exclusions mapping', () => {
      it('maps checklist tags correctly', () => {
        const row: PrefsRow = {
          user_id: mockUserId,
          colour_prefs: [],
          exclusions: ['skirts', 'heels'],
          no_repeat_days: null,
          no_repeat_mode: 'item',
          comfort_notes: null,
        };
        const result = toFormData(row);
        expect(result.exclusions.checklist).toEqual(['skirts', 'heels']);
        expect(result.exclusions.freeText).toBe('');
      });

      it('extracts free-text with prefix stripped', () => {
        const row: PrefsRow = {
          user_id: mockUserId,
          colour_prefs: [],
          exclusions: ['free:no wool'],
          no_repeat_days: null,
          no_repeat_mode: 'item',
          comfort_notes: null,
        };
        const result = toFormData(row);
        expect(result.exclusions.checklist).toEqual([]);
        expect(result.exclusions.freeText).toBe('no wool');
      });

      it('joins multiple free-text entries with newlines', () => {
        const row: PrefsRow = {
          user_id: mockUserId,
          colour_prefs: [],
          exclusions: ['free:no wool', 'free:no silk'],
          no_repeat_days: null,
          no_repeat_mode: 'item',
          comfort_notes: null,
        };
        const result = toFormData(row);
        expect(result.exclusions.freeText).toBe('no wool\nno silk');
      });

      it('handles mixed checklist and free-text', () => {
        const row: PrefsRow = {
          user_id: mockUserId,
          colour_prefs: [],
          exclusions: ['skirts', 'free:no wool', 'heels'],
          no_repeat_days: null,
          no_repeat_mode: 'item',
          comfort_notes: null,
        };
        const result = toFormData(row);
        expect(result.exclusions.checklist).toEqual(['skirts', 'heels']);
        expect(result.exclusions.freeText).toBe('no wool');
      });

      it('ignores unknown tags silently', () => {
        const row: PrefsRow = {
          user_id: mockUserId,
          colour_prefs: [],
          exclusions: ['skirts', 'unknown_tag', 'heels'],
          no_repeat_days: null,
          no_repeat_mode: 'item',
          comfort_notes: null,
        };
        const result = toFormData(row);
        expect(result.exclusions.checklist).toEqual(['skirts', 'heels']);
      });

      it('filters out empty free-text entries', () => {
        const row: PrefsRow = {
          user_id: mockUserId,
          colour_prefs: [],
          exclusions: ['free:', 'free:  ', 'free:valid'],
          no_repeat_days: null,
          no_repeat_mode: 'item',
          comfort_notes: null,
        };
        const result = toFormData(row);
        expect(result.exclusions.freeText).toBe('valid');
      });

      it('maps empty exclusions array', () => {
        const row: PrefsRow = {
          user_id: mockUserId,
          colour_prefs: [],
          exclusions: [],
          no_repeat_days: null,
          no_repeat_mode: 'item',
          comfort_notes: null,
        };
        const result = toFormData(row);
        expect(result.exclusions.checklist).toEqual([]);
        expect(result.exclusions.freeText).toBe('');
      });
    });

    describe('no-repeat window mapping', () => {
      it('maps 0 to 0', () => {
        const row: PrefsRow = {
          user_id: mockUserId,
          colour_prefs: [],
          exclusions: [],
          no_repeat_days: 0,
          no_repeat_mode: 'item',
          comfort_notes: null,
        };
        const result = toFormData(row);
        expect(result.noRepeatWindow).toBe(0);
      });

      it('maps 1-10 range to 7', () => {
        for (let days = 1; days <= 10; days++) {
          const row: PrefsRow = {
            user_id: mockUserId,
            colour_prefs: [],
            exclusions: [],
            no_repeat_days: days,
            no_repeat_mode: 'item',
            comfort_notes: null,
          };
          const result = toFormData(row);
          expect(result.noRepeatWindow).toBe(7);
        }
      });

      it('maps 11-21 range to 14', () => {
        for (let days = 11; days <= 21; days++) {
          const row: PrefsRow = {
            user_id: mockUserId,
            colour_prefs: [],
            exclusions: [],
            no_repeat_days: days,
            no_repeat_mode: 'item',
            comfort_notes: null,
          };
          const result = toFormData(row);
          expect(result.noRepeatWindow).toBe(14);
        }
      });

      it('maps 22+ to null (out of range)', () => {
        const row: PrefsRow = {
          user_id: mockUserId,
          colour_prefs: [],
          exclusions: [],
          no_repeat_days: 30,
          no_repeat_mode: 'item',
          comfort_notes: null,
        };
        const result = toFormData(row);
        expect(result.noRepeatWindow).toBeNull();
      });

      it('maps negative numbers to null', () => {
        const row: PrefsRow = {
          user_id: mockUserId,
          colour_prefs: [],
          exclusions: [],
          no_repeat_days: -5,
          no_repeat_mode: 'item',
          comfort_notes: null,
        };
        const result = toFormData(row);
        expect(result.noRepeatWindow).toBeNull();
      });

      it('maps null to null', () => {
        const row: PrefsRow = {
          user_id: mockUserId,
          colour_prefs: [],
          exclusions: [],
          no_repeat_days: null,
          no_repeat_mode: 'item',
          comfort_notes: null,
        };
        const result = toFormData(row);
        expect(result.noRepeatWindow).toBeNull();
      });
    });

    describe('comfort notes mapping', () => {
      it('maps notes as-is', () => {
        const row: PrefsRow = {
          user_id: mockUserId,
          colour_prefs: [],
          exclusions: [],
          no_repeat_days: null,
          no_repeat_mode: 'item',
          comfort_notes: 'no tight waistbands',
        };
        const result = toFormData(row);
        expect(result.comfortNotes).toBe('no tight waistbands');
      });

      it('trims whitespace from notes', () => {
        const row: PrefsRow = {
          user_id: mockUserId,
          colour_prefs: [],
          exclusions: [],
          no_repeat_days: null,
          no_repeat_mode: 'item',
          comfort_notes: '  spaces  ',
        };
        const result = toFormData(row);
        expect(result.comfortNotes).toBe('spaces');
      });

      it('maps null to empty string', () => {
        const row: PrefsRow = {
          user_id: mockUserId,
          colour_prefs: [],
          exclusions: [],
          no_repeat_days: null,
          no_repeat_mode: 'item',
          comfort_notes: null,
        };
        const result = toFormData(row);
        expect(result.comfortNotes).toBe('');
      });

      it('maps empty string to empty string', () => {
        const row: PrefsRow = {
          user_id: mockUserId,
          colour_prefs: [],
          exclusions: [],
          no_repeat_days: null,
          no_repeat_mode: 'item',
          comfort_notes: '',
        };
        const result = toFormData(row);
        expect(result.comfortNotes).toBe('');
      });
    });
  });

  describe('toPrefsRow', () => {
    it('includes user_id', () => {
      const form: PrefsFormData = DEFAULT_PREFS_FORM_DATA;
      const result = toPrefsRow(form, mockUserId);
      expect(result.user_id).toBe(mockUserId);
    });

    it('maps neutrals tendency to ["neutrals"]', () => {
      const form: PrefsFormData = {
        ...DEFAULT_PREFS_FORM_DATA,
        colourTendency: 'neutrals',
      };
      const result = toPrefsRow(form, mockUserId);
      expect(result.colour_prefs).toEqual(['neutrals']);
    });

    it('maps not_sure tendency to empty array', () => {
      const form: PrefsFormData = {
        ...DEFAULT_PREFS_FORM_DATA,
        colourTendency: 'not_sure',
      };
      const result = toPrefsRow(form, mockUserId);
      expect(result.colour_prefs).toEqual([]);
    });

    it('maps checklist exclusions correctly', () => {
      const form: PrefsFormData = {
        ...DEFAULT_PREFS_FORM_DATA,
        exclusions: {
          checklist: ['skirts', 'heels'],
          freeText: '',
        },
      };
      const result = toPrefsRow(form, mockUserId);
      expect(result.exclusions).toEqual(['skirts', 'heels']);
    });

    it('maps free-text exclusions with prefix', () => {
      const form: PrefsFormData = {
        ...DEFAULT_PREFS_FORM_DATA,
        exclusions: {
          checklist: [],
          freeText: 'no wool',
        },
      };
      const result = toPrefsRow(form, mockUserId);
      expect(result.exclusions).toEqual(['free:no wool']);
    });

    it('splits multi-line free-text into separate entries', () => {
      const form: PrefsFormData = {
        ...DEFAULT_PREFS_FORM_DATA,
        exclusions: {
          checklist: [],
          freeText: 'no wool\nno silk',
        },
      };
      const result = toPrefsRow(form, mockUserId);
      expect(result.exclusions).toEqual(['free:no wool', 'free:no silk']);
    });

    it('combines checklist and free-text exclusions', () => {
      const form: PrefsFormData = {
        ...DEFAULT_PREFS_FORM_DATA,
        exclusions: {
          checklist: ['skirts'],
          freeText: 'no wool',
        },
      };
      const result = toPrefsRow(form, mockUserId);
      expect(result.exclusions).toEqual(['skirts', 'free:no wool']);
    });

    it('filters empty lines from free-text', () => {
      const form: PrefsFormData = {
        ...DEFAULT_PREFS_FORM_DATA,
        exclusions: {
          checklist: [],
          freeText: 'no wool\n\n  \nno silk',
        },
      };
      const result = toPrefsRow(form, mockUserId);
      expect(result.exclusions).toEqual(['free:no wool', 'free:no silk']);
    });

    it('avoids double-prefixing if user typed "free:"', () => {
      const form: PrefsFormData = {
        ...DEFAULT_PREFS_FORM_DATA,
        exclusions: {
          checklist: [],
          freeText: 'free:no wool',
        },
      };
      const result = toPrefsRow(form, mockUserId);
      expect(result.exclusions).toEqual(['free:no wool']);
    });

    it('maps no-repeat days correctly', () => {
      const testCases: [number, number][] = [
        [0, 0],
        [7, 7],
        [14, 14],
        [30, 30],
      ];

      testCases.forEach(([input, expected]) => {
        const form: PrefsFormData = {
          ...DEFAULT_PREFS_FORM_DATA,
          noRepeatDays: input,
        };
        const result = toPrefsRow(form, mockUserId);
        expect(result.no_repeat_days).toBe(expected);
      });
    });

    it('maps comfort notes to database format', () => {
      const form: PrefsFormData = {
        ...DEFAULT_PREFS_FORM_DATA,
        comfortNotes: 'no tight waistbands',
      };
      const result = toPrefsRow(form, mockUserId);
      expect(result.comfort_notes).toBe('no tight waistbands');
    });

    it('maps empty notes to null', () => {
      const form: PrefsFormData = {
        ...DEFAULT_PREFS_FORM_DATA,
        comfortNotes: '',
      };
      const result = toPrefsRow(form, mockUserId);
      expect(result.comfort_notes).toBeNull();
    });

    it('trims and maps whitespace-only notes to null', () => {
      const form: PrefsFormData = {
        ...DEFAULT_PREFS_FORM_DATA,
        comfortNotes: '   ',
      };
      const result = toPrefsRow(form, mockUserId);
      expect(result.comfort_notes).toBeNull();
    });
  });

  describe('toUpdatePayload', () => {
    it('excludes user_id from payload', () => {
      const form: PrefsFormData = DEFAULT_PREFS_FORM_DATA;
      const result = toUpdatePayload(form);
      expect(result).not.toHaveProperty('user_id');
    });

    it('excludes created_at from payload', () => {
      const form: PrefsFormData = DEFAULT_PREFS_FORM_DATA;
      const result = toUpdatePayload(form);
      expect(result).not.toHaveProperty('created_at');
    });

    it('excludes updated_at from payload', () => {
      const form: PrefsFormData = DEFAULT_PREFS_FORM_DATA;
      const result = toUpdatePayload(form);
      expect(result).not.toHaveProperty('updated_at');
    });

    it('includes all updatable fields', () => {
      const form: PrefsFormData = {
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
      const result = toUpdatePayload(form);
      expect(result).toHaveProperty('colour_prefs');
      expect(result).toHaveProperty('exclusions');
      expect(result).toHaveProperty('no_repeat_days');
      expect(result).toHaveProperty('comfort_notes');
    });
  });

  describe('hasAnyData', () => {
    it('returns false for default form data', () => {
      const result = hasAnyData(DEFAULT_PREFS_FORM_DATA);
      expect(result).toBe(false);
    });

    it('returns true when colour tendency is set', () => {
      const form: PrefsFormData = {
        ...DEFAULT_PREFS_FORM_DATA,
        colourTendency: 'neutrals',
      };
      const result = hasAnyData(form);
      expect(result).toBe(true);
    });

    it('returns true when checklist exclusions present', () => {
      const form: PrefsFormData = {
        ...DEFAULT_PREFS_FORM_DATA,
        exclusions: {
          checklist: ['skirts'],
          freeText: '',
        },
      };
      const result = hasAnyData(form);
      expect(result).toBe(true);
    });

    it('returns true when free-text exclusions present', () => {
      const form: PrefsFormData = {
        ...DEFAULT_PREFS_FORM_DATA,
        exclusions: {
          checklist: [],
          freeText: 'no wool',
        },
      };
      const result = hasAnyData(form);
      expect(result).toBe(true);
    });

    it('returns true when no-repeat window is set', () => {
      const form: PrefsFormData = {
        ...DEFAULT_PREFS_FORM_DATA,
        noRepeatWindow: 7,
        noRepeatDays: 7,
        noRepeatMode: 'item',
      };
      const result = hasAnyData(form);
      expect(result).toBe(true);
    });

    it('returns true when comfort notes present', () => {
      const form: PrefsFormData = {
        ...DEFAULT_PREFS_FORM_DATA,
        comfortNotes: 'test notes',
      };
      const result = hasAnyData(form);
      expect(result).toBe(true);
    });

    it('returns false when only whitespace in free-text', () => {
      const form: PrefsFormData = {
        ...DEFAULT_PREFS_FORM_DATA,
        exclusions: {
          checklist: [],
          freeText: '   ',
        },
      };
      const result = hasAnyData(form);
      expect(result).toBe(false);
    });

    it('returns false when only whitespace in comfort notes', () => {
      const form: PrefsFormData = {
        ...DEFAULT_PREFS_FORM_DATA,
        comfortNotes: '   ',
      };
      const result = hasAnyData(form);
      expect(result).toBe(false);
    });
  });

  describe('getChangedFields', () => {
    it('returns empty object when no changes', () => {
      const current = DEFAULT_PREFS_FORM_DATA;
      const previous = DEFAULT_PREFS_FORM_DATA;
      const result = getChangedFields(current, previous);
      expect(Object.keys(result)).toHaveLength(0);
    });

    it('detects colour tendency change', () => {
      const previous = DEFAULT_PREFS_FORM_DATA;
      const current = { ...DEFAULT_PREFS_FORM_DATA, colourTendency: 'neutrals' as const };
      const result = getChangedFields(current, previous);
      expect(result).toHaveProperty('colour_prefs');
      expect(result.colour_prefs).toEqual(['neutrals']);
    });

    it('detects checklist exclusions change', () => {
      const previous = DEFAULT_PREFS_FORM_DATA;
      const current = {
        ...DEFAULT_PREFS_FORM_DATA,
        exclusions: { checklist: ['skirts' as const], freeText: '' },
      };
      const result = getChangedFields(current, previous);
      expect(result).toHaveProperty('exclusions');
      expect(result.exclusions).toEqual(['skirts']);
    });

    it('detects free-text exclusions change', () => {
      const previous = DEFAULT_PREFS_FORM_DATA;
      const current = {
        ...DEFAULT_PREFS_FORM_DATA,
        exclusions: { checklist: [], freeText: 'no wool' },
      };
      const result = getChangedFields(current, previous);
      expect(result).toHaveProperty('exclusions');
      expect(result.exclusions).toEqual(['free:no wool']);
    });

    it('detects no-repeat days change', () => {
      const previous = DEFAULT_PREFS_FORM_DATA;
      const current = { ...DEFAULT_PREFS_FORM_DATA, noRepeatDays: 14 };
      const result = getChangedFields(current, previous);
      expect(result).toHaveProperty('no_repeat_days');
      expect(result.no_repeat_days).toBe(14);
    });

    it('detects no-repeat mode change', () => {
      const previous = DEFAULT_PREFS_FORM_DATA;
      const current = { ...DEFAULT_PREFS_FORM_DATA, noRepeatMode: 'outfit' as const };
      const result = getChangedFields(current, previous);
      expect(result).toHaveProperty('no_repeat_mode');
      expect(result.no_repeat_mode).toBe('outfit');
    });

    it('detects comfort notes change', () => {
      const previous = DEFAULT_PREFS_FORM_DATA;
      const current = { ...DEFAULT_PREFS_FORM_DATA, comfortNotes: 'test notes' };
      const result = getChangedFields(current, previous);
      expect(result).toHaveProperty('comfort_notes');
      expect(result.comfort_notes).toBe('test notes');
    });

    it('detects multiple changes', () => {
      const previous = DEFAULT_PREFS_FORM_DATA;
      const current: PrefsFormData = {
        colourTendency: 'neutrals',
        exclusions: { checklist: ['skirts'], freeText: '' },
        noRepeatWindow: 14,
        noRepeatDays: 14,
        noRepeatMode: 'item',
        comfortNotes: 'test notes',
      };
      const result = getChangedFields(current, previous);
      expect(Object.keys(result)).toHaveLength(4);
    });

    it('ignores whitespace-only changes in comfort notes', () => {
      const previous = { ...DEFAULT_PREFS_FORM_DATA, comfortNotes: '' };
      const current = { ...DEFAULT_PREFS_FORM_DATA, comfortNotes: '   ' };
      const result = getChangedFields(current, previous);
      expect(result).not.toHaveProperty('comfort_notes');
    });

    it('handles checklist order changes correctly', () => {
      const previous: PrefsFormData = {
        ...DEFAULT_PREFS_FORM_DATA,
        exclusions: { checklist: ['skirts', 'heels'], freeText: '' },
      };
      const current: PrefsFormData = {
        ...DEFAULT_PREFS_FORM_DATA,
        exclusions: { checklist: ['heels', 'skirts'], freeText: '' },
      };
      const result = getChangedFields(current, previous);
      // Should not detect as change (order doesn't matter)
      expect(result).not.toHaveProperty('exclusions');
    });
  });

  describe('round-trip conversions', () => {
    it('preserves data through DB -> UI -> DB conversion', () => {
      const originalRow: PrefsRow = {
        user_id: mockUserId,
        colour_prefs: ['neutrals'],
        exclusions: ['skirts', 'free:no wool'],
        no_repeat_days: 14,
        no_repeat_mode: 'outfit',
        comfort_notes: 'test notes',
      };

      const formData = toFormData(originalRow);
      const reconvertedRow = toPrefsRow(formData, mockUserId);

      expect(reconvertedRow.colour_prefs).toEqual(originalRow.colour_prefs);
      expect(reconvertedRow.exclusions).toEqual(originalRow.exclusions);
      expect(reconvertedRow.no_repeat_days).toEqual(originalRow.no_repeat_days);
      expect(reconvertedRow.no_repeat_mode).toEqual(originalRow.no_repeat_mode);
      expect(reconvertedRow.comfort_notes).toEqual(originalRow.comfort_notes);
    });

    it('preserves data through UI -> DB -> UI conversion', () => {
      const originalForm: PrefsFormData = {
        colourTendency: 'some_colour',
        exclusions: {
          checklist: ['shorts', 'crop_tops'],
          freeText: 'no silk\nno lace',
        },
        noRepeatWindow: 14,
        noRepeatDays: 14,
        noRepeatMode: 'item',
        comfortNotes: 'sensitive skin',
      };

      const row = toPrefsRow(originalForm, mockUserId);
      const reconvertedForm = toFormData(row);

      expect(reconvertedForm.colourTendency).toEqual(originalForm.colourTendency);
      expect(reconvertedForm.exclusions.checklist.sort()).toEqual(
        originalForm.exclusions.checklist.sort()
      );
      expect(reconvertedForm.exclusions.freeText).toEqual(originalForm.exclusions.freeText);
      expect(reconvertedForm.noRepeatWindow).toEqual(originalForm.noRepeatWindow);
      expect(reconvertedForm.comfortNotes).toEqual(originalForm.comfortNotes);
    });
  });
});
