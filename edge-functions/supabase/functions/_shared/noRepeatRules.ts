/**
 * No-Repeat Rules Module
 *
 * A reusable module that applies user preferences and recent wear history
 * to filter and rank outfit candidates. This module ensures recommended
 * outfits respect the user's no-repeat window by default and degrade
 * gracefully when the wardrobe or window is too constrained.
 *
 * This module is designed to be used by both the current stubbed
 * recommendation endpoint and future AI-powered recommendation engines.
 *
 * ## Time Semantics
 *
 * All date handling uses calendar days in the user's local timezone:
 * - `targetDate`: The date for which recommendations are requested (YYYY-MM-DD)
 * - `wornDate`: The date an outfit/item was worn (YYYY-MM-DD)
 * - If worn on date D with noRepeatDays=N, days D+1 through D+N are blocked
 * - From D+N+1 onward, the outfit/item is eligible again
 * - Same-day repeats on D are allowed (v1 behaviour)
 *
 * ## Modes
 *
 * - `item`: Excludes outfits containing ANY item worn within the window
 * - `outfit`: Excludes only the exact outfit if worn within the window
 *
 * @module _shared/noRepeatRules
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * Default minimum count for strict results.
 * If strict filtering returns fewer than this, fallbacks are generated.
 */
export const DEFAULT_STRICT_MIN_COUNT = 3;

// ============================================================================
// Types
// ============================================================================
//
// ## Type Duplication Strategy
//
// The `Item` and `Outfit` interfaces defined here intentionally duplicate
// similar types from `get-outfit-recommendations/types.ts`. This is a
// deliberate design decision to keep this module self-contained and reusable:
//
// - `Item` mirrors `RepeatedItemSummary` from types.ts
// - `Outfit` mirrors the `Outfit` interface from types.ts
//
// By defining minimal local interfaces, this module:
// 1. Avoids import dependencies on endpoint-specific types
// 2. Can be reused by future AI recommendation engines
// 3. Documents only the fields it actually requires
//
// ## Keeping Types in Sync
//
// If the canonical types in `types.ts` evolve (e.g., new required fields):
// 1. Assess whether this module needs the new fields
// 2. If yes, add the field to the local interface with documentation
// 3. If no, the local interface remains unchanged (consumers handle mapping)
//
// The module's interfaces are intentionally minimal - they define the shape
// this module *needs*, not the full shape the system *provides*.
// ============================================================================

/**
 * Minimal item representation for fallback metadata.
 *
 * Used to communicate which items would be repeated in fallback outfits.
 * The `name` field is optional and used for client-side display when available.
 *
 * Note: This interface mirrors `RepeatedItemSummary` from
 * `get-outfit-recommendations/types.ts`. See "Type Duplication Strategy"
 * comment above for rationale and sync guidance.
 */
export interface Item {
  /** Unique identifier for the item (UUID) */
  id: string;
  /** Optional human-readable name for client display */
  name?: string;
}

/**
 * Outfit candidate for no-repeat filtering.
 *
 * This interface defines the minimal shape required by the rules module.
 * It is compatible with the full Outfit type from the recommendation endpoint.
 *
 * Note: This interface mirrors the `Outfit` interface from
 * `get-outfit-recommendations/types.ts`. See "Type Duplication Strategy"
 * comment in the Types section header for rationale and sync guidance.
 */
export interface Outfit {
  /** Unique identifier for this outfit (UUID) */
  id: string;
  /** User ID who owns this outfit */
  userId: string;
  /** List of item identifiers comprising this outfit */
  itemIds: string[];
  /** Natural-language explanation of why this outfit works */
  reason: string;
  /** Short descriptor of usage context */
  context: string;
  /** ISO 8601 timestamp of when the suggestion was created */
  createdAt: string;
  /** Optional rating */
  rating: number | null;
}

/**
 * A single wear history entry.
 *
 * Represents one occasion when an outfit was worn. The rules module
 * uses this to determine which items/outfits are within the blocked window.
 */
