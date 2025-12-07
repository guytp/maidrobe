/**
 * Unit Tests for No-Repeat Rules Module
 *
 * This test suite covers the pure functions in the noRepeatRules module
 * used for filtering outfit candidates based on wear history.
 *
 * Functions under test:
 * - parseDateString: Parses YYYY-MM-DD date strings
 * - daysBetween: Calculates days between two dates
 * - isWithinBlockedWindow: Determines if a wear event blocks recommendations
 * - applyNoRepeatRules: Main filtering function with item/outfit modes
 *
 * Test categories:
 * - (a) Item mode strict exclusion/inclusion
 * - (b) Outfit mode strict exclusion/inclusion
 * - (c) Same-day wear event handling
 * - (d) noRepeatDays = 0 behaviour
 * - (e) Fallback generation when all candidates excluded
 *
 * @module tests/noRepeatRules
 */

import { assertEquals, assertNotEquals } from 'std/assert/mod.ts';
import {
  parseDateString,
  daysBetween,
  isWithinBlockedWindow,
  applyNoRepeatRules,
  DEFAULT_STRICT_MIN_COUNT,
  type Outfit,
  type WearHistoryEntry,
  type NoRepeatPrefs,
  type ApplyNoRepeatRulesInput,
} from '../supabase/functions/_shared/noRepeatRules.ts';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Creates a test outfit with deterministic values.
 * Uses predictable UUIDs based on index for stable test assertions.
 */
function createTestOutfit(
  index: number,
  itemIds: string[] = [`item-${index}-a`, `item-${index}-b`]
): Outfit {
  // Generate predictable UUID-like IDs for deterministic ordering
  const id = `00000000-0000-0000-0000-${String(index).padStart(12, '0')}`;
  const userId = '11111111-1111-1111-1111-111111111111';

  return {
    id,
    userId,
    itemIds,
    reason: `Test outfit ${index} reason`,
    context: `Test context ${index}`,
    createdAt: '2024-01-01T00:00:00.000Z',
    rating: null,
  };
}

/**
 * Creates a wear history entry for testing.
 */
function createWearHistoryEntry(
  itemIds: string[],
  wornDate: string,
  outfitId?: string
): WearHistoryEntry {
  return {
    itemIds,
    wornDate,
    ...(outfitId && { outfitId }),
  };
}

/**
 * Creates default prefs for item mode testing.
 */
function createItemModePrefs(noRepeatDays: number): NoRepeatPrefs {
  return {
    noRepeatDays,
    noRepeatMode: 'item',
  };
}

/**
 * Creates default prefs for outfit mode testing.
 */
function createOutfitModePrefs(noRepeatDays: number): NoRepeatPrefs {
  return {
    noRepeatDays,
    noRepeatMode: 'outfit',
  };
}

// ============================================================================
// parseDateString Tests
// ============================================================================

Deno.test('parseDateString: parses valid YYYY-MM-DD format', () => {
  const result = parseDateString('2024-01-15');
  assertNotEquals(result, null);
  assertEquals(result?.getUTCFullYear(), 2024);
  assertEquals(result?.getUTCMonth(), 0); // January is 0
  assertEquals(result?.getUTCDate(), 15);
});

Deno.test('parseDateString: returns null for invalid format', () => {
  assertEquals(parseDateString('01-15-2024'), null);
  assertEquals(parseDateString('2024/01/15'), null);
  assertEquals(parseDateString('2024-1-15'), null);
  assertEquals(parseDateString('invalid'), null);
  assertEquals(parseDateString(''), null);
});

Deno.test('parseDateString: returns null for invalid dates', () => {
  assertEquals(parseDateString('2024-02-30'), null); // Feb 30 doesn't exist
  assertEquals(parseDateString('2024-13-01'), null); // Month 13 doesn't exist
});

// ============================================================================
// daysBetween Tests
// ============================================================================

Deno.test('daysBetween: returns 0 for same date', () => {
  const date1 = parseDateString('2024-01-15')!;
  const date2 = parseDateString('2024-01-15')!;
  assertEquals(daysBetween(date1, date2), 0);
});

Deno.test('daysBetween: returns positive for target after worn', () => {
  const target = parseDateString('2024-01-15')!;
  const worn = parseDateString('2024-01-10')!;
  assertEquals(daysBetween(target, worn), 5);
});

