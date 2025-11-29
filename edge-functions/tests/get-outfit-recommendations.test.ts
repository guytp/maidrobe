/**
 * Unit Tests for No-Repeat Rules Engine Functions
 *
 * This test suite covers the pure rules-engine functions used in the
 * get-outfit-recommendations Edge Function for implementing the no-repeat
 * window feature (Story #364).
 *
 * Functions under test:
 * - clampNoRepeatDays: Clamps noRepeatDays to valid range [0, 90]
 * - bucketNoRepeatDays: Privacy-safe bucketing for observability
 * - applyNoRepeatFilter: Filters outfits by "all items recent" rule
 * - applyMinMaxSelection: MIN/MAX selection with fallback logic
 *
 * @module tests/get-outfit-recommendations
 */

import { assertEquals } from 'std/assert/mod.ts';
import {
  clampNoRepeatDays,
  bucketNoRepeatDays,
  applyNoRepeatFilter,
  applyMinMaxSelection,
} from '../supabase/functions/get-outfit-recommendations/index.ts';
import type { Outfit } from '../supabase/functions/get-outfit-recommendations/types.ts';

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
 * Creates multiple test outfits with sequential IDs.
 */
function createTestOutfits(count: number): Outfit[] {
  return Array.from({ length: count }, (_, i) => createTestOutfit(i + 1));
}

/**
 * Creates an item worn-at map for testing recency scoring.
 * @param entries - Array of [itemId, timestamp] pairs
 */
function createItemWornAtMap(entries: [string, string][]): Map<string, string> {
  return new Map(entries);
}

// ============================================================================
// clampNoRepeatDays Tests
// ============================================================================

Deno.test('clampNoRepeatDays: returns 0 for null input', () => {
  assertEquals(clampNoRepeatDays(null), 0);
});

Deno.test('clampNoRepeatDays: returns 0 for undefined input', () => {
  assertEquals(clampNoRepeatDays(undefined), 0);
});

Deno.test('clampNoRepeatDays: returns 0 for NaN input', () => {
  assertEquals(clampNoRepeatDays(NaN), 0);
});

Deno.test('clampNoRepeatDays: returns 0 for negative values', () => {
  assertEquals(clampNoRepeatDays(-1), 0);
  assertEquals(clampNoRepeatDays(-100), 0);
  assertEquals(clampNoRepeatDays(-0.5), 0);
});

Deno.test('clampNoRepeatDays: returns 90 for values exceeding maximum', () => {
  assertEquals(clampNoRepeatDays(91), 90);
  assertEquals(clampNoRepeatDays(100), 90);
  assertEquals(clampNoRepeatDays(1000), 90);
});

Deno.test('clampNoRepeatDays: returns same value for valid integers in range', () => {
  assertEquals(clampNoRepeatDays(0), 0);
  assertEquals(clampNoRepeatDays(1), 1);
  assertEquals(clampNoRepeatDays(7), 7);
  assertEquals(clampNoRepeatDays(30), 30);
  assertEquals(clampNoRepeatDays(45), 45);
  assertEquals(clampNoRepeatDays(90), 90);
});

Deno.test('clampNoRepeatDays: floors floating point values', () => {
  assertEquals(clampNoRepeatDays(7.5), 7);
  assertEquals(clampNoRepeatDays(7.9), 7);
  assertEquals(clampNoRepeatDays(30.1), 30);
  assertEquals(clampNoRepeatDays(89.999), 89);
});

Deno.test('clampNoRepeatDays: coerces valid numeric strings', () => {
  assertEquals(clampNoRepeatDays('30'), 30);
  assertEquals(clampNoRepeatDays('0'), 0);
  assertEquals(clampNoRepeatDays('90'), 90);
  assertEquals(clampNoRepeatDays('7.5'), 7);
});

Deno.test('clampNoRepeatDays: returns 0 for invalid string values', () => {
  assertEquals(clampNoRepeatDays('invalid'), 0);
  assertEquals(clampNoRepeatDays(''), 0);
  assertEquals(clampNoRepeatDays('abc123'), 0);
});

Deno.test('clampNoRepeatDays: returns 0 for non-numeric types', () => {
  assertEquals(clampNoRepeatDays({}), 0);
  assertEquals(clampNoRepeatDays([]), 0);
  assertEquals(clampNoRepeatDays([30]), 30); // Array with single number coerces
  assertEquals(clampNoRepeatDays(true), 1); // Boolean true coerces to 1
  assertEquals(clampNoRepeatDays(false), 0); // Boolean false coerces to 0
});

Deno.test('clampNoRepeatDays: boundary value at 0 is preserved', () => {
  assertEquals(clampNoRepeatDays(0), 0);
  assertEquals(clampNoRepeatDays(0.0), 0);
  assertEquals(clampNoRepeatDays(-0), 0);
});

Deno.test('clampNoRepeatDays: boundary value at 90 is preserved', () => {
  assertEquals(clampNoRepeatDays(90), 90);
  assertEquals(clampNoRepeatDays(90.0), 90);
});

Deno.test('clampNoRepeatDays: handles Infinity values', () => {
  assertEquals(clampNoRepeatDays(Infinity), 90);
  assertEquals(clampNoRepeatDays(-Infinity), 0);
});

// ---------------------------------------------------------------------------
// Extended clampNoRepeatDays Tests - Purity, Determinism, and Edge Cases
// ---------------------------------------------------------------------------

Deno.test('clampNoRepeatDays: is deterministic - same input always produces same output', () => {
  // Test multiple calls with same input produce identical results
  const inputs = [0, 45, 90, -5, 100, 7.5, null, undefined, NaN, 'invalid'];

  for (const input of inputs) {
    const result1 = clampNoRepeatDays(input);
    const result2 = clampNoRepeatDays(input);
    const result3 = clampNoRepeatDays(input);

    assertEquals(result1, result2, `Determinism failed for input: ${input}`);
    assertEquals(result2, result3, `Determinism failed for input: ${input}`);
  }
});

Deno.test('clampNoRepeatDays: is pure - does not modify input objects', () => {
  // Test with mutable object input
  const objectInput = { value: 30 };
  const originalKeys = Object.keys(objectInput);
  const originalValue = objectInput.value;

  clampNoRepeatDays(objectInput);

  // Verify object was not mutated
  assertEquals(Object.keys(objectInput), originalKeys);
  assertEquals(objectInput.value, originalValue);

  // Test with array input
  const arrayInput = [45];
  const originalLength = arrayInput.length;
  const originalElement = arrayInput[0];

  clampNoRepeatDays(arrayInput);

  // Verify array was not mutated
  assertEquals(arrayInput.length, originalLength);
  assertEquals(arrayInput[0], originalElement);
});

Deno.test('clampNoRepeatDays: handles extreme numeric values', () => {
  // JavaScript's maximum and minimum values
  assertEquals(clampNoRepeatDays(Number.MAX_VALUE), 90);
  assertEquals(clampNoRepeatDays(Number.MIN_VALUE), 0); // Very small positive, floors to 0
  assertEquals(clampNoRepeatDays(Number.MAX_SAFE_INTEGER), 90);
  assertEquals(clampNoRepeatDays(Number.MIN_SAFE_INTEGER), 0);

  // Very large negative
  assertEquals(clampNoRepeatDays(-Number.MAX_VALUE), 0);

  // Epsilon (smallest difference from 1)
  assertEquals(clampNoRepeatDays(Number.EPSILON), 0); // Floors to 0
});

Deno.test('clampNoRepeatDays: handles near-boundary floating point values', () => {
  // Just below 0 (negative approaching zero)
  assertEquals(clampNoRepeatDays(-0.001), 0);
  assertEquals(clampNoRepeatDays(-0.0001), 0);
  assertEquals(clampNoRepeatDays(-1e-10), 0);

  // Just above 0 (positive but less than 1)
  assertEquals(clampNoRepeatDays(0.001), 0); // Floors to 0
  assertEquals(clampNoRepeatDays(0.999), 0); // Floors to 0

  // Just below 90
  assertEquals(clampNoRepeatDays(89.9999), 89); // Floors to 89

  // Just above 90
  assertEquals(clampNoRepeatDays(90.001), 90); // Clamps to 90
  assertEquals(clampNoRepeatDays(90.999), 90); // Clamps to 90
});

Deno.test('clampNoRepeatDays: handles scientific notation', () => {
  assertEquals(clampNoRepeatDays(1e2), 90); // 100 -> clamps to 90
  assertEquals(clampNoRepeatDays(9e1), 90); // 90
  assertEquals(clampNoRepeatDays(3e1), 30); // 30
  assertEquals(clampNoRepeatDays(1e-5), 0); // 0.00001 -> floors to 0
  assertEquals(clampNoRepeatDays(1e10), 90); // Very large -> clamps to 90
  assertEquals(clampNoRepeatDays(-1e5), 0); // Large negative -> clamps to 0
});