export interface WearHistoryEntry {
  /** Array of item IDs that were worn in this outfit */
  itemIds: string[];
  /** Optional outfit ID (used in outfit mode for exact matching) */
  outfitId?: string;
  /** Date the outfit was worn, in user's local timezone (YYYY-MM-DD) */
  wornDate: string;
}

/**
 * User preferences for no-repeat behaviour.
 */
export interface NoRepeatPrefs {
  /**
   * Number of days in the no-repeat window (0-90).
   * 0 means no-repeat filtering is disabled.
   */
  noRepeatDays: number;
  /**
   * Mode for no-repeat enforcement:
   * - 'item': Exclude outfits with ANY recently worn item
   * - 'outfit': Exclude only exact outfit matches
   */
  noRepeatMode: 'item' | 'outfit';
}

/**
 * Input parameters for the applyNoRepeatRules function.
 */
export interface ApplyNoRepeatRulesInput {
  /** Outfit candidates to filter (already filtered by other criteria) */
  candidates: Outfit[];
  /** Recent wear history entries within the relevant window */
  wearHistory: WearHistoryEntry[];
  /** User's no-repeat preferences */
  prefs: NoRepeatPrefs;
  /** Target date for recommendations (YYYY-MM-DD, user's local timezone) */
  targetDate: string;
  /**
   * Minimum count threshold for strict results.
   * If strict filtering returns fewer than this, fallbacks are generated.
   * @default 3
   */
  strictMinCount?: number;
}

/**
 * A fallback candidate with metadata about repeated items.
 *
 * When strict filtering is too restrictive, fallback candidates are provided
 * with information about which items would be repeated. This allows the
 * client to display appropriate messaging to the user.
 */
export interface FallbackCandidate {
  /** The outfit that would repeat some items */
  outfit: Outfit;
  /** Items that were worn within the no-repeat window */
  repeatedItems: Item[];
}

/**
 * Result of applying no-repeat rules to outfit candidates.
 */
export interface ApplyNoRepeatRulesResult {
  /**
   * Outfits that fully comply with the no-repeat rules.
   * In item mode: no items worn within the window.
   * In outfit mode: the exact outfit not worn within the window.
   */
  strictFiltered: Outfit[];
  /**
   * Fallback candidates when strict filtering is too restrictive.
   * Sorted by ascending number of repeated items (fewest first).
   * Includes metadata about which items would be repeated.
   */
  fallbackCandidates: FallbackCandidate[];
}

// ============================================================================
// Date Utilities
// ============================================================================

/**
 * Parses a YYYY-MM-DD date string into a Date object at midnight UTC.
 *
 * This ensures consistent date arithmetic regardless of timezone.
 * The returned Date represents the start of the given calendar day in UTC.
 *
 * @param dateStr - Date string in YYYY-MM-DD format
 * @returns Date object at midnight UTC, or null if invalid
 */
export function parseDateString(dateStr: string): Date | null {
  // Validate format: YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return null;
  }

  // Parse as UTC to avoid timezone issues
  const date = new Date(`${dateStr}T00:00:00.000Z`);

  // Check for invalid date (e.g., 2024-02-30)
  if (isNaN(date.getTime())) {
    return null;
  }

  return date;
}

/**
 * Calculates the number of days between two dates.
 *
 * Returns a positive number if targetDate is after wornDate.
 * Uses UTC midnight for both dates to ensure accurate day counting.
 *
 * @param targetDate - The target date (typically today)
 * @param wornDate - The date an outfit was worn
 * @returns Number of days between the dates (can be negative)
 */
export function daysBetween(targetDate: Date, wornDate: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  // Round to handle any potential DST issues with UTC dates
  return Math.round((targetDate.getTime() - wornDate.getTime()) / msPerDay);
}