Deno.test('daysBetween: returns negative for target before worn', () => {
  const target = parseDateString('2024-01-10')!;
  const worn = parseDateString('2024-01-15')!;
  assertEquals(daysBetween(target, worn), -5);
});

Deno.test('daysBetween: handles month boundaries', () => {
  const target = parseDateString('2024-02-05')!;
  const worn = parseDateString('2024-01-30')!;
  assertEquals(daysBetween(target, worn), 6);
});

// ============================================================================
// isWithinBlockedWindow Tests
// ============================================================================

Deno.test('isWithinBlockedWindow: returns false for noRepeatDays = 0', () => {
  const target = parseDateString('2024-01-15')!;
  const worn = parseDateString('2024-01-14')!;
  assertEquals(isWithinBlockedWindow(target, worn, 0), false);
});

Deno.test('isWithinBlockedWindow: same-day is NOT blocked', () => {
  const target = parseDateString('2024-01-15')!;
  const worn = parseDateString('2024-01-15')!;
  assertEquals(isWithinBlockedWindow(target, worn, 7), false);
});

Deno.test('isWithinBlockedWindow: day 1 IS blocked', () => {
  const target = parseDateString('2024-01-15')!;
  const worn = parseDateString('2024-01-14')!; // 1 day ago
  assertEquals(isWithinBlockedWindow(target, worn, 7), true);
});

Deno.test('isWithinBlockedWindow: day N IS blocked (boundary)', () => {
  const target = parseDateString('2024-01-15')!;
  const worn = parseDateString('2024-01-08')!; // 7 days ago
  assertEquals(isWithinBlockedWindow(target, worn, 7), true);
});

Deno.test('isWithinBlockedWindow: day N+1 is NOT blocked (eligible again)', () => {
  const target = parseDateString('2024-01-15')!;
  const worn = parseDateString('2024-01-07')!; // 8 days ago
  assertEquals(isWithinBlockedWindow(target, worn, 7), false);
});

Deno.test('isWithinBlockedWindow: future wear events are NOT blocked', () => {
  const target = parseDateString('2024-01-15')!;
  const worn = parseDateString('2024-01-20')!; // Future date
  assertEquals(isWithinBlockedWindow(target, worn, 7), false);
});

// ============================================================================
// (a) Item Mode - Strict Exclusion/Inclusion Tests
// ============================================================================

Deno.test('item mode: excludes outfit when item worn within window', () => {
  const candidates = [
    createTestOutfit(1, ['item-a', 'item-b']),
    createTestOutfit(2, ['item-c', 'item-d']),
  ];

  const wearHistory: WearHistoryEntry[] = [
    createWearHistoryEntry(['item-a'], '2024-01-14'), // item-a worn 1 day ago
  ];

  const input: ApplyNoRepeatRulesInput = {
    candidates,
    wearHistory,
    prefs: createItemModePrefs(7),
    targetDate: '2024-01-15',
  };

  const result = applyNoRepeatRules(input);

  // Outfit 1 should be excluded (contains item-a)
  assertEquals(result.strictFiltered.length, 1);
  assertEquals(result.strictFiltered[0].id, candidates[1].id);
});

Deno.test('item mode: includes outfit when item worn outside window', () => {
  const candidates = [
    createTestOutfit(1, ['item-a', 'item-b']),
    createTestOutfit(2, ['item-c', 'item-d']),
  ];

  const wearHistory: WearHistoryEntry[] = [
    createWearHistoryEntry(['item-a'], '2024-01-07'), // item-a worn 8 days ago (outside 7-day window)
  ];

  const input: ApplyNoRepeatRulesInput = {
    candidates,
    wearHistory,
    prefs: createItemModePrefs(7),
    targetDate: '2024-01-15',
  };

  const result = applyNoRepeatRules(input);

  // Both outfits should be included (item-a is outside window)
  assertEquals(result.strictFiltered.length, 2);
});