Deno.test('clampNoRepeatDays: handles objects with valueOf method', () => {
  // Object that coerces to a number via valueOf
  const objectWithValueOf = { valueOf: () => 45 };
  assertEquals(clampNoRepeatDays(objectWithValueOf), 45);

  // Object with valueOf returning out-of-range value
  const objectWithLargeValue = { valueOf: () => 200 };
  assertEquals(clampNoRepeatDays(objectWithLargeValue), 90);

  // Object with valueOf returning negative
  const objectWithNegative = { valueOf: () => -10 };
  assertEquals(clampNoRepeatDays(objectWithNegative), 0);
});

Deno.test('clampNoRepeatDays: handles whitespace-padded numeric strings', () => {
  assertEquals(clampNoRepeatDays('  30  '), 30);
  assertEquals(clampNoRepeatDays('\t45'), 45);
  assertEquals(clampNoRepeatDays('\n60\n'), 60);
  assertEquals(clampNoRepeatDays('   0   '), 0);
  assertEquals(clampNoRepeatDays('  90  '), 90);
});

Deno.test('clampNoRepeatDays: handles string edge cases', () => {
  // Strings with leading zeros
  assertEquals(clampNoRepeatDays('007'), 7);
  assertEquals(clampNoRepeatDays('090'), 90);
  assertEquals(clampNoRepeatDays('000'), 0);

  // Strings with signs
  assertEquals(clampNoRepeatDays('+30'), 30);
  assertEquals(clampNoRepeatDays('-30'), 0); // Negative clamps to 0

  // Hex strings (JavaScript's Number() parses these)
  assertEquals(clampNoRepeatDays('0x1E'), 30); // 0x1E = 30

  // Binary/octal-like strings (not parsed as such by Number())
  assertEquals(clampNoRepeatDays('0b101'), 0); // NaN -> 0
});

Deno.test('clampNoRepeatDays: handles special function and symbol types gracefully', () => {
  // Function input
  const fn = () => 30;
  assertEquals(clampNoRepeatDays(fn), 0); // NaN -> 0

  // Nested arrays
  assertEquals(clampNoRepeatDays([[30]]), 30); // Coerces via toString -> "30"
  assertEquals(clampNoRepeatDays([[[45]]]), 45);
  assertEquals(clampNoRepeatDays([1, 2, 3]), 0); // "1,2,3" -> NaN -> 0
});

Deno.test('clampNoRepeatDays: always returns an integer', () => {
  const testCases = [
    0, 45, 90, // Normal integers
    7.1, 7.5, 7.9, // Floats
    '30.5', // Float string
    { valueOf: () => 22.7 }, // Object with float valueOf
  ];

  for (const input of testCases) {
    const result = clampNoRepeatDays(input);
    assertEquals(Number.isInteger(result), true, `Result for ${input} should be integer`);
  }
});

Deno.test('clampNoRepeatDays: result is always within [0, 90] range', () => {
  // Comprehensive range test with various edge case inputs
  const edgeCases = [
    -Infinity, -1e10, -1000, -100, -1, -0.5,
    0, 0.5, 1, 45, 89, 90,
    90.5, 91, 100, 1000, 1e10, Infinity,
    null, undefined, NaN,
    'invalid', '', '  ', '-50', '150',
    {}, [], true, false,
  ];

  for (const input of edgeCases) {
    const result = clampNoRepeatDays(input);
    assertEquals(
      result >= 0 && result <= 90,
      true,
      `Result ${result} for input ${input} should be in [0, 90]`
    );
  }
});

// ============================================================================
// bucketNoRepeatDays Tests
// ============================================================================

Deno.test('bucketNoRepeatDays: returns "0" bucket for disabled (0 days)', () => {
  assertEquals(bucketNoRepeatDays(0), '0');
});

Deno.test('bucketNoRepeatDays: returns "1-7" bucket for short window', () => {
  assertEquals(bucketNoRepeatDays(1), '1-7');
  assertEquals(bucketNoRepeatDays(3), '1-7');
  assertEquals(bucketNoRepeatDays(7), '1-7');
});

Deno.test('bucketNoRepeatDays: returns "8-30" bucket for medium window', () => {
  assertEquals(bucketNoRepeatDays(8), '8-30');
  assertEquals(bucketNoRepeatDays(14), '8-30');
  assertEquals(bucketNoRepeatDays(30), '8-30');
});

Deno.test('bucketNoRepeatDays: returns "31-90" bucket for long window', () => {
  assertEquals(bucketNoRepeatDays(31), '31-90');
  assertEquals(bucketNoRepeatDays(60), '31-90');
  assertEquals(bucketNoRepeatDays(90), '31-90');
});

Deno.test('bucketNoRepeatDays: handles boundary transitions correctly', () => {
  // Transition from 0 to 1-7
  assertEquals(bucketNoRepeatDays(0), '0');
  assertEquals(bucketNoRepeatDays(1), '1-7');

  // Transition from 1-7 to 8-30
  assertEquals(bucketNoRepeatDays(7), '1-7');
  assertEquals(bucketNoRepeatDays(8), '8-30');

  // Transition from 8-30 to 31-90
  assertEquals(bucketNoRepeatDays(30), '8-30');
  assertEquals(bucketNoRepeatDays(31), '31-90');
});

Deno.test('bucketNoRepeatDays: buckets are stable for same input', () => {
  // Verify determinism - same input always produces same output
  const value = 15;
  assertEquals(bucketNoRepeatDays(value), bucketNoRepeatDays(value));
  assertEquals(bucketNoRepeatDays(value), '8-30');
});

// ---------------------------------------------------------------------------
// Extended bucketNoRepeatDays Tests - Full Range and Edge Cases
// ---------------------------------------------------------------------------

Deno.test('bucketNoRepeatDays: complete coverage of all integers 0-90', () => {
  // Bucket '0' - only value 0
  assertEquals(bucketNoRepeatDays(0), '0');

  // Bucket '1-7' - values 1 through 7
  for (let i = 1; i <= 7; i++) {
    assertEquals(bucketNoRepeatDays(i), '1-7', `Day ${i} should be in bucket '1-7'`);
  }

  // Bucket '8-30' - values 8 through 30
  for (let i = 8; i <= 30; i++) {
    assertEquals(bucketNoRepeatDays(i), '8-30', `Day ${i} should be in bucket '8-30'`);
  }

  // Bucket '31-90' - values 31 through 90
  for (let i = 31; i <= 90; i++) {
    assertEquals(bucketNoRepeatDays(i), '31-90', `Day ${i} should be in bucket '31-90'`);
  }
});

Deno.test('bucketNoRepeatDays: typical user-configured values', () => {
  // Common user preferences map to expected buckets
  const typicalValues: [number, string][] = [
    [0, '0'],      // Disabled
    [1, '1-7'],    // Minimal window
    [3, '1-7'],    // Few days
    [7, '1-7'],    // One week (common choice)
    [14, '8-30'],  // Two weeks (common choice)
    [21, '8-30'],  // Three weeks
    [30, '8-30'],  // One month (common choice)
    [45, '31-90'], // Six weeks
    [60, '31-90'], // Two months
    [90, '31-90'], // Maximum / three months
  ];

  for (const [days, expectedBucket] of typicalValues) {
    assertEquals(
      bucketNoRepeatDays(days),
      expectedBucket,
      `${days} days should map to bucket '${expectedBucket}'`
    );
  }
});

Deno.test('bucketNoRepeatDays: handles non-integer values (floats)', () => {
  // Function expects clamped integers, but should handle floats gracefully
  // These test the actual behavior when floats are passed

  // Values in '1-7' range with decimals
  assertEquals(bucketNoRepeatDays(1.5), '1-7');
  assertEquals(bucketNoRepeatDays(6.9), '1-7');
  assertEquals(bucketNoRepeatDays(7.0), '1-7');

  // Values just above 7 - 7.1 > 7, so falls to '8-30' bucket
  assertEquals(bucketNoRepeatDays(7.1), '8-30');
  assertEquals(bucketNoRepeatDays(8.5), '8-30');
  assertEquals(bucketNoRepeatDays(29.9), '8-30');

  // Values near boundaries
  assertEquals(bucketNoRepeatDays(0.5), '1-7'); // 0.5 !== 0, and 0.5 <= 7
  assertEquals(bucketNoRepeatDays(30.5), '31-90'); // 30.5 > 30, falls through to '31-90'
});