/**
 * Determines if a wear event falls within the blocked window.
 *
 * This is the single, reusable helper for time-window logic used by both
 * item and outfit modes. It implements calendar-day semantics in the user's
 * local timezone.
 *
 * ## Blocked Window Definition
 *
 * Given a wear event on date D with noRepeatDays=N, the blocked window is:
 * - From: targetDate - noRepeatDays (inclusive), i.e., targetDate - N
 * - To: targetDate - 1 (inclusive)
 *
 * Equivalently, from the perspective of the wear date D:
 * - Days D+1 through D+N are blocked for recommendations
 * - Day D+N+1 onward: the item/outfit is eligible again
 * - Same-day repeats on D are allowed (v1 behaviour)
 *
 * ## Examples
 *
 * With noRepeatDays=7 and targetDate=2024-01-15:
 * - Worn on 2024-01-15 (same day): NOT blocked (same-day allowed)
 * - Worn on 2024-01-14 (1 day ago): BLOCKED (within window)
 * - Worn on 2024-01-08 (7 days ago): BLOCKED (within window)
 * - Worn on 2024-01-07 (8 days ago): NOT blocked (outside window)
 *
 * @param targetDate - Date for which recommendations are requested
 * @param wornDate - Date the outfit/item was worn
 * @param noRepeatDays - Number of days in the no-repeat window (N)
 * @returns true if the wear event blocks recommendations on targetDate
 */
export function isWithinBlockedWindow(
  targetDate: Date,
  wornDate: Date,
  noRepeatDays: number
): boolean {
  // If noRepeatDays is 0, nothing is blocked
  if (noRepeatDays <= 0) {
    return false;
  }

  const daysDiff = daysBetween(targetDate, wornDate);

  // Same-day is allowed (daysDiff === 0)
  if (daysDiff <= 0) {
    return false;
  }

  // Days 1 through noRepeatDays are blocked
  // Day noRepeatDays+1 and beyond are allowed
  return daysDiff <= noRepeatDays;
}

// ============================================================================
// Core Rules Function
// ============================================================================

/**
 * Applies no-repeat rules to filter and rank outfit candidates.
 *
 * This is the primary export of this module. It takes outfit candidates,
 * wear history, and user preferences, then returns:
 * - `strictFiltered`: Outfits fully complying with no-repeat rules
 * - `fallbackCandidates`: Ranked alternatives when strict filtering is too restrictive
 *
 * ## Behaviour by noRepeatDays
 *
 * - `noRepeatDays = 0`: Filtering disabled. All candidates pass as strict.
 * - `noRepeatDays > 0`: Apply mode-specific filtering.
 *
 * ## Modes
 *
 * - `item` mode: A candidate is excluded from strictFiltered if ANY of its
 *   itemIds appear in wear history within the blocked window.
 *
 * - `outfit` mode: A candidate is excluded from strictFiltered only if its
 *   exact outfitId appears in wear history within the blocked window.
 *
 * ## Fallback Generation
 *
 * When strictFiltered has fewer than strictMinCount outfits:
 * - All candidates are evaluated for their repeated items
 * - Candidates are sorted by ascending repeat count (fewest first)
 * - Deterministic tie-breaking by outfit ID
 *
 * @param input - Input parameters including candidates, history, prefs, and targetDate
 * @returns Result containing strictFiltered and fallbackCandidates
 */
