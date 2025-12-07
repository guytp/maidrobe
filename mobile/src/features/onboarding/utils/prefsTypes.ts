/**
 * @fileoverview Preferences domain types and constants.
 *
 * Defines type-safe interfaces for user preferences, including:
 * - Database schema types (PrefsRow - snake_case)
 * - UI view model types (PrefsFormData - camelCase)
 * - Canonical tag constants for exclusions and colour preferences
 * - No-repeat window and mode settings for outfit recommendations
 *
 * The type system enforces:
 * - Strict enum types for colour tendencies and exclusions
 * - Literal types for no-repeat windows (0, 3, 7, 14, 30, or null for presets)
 * - No-repeat mode ('item' or 'outfit') for repeat avoidance granularity
 * - Clear separation between database and UI representations
 *
 * @module features/onboarding/utils/prefsTypes
 */

/**
 * Canonical exclusion tags supported by the app.
 *
 * These correspond to common clothing items users may want to exclude
 * from outfit recommendations. Tags are stored in lowercase with underscores.
 *
 * Usage:
 * - UI displays friendly names (e.g., "Crop tops")
 * - Database stores canonical tags (e.g., "crop_tops")
 * - Mapping layer handles conversion
 */
export const EXCLUSION_TAGS = [
  'skirts',
  'shorts',
  'crop_tops',
  'heels',
  'suits_blazers',
  'sleeveless_tops',
] as const;

/**
 * Type-safe exclusion tag derived from canonical tags array.
 *
 * Using const assertion and typeof ensures this type automatically
 * stays in sync with EXCLUSION_TAGS array modifications.
 */
export type ExclusionTag = (typeof EXCLUSION_TAGS)[number];

/**
 * Canonical colour preference tags (database values).
 *
 * Stored in database colour_prefs array. Future-proofed as array
 * to support multiple colour tendencies if needed.
 *
 * Current approach: Single-select UI, array storage.
 */
export const COLOUR_TAGS = ['neutrals', 'some_colour', 'bold_colours'] as const;

/**
 * Type-safe colour tag derived from canonical tags array.
 */
export type ColourTag = (typeof COLOUR_TAGS)[number];

/**
 * Colour tendency options for UI.
 *
 * Maps to colour_prefs array in database:
 * - 'neutrals': User prefers neutral colours
 * - 'some_colour': User enjoys occasional colour
 * - 'bold_colours': User loves bold, vibrant colours
 * - 'not_sure': User hasn't decided (stored as empty array)
 */
export type ColourTendency = ColourTag | 'not_sure';

/**
 * No-repeat window preset options (in days) for UI buttons.
 *
 * Represents preset options for the no-repeat window:
 * - 0: Okay with immediate repeats (Off)
 * - 3: Avoid repeats within 3 days
 * - 7: Avoid repeats within ~1 week (default)
 * - 14: Avoid repeats within ~2 weeks
 * - 30: Avoid repeats within ~1 month
 * - null: No preference set (uses default)
 *
 * These are the preset button values in the UI.
 * The Advanced section allows custom values 0-90.
 */
export type NoRepeatWindowPreset = 0 | 3 | 7 | 14 | 30 | null;

/**
 * Legacy no-repeat window preset options.
 *
 * @deprecated Since Story #446 (2025-Q1). Use NoRepeatWindowPreset for preset buttons
 * and noRepeatDays (number) for the actual value.
 *
 * Migration guide:
 * - Replace NoRepeatWindow type with NoRepeatWindowPreset (adds 3 and 30 day options)
 * - Replace noRepeatWindow field with noRepeatDays (number, 0-90 range)
 * - The legacy 0/7/14/null bucket mapping is no longer needed; use exact days directly
 *
 * This type will be removed in a future release once all usages are migrated.
 * Remaining usages: PrefsFormData.noRepeatWindow, onboarding PrefsScreen.
 *
 * @see NoRepeatWindowPreset for the updated preset type
 * @see PrefsFormData.noRepeatDays for the replacement field
 */