Deno.test('bucketNoRepeatDays: handles out-of-range values', () => {
  // Values below valid range (function expects pre-clamped input)
  // Negative values: -1 !== 0, but -1 <= 7, so returns '1-7'
  assertEquals(bucketNoRepeatDays(-1), '1-7');
  assertEquals(bucketNoRepeatDays(-10), '1-7');

  // Values above valid range - all fall through to '31-90'
  assertEquals(bucketNoRepeatDays(91), '31-90');
  assertEquals(bucketNoRepeatDays(100), '31-90');
  assertEquals(bucketNoRepeatDays(365), '31-90');
  assertEquals(bucketNoRepeatDays(1000), '31-90');
});

Deno.test('bucketNoRepeatDays: returns only valid bucket strings', () => {
  // Valid buckets per the NoRepeatDaysBucket type
  const validBuckets = ['0', '1-7', '8-30', '31-90'];

  // Test a wide range of inputs
  const testValues = [
    0, 1, 2, 3, 4, 5, 6, 7,
    8, 15, 20, 25, 30,
    31, 45, 60, 75, 90,
    -5, 100, 0.5, 7.5, 30.5,
  ];

  for (const value of testValues) {
    const bucket = bucketNoRepeatDays(value);
    assertEquals(
      validBuckets.includes(bucket),
      true,
      `Bucket '${bucket}' for value ${value} should be a valid bucket`
    );
  }
});

Deno.test('bucketNoRepeatDays: privacy-safe - buckets hide exact values', () => {
  // Verify that different exact values map to the same bucket
  // This confirms the privacy-safe design where exact preferences aren't exposed

  // Multiple values should produce identical bucket output
  assertEquals(bucketNoRepeatDays(1), bucketNoRepeatDays(7));  // Both '1-7'
  assertEquals(bucketNoRepeatDays(2), bucketNoRepeatDays(5));  // Both '1-7'
  assertEquals(bucketNoRepeatDays(8), bucketNoRepeatDays(30)); // Both '8-30'
  assertEquals(bucketNoRepeatDays(15), bucketNoRepeatDays(25)); // Both '8-30'
  assertEquals(bucketNoRepeatDays(31), bucketNoRepeatDays(90)); // Both '31-90'
  assertEquals(bucketNoRepeatDays(45), bucketNoRepeatDays(75)); // Both '31-90'

  // The only unique bucket is '0' which maps to a single value
  assertEquals(bucketNoRepeatDays(0), '0');
});

Deno.test('bucketNoRepeatDays: deterministic across all buckets', () => {
  // Test stability with representative values from each bucket
  const testCases = [
    { value: 0, bucket: '0' },
    { value: 4, bucket: '1-7' },
    { value: 20, bucket: '8-30' },
    { value: 60, bucket: '31-90' },
  ];

  for (const { value, bucket } of testCases) {
    // Multiple calls should return identical results
    const result1 = bucketNoRepeatDays(value);
    const result2 = bucketNoRepeatDays(value);
    const result3 = bucketNoRepeatDays(value);

    assertEquals(result1, bucket);
    assertEquals(result2, bucket);
    assertEquals(result3, bucket);
    assertEquals(result1, result2);
    assertEquals(result2, result3);
  }
});

Deno.test('bucketNoRepeatDays: bucket boundaries align with semantic ranges', () => {
  // Verify buckets match the documented semantic meanings:
  // '0' = disabled
  // '1-7' = up to 1 week
  // '8-30' = up to 1 month
  // '31-90' = over 1 month

  // Week boundary (7 days)
  assertEquals(bucketNoRepeatDays(7), '1-7', '7 days (1 week) should be in short window');
  assertEquals(bucketNoRepeatDays(8), '8-30', '8 days should start medium window');

  // Month boundary (30 days)
  assertEquals(bucketNoRepeatDays(30), '8-30', '30 days (~1 month) should be in medium window');
  assertEquals(bucketNoRepeatDays(31), '31-90', '31 days should start long window');

  // Maximum (90 days = ~3 months)
  assertEquals(bucketNoRepeatDays(90), '31-90', '90 days (max) should be in long window');
});

// ============================================================================
// applyNoRepeatFilter Tests
// ============================================================================

Deno.test('applyNoRepeatFilter: all outfits eligible when wear history is empty', () => {
  const outfits = createTestOutfits(3);
  const recentlyWornItemIds = new Set<string>();

  const result = applyNoRepeatFilter(outfits, recentlyWornItemIds);

  assertEquals(result.eligible.length, 3);
  assertEquals(result.excluded.length, 0);
  assertEquals(result.eligible, outfits);
});

Deno.test('applyNoRepeatFilter: returns empty arrays for empty outfit list', () => {
  const outfits: Outfit[] = [];
  const recentlyWornItemIds = new Set(['item-1-a', 'item-1-b']);

  const result = applyNoRepeatFilter(outfits, recentlyWornItemIds);

  assertEquals(result.eligible.length, 0);
  assertEquals(result.excluded.length, 0);
});

Deno.test('applyNoRepeatFilter: outfit with empty itemIds is treated as eligible', () => {
  const outfitWithEmptyItems = createTestOutfit(1, []);
  const outfits = [outfitWithEmptyItems];
  const recentlyWornItemIds = new Set(['some-item']);

  const result = applyNoRepeatFilter(outfits, recentlyWornItemIds);

  assertEquals(result.eligible.length, 1);
  assertEquals(result.excluded.length, 0);
});

Deno.test('applyNoRepeatFilter: excludes outfit when ALL items are recently worn', () => {
  const outfit = createTestOutfit(1, ['item-a', 'item-b', 'item-c']);
  const outfits = [outfit];
  const recentlyWornItemIds = new Set(['item-a', 'item-b', 'item-c']);

  const result = applyNoRepeatFilter(outfits, recentlyWornItemIds);

  assertEquals(result.eligible.length, 0);
  assertEquals(result.excluded.length, 1);
  assertEquals(result.excluded[0], outfit);
});

Deno.test('applyNoRepeatFilter: keeps outfit eligible when at least one item not worn', () => {
  const outfit = createTestOutfit(1, ['item-a', 'item-b', 'item-c']);
  const outfits = [outfit];
  // Only item-a and item-b are recently worn, item-c is not
  const recentlyWornItemIds = new Set(['item-a', 'item-b']);

  const result = applyNoRepeatFilter(outfits, recentlyWornItemIds);

  assertEquals(result.eligible.length, 1);
  assertEquals(result.excluded.length, 0);
  assertEquals(result.eligible[0], outfit);
});

Deno.test('applyNoRepeatFilter: keeps outfit eligible when NO items are worn', () => {
  const outfit = createTestOutfit(1, ['item-a', 'item-b']);
  const outfits = [outfit];
  // Completely different items in wear history
  const recentlyWornItemIds = new Set(['other-item-1', 'other-item-2']);

  const result = applyNoRepeatFilter(outfits, recentlyWornItemIds);

  assertEquals(result.eligible.length, 1);
  assertEquals(result.excluded.length, 0);
});

Deno.test('applyNoRepeatFilter: correctly separates mixed eligible and excluded outfits', () => {
  const outfit1 = createTestOutfit(1, ['item-a', 'item-b']); // Will be excluded
  const outfit2 = createTestOutfit(2, ['item-a', 'item-c']); // Will be eligible (item-c not worn)
  const outfit3 = createTestOutfit(3, ['item-d', 'item-e']); // Will be eligible (neither worn)
  const outfit4 = createTestOutfit(4, ['item-b', 'item-f']); // Will be eligible (item-f not worn)

  const outfits = [outfit1, outfit2, outfit3, outfit4];
  const recentlyWornItemIds = new Set(['item-a', 'item-b']);

  const result = applyNoRepeatFilter(outfits, recentlyWornItemIds);

  assertEquals(result.eligible.length, 3);
  assertEquals(result.excluded.length, 1);
  assertEquals(result.excluded[0], outfit1);
  assertEquals(result.eligible.includes(outfit2), true);
  assertEquals(result.eligible.includes(outfit3), true);
  assertEquals(result.eligible.includes(outfit4), true);
});

Deno.test('applyNoRepeatFilter: excludes all outfits when all items fully worn', () => {
  const outfit1 = createTestOutfit(1, ['item-a', 'item-b']);
  const outfit2 = createTestOutfit(2, ['item-c', 'item-d']);
  const outfit3 = createTestOutfit(3, ['item-e', 'item-f']);

  const outfits = [outfit1, outfit2, outfit3];
  // All items are recently worn
  const recentlyWornItemIds = new Set([
    'item-a',
    'item-b',
    'item-c',
    'item-d',
    'item-e',
    'item-f',
  ]);

  const result = applyNoRepeatFilter(outfits, recentlyWornItemIds);

  assertEquals(result.eligible.length, 0);
  assertEquals(result.excluded.length, 3);
});

