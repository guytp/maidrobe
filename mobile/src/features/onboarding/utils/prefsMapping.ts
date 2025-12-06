/**
 * @fileoverview Bidirectional mapping between database and UI representations of prefs.
 *
 * Provides deterministic, reversible transformations between:
 * - PrefsRow (database schema, snake_case)
 * - PrefsFormData (UI view model, camelCase)
 *
 * Key functions:
 * - toFormData: Database -> UI (with fallback to defaults)
 * - toPrefsRow: UI -> Database (complete row for INSERT)
 * - toUpdatePayload: UI -> Database (partial for UPDATE)
 * - hasAnyData: Check if form differs from defaults
 * - getChangedFields: Compute delta between form states
 *
 * All mappings handle edge cases gracefully and preserve data integrity.
 *
 * @module features/onboarding/utils/prefsMapping
 */

import {
  EXCLUSION_TAGS,
  COLOUR_TAGS,
  NO_REPEAT_MODES,
  DEFAULT_PREFS_FORM_DATA,
  DEFAULT_NO_REPEAT_DAYS,
  DEFAULT_NO_REPEAT_MODE,
  type PrefsRow,
  type PrefsFormData,
  type PrefsUpdatePayload,
  type ColourTendency,
  type ExclusionsData,
  type NoRepeatWindow,
  type NoRepeatMode,
  type ExclusionTag,
} from './prefsTypes';

/**
 * Free-text prefix used to distinguish user-entered exclusions from canonical tags.
 *
 * Convention:
 * - Checklist tags stored as-is: "skirts"
 * - Free-text entries prefixed: "free:no wool"
 *
 * This allows mixing both types in the same database array while
 * maintaining the ability to separate them in the UI.
 */
const FREE_TEXT_PREFIX = 'free:';

/**
 * Maps colour preferences array from database to UI colour tendency.
 *
 * Strategy:
 * - Single-select UI (one tendency)
 * - Array storage in database (future-proof for multi-select)
 * - First recognized tag wins
 * - Unknown/empty defaults to 'not_sure'
 *
 * Examples:
 * - ["neutrals"] -> 'neutrals'
 * - ["some_colour"] -> 'some_colour'
 * - ["bold_colours"] -> 'bold_colours'
 * - [] -> 'not_sure'
 * - null -> 'not_sure'
 * - ["unknown_tag"] -> 'not_sure'
 * - ["neutrals", "some_colour"] -> 'neutrals' (first wins)
 *
 * @param tags - Colour preference tags from database (can be null or empty)
 * @returns UI colour tendency enum value
 */
function mapColourPrefsToTendency(tags: string[] | null): ColourTendency {
  if (!tags || tags.length === 0) {
    return 'not_sure';
  }

  // Find first known tag
  for (const tag of tags) {
    if (COLOUR_TAGS.includes(tag as never)) {
      return tag as ColourTendency;
    }
  }

  // No known tags found, default to not_sure
  return 'not_sure';
}

/**
 * Maps UI colour tendency to database colour preferences array.
 *
 * Reverse of mapColourPrefsToTendency.
 *
 * Examples:
 * - 'neutrals' -> ["neutrals"]
 * - 'some_colour' -> ["some_colour"]
 * - 'bold_colours' -> ["bold_colours"]
 * - 'not_sure' -> []
 *
 * @param tendency - UI colour tendency value
 * @returns Array of colour tags for database storage
 */
function mapColourTendencyToPrefs(tendency: ColourTendency): string[] {
  if (tendency === 'not_sure') {
    return [];
  }
  return [tendency];
}

/**
 * Splits database exclusions array into checklist tags and free-text.
 *
 * Separates two types of exclusions:
 * 1. Known tags from EXCLUSION_TAGS (e.g., "skirts")
 * 2. Free-text entries with "free:" prefix (e.g., "free:no wool")
 *
 * Free-text handling:
 * - Multiple "free:" entries joined with newlines
 * - Prefix stripped when displaying to user
 * - Empty entries filtered out
 * - Preserves insertion order
 *
 * Unknown tags (not in EXCLUSION_TAGS and not "free:"):
 * - Silently ignored (graceful degradation)
 * - Prevents crashes from schema evolution
 *
 * Examples:
 * - ["skirts", "heels"] -> {checklist: ["skirts", "heels"], freeText: ""}
 * - ["free:no wool"] -> {checklist: [], freeText: "no wool"}
 * - ["skirts", "free:no wool", "free:no silk"] ->
 *     {checklist: ["skirts"], freeText: "no wool\nno silk"}
 * - [] -> {checklist: [], freeText: ""}
 * - null -> {checklist: [], freeText: ""}
 *
 * @param tags - Exclusion tags from database (can be null or empty)
 * @returns Separated checklist tags and free-text
 */