export type NoRepeatWindow = 0 | 7 | 14 | null;

/**
 * No-repeat mode options for repeat avoidance granularity.
 *
 * Determines how the no-repeat window is applied:
 * - 'item': Avoid repeating key individual items within the window (recommended)
 * - 'outfit': Only avoid repeating the exact same outfit combination
 *
 * Default is 'item' which provides more variety in recommendations.
 */
export const NO_REPEAT_MODES = ['item', 'outfit'] as const;

/**
 * Type-safe no-repeat mode derived from modes array.
 */
export type NoRepeatMode = (typeof NO_REPEAT_MODES)[number];

/**
 * Preset options for the no-repeat window UI buttons.
 *
 * Each preset maps to a specific number of days:
 * - 'off' → 0 days
 * - '3days' → 3 days
 * - '7days' → 7 days (default)
 * - '14days' → 14 days
 * - '30days' → 30 days
 */
export const NO_REPEAT_PRESET_VALUES = {
  off: 0,
  '3days': 3,
  '7days': 7,
  '14days': 14,
  '30days': 30,
} as const;

/**
 * Default no-repeat days value for new users.
 * 7 days provides a good balance of variety without being too restrictive.
 */
export const DEFAULT_NO_REPEAT_DAYS = 7;

/**
 * Default no-repeat mode for new users.
 * 'item' mode is recommended as it provides more variety.
 */
export const DEFAULT_NO_REPEAT_MODE: NoRepeatMode = 'item';

/**
 * Maximum allowed value for no-repeat days in UI input.
 * Higher values may be impractical for small wardrobes.
 */
export const MAX_NO_REPEAT_DAYS_UI = 90;

/**
 * Maximum allowed value for no-repeat days in database.
 * Allows buffer for future expansion beyond UI limits.
 */
export const MAX_NO_REPEAT_DAYS_DB = 180;

/**
 * Minimum allowed value for no-repeat days.
 * 0 means "off" (okay with immediate repeats).
 */
export const MIN_NO_REPEAT_DAYS = 0;

/**
 * Exclusions data split into checklist and free-text.
 *
 * This structure separates:
 * - checklist: Known tags from EXCLUSION_TAGS
 * - freeText: User-entered custom exclusions
 *
 * Database representation:
 * - Checklist tags stored as-is (e.g., "skirts")
 * - Free-text entries prefixed with "free:" (e.g., "free:no wool")
 *
 * Free-text format:
 * - Newline-separated entries in UI
 * - Each line becomes separate "free:" entry in database
 * - Empty lines filtered out
 * - Trimmed before storage
 */
export interface ExclusionsData {
  /** Known exclusion tags selected from checklist */
  checklist: ExclusionTag[];
  /** User-entered free-text exclusions (newline-separated) */
  freeText: string;
}

/**
 * UI-facing form data for preferences screen.
 *
 * This is the view model used by PrefsScreen component.
 * All fields have sensible defaults for new users.
 *
 * Field constraints:
 * - colourTendency: Required, defaults to 'not_sure'
 * - exclusions.checklist: Array of valid ExclusionTag values
 * - exclusions.freeText: String, max combined length validated separately
 * - noRepeatWindow: 0, 7, 14, or null (deprecated, use noRepeatDays)
 * - noRepeatDays: Number 0-90 for custom input, or preset value
 * - noRepeatMode: 'item' or 'outfit' for repeat avoidance granularity
 * - comfortNotes: String, max 500 characters
 *
 * Validation:
 * - Runtime validation via Zod schemas in prefsValidation.ts
 * - Compile-time type safety via TypeScript
 */