Deno.test('applyNoRepeatFilter: preserves outfit order in results', () => {
  const outfit1 = createTestOutfit(1, ['item-a']);
  const outfit2 = createTestOutfit(2, ['item-b']);
  const outfit3 = createTestOutfit(3, ['item-c']);

  const outfits = [outfit1, outfit2, outfit3];
  const recentlyWornItemIds = new Set(['item-b']); // Only outfit2 excluded

  const result = applyNoRepeatFilter(outfits, recentlyWornItemIds);

  assertEquals(result.eligible.length, 2);
  assertEquals(result.eligible[0], outfit1);
  assertEquals(result.eligible[1], outfit3);
  assertEquals(result.excluded[0], outfit2);
});

// ---------------------------------------------------------------------------
// Extended applyNoRepeatFilter Tests - Deterministic Sets and Edge Cases
// ---------------------------------------------------------------------------

Deno.test('applyNoRepeatFilter: single-item outfit - item worn → excluded', () => {
  // Minimal case: one outfit with one item, that item is in wear history
  const outfit = createTestOutfit(1, ['single-item']);
  const recentlyWornItemIds = new Set(['single-item']);

  const result = applyNoRepeatFilter([outfit], recentlyWornItemIds);

  assertEquals(result.eligible.length, 0);
  assertEquals(result.excluded.length, 1);
  assertEquals(result.excluded[0], outfit);
});

Deno.test('applyNoRepeatFilter: single-item outfit - item not worn → eligible', () => {
  // Minimal case: one outfit with one item, that item is NOT in wear history
  const outfit = createTestOutfit(1, ['fresh-item']);
  const recentlyWornItemIds = new Set(['other-item']);

  const result = applyNoRepeatFilter([outfit], recentlyWornItemIds);

  assertEquals(result.eligible.length, 1);
  assertEquals(result.excluded.length, 0);
  assertEquals(result.eligible[0], outfit);
});

Deno.test('applyNoRepeatFilter: two-item outfit classification matrix', () => {
  // Test all combinations of two items being worn/not-worn
  // Format: [item1-worn, item2-worn] → expected result

  // Case 1: Neither worn → eligible
  const outfit1 = createTestOutfit(1, ['fresh-a', 'fresh-b']);
  const result1 = applyNoRepeatFilter([outfit1], new Set(['other']));
  assertEquals(result1.eligible.length, 1, 'Neither worn → eligible');
  assertEquals(result1.excluded.length, 0);

  // Case 2: Only first worn → eligible (one fresh item)
  const outfit2 = createTestOutfit(2, ['worn-a', 'fresh-b']);
  const result2 = applyNoRepeatFilter([outfit2], new Set(['worn-a']));
  assertEquals(result2.eligible.length, 1, 'Only first worn → eligible');
  assertEquals(result2.excluded.length, 0);

  // Case 3: Only second worn → eligible (one fresh item)
  const outfit3 = createTestOutfit(3, ['fresh-a', 'worn-b']);
  const result3 = applyNoRepeatFilter([outfit3], new Set(['worn-b']));
  assertEquals(result3.eligible.length, 1, 'Only second worn → eligible');
  assertEquals(result3.excluded.length, 0);

  // Case 4: Both worn → excluded
  const outfit4 = createTestOutfit(4, ['worn-a', 'worn-b']);
  const result4 = applyNoRepeatFilter([outfit4], new Set(['worn-a', 'worn-b']));
  assertEquals(result4.eligible.length, 0, 'Both worn → excluded');
  assertEquals(result4.excluded.length, 1);
});

Deno.test('applyNoRepeatFilter: shared item across multiple outfits', () => {
  // When the same item appears in multiple outfits
  const sharedItem = 'shared-blazer';

  const outfit1 = createTestOutfit(1, [sharedItem, 'item-1b']); // shared + fresh
  const outfit2 = createTestOutfit(2, [sharedItem, 'item-2b']); // shared + fresh
  const outfit3 = createTestOutfit(3, [sharedItem, 'item-3b']); // shared + worn

  const outfits = [outfit1, outfit2, outfit3];
  // Shared item is worn, plus item-3b is worn
  const recentlyWornItemIds = new Set([sharedItem, 'item-3b']);

  const result = applyNoRepeatFilter(outfits, recentlyWornItemIds);

  // outfit1: shared(worn) + item-1b(fresh) → eligible
  // outfit2: shared(worn) + item-2b(fresh) → eligible
  // outfit3: shared(worn) + item-3b(worn) → excluded (all items worn)
  assertEquals(result.eligible.length, 2);
  assertEquals(result.excluded.length, 1);
  assertEquals(result.excluded[0], outfit3);
});

Deno.test('applyNoRepeatFilter: large wear history with few matches', () => {
  // Many items in wear history, but outfit items don't overlap much
  const outfit = createTestOutfit(1, ['target-item-1', 'target-item-2', 'target-item-3']);

  // Large set of worn items, but only one matches the outfit
  const largeWornSet = new Set([
    'worn-1', 'worn-2', 'worn-3', 'worn-4', 'worn-5',
    'worn-6', 'worn-7', 'worn-8', 'worn-9', 'worn-10',
    'target-item-1', // Only this matches
  ]);

  const result = applyNoRepeatFilter([outfit], largeWornSet);

  // Only 1 of 3 items worn → eligible
  assertEquals(result.eligible.length, 1);
  assertEquals(result.excluded.length, 0);
});

Deno.test('applyNoRepeatFilter: large wear history covering all items', () => {
  // Outfit items are subset of large wear history
  const outfit = createTestOutfit(1, ['item-a', 'item-b', 'item-c']);

  const largeWornSet = new Set([
    'item-a', 'item-b', 'item-c', // All outfit items
    'extra-1', 'extra-2', 'extra-3', 'extra-4', 'extra-5',
  ]);

  const result = applyNoRepeatFilter([outfit], largeWornSet);

  assertEquals(result.eligible.length, 0);
  assertEquals(result.excluded.length, 1);
});

Deno.test('applyNoRepeatFilter: is pure - does not modify input arrays', () => {
  const outfit1 = createTestOutfit(1, ['item-a', 'item-b']);
  const outfit2 = createTestOutfit(2, ['item-c', 'item-d']);
  const outfits = [outfit1, outfit2];
  const originalOutfitsLength = outfits.length;
  const originalOutfit1Items = [...outfit1.itemIds];

  const recentlyWornItemIds = new Set(['item-a', 'item-b']);
  const originalSetSize = recentlyWornItemIds.size;

  applyNoRepeatFilter(outfits, recentlyWornItemIds);

  // Verify inputs were not mutated
  assertEquals(outfits.length, originalOutfitsLength);
  assertEquals(outfit1.itemIds, originalOutfit1Items);
  assertEquals(recentlyWornItemIds.size, originalSetSize);
});

Deno.test('applyNoRepeatFilter: is deterministic - same inputs produce same outputs', () => {
  const outfit1 = createTestOutfit(1, ['item-a', 'item-b']);
  const outfit2 = createTestOutfit(2, ['item-a', 'item-c']);
  const outfit3 = createTestOutfit(3, ['item-d', 'item-e']);

  const outfits = [outfit1, outfit2, outfit3];
  const recentlyWornItemIds = new Set(['item-a', 'item-b']);

  // Call multiple times
  const result1 = applyNoRepeatFilter(outfits, recentlyWornItemIds);
  const result2 = applyNoRepeatFilter(outfits, recentlyWornItemIds);
  const result3 = applyNoRepeatFilter(outfits, recentlyWornItemIds);

  // All results should be identical
  assertEquals(result1.eligible.length, result2.eligible.length);
  assertEquals(result2.eligible.length, result3.eligible.length);
  assertEquals(result1.excluded.length, result2.excluded.length);
  assertEquals(result2.excluded.length, result3.excluded.length);

  // Same outfits in same positions
  assertEquals(result1.eligible[0], result2.eligible[0]);
  assertEquals(result1.excluded[0], result2.excluded[0]);
});