function splitExclusions(tags: string[] | null): ExclusionsData {
  if (!tags || tags.length === 0) {
    return { checklist: [], freeText: '' };
  }

  const checklist: ExclusionTag[] = [];
  const freeTextEntries: string[] = [];

  for (const tag of tags) {
    if (tag.startsWith(FREE_TEXT_PREFIX)) {
      // Extract free-text (remove prefix)
      const text = tag.slice(FREE_TEXT_PREFIX.length).trim();
      if (text) {
        freeTextEntries.push(text);
      }
    } else if (EXCLUSION_TAGS.includes(tag as never)) {
      // Known checklist tag
      checklist.push(tag as ExclusionTag);
    }
    // Unknown tags silently ignored
  }

  // Join free-text entries with newlines
  const freeText = freeTextEntries.join('\n');

  return { checklist, freeText };
}

/**
 * Joins checklist tags and free-text into database exclusions array.
 *
 * Reverse of splitExclusions.
 *
 * Free-text processing:
 * - Split by newlines
 * - Trim each line
 * - Filter empty lines
 * - Add "free:" prefix to each entry
 * - Avoid double-prefixing if user typed "free:"
 *
 * Examples:
 * - {checklist: ["skirts"], freeText: ""} -> ["skirts"]
 * - {checklist: [], freeText: "no wool"} -> ["free:no wool"]
 * - {checklist: ["skirts"], freeText: "no wool\nno silk"} ->
 *     ["skirts", "free:no wool", "free:no silk"]
 * - {checklist: [], freeText: ""} -> []
 *
 * @param data - Separated checklist and free-text from UI
 * @returns Combined array for database storage
 */
function joinExclusions(data: ExclusionsData): string[] {
  const result: string[] = [];

  // Add checklist tags as-is
  result.push(...data.checklist);

  // Process free-text
  if (data.freeText.trim()) {
    const lines = data.freeText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    for (const line of lines) {
      // Avoid double-prefixing if user typed "free:"
      if (line.startsWith(FREE_TEXT_PREFIX)) {
        result.push(line);
      } else {
        result.push(FREE_TEXT_PREFIX + line);
      }
    }
  }

  return result;
}

/**
 * Maps database no-repeat days to UI window bucket.
 *
 * Bucketing strategy:
 * - 0: Exact match (okay with repeats)
 * - 1-10: Map to 7 days (~1 week bucket)
 * - 11-21: Map to 14 days (~2 weeks bucket)
 * - Other: Map to null (out of range, user re-chooses)
 *
 * Edge cases:
 * - null: No preference -> null
 * - Negative: Invalid -> null
 * - 22+: Out of range -> null
 *
 * Rationale:
 * - Preserves exact user selections (0, 7, 14)
 * - Maps intermediate values to nearest bucket
 * - Handles data errors gracefully (negative, very large)
 *
 * Examples:
 * - 0 -> 0
 * - 5 -> 7 (1-10 bucket)
 * - 7 -> 7 (exact)
 * - 12 -> 14 (11-21 bucket)
 * - 14 -> 14 (exact)
 * - 25 -> null (out of range)
 * - -5 -> null (invalid)
 * - null -> null
 *
 * @param days - No-repeat days from database (can be null)
 * @returns UI window value (0, 7, 14, or null)
 */
function mapNoRepeatDaysToWindow(days: number | null): NoRepeatWindow {
  if (days === null || days < 0) {
    return null;
  }

  if (days === 0) {
    return 0;
  }

  if (days >= 1 && days <= 10) {
    return 7;
  }

  if (days >= 11 && days <= 21) {
    return 14;
  }

  // Out of range (22+)
  return null;
}

/**
 * Maps UI window to database no-repeat days.
 *
 * Reverse of mapNoRepeatDaysToWindow (for exact values only).
 *
 * Examples:
 * - 0 -> 0
 * - 7 -> 7
 * - 14 -> 14
 * - null -> null
 *
 * @param window - UI window value
 * @returns Exact days for database storage
 * @deprecated Use noRepeatDays directly instead of mapping from window buckets
 */
function mapNoRepeatWindowToDays(window: NoRepeatWindow): number | null {
  return window;
}

/**
 * Maps database no-repeat mode to UI form value.
 *
 * Validates that the mode is one of the known values, defaulting to 'item'
 * if the value is unknown or missing.
 *
 * Examples:
 * - 'item' -> 'item'
 * - 'outfit' -> 'outfit'
 * - 'unknown' -> 'item' (fallback to default)
 * - null/undefined -> 'item' (fallback to default)
 *
 * @param mode - No-repeat mode from database
 * @returns Valid NoRepeatMode value
 */