Deno.test('item mode: excludes outfit when ANY item worn within window', () => {
  const candidates = [
    createTestOutfit(1, ['item-a', 'item-b', 'item-c']),
  ];

  const wearHistory: WearHistoryEntry[] = [
    createWearHistoryEntry(['item-b'], '2024-01-14'), // Only item-b worn recently
  ];

  const input: ApplyNoRepeatRulesInput = {
    candidates,
    wearHistory,
    prefs: createItemModePrefs(7),
    targetDate: '2024-01-15',
  };

  const result = applyNoRepeatRules(input);

  // Outfit should be excluded because item-b was worn within window
  assertEquals(result.strictFiltered.length, 0);
});

Deno.test('item mode: works with multiple noRepeatDays values', () => {
  const candidates = [
    createTestOutfit(1, ['item-a']),
  ];

  const wearHistory: WearHistoryEntry[] = [
    createWearHistoryEntry(['item-a'], '2024-01-12'), // 3 days ago
  ];

  const targetDate = '2024-01-15';

  // With 3-day window: should be blocked (3 days ago = day 3, still blocked)
  const result3 = applyNoRepeatRules({
    candidates,
    wearHistory,
    prefs: createItemModePrefs(3),
    targetDate,
  });
  assertEquals(result3.strictFiltered.length, 0);

  // With 2-day window: should NOT be blocked (3 days ago = day 3, outside 2-day window)
  const result2 = applyNoRepeatRules({
    candidates,
    wearHistory,
    prefs: createItemModePrefs(2),
    targetDate,
  });
  assertEquals(result2.strictFiltered.length, 1);
});

// ============================================================================
// (b) Outfit Mode - Strict Exclusion/Inclusion Tests
// ============================================================================

Deno.test('outfit mode: excludes outfit when exact outfit worn within window', () => {
  const outfit1 = createTestOutfit(1, ['item-a', 'item-b']);
  const outfit2 = createTestOutfit(2, ['item-c', 'item-d']);
  const candidates = [outfit1, outfit2];

  const wearHistory: WearHistoryEntry[] = [
    createWearHistoryEntry(['item-a', 'item-b'], '2024-01-14', outfit1.id),
  ];

  const input: ApplyNoRepeatRulesInput = {
    candidates,
    wearHistory,
    prefs: createOutfitModePrefs(7),
    targetDate: '2024-01-15',
  };

  const result = applyNoRepeatRules(input);

  // Outfit 1 should be excluded (exact outfit worn recently)
  assertEquals(result.strictFiltered.length, 1);
  assertEquals(result.strictFiltered[0].id, outfit2.id);
});

Deno.test('outfit mode: includes outfit when exact outfit worn outside window', () => {
  const outfit1 = createTestOutfit(1, ['item-a', 'item-b']);
  const candidates = [outfit1];

  const wearHistory: WearHistoryEntry[] = [
    createWearHistoryEntry(['item-a', 'item-b'], '2024-01-07', outfit1.id), // 8 days ago
  ];

  const input: ApplyNoRepeatRulesInput = {
    candidates,
    wearHistory,
    prefs: createOutfitModePrefs(7),
    targetDate: '2024-01-15',
  };

  const result = applyNoRepeatRules(input);

  // Outfit should be included (worn outside window)
  assertEquals(result.strictFiltered.length, 1);
});

Deno.test('outfit mode: includes outfit when items worn but not exact outfit', () => {
  const outfit1 = createTestOutfit(1, ['item-a', 'item-b']);
  const outfit2 = createTestOutfit(2, ['item-a', 'item-c']); // Shares item-a
  const candidates = [outfit1, outfit2];

  const wearHistory: WearHistoryEntry[] = [
    // Outfit 2 worn recently, but we're checking outfit 1
    createWearHistoryEntry(['item-a', 'item-c'], '2024-01-14', outfit2.id),
  ];

  const input: ApplyNoRepeatRulesInput = {
    candidates,
    wearHistory,
    prefs: createOutfitModePrefs(7),
    targetDate: '2024-01-15',
  };

  const result = applyNoRepeatRules(input);

  // Outfit 1 should be included (different outfit, even though item-a was worn)
  // Outfit 2 should be excluded (exact outfit worn recently)
  assertEquals(result.strictFiltered.length, 1);
  assertEquals(result.strictFiltered[0].id, outfit1.id);
});

// ============================================================================
// (c) Same-Day Wear Event Handling Tests
// ============================================================================