export function applyNoRepeatRules(input: ApplyNoRepeatRulesInput): ApplyNoRepeatRulesResult {
  const {
    candidates,
    wearHistory,
    prefs,
    targetDate,
    strictMinCount = DEFAULT_STRICT_MIN_COUNT,
  } = input;

  // Handle disabled state (noRepeatDays = 0)
  // All candidates pass strict filtering, no fallbacks needed
  if (prefs.noRepeatDays <= 0) {
    return {
      strictFiltered: [...candidates],
      fallbackCandidates: [],
    };
  }

  // Parse the target date
  const targetDateParsed = parseDateString(targetDate);
  if (targetDateParsed === null) {
    // Invalid target date - treat as disabled to avoid blocking recommendations
    // This is a defensive fallback; callers should validate dates
    return {
      strictFiltered: [...candidates],
      fallbackCandidates: [],
    };
  }

  // Build the set of items/outfits that are within the blocked window
  const { recentItemIds, recentOutfitIds } = buildRecentSets(
    wearHistory,
    targetDateParsed,
    prefs.noRepeatDays
  );

  // Apply filtering based on mode
  const strictFiltered: Outfit[] = [];
  const nonStrictCandidates: Outfit[] = [];

  for (const candidate of candidates) {
    const isStrict = isCandidateStrict(
      candidate,
      prefs.noRepeatMode,
      recentItemIds,
      recentOutfitIds
    );

    if (isStrict) {
      strictFiltered.push(candidate);
    } else {
      nonStrictCandidates.push(candidate);
    }
  }

  // Build set of strict outfit IDs for exclusion from fallbacks
  // This prevents duplicates when combining strict results with fallbacks
  const strictOutfitIds = new Set(strictFiltered.map((o) => o.id));

  // Build fallback candidates with repeated items metadata
  // When strict filtering is too strong (fewer than strictMinCount results),
  // we evaluate non-strict candidates to provide fallbacks sorted by
  // how many items they would repeat. Strict outfits are excluded to
  // prevent duplicates in the final selection.
  const fallbackCandidates = buildFallbackCandidates(
    candidates,
    recentItemIds,
    strictFiltered.length,
    strictMinCount,
    strictOutfitIds
  );

  return {
    strictFiltered,
    fallbackCandidates,
  };
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Result of building recent item/outfit sets from wear history.
 */
interface RecentSets {
  /** Set of item IDs worn within the blocked window */
  recentItemIds: Set<string>;
  /** Set of outfit IDs worn within the blocked window */
  recentOutfitIds: Set<string>;
}

/**
 * Builds sets of recently worn items and outfits from wear history.
 *
 * This function derives `recentItemIds` and `recentOutfitIds` from wear history
 * events occurring within the blocked window:
 * - From: targetDate - noRepeatDays (inclusive)
 * - To: targetDate - 1 (inclusive)
 *
 * The same time window is used for both item and outfit modes, ensuring
 * consistent behaviour. The `isWithinBlockedWindow` helper is used to
 * determine which entries fall within this window.
 *
 * ## Item Mode Usage
 *
 * The `recentItemIds` set contains all item IDs from wear history entries
 * within the blocked window. Any candidate outfit with itemIds intersecting
 * this set will be excluded from strictFiltered.
 *
 * ## Outfit Mode Usage
 *
 * The `recentOutfitIds` set contains all outfit IDs from wear history entries
 * within the blocked window. Any candidate whose ID appears in this set will
 * be excluded from strictFiltered.
 *
 * @param wearHistory - Array of wear history entries
 * @param targetDate - Parsed target date (Date object at UTC midnight)
 * @param noRepeatDays - Number of days in the no-repeat window
 * @returns Sets of recent item IDs and outfit IDs
 */
function buildRecentSets(
  wearHistory: WearHistoryEntry[],
  targetDate: Date,
  noRepeatDays: number
): RecentSets {
  const recentItemIds = new Set<string>();
  const recentOutfitIds = new Set<string>();

  for (const entry of wearHistory) {
    const wornDate = parseDateString(entry.wornDate);

    // Skip entries with invalid dates
    if (wornDate === null) {
      continue;
    }

    // Check if this entry is within the blocked window
    if (!isWithinBlockedWindow(targetDate, wornDate, noRepeatDays)) {
      continue;
    }

    // Add item IDs to the recent set
    for (const itemId of entry.itemIds) {
      if (typeof itemId === 'string' && itemId.length > 0) {
        recentItemIds.add(itemId);
      }
    }

    // Add outfit ID to the recent set (if present)
    if (typeof entry.outfitId === 'string' && entry.outfitId.length > 0) {
      recentOutfitIds.add(entry.outfitId);
    }
  }

  return { recentItemIds, recentOutfitIds };
}

/**
 * Determines if a candidate outfit passes strict filtering.
 *
 * This function implements the mode-specific exclusion logic:
 *
 * ## Item Mode
 *
 * A candidate is excluded from strictFiltered if ANY of its itemIds
 * intersect with recentItemIds. This means if even one item in the
 * candidate outfit was worn within the blocked window, the entire
 * outfit is excluded.
 *
 * ## Outfit Mode
 *
 * A candidate is excluded from strictFiltered only if its exact
 * outfit ID (candidate.id) appears in recentOutfitIds. Individual
 * items may have been worn recently, but as long as this specific
 * outfit combination wasn't worn, it passes.
 *
 * @param candidate - The outfit to check
 * @param mode - The no-repeat mode ('item' or 'outfit')
 * @param recentItemIds - Set of item IDs worn within the blocked window
 * @param recentOutfitIds - Set of outfit IDs worn within the blocked window
 * @returns true if the candidate passes strict filtering (not excluded)
 */
function isCandidateStrict(
  candidate: Outfit,
  mode: 'item' | 'outfit',
  recentItemIds: Set<string>,
  recentOutfitIds: Set<string>
): boolean {
  if (mode === 'outfit') {
    // Outfit mode: check if this exact outfit was worn recently
    return !recentOutfitIds.has(candidate.id);
  }

  // Item mode: check if ANY item in this outfit was worn recently
  for (const itemId of candidate.itemIds) {
    if (recentItemIds.has(itemId)) {
      return false;
    }
  }

  return true;
}

/**
 * Builds the fallback candidates array with repeated items metadata.
 *
 * When strict filtering is too strong (strictCount < strictMinCount), this
 * function evaluates non-strict candidates to provide alternatives. For each
 * candidate not already in the strict set, it computes the intersection
 * between its itemIds and recentItemIds to determine repeatedItems.
 *
 * ## Strict Outfit Exclusion
 *
 * Outfits that passed strict filtering are excluded from the fallback pool.
 * This prevents duplicates when the final selection combines strict results
 * with fallback candidates to reach the minimum threshold.
 *
 * ## Sorting
 *
 * Candidates are sorted by ascending repeat count (fewest repeats first),
 * with deterministic tie-breaking by outfit ID. This means:
 * - Candidates with 1 repeated item come first
 * - Candidates with 2 repeated items come next
 * - And so on...
 *
 * ## When Strict Filtering is Sufficient
 *
 * When strictCount >= strictMinCount, an empty array is returned for
 * efficiency. The output shape remains consistent (always FallbackCandidate[])
 * so callers can rely on the structure without additional checks.
 *
 * @param allCandidates - All original outfit candidates (before filtering)
 * @param recentItemIds - Set of item IDs worn within the blocked window
 * @param strictCount - Number of candidates that passed strict filtering
 * @param strictMinCount - Minimum threshold for strict results
 * @param strictOutfitIds - Set of outfit IDs that passed strict filtering (to exclude from fallbacks)
 * @returns Sorted array of fallback candidates with repeatedItems metadata
 */
function buildFallbackCandidates(
  allCandidates: Outfit[],
  recentItemIds: Set<string>,
  strictCount: number,
  strictMinCount: number,
  strictOutfitIds: Set<string>
): FallbackCandidate[] {
  // If we have enough strict results, return empty fallback array
  // This is an optimization - callers don't need fallbacks if strict is sufficient
  if (strictCount >= strictMinCount) {
    return [];
  }

  // Build fallback candidates with repeated items metadata
  // Exclude outfits that already passed strict filtering to prevent duplicates
  const fallbacks: FallbackCandidate[] = [];

  for (const outfit of allCandidates) {
    // Skip outfits that are already in the strict set
    if (strictOutfitIds.has(outfit.id)) {
      continue;
    }

    const repeatedItems: Item[] = [];

    for (const itemId of outfit.itemIds) {
      if (recentItemIds.has(itemId)) {
        repeatedItems.push({ id: itemId });
      }
    }

    fallbacks.push({ outfit, repeatedItems });
  }

  // Sort by ascending repeat count, then by outfit ID for stability
  fallbacks.sort((a, b) => {
    // Primary: fewer repeated items first
    const countDiff = a.repeatedItems.length - b.repeatedItems.length;
    if (countDiff !== 0) {
      return countDiff;
    }

    // Secondary: deterministic tie-breaking by outfit ID
    return a.outfit.id < b.outfit.id ? -1 : a.outfit.id > b.outfit.id ? 1 : 0;
  });

  return fallbacks;
}