function mapNoRepeatModeToFormData(mode: string | null | undefined): NoRepeatMode {
  if (mode && NO_REPEAT_MODES.includes(mode as NoRepeatMode)) {
    return mode as NoRepeatMode;
  }
  return DEFAULT_NO_REPEAT_MODE;
}

/**
 * Maps database no-repeat days to UI form value.
 *
 * Handles null/undefined by returning the default value.
 * Clamps negative values to 0.
 *
 * Examples:
 * - 7 -> 7
 * - 0 -> 0
 * - null -> 7 (default)
 * - -5 -> 0 (clamped)
 *
 * @param days - No-repeat days from database (can be null)
 * @returns Valid number of days (defaults to DEFAULT_NO_REPEAT_DAYS if null)
 */
function mapNoRepeatDaysToFormData(days: number | null): number {
  if (days === null || days === undefined) {
    return DEFAULT_NO_REPEAT_DAYS;
  }
  // Clamp negative values to 0
  return Math.max(0, days);
}

/**
 * Trims comfort notes and converts null to empty string.
 *
 * UI representation uses empty string, not null.
 *
 * Examples:
 * - "some notes" -> "some notes"
 * - "  spaces  " -> "spaces"
 * - "" -> ""
 * - null -> ""
 *
 * @param notes - Comfort notes from database (can be null)
 * @returns Trimmed string for UI (never null)
 */
function trimNotes(notes: string | null): string {
  if (!notes) {
    return '';
  }
  return notes.trim();
}

/**
 * Converts UI notes to database format (null for empty).
 *
 * Database representation uses null for "no notes", not empty string.
 *
 * Examples:
 * - "some notes" -> "some notes"
 * - "  spaces  " -> "spaces" (trimmed)
 * - "" -> null
 * - "   " -> null (whitespace only)
 *
 * @param notes - Comfort notes from UI
 * @returns Trimmed string or null for database storage
 */
function notesToDatabase(notes: string): string | null {
  const trimmed = notes.trim();
  return trimmed || null;
}

/**
 * Converts database prefs row to UI form data.
 *
 * Main entry point for database -> UI transformation.
 *
 * Handles:
 * - null row (returns defaults)
 * - Missing/null fields (uses defaults)
 * - All field mappings (colour, exclusions, no-repeat days/mode, notes)
 * - Unknown/invalid values (graceful degradation)
 *
 * Guarantees:
 * - Always returns valid PrefsFormData
 * - Never throws on bad input
 * - Deterministic output for same input
 *
 * Usage:
 * ```typescript
 * const { data: row } = await supabase.from('prefs').select('*').single();
 * const formData = toFormData(row);
 * // formData ready for PrefsScreen
 * ```
 *
 * @param row - Database prefs row (can be null)
 * @returns UI-ready form data with all fields populated
 */
export function toFormData(row: PrefsRow | null): PrefsFormData {
  if (!row) {
    return DEFAULT_PREFS_FORM_DATA;
  }

  return {
    colourTendency: mapColourPrefsToTendency(row.colour_prefs),
    exclusions: splitExclusions(row.exclusions),
    noRepeatWindow: mapNoRepeatDaysToWindow(row.no_repeat_days),
    noRepeatDays: mapNoRepeatDaysToFormData(row.no_repeat_days),
    noRepeatMode: mapNoRepeatModeToFormData(row.no_repeat_mode),
    comfortNotes: trimNotes(row.comfort_notes),
  };
}

/**
 * Converts UI form data to complete database prefs row.
 *
 * Main entry point for UI -> Database transformation (INSERT).
 *
 * Creates a complete PrefsRow with:
 * - Provided user_id
 * - All fields from form data
 * - noRepeatDays used directly (noRepeatWindow is legacy/deprecated)
 * - Timestamps omitted (managed by database DEFAULT)
 *
 * Usage:
 * ```typescript
 * const row = toPrefsRow(formData, userId);
 * await supabase.from('prefs').insert(row);
 * ```
 *
 * @param form - UI form data
 * @param userId - User ID for the prefs row
 * @returns Complete database row ready for INSERT
 */
export function toPrefsRow(form: PrefsFormData, userId: string): PrefsRow {
  return {
    user_id: userId,
    colour_prefs: mapColourTendencyToPrefs(form.colourTendency),
    exclusions: joinExclusions(form.exclusions),
    no_repeat_days: form.noRepeatDays,
    no_repeat_mode: form.noRepeatMode,
    comfort_notes: notesToDatabase(form.comfortNotes),
  };
}