Deno.test('same-day wear: item mode allows same-day repeat', () => {
  const candidates = [
    createTestOutfit(1, ['item-a', 'item-b']),
  ];

  const wearHistory: WearHistoryEntry[] = [
    createWearHistoryEntry(['item-a'], '2024-01-15'), // Same day as target
  ];

  const input: ApplyNoRepeatRulesInput = {
    candidates,
    wearHistory,
    prefs: createItemModePrefs(7),
    targetDate: '2024-01-15',
  };

  const result = applyNoRepeatRules(input);

  // Same-day should be allowed
  assertEquals(result.strictFiltered.length, 1);
});

Deno.test('same-day wear: outfit mode allows same-day repeat', () => {
  const outfit1 = createTestOutfit(1, ['item-a', 'item-b']);
  const candidates = [outfit1];

  const wearHistory: WearHistoryEntry[] = [
    createWearHistoryEntry(['item-a', 'item-b'], '2024-01-15', outfit1.id), // Same day
  ];

  const input: ApplyNoRepeatRulesInput = {
    candidates,
    wearHistory,
    prefs: createOutfitModePrefs(7),
    targetDate: '2024-01-15',
  };

  const result = applyNoRepeatRules(input);

  // Same-day should be allowed
  assertEquals(result.strictFiltered.length, 1);
});

Deno.test('same-day wear: next day IS blocked', () => {
  const candidates = [
    createTestOutfit(1, ['item-a', 'item-b']),
  ];

  const wearHistory: WearHistoryEntry[] = [
    createWearHistoryEntry(['item-a'], '2024-01-14'), // Day before target
  ];

  const input: ApplyNoRepeatRulesInput = {
    candidates,
    wearHistory,
    prefs: createItemModePrefs(7),
    targetDate: '2024-01-15',
  };

  const result = applyNoRepeatRules(input);

  // Day 1 (next day after wear) should be blocked
  assertEquals(result.strictFiltered.length, 0);
});

Deno.test('same-day wear: day N+1 after wear is eligible again', () => {
  const candidates = [
    createTestOutfit(1, ['item-a', 'item-b']),
  ];

  // With noRepeatDays=3, worn on Jan 12
  // Blocked: Jan 13, 14, 15 (days 1, 2, 3)
  // Eligible: Jan 16 (day 4 = N+1)
  const wearHistory: WearHistoryEntry[] = [
    createWearHistoryEntry(['item-a'], '2024-01-12'),
  ];

  // Target is Jan 16 - should be eligible
  const inputEligible: ApplyNoRepeatRulesInput = {
    candidates,
    wearHistory,
    prefs: createItemModePrefs(3),
    targetDate: '2024-01-16',
  };

  const resultEligible = applyNoRepeatRules(inputEligible);
  assertEquals(resultEligible.strictFiltered.length, 1);

  // Target is Jan 15 - should still be blocked (day 3)
  const inputBlocked: ApplyNoRepeatRulesInput = {
    candidates,
    wearHistory,
    prefs: createItemModePrefs(3),
    targetDate: '2024-01-15',
  };

  const resultBlocked = applyNoRepeatRules(inputBlocked);
  assertEquals(resultBlocked.strictFiltered.length, 0);
});

// ============================================================================
// (d) noRepeatDays = 0 Behaviour Tests
// ============================================================================

Deno.test('noRepeatDays = 0: no strict exclusions in item mode', () => {
  const candidates = [
    createTestOutfit(1, ['item-a', 'item-b']),
    createTestOutfit(2, ['item-c', 'item-d']),
  ];

  const wearHistory: WearHistoryEntry[] = [
    createWearHistoryEntry(['item-a'], '2024-01-14'), // Would normally exclude outfit 1
    createWearHistoryEntry(['item-c'], '2024-01-14'), // Would normally exclude outfit 2
  ];

  const input: ApplyNoRepeatRulesInput = {
    candidates,
    wearHistory,
    prefs: createItemModePrefs(0), // Disabled
    targetDate: '2024-01-15',
  };

  const result = applyNoRepeatRules(input);

  // All candidates should pass when noRepeatDays = 0
  assertEquals(result.strictFiltered.length, 2);
  assertEquals(result.fallbackCandidates.length, 0);
});