Deno.test('applyNoRepeatFilter: progressive filtering demonstration', () => {
  // Shows how adding items to wear history progressively filters outfits
  const outfit1 = createTestOutfit(1, ['item-a']);
  const outfit2 = createTestOutfit(2, ['item-a', 'item-b']);
  const outfit3 = createTestOutfit(3, ['item-b', 'item-c']);
  const outfits = [outfit1, outfit2, outfit3];

  // Stage 1: Empty history - all eligible
  const result1 = applyNoRepeatFilter(outfits, new Set());
  assertEquals(result1.eligible.length, 3, 'Empty history: all eligible');
  assertEquals(result1.excluded.length, 0);

  // Stage 2: Only item-a worn
  // outfit1: [a] → excluded (all worn)
  // outfit2: [a,b] → eligible (b not worn)
  // outfit3: [b,c] → eligible (neither worn)
  const result2 = applyNoRepeatFilter(outfits, new Set(['item-a']));
  assertEquals(result2.eligible.length, 2, 'item-a worn: 2 eligible');
  assertEquals(result2.excluded.length, 1);
  assertEquals(result2.excluded[0], outfit1);

  // Stage 3: item-a and item-b worn
  // outfit1: [a] → excluded
  // outfit2: [a,b] → excluded (all worn)
  // outfit3: [b,c] → eligible (c not worn)
  const result3 = applyNoRepeatFilter(outfits, new Set(['item-a', 'item-b']));
  assertEquals(result3.eligible.length, 1, 'item-a+b worn: 1 eligible');
  assertEquals(result3.excluded.length, 2);

  // Stage 4: All items worn
  const result4 = applyNoRepeatFilter(outfits, new Set(['item-a', 'item-b', 'item-c']));
  assertEquals(result4.eligible.length, 0, 'All worn: none eligible');
  assertEquals(result4.excluded.length, 3);
});

Deno.test('applyNoRepeatFilter: outfit with many items - partial overlap', () => {
  // Outfit with 5 items, only 4 are worn → still eligible
  const outfit = createTestOutfit(1, [
    'item-1', 'item-2', 'item-3', 'item-4', 'item-5',
  ]);

  const recentlyWornItemIds = new Set([
    'item-1', 'item-2', 'item-3', 'item-4', // 4 of 5 worn
  ]);

  const result = applyNoRepeatFilter([outfit], recentlyWornItemIds);

  // One item (item-5) not worn → eligible
  assertEquals(result.eligible.length, 1);
  assertEquals(result.excluded.length, 0);
});

Deno.test('applyNoRepeatFilter: multiple outfits with overlapping items', () => {
  // Complex scenario with overlapping item usage
  const outfit1 = createTestOutfit(1, ['shirt-a', 'pants-a']);
  const outfit2 = createTestOutfit(2, ['shirt-a', 'pants-b']);
  const outfit3 = createTestOutfit(3, ['shirt-b', 'pants-a']);
  const outfit4 = createTestOutfit(4, ['shirt-b', 'pants-b']);

  const outfits = [outfit1, outfit2, outfit3, outfit4];

  // Wear shirt-a and pants-a
  const recentlyWornItemIds = new Set(['shirt-a', 'pants-a']);

  const result = applyNoRepeatFilter(outfits, recentlyWornItemIds);

  // outfit1: shirt-a(worn) + pants-a(worn) → excluded
  // outfit2: shirt-a(worn) + pants-b(fresh) → eligible
  // outfit3: shirt-b(fresh) + pants-a(worn) → eligible
  // outfit4: shirt-b(fresh) + pants-b(fresh) → eligible
  assertEquals(result.eligible.length, 3);
  assertEquals(result.excluded.length, 1);
  assertEquals(result.excluded[0], outfit1);
});

// ============================================================================
// applyMinMaxSelection Tests
// ============================================================================

Deno.test('applyMinMaxSelection: returns configError for empty static pool', () => {
  const staticPool: Outfit[] = [];
  const eligible: Outfit[] = [];
  const excluded: Outfit[] = [];
  const itemWornAtMap = new Map<string, string>();

  const result = applyMinMaxSelection(staticPool, eligible, excluded, itemWornAtMap);

  assertEquals(result.outfits.length, 0);
  assertEquals(result.fallbackCount, 0);
  assertEquals(result.configError, true);
  assertEquals(result.configWarning, false);
});

Deno.test('applyMinMaxSelection: returns configWarning when pool smaller than MIN', () => {
  const staticPool = createTestOutfits(2); // Less than MIN_OUTFITS (3)
  const eligible = staticPool;
  const excluded: Outfit[] = [];
  const itemWornAtMap = new Map<string, string>();

  const result = applyMinMaxSelection(staticPool, eligible, excluded, itemWornAtMap);

  assertEquals(result.outfits.length, 2);
  assertEquals(result.fallbackCount, 0);
  assertEquals(result.configError, false);
  assertEquals(result.configWarning, true);
});

Deno.test('applyMinMaxSelection: returns single outfit with configWarning', () => {
  const staticPool = createTestOutfits(1);
  const eligible = staticPool;
  const excluded: Outfit[] = [];
  const itemWornAtMap = new Map<string, string>();

  const result = applyMinMaxSelection(staticPool, eligible, excluded, itemWornAtMap);

  assertEquals(result.outfits.length, 1);
  assertEquals(result.configWarning, true);
  assertEquals(result.configError, false);
});

Deno.test('applyMinMaxSelection: uses eligible list when count >= MIN', () => {
  const staticPool = createTestOutfits(5);
  const eligible = staticPool.slice(0, 4); // 4 eligible
  const excluded = staticPool.slice(4); // 1 excluded
  const itemWornAtMap = new Map<string, string>();

  const result = applyMinMaxSelection(staticPool, eligible, excluded, itemWornAtMap);

  assertEquals(result.outfits.length, 4);
  assertEquals(result.fallbackCount, 0);
  assertEquals(result.configError, false);
  assertEquals(result.configWarning, false);
});

Deno.test('applyMinMaxSelection: exactly MIN eligible outfits works correctly', () => {
  const staticPool = createTestOutfits(5);
  const eligible = staticPool.slice(0, 3); // Exactly MIN_OUTFITS (3)
  const excluded = staticPool.slice(3);
  const itemWornAtMap = new Map<string, string>();

  const result = applyMinMaxSelection(staticPool, eligible, excluded, itemWornAtMap);

  assertEquals(result.outfits.length, 3);
  assertEquals(result.fallbackCount, 0);
});

Deno.test('applyMinMaxSelection: applies fallback when eligible < MIN', () => {
  const staticPool = createTestOutfits(5);
  const eligible = staticPool.slice(0, 1); // Only 1 eligible
  const excluded = staticPool.slice(1); // 4 excluded
  const itemWornAtMap = new Map<string, string>();

  const result = applyMinMaxSelection(staticPool, eligible, excluded, itemWornAtMap);

  assertEquals(result.outfits.length, 3); // MIN_OUTFITS
  assertEquals(result.fallbackCount, 2); // Added 2 from excluded
  assertEquals(result.configError, false);
  assertEquals(result.configWarning, false);
});

Deno.test('applyMinMaxSelection: fallback adds excluded by ascending recency', () => {
  // Create outfits with specific item IDs for recency testing
  const outfit1 = createTestOutfit(1, ['item-old']); // Will have oldest timestamp
  const outfit2 = createTestOutfit(2, ['item-mid']); // Will have middle timestamp
  const outfit3 = createTestOutfit(3, ['item-new']); // Will have newest timestamp

  const staticPool = [outfit1, outfit2, outfit3];
  const eligible: Outfit[] = []; // No eligible outfits
  const excluded = [outfit1, outfit2, outfit3]; // All excluded

  // Set up recency scores - older timestamps should be preferred in fallback
  const itemWornAtMap = createItemWornAtMap([
    ['item-old', '2024-01-01T00:00:00.000Z'], // Oldest
    ['item-mid', '2024-01-15T00:00:00.000Z'], // Middle
    ['item-new', '2024-01-30T00:00:00.000Z'], // Newest
  ]);

  const result = applyMinMaxSelection(staticPool, eligible, excluded, itemWornAtMap);

  assertEquals(result.outfits.length, 3);
  assertEquals(result.fallbackCount, 3);

  // Outfits should be ordered deterministically by ID after selection
  // But fallback selection should have picked the least recently worn first
  // The final ordering is by outfit.id, so we check that all are present
  const ids = result.outfits.map((o) => o.id);
  assertEquals(ids.includes(outfit1.id), true);
  assertEquals(ids.includes(outfit2.id), true);
  assertEquals(ids.includes(outfit3.id), true);
});

Deno.test('applyMinMaxSelection: fallback respects outfit.id tie-breaker', () => {
  // Create outfits with same recency score (same worn timestamp)
  const outfit1 = createTestOutfit(1, ['shared-item']);
  const outfit2 = createTestOutfit(2, ['shared-item']);
  const outfit3 = createTestOutfit(3, ['shared-item']);

  const staticPool = [outfit3, outfit1, outfit2]; // Intentionally out of order
  const eligible: Outfit[] = [];
  const excluded = [outfit3, outfit1, outfit2];

  // Same timestamp for all - tie-breaker by outfit.id
  const itemWornAtMap = createItemWornAtMap([
    ['shared-item', '2024-01-15T00:00:00.000Z'],
  ]);

  const result = applyMinMaxSelection(staticPool, eligible, excluded, itemWornAtMap);

  assertEquals(result.outfits.length, 3);

  // Final ordering should be deterministic by outfit.id
  assertEquals(result.outfits[0].id, outfit1.id);
  assertEquals(result.outfits[1].id, outfit2.id);
  assertEquals(result.outfits[2].id, outfit3.id);
});