/**
 * Converts UI form data to partial update payload.
 *
 * Main entry point for UI -> Database transformation (UPDATE).
 *
 * Creates a PrefsUpdatePayload with:
 * - All updatable fields
 * - noRepeatDays and noRepeatMode included
 * - user_id, created_at, updated_at omitted
 *
 * Use this for full updates where all fields are replaced.
 * For partial updates (PATCH), use getChangedFields instead.
 *
 * Usage:
 * ```typescript
 * const payload = toUpdatePayload(formData);
 * await supabase.from('prefs').update(payload).eq('user_id', userId);
 * ```
 *
 * @param form - UI form data
 * @returns Partial payload ready for UPDATE
 */
export function toUpdatePayload(form: PrefsFormData): PrefsUpdatePayload {
  return {
    colour_prefs: mapColourTendencyToPrefs(form.colourTendency),
    exclusions: joinExclusions(form.exclusions),
    no_repeat_days: form.noRepeatDays,
    no_repeat_mode: form.noRepeatMode,
    comfort_notes: notesToDatabase(form.comfortNotes),
  };
}

/**
 * Checks if form data contains any meaningful user input.
 *
 * Returns false if form is completely default/empty:
 * - Colour tendency is 'not_sure'
 * - No exclusions (checklist and free-text both empty)
 * - No no-repeat days changed from default (7)
 * - No no-repeat mode changed from default ('item')
 * - No comfort notes
 *
 * Use case:
 * Determine if we should INSERT a prefs row or skip.
 * If user hasn't set any preferences, don't create empty row.
 *
 * Usage:
 * ```typescript
 * if (hasAnyData(formData)) {
 *   await supabase.from('prefs').insert(toPrefsRow(formData, userId));
 * } else {
 *   // Skip - no data to save
 * }
 * ```
 *
 * @param form - UI form data to check
 * @returns true if form has any non-default values
 */
export function hasAnyData(form: PrefsFormData): boolean {
  // Check colour tendency
  if (form.colourTendency !== 'not_sure') {
    return true;
  }

  // Check exclusions
  if (form.exclusions.checklist.length > 0 || form.exclusions.freeText.trim()) {
    return true;
  }

  // Check no-repeat days (legacy window check for backward compatibility)
  if (form.noRepeatWindow !== null) {
    return true;
  }

  // Check no-repeat days differs from default
  if (form.noRepeatDays !== DEFAULT_NO_REPEAT_DAYS) {
    return true;
  }

  // Check no-repeat mode differs from default
  if (form.noRepeatMode !== DEFAULT_NO_REPEAT_MODE) {
    return true;
  }

  // Check comfort notes
  if (form.comfortNotes.trim()) {
    return true;
  }

  return false;
}

/**
 * Computes changed fields between two form states.
 *
 * Performs deep comparison to identify which fields differ.
 * Returns only the changed fields as an update payload.
 *
 * Comparison logic:
 * - Colour tendency: Direct equality
 * - Exclusions: Deep array/string comparison
 * - No-repeat days: Direct equality
 * - No-repeat mode: Direct equality
 * - Comfort notes: Trimmed string comparison
 *
 * Use case:
 * Efficient PATCH operations that only update changed fields.
 * Reduces database writes and prevents unnecessary triggers.
 *
 * Usage:
 * ```typescript
 * const changed = getChangedFields(newFormData, oldFormData);
 * if (Object.keys(changed).length > 0) {
 *   await supabase.from('prefs').update(changed).eq('user_id', userId);
 * }
 * ```
 *
 * @param current - New form state
 * @param previous - Old form state
 * @returns Partial payload containing only changed fields
 */
export function getChangedFields(
  current: PrefsFormData,
  previous: PrefsFormData
): PrefsUpdatePayload {
  const changes: PrefsUpdatePayload = {};

  // Check colour tendency
  if (current.colourTendency !== previous.colourTendency) {
    changes.colour_prefs = mapColourTendencyToPrefs(current.colourTendency);
  }

  // Check exclusions (deep comparison)
  const exclusionsChanged =
    JSON.stringify(current.exclusions.checklist.sort()) !==
      JSON.stringify(previous.exclusions.checklist.sort()) ||
    current.exclusions.freeText.trim() !== previous.exclusions.freeText.trim();

  if (exclusionsChanged) {
    changes.exclusions = joinExclusions(current.exclusions);
  }

  // Check no-repeat days
  if (current.noRepeatDays !== previous.noRepeatDays) {
    changes.no_repeat_days = current.noRepeatDays;
  }

  // Check no-repeat mode
  if (current.noRepeatMode !== previous.noRepeatMode) {
    changes.no_repeat_mode = current.noRepeatMode;
  }

  // Check comfort notes
  if (current.comfortNotes.trim() !== previous.comfortNotes.trim()) {
    changes.comfort_notes = notesToDatabase(current.comfortNotes);
  }

  return changes;
}