Deno.test('noRepeatDays = 0: no strict exclusions in outfit mode', () => {
  const outfit1 = createTestOutfit(1, ['item-a', 'item-b']);
  const outfit2 = createTestOutfit(2, ['item-c', 'item-d']);
  const candidates = [outfit1, outfit2];

  const wearHistory: WearHistoryEntry[] = [
    createWearHistoryEntry(['item-a', 'item-b'], '2024-01-14', outfit1.id),
    createWearHistoryEntry(['item-c', 'item-d'], '2024-01-14', outfit2.id),
  ];

  const input: ApplyNoRepeatRulesInput = {
    candidates,
    wearHistory,
    prefs: createOutfitModePrefs(0), // Disabled
    targetDate: '2024-01-15',
  };

  const result = applyNoRepeatRules(input);

  // All candidates should pass when noRepeatDays = 0
  assertEquals(result.strictFiltered.length, 2);
  assertEquals(result.fallbackCandidates.length, 0);
});

Deno.test('noRepeatDays = 0: returns consistent output shape', () => {
  const candidates = [createTestOutfit(1)];

  const input: ApplyNoRepeatRulesInput = {
    candidates,
    wearHistory: [],
    prefs: createItemModePrefs(0),
    targetDate: '2024-01-15',
  };

  const result = applyNoRepeatRules(input);

  // Should have correct shape even when disabled
  assertEquals(Array.isArray(result.strictFiltered), true);
  assertEquals(Array.isArray(result.fallbackCandidates), true);
  assertEquals(result.strictFiltered.length, 1);
  assertEquals(result.fallbackCandidates.length, 0);
});

// ============================================================================
// (e) Fallback Generation Tests
// ============================================================================

Deno.test('fallback: generated when all candidates excluded (strictFiltered empty)', () => {
  const candidates = [
    createTestOutfit(1, ['item-a']),
    createTestOutfit(2, ['item-b']),
    createTestOutfit(3, ['item-c']),
  ];

  const wearHistory: WearHistoryEntry[] = [
    createWearHistoryEntry(['item-a', 'item-b', 'item-c'], '2024-01-14'),
  ];

  const input: ApplyNoRepeatRulesInput = {
    candidates,
    wearHistory,
    prefs: createItemModePrefs(7),
    targetDate: '2024-01-15',
    strictMinCount: 3,
  };

  const result = applyNoRepeatRules(input);

  // strictFiltered should be empty
  assertEquals(result.strictFiltered.length, 0);

  // fallbackCandidates should include all original candidates
  assertEquals(result.fallbackCandidates.length, 3);
});

Deno.test('fallback: includes accurate repeatedItems lists', () => {
  const candidates = [
    createTestOutfit(1, ['item-a', 'item-b']), // Both items worn
    createTestOutfit(2, ['item-a', 'item-c']), // Only item-a worn
    createTestOutfit(3, ['item-d', 'item-e']), // Neither worn
  ];

  const wearHistory: WearHistoryEntry[] = [
    createWearHistoryEntry(['item-a', 'item-b'], '2024-01-14'),
  ];

  const input: ApplyNoRepeatRulesInput = {
    candidates,
    wearHistory,
    prefs: createItemModePrefs(7),
    targetDate: '2024-01-15',
    strictMinCount: 5, // Force fallback generation
  };

  const result = applyNoRepeatRules(input);

  // Find each outfit in fallbacks
  const fallback1 = result.fallbackCandidates.find((f) => f.outfit.id === candidates[0].id);
  const fallback2 = result.fallbackCandidates.find((f) => f.outfit.id === candidates[1].id);
  const fallback3 = result.fallbackCandidates.find((f) => f.outfit.id === candidates[2].id);

  // Verify repeatedItems accuracy
  assertEquals(fallback1?.repeatedItems.length, 2); // item-a and item-b
  assertEquals(fallback2?.repeatedItems.length, 1); // item-a only
  assertEquals(fallback3?.repeatedItems.length, 0); // No repeats

  // Verify item IDs in repeatedItems
  const fallback1ItemIds = fallback1?.repeatedItems.map((i) => i.id).sort();
  assertEquals(fallback1ItemIds, ['item-a', 'item-b']);

  const fallback2ItemIds = fallback2?.repeatedItems.map((i) => i.id);
  assertEquals(fallback2ItemIds, ['item-a']);
});