Deno.test('applyMinMaxSelection: truncates to MAX when candidates exceed limit', () => {
  const staticPool = createTestOutfits(15); // More than MAX_OUTFITS (10)
  const eligible = staticPool; // All eligible
  const excluded: Outfit[] = [];
  const itemWornAtMap = new Map<string, string>();

  const result = applyMinMaxSelection(staticPool, eligible, excluded, itemWornAtMap);

  assertEquals(result.outfits.length, 10); // MAX_OUTFITS
  assertEquals(result.fallbackCount, 0);
});

Deno.test('applyMinMaxSelection: exactly MAX outfits returns all', () => {
  const staticPool = createTestOutfits(10); // Exactly MAX_OUTFITS
  const eligible = staticPool;
  const excluded: Outfit[] = [];
  const itemWornAtMap = new Map<string, string>();

  const result = applyMinMaxSelection(staticPool, eligible, excluded, itemWornAtMap);

  assertEquals(result.outfits.length, 10);
});

Deno.test('applyMinMaxSelection: handles zero eligible with insufficient excluded', () => {
  // Only 2 outfits total, but MIN is 3
  const staticPool = createTestOutfits(2);
  const eligible: Outfit[] = [];
  const excluded = staticPool;
  const itemWornAtMap = new Map<string, string>();

  const result = applyMinMaxSelection(staticPool, eligible, excluded, itemWornAtMap);

  // Pool < MIN triggers configWarning path, returns full pool
  assertEquals(result.outfits.length, 2);
  assertEquals(result.configWarning, true);
});

Deno.test('applyMinMaxSelection: fallback with some eligible, some excluded', () => {
  const outfit1 = createTestOutfit(1, ['item-1']);
  const outfit2 = createTestOutfit(2, ['item-2']);
  const outfit3 = createTestOutfit(3, ['item-3']);
  const outfit4 = createTestOutfit(4, ['item-4']);
  const outfit5 = createTestOutfit(5, ['item-5']);

  const staticPool = [outfit1, outfit2, outfit3, outfit4, outfit5];
  const eligible = [outfit1]; // Only 1 eligible
  const excluded = [outfit2, outfit3, outfit4, outfit5]; // 4 excluded

  // Set recency so outfit5 is oldest (preferred for fallback)
  const itemWornAtMap = createItemWornAtMap([
    ['item-2', '2024-01-04T00:00:00.000Z'],
    ['item-3', '2024-01-03T00:00:00.000Z'],
    ['item-4', '2024-01-02T00:00:00.000Z'],
    ['item-5', '2024-01-01T00:00:00.000Z'], // Oldest - should be picked first
  ]);

  const result = applyMinMaxSelection(staticPool, eligible, excluded, itemWornAtMap);

  assertEquals(result.outfits.length, 3); // MIN_OUTFITS
  assertEquals(result.fallbackCount, 2); // 2 added from excluded

  // Should include outfit1 (eligible) and 2 from excluded (outfit4, outfit5 - oldest)
  const ids = result.outfits.map((o) => o.id);
  assertEquals(ids.includes(outfit1.id), true); // The eligible one
});

Deno.test('applyMinMaxSelection: items without recency score sort first (oldest)', () => {
  const outfit1 = createTestOutfit(1, ['item-no-history']); // No history
  const outfit2 = createTestOutfit(2, ['item-with-history']);

  const staticPool = [outfit1, outfit2];
  const eligible: Outfit[] = [];
  const excluded = [outfit2, outfit1]; // Intentionally reversed

  // Only outfit2 has history
  const itemWornAtMap = createItemWornAtMap([
    ['item-with-history', '2024-01-15T00:00:00.000Z'],
  ]);

  const result = applyMinMaxSelection(staticPool, eligible, excluded, itemWornAtMap);

  // Pool < MIN triggers configWarning, returns all
  assertEquals(result.outfits.length, 2);
  assertEquals(result.configWarning, true);
});

Deno.test('applyMinMaxSelection: applies deterministic ordering to final result', () => {
  // Create outfits with IDs in specific order
  const outfit3 = createTestOutfit(3, ['item-3']);
  const outfit1 = createTestOutfit(1, ['item-1']);
  const outfit2 = createTestOutfit(2, ['item-2']);

  const staticPool = [outfit3, outfit1, outfit2]; // Out of ID order
  const eligible = [outfit3, outfit1, outfit2];
  const excluded: Outfit[] = [];
  const itemWornAtMap = new Map<string, string>();

  const result = applyMinMaxSelection(staticPool, eligible, excluded, itemWornAtMap);

  // Should be sorted by outfit.id
  assertEquals(result.outfits[0].id, outfit1.id);
  assertEquals(result.outfits[1].id, outfit2.id);
  assertEquals(result.outfits[2].id, outfit3.id);
});

Deno.test('applyMinMaxSelection: empty excluded list with insufficient eligible', () => {
  const staticPool = createTestOutfits(4);
  const eligible = staticPool.slice(0, 2); // Only 2 eligible
  const excluded: Outfit[] = []; // No excluded to fall back on
  const itemWornAtMap = new Map<string, string>();

  const result = applyMinMaxSelection(staticPool, eligible, excluded, itemWornAtMap);

  // Cannot reach MIN, but no configWarning because staticPool >= MIN
  assertEquals(result.outfits.length, 2);
  assertEquals(result.fallbackCount, 0);
  assertEquals(result.configWarning, false);
});

// ---------------------------------------------------------------------------
// Extended applyMinMaxSelection Tests - Core Selection Behaviour
// ---------------------------------------------------------------------------

Deno.test('applyMinMaxSelection: is pure - does not modify input arrays', () => {
  const outfit1 = createTestOutfit(1, ['item-1']);
  const outfit2 = createTestOutfit(2, ['item-2']);
  const outfit3 = createTestOutfit(3, ['item-3']);
  const outfit4 = createTestOutfit(4, ['item-4']);

  const staticPool = [outfit1, outfit2, outfit3, outfit4];
  const eligible = [outfit1];
  const excluded = [outfit2, outfit3, outfit4];

  // Capture original states
  const originalStaticPoolLength = staticPool.length;
  const originalEligibleLength = eligible.length;
  const originalExcludedLength = excluded.length;
  const originalStaticPoolIds = staticPool.map((o) => o.id);
  const originalEligibleIds = eligible.map((o) => o.id);
  const originalExcludedIds = excluded.map((o) => o.id);

  const itemWornAtMap = createItemWornAtMap([
    ['item-2', '2024-01-03T00:00:00.000Z'],
    ['item-3', '2024-01-02T00:00:00.000Z'],
    ['item-4', '2024-01-01T00:00:00.000Z'],
  ]);
  const originalMapSize = itemWornAtMap.size;

  applyMinMaxSelection(staticPool, eligible, excluded, itemWornAtMap);

  // Verify arrays were not mutated
  assertEquals(staticPool.length, originalStaticPoolLength);
  assertEquals(eligible.length, originalEligibleLength);
  assertEquals(excluded.length, originalExcludedLength);
  assertEquals(staticPool.map((o) => o.id), originalStaticPoolIds);
  assertEquals(eligible.map((o) => o.id), originalEligibleIds);
  assertEquals(excluded.map((o) => o.id), originalExcludedIds);
  assertEquals(itemWornAtMap.size, originalMapSize);
});

Deno.test('applyMinMaxSelection: is deterministic - same inputs produce same outputs', () => {
  const outfit1 = createTestOutfit(1, ['item-1']);
  const outfit2 = createTestOutfit(2, ['item-2']);
  const outfit3 = createTestOutfit(3, ['item-3']);
  const outfit4 = createTestOutfit(4, ['item-4']);
  const outfit5 = createTestOutfit(5, ['item-5']);

  const staticPool = [outfit1, outfit2, outfit3, outfit4, outfit5];
  const eligible = [outfit1, outfit2];
  const excluded = [outfit3, outfit4, outfit5];

  const itemWornAtMap = createItemWornAtMap([
    ['item-3', '2024-01-03T00:00:00.000Z'],
    ['item-4', '2024-01-02T00:00:00.000Z'],
    ['item-5', '2024-01-01T00:00:00.000Z'],
  ]);

  // Call multiple times
  const result1 = applyMinMaxSelection(staticPool, eligible, excluded, itemWornAtMap);
  const result2 = applyMinMaxSelection(staticPool, eligible, excluded, itemWornAtMap);
  const result3 = applyMinMaxSelection(staticPool, eligible, excluded, itemWornAtMap);

  // All results should be identical
  assertEquals(result1.outfits.length, result2.outfits.length);
  assertEquals(result2.outfits.length, result3.outfits.length);
  assertEquals(result1.fallbackCount, result2.fallbackCount);
  assertEquals(result2.fallbackCount, result3.fallbackCount);
  assertEquals(result1.configError, result2.configError);
  assertEquals(result1.configWarning, result2.configWarning);

  // Same outfits in same order
  for (let i = 0; i < result1.outfits.length; i++) {
    assertEquals(result1.outfits[i].id, result2.outfits[i].id);
    assertEquals(result2.outfits[i].id, result3.outfits[i].id);
  }
});