export interface PrefsFormData {
  /** User's colour tendency preference */
  colourTendency: ColourTendency;
  /** Items/styles user never wears */
  exclusions: ExclusionsData;
  /**
   * Days to wait before repeating outfits (legacy preset bucket).
   *
   * @deprecated Since Story #446 (2025-Q1). Use noRepeatDays for the actual value.
   *
   * This field used coarse buckets (0, 7, 14) while noRepeatDays stores exact values (0-90).
   * The field will be made optional, then removed in a future release.
   *
   * Migration: Remove this field from form state; read/write noRepeatDays directly.
   */
  noRepeatWindow: NoRepeatWindow;
  /**
   * Exact number of days to wait before repeating items/outfits.
   * Range: 0-90 in UI (0 = off, allows immediate repeats).
   * This is the actual value stored in the database.
   */
  noRepeatDays: number;
  /**
   * Granularity of repeat avoidance.
   * - 'item': Avoid repeating key individual items (recommended)
   * - 'outfit': Only avoid exact outfit combinations
   */
  noRepeatMode: NoRepeatMode;
  /** Free-text comfort and style notes */
  comfortNotes: string;
}

/**
 * Supabase prefs table row structure.
 *
 * Matches database schema with snake_case naming convention.
 * All fields except user_id are nullable/optional to support partial updates.
 *
 * Schema:
 * ```sql
 * CREATE TABLE prefs (
 *   user_id UUID PRIMARY KEY REFERENCES auth.users(id),
 *   no_repeat_days INTEGER NOT NULL DEFAULT 7 CHECK (0-180),
 *   no_repeat_mode TEXT NOT NULL DEFAULT 'item' CHECK ('item', 'outfit'),
 *   colour_prefs TEXT[] NOT NULL DEFAULT '{}',
 *   exclusions TEXT[] NOT NULL DEFAULT '{}',
 *   comfort_notes TEXT,
 *   created_at TIMESTAMPTZ DEFAULT NOW(),
 *   updated_at TIMESTAMPTZ DEFAULT NOW()
 * );
 * ```
 *
 * Row Level Security:
 * - Users can only access their own prefs row
 * - RLS policies enforce auth.uid() = user_id
 */
export interface PrefsRow {
  /** User ID (UUID) - primary key, foreign key to auth.users */
  user_id: string;
  /** Number of days before allowing outfit repeats (0 = okay with repeats). Default: 7 */
  no_repeat_days: number | null;
  /**
   * Granularity of repeat avoidance. Default: 'item'
   * - 'item': Avoid repeating key individual items
   * - 'outfit': Only avoid exact outfit combinations
   */
  no_repeat_mode: NoRepeatMode;
  /** Array of colour preference tags */
  colour_prefs: string[];
  /** Array of exclusion tags (checklist + "free:" prefixed entries) */
  exclusions: string[];
  /** Free-text comfort and style notes */
  comfort_notes: string | null;
  /** Row creation timestamp (managed by database) */
  created_at?: string;
  /** Row last update timestamp (managed by database) */
  updated_at?: string;
}

/**
 * Partial prefs for create/update operations.
 *
 * Omits system-managed fields (user_id, created_at, updated_at).
 * All fields are optional to support partial updates (PATCH semantics).
 *
 * Usage:
 * - INSERT: Include all desired fields, omit user_id (added separately)
 * - UPDATE: Include only changed fields
 * - PATCH: Include only fields user modified on this screen
 */
export type PrefsUpdatePayload = Omit<Partial<PrefsRow>, 'user_id' | 'created_at' | 'updated_at'>;

/**
 * Default form data for new users.
 *
 * Used when:
 * - No prefs record exists in database
 * - Database fetch fails (offline scenario)
 * - User explicitly resets preferences
 *
 * Default no-repeat settings:
 * - noRepeatDays: 7 (one week window)
 * - noRepeatMode: 'item' (avoid repeating individual items)
 *
 * These defaults provide good variety without being too restrictive.
 */
export const DEFAULT_PREFS_FORM_DATA: PrefsFormData = {
  colourTendency: 'not_sure',
  exclusions: {
    checklist: [],
    freeText: '',
  },
  noRepeatWindow: null,
  noRepeatDays: DEFAULT_NO_REPEAT_DAYS,
  noRepeatMode: DEFAULT_NO_REPEAT_MODE,
  comfortNotes: '',
};
