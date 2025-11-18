/**
 * @fileoverview Preferences domain types and constants.
 *
 * Defines type-safe interfaces for user preferences, including:
 * - Database schema types (PrefsRow - snake_case)
 * - UI view model types (PrefsFormData - camelCase)
 * - Canonical tag constants for exclusions and colour preferences
 *
 * The type system enforces:
 * - Strict enum types for colour tendencies and exclusions
 * - Literal types for no-repeat windows (0, 7, 14, or null)
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
 * No-repeat window options (in days).
 *
 * Represents how long user wants to wait before repeating an outfit:
 * - 0: Okay with immediate repeats
 * - 7: Avoid repeats within ~1 week
 * - 14: Avoid repeats within ~2 weeks
 * - null: No preference set
 *
 * Database stores exact number, UI uses these buckets.
 * Intermediate values (e.g., 5 days) are mapped to nearest bucket.
 */
export type NoRepeatWindow = 0 | 7 | 14 | null;

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
 * - noRepeatWindow: 0, 7, 14, or null
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
  /** Days to wait before repeating outfits */
  noRepeatWindow: NoRepeatWindow;
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
 *   no_repeat_days INTEGER,
 *   colour_prefs TEXT[],
 *   exclusions TEXT[],
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
  /** Number of days before allowing outfit repeats (0 = okay with repeats) */
  no_repeat_days: number | null;
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
 * Represents "no preferences set" state:
 * - User hasn't chosen a colour tendency
 * - User hasn't excluded anything
 * - User hasn't set a no-repeat window
 * - User hasn't entered comfort notes
 */
export const DEFAULT_PREFS_FORM_DATA: PrefsFormData = {
  colourTendency: 'not_sure',
  exclusions: {
    checklist: [],
    freeText: '',
  },
  noRepeatWindow: null,
  comfortNotes: '',
};