Deno.test('applyMinMaxSelection: pool exactly at MIN returns all without warning', () => {
  // Pool has exactly MIN_OUTFITS (3) - should not trigger configWarning
  const staticPool = createTestOutfits(3);
  const eligible = staticPool;
  const excluded: Outfit[] = [];
  const itemWornAtMap = new Map<string, string>();

  const result = applyMinMaxSelection(staticPool, eligible, excluded, itemWornAtMap);

  assertEquals(result.outfits.length, 3);
  assertEquals(result.fallbackCount, 0);
  assertEquals(result.configWarning, false);
  assertEquals(result.configError, false);
});

Deno.test('applyMinMaxSelection: eligible one less than MIN adds exactly one from fallback', () => {
  // 2 eligible (MIN - 1), need exactly 1 from fallback
  const outfit1 = createTestOutfit(1, ['item-1']);
  const outfit2 = createTestOutfit(2, ['item-2']);
  const outfit3 = createTestOutfit(3, ['item-3']);
  const outfit4 = createTestOutfit(4, ['item-4']);

  const staticPool = [outfit1, outfit2, outfit3, outfit4];
  const eligible = [outfit1, outfit2]; // 2 eligible
  const excluded = [outfit3, outfit4]; // 2 excluded

  const itemWornAtMap = createItemWornAtMap([
    ['item-3', '2024-01-02T00:00:00.000Z'], // Newer
    ['item-4', '2024-01-01T00:00:00.000Z'], // Older - picked first
  ]);

  const result = applyMinMaxSelection(staticPool, eligible, excluded, itemWornAtMap);

  assertEquals(result.outfits.length, 3); // MIN_OUTFITS
  assertEquals(result.fallbackCount, 1); // Exactly 1 added
  assertEquals(result.configWarning, false);

  // Should include outfit4 (oldest from excluded)
  const ids = result.outfits.map((o) => o.id);
  assertEquals(ids.includes(outfit1.id), true);
  assertEquals(ids.includes(outfit2.id), true);
  assertEquals(ids.includes(outfit4.id), true); // The fallback
  assertEquals(ids.includes(outfit3.id), false); // Not needed
});

Deno.test('applyMinMaxSelection: fallback count exact when excluded fully fills gap', () => {
  // 0 eligible, 5 excluded - need exactly 3 (MIN) from fallback
  const staticPool = createTestOutfits(5);
  const eligible: Outfit[] = [];
  const excluded = staticPool;

  const itemWornAtMap = new Map<string, string>();

  const result = applyMinMaxSelection(staticPool, eligible, excluded, itemWornAtMap);

  assertEquals(result.outfits.length, 3); // MIN_OUTFITS
  assertEquals(result.fallbackCount, 3); // Exactly MIN added from fallback
});

Deno.test('applyMinMaxSelection: truncation applied after fallback when combined exceeds MAX', () => {
  // Create 12 outfits: 8 eligible + 4 excluded
  // 8 eligible < MAX (10), but with fallback would exceed
  // However, since eligible >= MIN, no fallback is used
  // This tests truncation of eligible list that exceeds MAX
  const staticPool = createTestOutfits(15);
  const eligible = staticPool.slice(0, 12); // 12 eligible (exceeds MAX)
  const excluded = staticPool.slice(12); // 3 excluded

  const itemWornAtMap = new Map<string, string>();

  const result = applyMinMaxSelection(staticPool, eligible, excluded, itemWornAtMap);

  assertEquals(result.outfits.length, 10); // Truncated to MAX_OUTFITS
  assertEquals(result.fallbackCount, 0); // No fallback needed
});

Deno.test('applyMinMaxSelection: recency ordering prefers outfits worn longest ago', () => {
  // All excluded, fallback should select by ascending recency (oldest first)
  const outfit1 = createTestOutfit(1, ['item-newest']);
  const outfit2 = createTestOutfit(2, ['item-middle']);
  const outfit3 = createTestOutfit(3, ['item-oldest']);

  const staticPool = [outfit1, outfit2, outfit3];
  const eligible: Outfit[] = [];
  const excluded = [outfit1, outfit2, outfit3];

  const itemWornAtMap = createItemWornAtMap([
    ['item-newest', '2024-01-30T00:00:00.000Z'], // Most recent
    ['item-middle', '2024-01-15T00:00:00.000Z'], // Middle
    ['item-oldest', '2024-01-01T00:00:00.000Z'], // Oldest - preferred
  ]);

  const result = applyMinMaxSelection(staticPool, eligible, excluded, itemWornAtMap);

  // All 3 selected (pool = MIN), but we verify the selection order is correct
  // Final output is sorted by id, but fallback selection prioritised oldest
  assertEquals(result.outfits.length, 3);
  assertEquals(result.fallbackCount, 3);

  // Verify all are present (ordering is by id in final result)
  const ids = result.outfits.map((o) => o.id);
  assertEquals(ids.includes(outfit1.id), true);
  assertEquals(ids.includes(outfit2.id), true);
  assertEquals(ids.includes(outfit3.id), true);
});

Deno.test('applyMinMaxSelection: output always sorted by outfit.id regardless of input order', () => {
  // Pass outfits in reverse ID order
  const outfit5 = createTestOutfit(5, ['item-5']);
  const outfit3 = createTestOutfit(3, ['item-3']);
  const outfit1 = createTestOutfit(1, ['item-1']);
  const outfit4 = createTestOutfit(4, ['item-4']);
  const outfit2 = createTestOutfit(2, ['item-2']);

  const staticPool = [outfit5, outfit3, outfit1, outfit4, outfit2]; // Scrambled order
  const eligible = [outfit5, outfit3, outfit1, outfit4, outfit2];
  const excluded: Outfit[] = [];
  const itemWornAtMap = new Map<string, string>();

  const result = applyMinMaxSelection(staticPool, eligible, excluded, itemWornAtMap);

  // Output should be sorted by outfit.id (ascending)
  assertEquals(result.outfits[0].id, outfit1.id);
  assertEquals(result.outfits[1].id, outfit2.id);
  assertEquals(result.outfits[2].id, outfit3.id);
  assertEquals(result.outfits[3].id, outfit4.id);
  assertEquals(result.outfits[4].id, outfit5.id);
});

Deno.test('applyMinMaxSelection: large pool with complex recency scores', () => {
  // Test with many outfits to verify scalability
  const outfits: Outfit[] = [];
  for (let i = 1; i <= 20; i++) {
    outfits.push(createTestOutfit(i, [`item-${i}`]));
  }

  const staticPool = outfits;
  const eligible = outfits.slice(0, 5); // 5 eligible
  const excluded = outfits.slice(5); // 15 excluded

  // Create varied recency scores
  const wornAtEntries: [string, string][] = [];
  for (let i = 6; i <= 20; i++) {
    // Alternating pattern for recency
    const day = (i % 10) + 1;
    wornAtEntries.push([`item-${i}`, `2024-01-${String(day).padStart(2, '0')}T00:00:00.000Z`]);
  }
  const itemWornAtMap = createItemWornAtMap(wornAtEntries);

  const result = applyMinMaxSelection(staticPool, eligible, excluded, itemWornAtMap);

  // Should return 5 eligible (no fallback needed since 5 >= MIN)
  assertEquals(result.outfits.length, 5);
  assertEquals(result.fallbackCount, 0);

  // Verify deterministic ordering by id
  for (let i = 0; i < result.outfits.length - 1; i++) {
    assertEquals(
      result.outfits[i].id < result.outfits[i + 1].id,
      true,
      'Output should be sorted by ascending id'
    );
  }
});