Deno.test('fallback: sorted by ascending repeat count', () => {
  const candidates = [
    createTestOutfit(1, ['item-a', 'item-b', 'item-c']), // 3 repeats
    createTestOutfit(2, ['item-a']), // 1 repeat
    createTestOutfit(3, ['item-a', 'item-b']), // 2 repeats
    createTestOutfit(4, ['item-d']), // 0 repeats
  ];

  const wearHistory: WearHistoryEntry[] = [
    createWearHistoryEntry(['item-a', 'item-b', 'item-c'], '2024-01-14'),
  ];

  const input: ApplyNoRepeatRulesInput = {
    candidates,
    wearHistory,
    prefs: createItemModePrefs(7),
    targetDate: '2024-01-15',
    strictMinCount: 5, // Force fallback generation
  };

  const result = applyNoRepeatRules(input);

  // Verify sort order: fewest repeats first
  assertEquals(result.fallbackCandidates[0].repeatedItems.length, 0); // outfit 4
  assertEquals(result.fallbackCandidates[1].repeatedItems.length, 1); // outfit 2
  assertEquals(result.fallbackCandidates[2].repeatedItems.length, 2); // outfit 3
  assertEquals(result.fallbackCandidates[3].repeatedItems.length, 3); // outfit 1
});

Deno.test('fallback: deterministic tie-breaking by outfit ID', () => {
  // Create outfits with same repeat count but different IDs
  const candidates = [
    createTestOutfit(3, ['item-a']), // 1 repeat, ID ends in ...003
    createTestOutfit(1, ['item-b']), // 1 repeat, ID ends in ...001
    createTestOutfit(2, ['item-c']), // 1 repeat, ID ends in ...002
  ];

  const wearHistory: WearHistoryEntry[] = [
    createWearHistoryEntry(['item-a', 'item-b', 'item-c'], '2024-01-14'),
  ];

  const input: ApplyNoRepeatRulesInput = {
    candidates,
    wearHistory,
    prefs: createItemModePrefs(7),
    targetDate: '2024-01-15',
    strictMinCount: 5,
  };

  const result = applyNoRepeatRules(input);

  // All have 1 repeat, so should be sorted by ID (ascending)
  assertEquals(result.fallbackCandidates[0].outfit.id, candidates[1].id); // ...001
  assertEquals(result.fallbackCandidates[1].outfit.id, candidates[2].id); // ...002
  assertEquals(result.fallbackCandidates[2].outfit.id, candidates[0].id); // ...003
});

Deno.test('fallback: empty when strictFiltered meets strictMinCount', () => {
  const candidates = [
    createTestOutfit(1, ['item-a']),
    createTestOutfit(2, ['item-b']),
    createTestOutfit(3, ['item-c']),
    createTestOutfit(4, ['item-d']), // Only this one has worn items
  ];

  const wearHistory: WearHistoryEntry[] = [
    createWearHistoryEntry(['item-d'], '2024-01-14'),
  ];

  const input: ApplyNoRepeatRulesInput = {
    candidates,
    wearHistory,
    prefs: createItemModePrefs(7),
    targetDate: '2024-01-15',
    strictMinCount: 3, // We have 3 strict candidates
  };

  const result = applyNoRepeatRules(input);

  // Should have 3 strict candidates (outfits 1, 2, 3)
  assertEquals(result.strictFiltered.length, 3);

  // Fallbacks should be empty since we met strictMinCount
  assertEquals(result.fallbackCandidates.length, 0);
});

Deno.test('fallback: generated when strictFiltered below strictMinCount', () => {
  const candidates = [
    createTestOutfit(1, ['item-a']),
    createTestOutfit(2, ['item-b']),
    createTestOutfit(3, ['item-c']),
  ];

  const wearHistory: WearHistoryEntry[] = [
    createWearHistoryEntry(['item-a', 'item-b'], '2024-01-14'),
  ];

  const input: ApplyNoRepeatRulesInput = {
    candidates,
    wearHistory,
    prefs: createItemModePrefs(7),
    targetDate: '2024-01-15',
    strictMinCount: 3, // Need 3, only have 1 strict
  };

  const result = applyNoRepeatRules(input);

  // Only outfit 3 passes strict (1 < 3)
  assertEquals(result.strictFiltered.length, 1);

  // Fallbacks should be generated for ALL candidates
  assertEquals(result.fallbackCandidates.length, 3);
});