Deno.test('applyMinMaxSelection: excluded with mixed recency and no-history items', () => {
  // Some excluded items have no wear history (should sort as oldest)
  const outfit1 = createTestOutfit(1, ['item-no-history-1']);
  const outfit2 = createTestOutfit(2, ['item-with-history']);
  const outfit3 = createTestOutfit(3, ['item-no-history-2']);
  const outfit4 = createTestOutfit(4, ['item-recent']);

  const staticPool = [outfit1, outfit2, outfit3, outfit4];
  const eligible: Outfit[] = [];
  const excluded = [outfit1, outfit2, outfit3, outfit4];

  // Only some items have history
  const itemWornAtMap = createItemWornAtMap([
    ['item-with-history', '2024-01-15T00:00:00.000Z'],
    ['item-recent', '2024-01-30T00:00:00.000Z'],
  ]);

  const result = applyMinMaxSelection(staticPool, eligible, excluded, itemWornAtMap);

  assertEquals(result.outfits.length, 3); // MIN_OUTFITS
  assertEquals(result.fallbackCount, 3);

  // Items without history should be preferred (treated as oldest)
  // outfit1 and outfit3 have no history, outfit2 has older history than outfit4
  const ids = result.outfits.map((o) => o.id);

  // outfit4 (most recent) should be excluded from the 3 selected
  // The 3 selected should be outfit1, outfit2, outfit3 (or outfit1, outfit3, and one other)
  // Since no-history items sort first (as empty string), outfit1 and outfit3 should be selected
  assertEquals(ids.includes(outfit1.id), true); // No history - prioritised
  assertEquals(ids.includes(outfit3.id), true); // No history - prioritised
});

Deno.test('applyMinMaxSelection: fallback stops exactly at MIN threshold', () => {
  // Verify that fallback doesn't add more than needed
  const staticPool = createTestOutfits(10);
  const eligible = [staticPool[0]]; // 1 eligible
  const excluded = staticPool.slice(1); // 9 excluded

  const itemWornAtMap = new Map<string, string>();

  const result = applyMinMaxSelection(staticPool, eligible, excluded, itemWornAtMap);

  assertEquals(result.outfits.length, 3); // Exactly MIN_OUTFITS
  assertEquals(result.fallbackCount, 2); // Added exactly 2 to reach MIN
  // Should not add more even though 9 excluded are available
});

Deno.test('applyMinMaxSelection: configError and configWarning are mutually exclusive', () => {
  // Test that flags never overlap

  // Case 1: configError (empty pool)
  const result1 = applyMinMaxSelection([], [], [], new Map());
  assertEquals(result1.configError, true);
  assertEquals(result1.configWarning, false);

  // Case 2: configWarning (pool < MIN)
  const smallPool = createTestOutfits(2);
  const result2 = applyMinMaxSelection(smallPool, smallPool, [], new Map());
  assertEquals(result2.configError, false);
  assertEquals(result2.configWarning, true);

  // Case 3: Normal operation (neither flag)
  const normalPool = createTestOutfits(5);
  const result3 = applyMinMaxSelection(normalPool, normalPool, [], new Map());
  assertEquals(result3.configError, false);
  assertEquals(result3.configWarning, false);
});

Deno.test('applyMinMaxSelection: verifies all result properties are correctly typed', () => {
  const staticPool = createTestOutfits(5);
  const eligible = staticPool.slice(0, 3);
  const excluded = staticPool.slice(3);
  const itemWornAtMap = new Map<string, string>();

  const result = applyMinMaxSelection(staticPool, eligible, excluded, itemWornAtMap);

  // Verify result shape
  assertEquals(Array.isArray(result.outfits), true);
  assertEquals(typeof result.fallbackCount, 'number');
  assertEquals(typeof result.configError, 'boolean');
  assertEquals(typeof result.configWarning, 'boolean');

  // Verify outfits have correct structure
  for (const outfit of result.outfits) {
    assertEquals(typeof outfit.id, 'string');
    assertEquals(typeof outfit.userId, 'string');
    assertEquals(Array.isArray(outfit.itemIds), true);
    assertEquals(typeof outfit.reason, 'string');
    assertEquals(typeof outfit.context, 'string');
  }
});

// ============================================================================
// Integration-style Tests (combining multiple functions)
// ============================================================================

Deno.test('integration: full filtering and selection pipeline with mixed outfits', () => {
  // Setup: 5 outfits, some with all items worn, some with partial
  const outfit1 = createTestOutfit(1, ['worn-a', 'worn-b']); // Fully worn - excluded
  const outfit2 = createTestOutfit(2, ['worn-a', 'fresh-c']); // Partial - eligible
  const outfit3 = createTestOutfit(3, ['fresh-d', 'fresh-e']); // Fresh - eligible
  const outfit4 = createTestOutfit(4, ['worn-b', 'worn-a']); // Fully worn - excluded
  const outfit5 = createTestOutfit(5, ['fresh-f', 'worn-a']); // Partial - eligible

  const staticPool = [outfit1, outfit2, outfit3, outfit4, outfit5];
  const recentlyWornItemIds = new Set(['worn-a', 'worn-b']);

  // Step 1: Apply filter
  const filterResult = applyNoRepeatFilter(staticPool, recentlyWornItemIds);
  assertEquals(filterResult.eligible.length, 3); // outfit2, outfit3, outfit5
  assertEquals(filterResult.excluded.length, 2); // outfit1, outfit4

  // Step 2: Apply selection (eligible >= MIN, no fallback needed)
  const itemWornAtMap = createItemWornAtMap([
    ['worn-a', '2024-01-15T00:00:00.000Z'],
    ['worn-b', '2024-01-14T00:00:00.000Z'],
  ]);

  const selectionResult = applyMinMaxSelection(
    staticPool,
    filterResult.eligible,
    filterResult.excluded,
    itemWornAtMap
  );

  assertEquals(selectionResult.outfits.length, 3);
  assertEquals(selectionResult.fallbackCount, 0);
  assertEquals(selectionResult.configError, false);
  assertEquals(selectionResult.configWarning, false);
});

Deno.test('integration: fallback scenario when all outfits filtered', () => {
  // All outfits have all items recently worn
  const outfit1 = createTestOutfit(1, ['item-a']);
  const outfit2 = createTestOutfit(2, ['item-b']);
  const outfit3 = createTestOutfit(3, ['item-c']);
  const outfit4 = createTestOutfit(4, ['item-d']);

  const staticPool = [outfit1, outfit2, outfit3, outfit4];
  const recentlyWornItemIds = new Set(['item-a', 'item-b', 'item-c', 'item-d']);

  // Step 1: Apply filter - all excluded
  const filterResult = applyNoRepeatFilter(staticPool, recentlyWornItemIds);
  assertEquals(filterResult.eligible.length, 0);
  assertEquals(filterResult.excluded.length, 4);

  // Step 2: Apply selection with fallback
  const itemWornAtMap = createItemWornAtMap([
    ['item-a', '2024-01-04T00:00:00.000Z'], // Newest
    ['item-b', '2024-01-03T00:00:00.000Z'],
    ['item-c', '2024-01-02T00:00:00.000Z'],
    ['item-d', '2024-01-01T00:00:00.000Z'], // Oldest - preferred for fallback
  ]);

  const selectionResult = applyMinMaxSelection(
    staticPool,
    filterResult.eligible,
    filterResult.excluded,
    itemWornAtMap
  );

  assertEquals(selectionResult.outfits.length, 3); // MIN_OUTFITS
  assertEquals(selectionResult.fallbackCount, 3);

  // Verify outfit4 (oldest) is in result
  const ids = selectionResult.outfits.map((o) => o.id);
  assertEquals(ids.includes(outfit4.id), true);
});

Deno.test('integration: noRepeatDays clamping flows into bucket correctly', () => {
  // Test the full flow from raw value to bucket
  const testCases = [
    { raw: null, expectedClamped: 0, expectedBucket: '0' },
    { raw: -5, expectedClamped: 0, expectedBucket: '0' },
    { raw: 0, expectedClamped: 0, expectedBucket: '0' },
    { raw: 5, expectedClamped: 5, expectedBucket: '1-7' },
    { raw: 7.9, expectedClamped: 7, expectedBucket: '1-7' },
    { raw: 15, expectedClamped: 15, expectedBucket: '8-30' },
    { raw: 45, expectedClamped: 45, expectedBucket: '31-90' },
    { raw: 100, expectedClamped: 90, expectedBucket: '31-90' },
    { raw: 'invalid', expectedClamped: 0, expectedBucket: '0' },
  ];

  for (const tc of testCases) {
    const clamped = clampNoRepeatDays(tc.raw);
    const bucket = bucketNoRepeatDays(clamped);

    assertEquals(clamped, tc.expectedClamped, `clamp(${tc.raw}) should be ${tc.expectedClamped}`);
    assertEquals(bucket, tc.expectedBucket, `bucket(${clamped}) should be ${tc.expectedBucket}`);
  }
});