Deno.test('fallback: uses DEFAULT_STRICT_MIN_COUNT when not specified', () => {
  const candidates = [
    createTestOutfit(1, ['item-a']),
    createTestOutfit(2, ['item-b']),
  ];

  const wearHistory: WearHistoryEntry[] = [
    createWearHistoryEntry(['item-a', 'item-b'], '2024-01-14'),
  ];

  const input: ApplyNoRepeatRulesInput = {
    candidates,
    wearHistory,
    prefs: createItemModePrefs(7),
    targetDate: '2024-01-15',
    // strictMinCount not specified, should use DEFAULT_STRICT_MIN_COUNT (3)
  };

  const result = applyNoRepeatRules(input);

  // 0 strict candidates < DEFAULT_STRICT_MIN_COUNT (3), so fallbacks generated
  assertEquals(result.strictFiltered.length, 0);
  assertEquals(result.fallbackCandidates.length, 2);
  assertEquals(DEFAULT_STRICT_MIN_COUNT, 3);
});

// ============================================================================
// Edge Cases and Integration Tests
// ============================================================================

Deno.test('handles empty candidates array', () => {
  const input: ApplyNoRepeatRulesInput = {
    candidates: [],
    wearHistory: [],
    prefs: createItemModePrefs(7),
    targetDate: '2024-01-15',
  };

  const result = applyNoRepeatRules(input);

  assertEquals(result.strictFiltered.length, 0);
  assertEquals(result.fallbackCandidates.length, 0);
});

Deno.test('handles empty wear history', () => {
  const candidates = [
    createTestOutfit(1, ['item-a']),
    createTestOutfit(2, ['item-b']),
  ];

  const input: ApplyNoRepeatRulesInput = {
    candidates,
    wearHistory: [],
    prefs: createItemModePrefs(7),
    targetDate: '2024-01-15',
  };

  const result = applyNoRepeatRules(input);

  // All candidates should pass with no wear history
  assertEquals(result.strictFiltered.length, 2);
});

Deno.test('handles invalid targetDate gracefully', () => {
  const candidates = [createTestOutfit(1, ['item-a'])];

  const input: ApplyNoRepeatRulesInput = {
    candidates,
    wearHistory: [createWearHistoryEntry(['item-a'], '2024-01-14')],
    prefs: createItemModePrefs(7),
    targetDate: 'invalid-date',
  };

  const result = applyNoRepeatRules(input);

  // Should treat as disabled (all pass) rather than error
  assertEquals(result.strictFiltered.length, 1);
});

Deno.test('handles invalid wearHistory dates gracefully', () => {
  const candidates = [createTestOutfit(1, ['item-a'])];

  const input: ApplyNoRepeatRulesInput = {
    candidates,
    wearHistory: [
      createWearHistoryEntry(['item-a'], 'invalid-date'),
      createWearHistoryEntry(['item-a'], '2024-01-14'), // Valid entry
    ],
    prefs: createItemModePrefs(7),
    targetDate: '2024-01-15',
  };

  const result = applyNoRepeatRules(input);

  // Should skip invalid entries but process valid ones
  assertEquals(result.strictFiltered.length, 0); // Excluded by valid entry
});

Deno.test('long noRepeatDays window (30 days)', () => {
  const candidates = [createTestOutfit(1, ['item-a'])];

  // Worn 29 days ago - should be blocked with 30-day window
  const wearHistory: WearHistoryEntry[] = [
    createWearHistoryEntry(['item-a'], '2024-01-01'),
  ];

  const input: ApplyNoRepeatRulesInput = {
    candidates,
    wearHistory,
    prefs: createItemModePrefs(30),
    targetDate: '2024-01-30', // 29 days after Jan 1
  };

  const result = applyNoRepeatRules(input);
  assertEquals(result.strictFiltered.length, 0); // Still blocked

  // Worn 31 days ago - should NOT be blocked
  const input2: ApplyNoRepeatRulesInput = {
    candidates,
    wearHistory,
    prefs: createItemModePrefs(30),
    targetDate: '2024-02-01', // 31 days after Jan 1
  };

  const result2 = applyNoRepeatRules(input2);
  assertEquals(result2.strictFiltered.length, 1); // Eligible again
});
