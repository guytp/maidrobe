/**
 * Unit Tests for get-outfit-recommendations Edge Function
 *
 * This test suite covers the pure functions used in the
 * get-outfit-recommendations Edge Function.
 *
 * Functions under test:
 * - clampNoRepeatDays: Clamps noRepeatDays to valid range [0, 90] (Story #364)
 * - bucketNoRepeatDays: Privacy-safe bucketing for observability (Story #364)
 * - parseContextParams: Parses and validates context parameters (Story #365)
 * - applyFinalSelection: MIN/MAX selection with noRepeatRules integration (Story #364)
 *
 * @module tests/get-outfit-recommendations
 */

import { assertEquals } from 'std/assert/mod.ts';
import {
  clampNoRepeatDays,
  bucketNoRepeatDays,
  parseContextParams,
  applyFinalSelection,
} from '../supabase/functions/get-outfit-recommendations/index.ts';
import type {
  Outfit,
  OutfitWithMeta,
  OutfitNoRepeatMeta,
} from '../supabase/functions/get-outfit-recommendations/types.ts';
import {
  DEFAULT_OCCASION,
  DEFAULT_TEMPERATURE_BAND,
  MIN_OUTFITS_PER_RESPONSE,
  MAX_OUTFITS_PER_RESPONSE,
} from '../supabase/functions/get-outfit-recommendations/types.ts';
import type {
  ApplyNoRepeatRulesResult,
  FallbackCandidate,
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
 * Creates multiple test outfits with sequential IDs.
 */
function createTestOutfits(count: number): Outfit[] {
  return Array.from({ length: count }, (_, i: number) => createTestOutfit(i + 1));
}

/**
 * Creates an ApplyNoRepeatRulesResult with all strict outfits (no fallbacks).
 * Used for testing applyFinalSelection with strict-only scenarios.
 */
function createStrictOnlyResult(strictOutfits: Outfit[]): ApplyNoRepeatRulesResult {
  return {
    strictFiltered: strictOutfits,
    fallbackCandidates: [],
  };
}

/**
 * Creates a FallbackCandidate from an outfit with specified repeated items.
 */
function createFallbackCandidate(
  outfit: Outfit,
  repeatedItemIds: string[] = []
): FallbackCandidate {
  return {
    outfit,
    repeatedItems: repeatedItemIds.map((id: string) => ({ id })),
  };
}

/**
 * Creates an ApplyNoRepeatRulesResult with mixed strict and fallback outfits.
 */
function createMixedResult(
  strictOutfits: Outfit[],
  fallbackOutfits: { outfit: Outfit; repeatedItemIds: string[] }[]
): ApplyNoRepeatRulesResult {
  return {
    strictFiltered: strictOutfits,
    fallbackCandidates: fallbackOutfits.map((f: { outfit: Outfit; repeatedItemIds: string[] }) =>
      createFallbackCandidate(f.outfit, f.repeatedItemIds)
    ),
  };
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

  // Hex strings (JavaScript's Number() parses these since ES2015)
  assertEquals(clampNoRepeatDays('0x1E'), 30); // 0x1E = 30

  // Binary strings (JavaScript's Number() parses these since ES2015)
  // Note: Number('0b101') = 5, which is valid in range [0, 90]
  assertEquals(clampNoRepeatDays('0b101'), 5); // 0b101 = 5
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
    0,
    45,
    90, // Normal integers
    7.1,
    7.5,
    7.9, // Floats
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
    -Infinity,
    -1e10,
    -1000,
    -100,
    -1,
    -0.5,
    0,
    0.5,
    1,
    45,
    89,
    90,
    90.5,
    91,
    100,
    1000,
    1e10,
    Infinity,
    null,
    undefined,
    NaN,
    'invalid',
    '',
    '  ',
    '-50',
    '150',
    {},
    [],
    true,
    false,
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
    [0, '0'], // Disabled
    [1, '1-7'], // Minimal window
    [3, '1-7'], // Few days
    [7, '1-7'], // One week (common choice)
    [14, '8-30'], // Two weeks (common choice)
    [21, '8-30'], // Three weeks
    [30, '8-30'], // One month (common choice)
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
    0, 1, 2, 3, 4, 5, 6, 7, 8, 15, 20, 25, 30, 31, 45, 60, 75, 90, -5, 100, 0.5, 7.5, 30.5,
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
  assertEquals(bucketNoRepeatDays(1), bucketNoRepeatDays(7)); // Both '1-7'
  assertEquals(bucketNoRepeatDays(2), bucketNoRepeatDays(5)); // Both '1-7'
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
// applyFinalSelection Tests
// ============================================================================

// ---------------------------------------------------------------------------
// Configuration Error Tests (Empty Pool)
// ---------------------------------------------------------------------------

Deno.test('applyFinalSelection: returns configError for empty static pool', () => {
  const staticPool: Outfit[] = [];
  const rulesResult = createStrictOnlyResult([]);

  const result = applyFinalSelection(staticPool, rulesResult);

  assertEquals(result.outfits.length, 0);
  assertEquals(result.fallbackCount, 0);
  assertEquals(result.configError, true);
  assertEquals(result.configWarning, false);
  assertEquals(result.repeatedItemIds.length, 0);
});

// ---------------------------------------------------------------------------
// Configuration Warning Tests (Pool Smaller Than MIN)
// ---------------------------------------------------------------------------

Deno.test('applyFinalSelection: returns configWarning when pool smaller than MIN', () => {
  const staticPool = createTestOutfits(2); // Less than MIN_OUTFITS (3)
  const rulesResult = createStrictOnlyResult(staticPool);

  const result = applyFinalSelection(staticPool, rulesResult);

  assertEquals(result.outfits.length, 2);
  assertEquals(result.fallbackCount, 0);
  assertEquals(result.configError, false);
  assertEquals(result.configWarning, true);
});

Deno.test('applyFinalSelection: returns single outfit with configWarning', () => {
  const staticPool = createTestOutfits(1);
  const rulesResult = createStrictOnlyResult(staticPool);

  const result = applyFinalSelection(staticPool, rulesResult);

  assertEquals(result.outfits.length, 1);
  assertEquals(result.configWarning, true);
  assertEquals(result.configError, false);
});

Deno.test('applyFinalSelection: configWarning path skips filtering and returns full pool', () => {
  // Pool < MIN should return all outfits regardless of rulesResult
  const staticPool = createTestOutfits(2);
  // Even with empty strict results, should return full pool
  const rulesResult = createStrictOnlyResult([]);

  const result = applyFinalSelection(staticPool, rulesResult);

  assertEquals(result.outfits.length, 2);
  assertEquals(result.configWarning, true);
  assertEquals(result.fallbackCount, 0);
});

// ---------------------------------------------------------------------------
// Normal Operation - Strict Only
// ---------------------------------------------------------------------------

Deno.test('applyFinalSelection: uses strict results when count >= MIN', () => {
  const staticPool = createTestOutfits(5);
  const strictFiltered = staticPool.slice(0, 4); // 4 strict
  const rulesResult = createStrictOnlyResult(strictFiltered);

  const result = applyFinalSelection(staticPool, rulesResult);

  assertEquals(result.outfits.length, 4);
  assertEquals(result.fallbackCount, 0);
  assertEquals(result.configError, false);
  assertEquals(result.configWarning, false);
});

Deno.test('applyFinalSelection: exactly MIN strict outfits works correctly', () => {
  const staticPool = createTestOutfits(5);
  const strictFiltered = staticPool.slice(0, MIN_OUTFITS_PER_RESPONSE);
  const rulesResult = createStrictOnlyResult(strictFiltered);

  const result = applyFinalSelection(staticPool, rulesResult);

  assertEquals(result.outfits.length, MIN_OUTFITS_PER_RESPONSE);
  assertEquals(result.fallbackCount, 0);
});

Deno.test('applyFinalSelection: pool exactly at MIN returns all without warning', () => {
  const staticPool = createTestOutfits(MIN_OUTFITS_PER_RESPONSE);
  const rulesResult = createStrictOnlyResult(staticPool);

  const result = applyFinalSelection(staticPool, rulesResult);

  assertEquals(result.outfits.length, MIN_OUTFITS_PER_RESPONSE);
  assertEquals(result.fallbackCount, 0);
  assertEquals(result.configWarning, false);
  assertEquals(result.configError, false);
});

// ---------------------------------------------------------------------------
// Fallback Selection Tests
// ---------------------------------------------------------------------------

Deno.test('applyFinalSelection: adds fallbacks when strict < MIN', () => {
  const staticPool = createTestOutfits(5);
  const strictFiltered = [staticPool[0]]; // Only 1 strict
  const fallbackOutfits = [
    { outfit: staticPool[1], repeatedItemIds: ['item-2-a'] },
    { outfit: staticPool[2], repeatedItemIds: ['item-3-a'] },
    { outfit: staticPool[3], repeatedItemIds: ['item-4-a'] },
    { outfit: staticPool[4], repeatedItemIds: ['item-5-a'] },
  ];
  const rulesResult = createMixedResult(strictFiltered, fallbackOutfits);

  const result = applyFinalSelection(staticPool, rulesResult);

  assertEquals(result.outfits.length, MIN_OUTFITS_PER_RESPONSE);
  assertEquals(result.fallbackCount, 2); // Added 2 from fallback to reach MIN
  assertEquals(result.configError, false);
  assertEquals(result.configWarning, false);
});

Deno.test('applyFinalSelection: fallback stops exactly at MIN threshold', () => {
  const staticPool = createTestOutfits(10);
  const strictFiltered = [staticPool[0]]; // 1 strict
  const fallbackOutfits = staticPool.slice(1).map((o: Outfit) => ({
    outfit: o,
    repeatedItemIds: [o.itemIds[0]],
  }));
  const rulesResult = createMixedResult(strictFiltered, fallbackOutfits);

  const result = applyFinalSelection(staticPool, rulesResult);

  assertEquals(result.outfits.length, MIN_OUTFITS_PER_RESPONSE);
  assertEquals(result.fallbackCount, MIN_OUTFITS_PER_RESPONSE - 1); // Added exactly 2 to reach MIN
});

Deno.test('applyFinalSelection: one less than MIN strict adds exactly one fallback', () => {
  const staticPool = createTestOutfits(5);
  const strictFiltered = staticPool.slice(0, MIN_OUTFITS_PER_RESPONSE - 1); // 2 strict
  const fallbackOutfits = [
    { outfit: staticPool[2], repeatedItemIds: ['item-3-a'] },
    { outfit: staticPool[3], repeatedItemIds: ['item-4-a'] },
  ];
  const rulesResult = createMixedResult(strictFiltered, fallbackOutfits);

  const result = applyFinalSelection(staticPool, rulesResult);

  assertEquals(result.outfits.length, MIN_OUTFITS_PER_RESPONSE);
  assertEquals(result.fallbackCount, 1);
});

Deno.test('applyFinalSelection: zero strict, all fallback', () => {
  const staticPool = createTestOutfits(5);
  const fallbackOutfits = staticPool.map((o: Outfit) => ({
    outfit: o,
    repeatedItemIds: [o.itemIds[0]],
  }));
  const rulesResult = createMixedResult([], fallbackOutfits);

  const result = applyFinalSelection(staticPool, rulesResult);

  assertEquals(result.outfits.length, MIN_OUTFITS_PER_RESPONSE);
  assertEquals(result.fallbackCount, MIN_OUTFITS_PER_RESPONSE);
});

// ---------------------------------------------------------------------------
// MAX Truncation Tests
// ---------------------------------------------------------------------------

Deno.test('applyFinalSelection: truncates to MAX when strict exceeds limit', () => {
  const staticPool = createTestOutfits(15);
  const strictFiltered = staticPool.slice(0, 12); // 12 strict (exceeds MAX)
  const rulesResult = createStrictOnlyResult(strictFiltered);

  const result = applyFinalSelection(staticPool, rulesResult);

  assertEquals(result.outfits.length, MAX_OUTFITS_PER_RESPONSE);
  assertEquals(result.fallbackCount, 0);
});

Deno.test('applyFinalSelection: exactly MAX outfits returns all', () => {
  const staticPool = createTestOutfits(MAX_OUTFITS_PER_RESPONSE);
  const rulesResult = createStrictOnlyResult(staticPool);

  const result = applyFinalSelection(staticPool, rulesResult);

  assertEquals(result.outfits.length, MAX_OUTFITS_PER_RESPONSE);
});

// ---------------------------------------------------------------------------
// Repeated Item IDs Collection
// ---------------------------------------------------------------------------

Deno.test('applyFinalSelection: collects repeated item IDs from fallbacks', () => {
  const staticPool = createTestOutfits(5);
  const strictFiltered = [staticPool[0]];
  const fallbackOutfits = [
    { outfit: staticPool[1], repeatedItemIds: ['item-2-a', 'item-2-b'] },
    { outfit: staticPool[2], repeatedItemIds: ['item-3-a'] },
  ];
  const rulesResult = createMixedResult(strictFiltered, fallbackOutfits);

  const result = applyFinalSelection(staticPool, rulesResult);

  assertEquals(result.fallbackCount, 2);
  // Should contain all repeated item IDs from the fallbacks used
  assertEquals(result.repeatedItemIds.length, 3);
  assertEquals(result.repeatedItemIds.includes('item-2-a'), true);
  assertEquals(result.repeatedItemIds.includes('item-2-b'), true);
  assertEquals(result.repeatedItemIds.includes('item-3-a'), true);
});

Deno.test('applyFinalSelection: no repeated items when all strict', () => {
  const staticPool = createTestOutfits(5);
  const rulesResult = createStrictOnlyResult(staticPool);

  const result = applyFinalSelection(staticPool, rulesResult);

  assertEquals(result.fallbackCount, 0);
  assertEquals(result.repeatedItemIds.length, 0);
});

// ---------------------------------------------------------------------------
// Metadata Handling
// ---------------------------------------------------------------------------

Deno.test('applyFinalSelection: includes metadata by default', () => {
  const staticPool = createTestOutfits(5);
  const strictFiltered = [staticPool[0], staticPool[1], staticPool[2]];
  const rulesResult = createStrictOnlyResult(strictFiltered);

  const result = applyFinalSelection(staticPool, rulesResult, true);

  // Outfits should have noRepeatMeta
  for (const outfit of result.outfits) {
    const outfitWithMeta = outfit as Outfit & { noRepeatMeta?: unknown };
    assertEquals(outfitWithMeta.noRepeatMeta !== undefined, true);
  }
});

Deno.test('applyFinalSelection: excludes metadata when includeMetadata=false', () => {
  const staticPool = createTestOutfits(5);
  const strictFiltered = staticPool.slice(0, 3);
  const rulesResult = createStrictOnlyResult(strictFiltered);

  const result = applyFinalSelection(staticPool, rulesResult, false);

  // Outfits should NOT have noRepeatMeta
  for (const outfit of result.outfits) {
    const outfitWithMeta = outfit as Outfit & { noRepeatMeta?: unknown };
    assertEquals(outfitWithMeta.noRepeatMeta, undefined);
  }
});

// ---------------------------------------------------------------------------
// Metadata Content Verification Tests
// ---------------------------------------------------------------------------

Deno.test('applyFinalSelection: strict outfits have filterStatus=strict metadata', () => {
  const staticPool = createTestOutfits(5);
  const strictFiltered = staticPool.slice(0, 3);
  const rulesResult = createStrictOnlyResult(strictFiltered);

  const result = applyFinalSelection(staticPool, rulesResult, true);

  // All outfits should have strict metadata
  for (const outfit of result.outfits) {
    const outfitWithMeta = outfit as OutfitWithMeta;
    assertEquals(outfitWithMeta.noRepeatMeta !== undefined, true);
    const meta = outfitWithMeta.noRepeatMeta as OutfitNoRepeatMeta;
    assertEquals(meta.filterStatus, 'strict');
    assertEquals(Array.isArray(meta.repeatedItems), true);
    assertEquals(meta.repeatedItems.length, 0);
  }
});

Deno.test('applyFinalSelection: fallback outfits have filterStatus=fallback metadata', () => {
  const staticPool = createTestOutfits(5);
  // No strict outfits, all fallbacks
  const fallbackOutfits = staticPool.slice(0, 3).map((o: Outfit) => ({
    outfit: o,
    repeatedItemIds: [o.itemIds[0]],
  }));
  const rulesResult = createMixedResult([], fallbackOutfits);

  const result = applyFinalSelection(staticPool, rulesResult, true);

  // All outfits should have fallback metadata
  assertEquals(result.fallbackCount, 3);
  for (const outfit of result.outfits) {
    const outfitWithMeta = outfit as OutfitWithMeta;
    assertEquals(outfitWithMeta.noRepeatMeta !== undefined, true);
    const meta = outfitWithMeta.noRepeatMeta as OutfitNoRepeatMeta;
    assertEquals(meta.filterStatus, 'fallback');
  }
});

Deno.test('applyFinalSelection: fallback metadata contains correct repeatedItems', () => {
  const staticPool = createTestOutfits(5);
  const strictFiltered = [staticPool[0]];
  // Fallback with specific repeated item IDs
  const fallbackOutfits = [
    { outfit: staticPool[1], repeatedItemIds: ['repeated-item-a', 'repeated-item-b'] },
    { outfit: staticPool[2], repeatedItemIds: ['repeated-item-c'] },
  ];
  const rulesResult = createMixedResult(strictFiltered, fallbackOutfits);

  const result = applyFinalSelection(staticPool, rulesResult, true);

  // Find the fallback outfits in the result (sorted by ID)
  const fallbackResults = result.outfits.filter((o: OutfitWithMeta) => {
    const meta = o.noRepeatMeta as OutfitNoRepeatMeta | undefined;
    return meta?.filterStatus === 'fallback';
  });

  assertEquals(fallbackResults.length, 2);

  // Check that repeated items are correctly attached
  for (const outfit of fallbackResults) {
    const meta = (outfit as OutfitWithMeta).noRepeatMeta as OutfitNoRepeatMeta;
    assertEquals(meta.filterStatus, 'fallback');
    assertEquals(Array.isArray(meta.repeatedItems), true);
    assertEquals(meta.repeatedItems.length > 0, true);

    // Each repeated item should have an id property
    for (const item of meta.repeatedItems) {
      assertEquals(typeof item.id, 'string');
    }
  }
});

Deno.test('applyFinalSelection: mixed selection has correct metadata for each type', () => {
  const staticPool = createTestOutfits(5);
  const strictFiltered = [staticPool[0], staticPool[1]]; // 2 strict
  const fallbackOutfits = [{ outfit: staticPool[2], repeatedItemIds: ['item-3-repeated'] }]; // 1 fallback needed to reach MIN
  const rulesResult = createMixedResult(strictFiltered, fallbackOutfits);

  const result = applyFinalSelection(staticPool, rulesResult, true);

  assertEquals(result.outfits.length, MIN_OUTFITS_PER_RESPONSE);
  assertEquals(result.fallbackCount, 1);

  let strictCount = 0;
  let fallbackCount = 0;

  for (const outfit of result.outfits) {
    const outfitWithMeta = outfit as OutfitWithMeta;
    const meta = outfitWithMeta.noRepeatMeta as OutfitNoRepeatMeta;

    if (meta.filterStatus === 'strict') {
      strictCount++;
      assertEquals(meta.repeatedItems.length, 0);
    } else if (meta.filterStatus === 'fallback') {
      fallbackCount++;
      assertEquals(meta.repeatedItems.length > 0, true);
    }
  }

  assertEquals(strictCount, 2);
  assertEquals(fallbackCount, 1);
});

Deno.test('applyFinalSelection: configWarning path returns outfits without metadata', () => {
  // When pool < MIN, the configWarning path is taken which skips metadata
  const staticPool = createTestOutfits(2); // Less than MIN
  const rulesResult = createStrictOnlyResult(staticPool);

  const result = applyFinalSelection(staticPool, rulesResult, true);

  assertEquals(result.configWarning, true);
  assertEquals(result.outfits.length, 2);

  // configWarning path should not add noRepeatMeta
  for (const outfit of result.outfits) {
    const outfitWithMeta = outfit as OutfitWithMeta;
    assertEquals(outfitWithMeta.noRepeatMeta, undefined);
  }
});

Deno.test('applyFinalSelection: strict metadata repeatedItems is always empty array', () => {
  const staticPool = createTestOutfits(5);
  const strictFiltered = staticPool.slice(0, 4);
  const rulesResult = createStrictOnlyResult(strictFiltered);

  const result = applyFinalSelection(staticPool, rulesResult, true);

  for (const outfit of result.outfits) {
    const meta = (outfit as OutfitWithMeta).noRepeatMeta as OutfitNoRepeatMeta;
    assertEquals(meta.filterStatus, 'strict');
    assertEquals(meta.repeatedItems, []);
  }
});

Deno.test('applyFinalSelection: fallback repeatedItems contains item objects with id', () => {
  const staticPool = createTestOutfits(5);
  const fallbackOutfits = [
    { outfit: staticPool[0], repeatedItemIds: ['item-id-1'] },
    { outfit: staticPool[1], repeatedItemIds: ['item-id-2', 'item-id-3'] },
    { outfit: staticPool[2], repeatedItemIds: ['item-id-4'] },
  ];
  const rulesResult = createMixedResult([], fallbackOutfits);

  const result = applyFinalSelection(staticPool, rulesResult, true);

  assertEquals(result.fallbackCount, MIN_OUTFITS_PER_RESPONSE);

  for (const outfit of result.outfits) {
    const meta = (outfit as OutfitWithMeta).noRepeatMeta as OutfitNoRepeatMeta;
    assertEquals(meta.filterStatus, 'fallback');

    // Each item in repeatedItems should have an id
    for (const item of meta.repeatedItems) {
      assertEquals(typeof item.id, 'string');
      assertEquals(item.id.startsWith('item-id-'), true);
    }
  }
});

Deno.test('applyFinalSelection: metadata filterStatus is exactly strict or fallback', () => {
  const staticPool = createTestOutfits(5);
  const strictFiltered = [staticPool[0]];
  const fallbackOutfits = [
    { outfit: staticPool[1], repeatedItemIds: ['item-a'] },
    { outfit: staticPool[2], repeatedItemIds: ['item-b'] },
  ];
  const rulesResult = createMixedResult(strictFiltered, fallbackOutfits);

  const result = applyFinalSelection(staticPool, rulesResult, true);

  for (const outfit of result.outfits) {
    const meta = (outfit as OutfitWithMeta).noRepeatMeta as OutfitNoRepeatMeta;
    assertEquals(
      meta.filterStatus === 'strict' || meta.filterStatus === 'fallback',
      true,
      `filterStatus should be 'strict' or 'fallback', got '${meta.filterStatus}'`
    );
  }
});

Deno.test('applyFinalSelection: only used fallbacks contribute to repeatedItemIds', () => {
  const staticPool = createTestOutfits(5);
  const strictFiltered = [staticPool[0], staticPool[1]]; // 2 strict
  // 3 fallback candidates, but only 1 will be used to reach MIN
  const fallbackOutfits = [
    { outfit: staticPool[2], repeatedItemIds: ['used-item'] },
    { outfit: staticPool[3], repeatedItemIds: ['unused-item-a'] },
    { outfit: staticPool[4], repeatedItemIds: ['unused-item-b'] },
  ];
  const rulesResult = createMixedResult(strictFiltered, fallbackOutfits);

  const result = applyFinalSelection(staticPool, rulesResult, true);

  assertEquals(result.outfits.length, MIN_OUTFITS_PER_RESPONSE);
  assertEquals(result.fallbackCount, 1);

  // Only the first fallback should have been used
  assertEquals(result.repeatedItemIds.length, 1);
  assertEquals(result.repeatedItemIds.includes('used-item'), true);
  assertEquals(result.repeatedItemIds.includes('unused-item-a'), false);
  assertEquals(result.repeatedItemIds.includes('unused-item-b'), false);
});

// ---------------------------------------------------------------------------
// Deterministic Ordering Tests
// ---------------------------------------------------------------------------

Deno.test('applyFinalSelection: applies deterministic ordering to final result', () => {
  const outfit3 = createTestOutfit(3, ['item-3']);
  const outfit1 = createTestOutfit(1, ['item-1']);
  const outfit2 = createTestOutfit(2, ['item-2']);

  const staticPool = [outfit3, outfit1, outfit2]; // Out of ID order
  const rulesResult = createStrictOnlyResult([outfit3, outfit1, outfit2]);

  const result = applyFinalSelection(staticPool, rulesResult);

  // Should be sorted by outfit.id
  assertEquals(result.outfits[0].id, outfit1.id);
  assertEquals(result.outfits[1].id, outfit2.id);
  assertEquals(result.outfits[2].id, outfit3.id);
});

Deno.test(
  'applyFinalSelection: output always sorted by outfit.id regardless of input order',
  () => {
    const outfit5 = createTestOutfit(5, ['item-5']);
    const outfit3 = createTestOutfit(3, ['item-3']);
    const outfit1 = createTestOutfit(1, ['item-1']);
    const outfit4 = createTestOutfit(4, ['item-4']);
    const outfit2 = createTestOutfit(2, ['item-2']);

    const staticPool = [outfit5, outfit3, outfit1, outfit4, outfit2];
    const rulesResult = createStrictOnlyResult([outfit5, outfit3, outfit1, outfit4, outfit2]);

    const result = applyFinalSelection(staticPool, rulesResult);

    assertEquals(result.outfits[0].id, outfit1.id);
    assertEquals(result.outfits[1].id, outfit2.id);
    assertEquals(result.outfits[2].id, outfit3.id);
    assertEquals(result.outfits[3].id, outfit4.id);
    assertEquals(result.outfits[4].id, outfit5.id);
  }
);

// ---------------------------------------------------------------------------
// Purity and Determinism Tests
// ---------------------------------------------------------------------------

Deno.test('applyFinalSelection: is pure - does not modify input arrays', () => {
  const outfit1 = createTestOutfit(1, ['item-1']);
  const outfit2 = createTestOutfit(2, ['item-2']);
  const outfit3 = createTestOutfit(3, ['item-3']);
  const outfit4 = createTestOutfit(4, ['item-4']);

  const staticPool = [outfit1, outfit2, outfit3, outfit4];
  const originalStaticPoolLength = staticPool.length;
  const originalStaticPoolIds = staticPool.map((o: Outfit) => o.id);

  const strictFiltered = [outfit1];
  const originalStrictLength = strictFiltered.length;

  const fallbackCandidates: FallbackCandidate[] = [
    createFallbackCandidate(outfit2, ['item-2-a']),
    createFallbackCandidate(outfit3, ['item-3-a']),
    createFallbackCandidate(outfit4, ['item-4-a']),
  ];
  const originalFallbackLength = fallbackCandidates.length;

  const rulesResult: ApplyNoRepeatRulesResult = {
    strictFiltered,
    fallbackCandidates,
  };

  applyFinalSelection(staticPool, rulesResult);

  // Verify inputs were not mutated
  assertEquals(staticPool.length, originalStaticPoolLength);
  assertEquals(
    staticPool.map((o: Outfit) => o.id),
    originalStaticPoolIds
  );
  assertEquals(rulesResult.strictFiltered.length, originalStrictLength);
  assertEquals(rulesResult.fallbackCandidates.length, originalFallbackLength);
});

Deno.test('applyFinalSelection: is deterministic - same inputs produce same outputs', () => {
  const staticPool = createTestOutfits(5);
  const strictFiltered = staticPool.slice(0, 2);
  const fallbackOutfits = [
    { outfit: staticPool[2], repeatedItemIds: ['item-3-a'] },
    { outfit: staticPool[3], repeatedItemIds: ['item-4-a'] },
    { outfit: staticPool[4], repeatedItemIds: ['item-5-a'] },
  ];
  const rulesResult = createMixedResult(strictFiltered, fallbackOutfits);

  // Call multiple times
  const result1 = applyFinalSelection(staticPool, rulesResult);
  const result2 = applyFinalSelection(staticPool, rulesResult);
  const result3 = applyFinalSelection(staticPool, rulesResult);

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

// ---------------------------------------------------------------------------
// configError and configWarning Mutual Exclusivity
// ---------------------------------------------------------------------------

Deno.test('applyFinalSelection: configError and configWarning are mutually exclusive', () => {
  // Case 1: configError (empty pool)
  const emptyResult = applyFinalSelection([], createStrictOnlyResult([]));
  assertEquals(emptyResult.configError, true);
  assertEquals(emptyResult.configWarning, false);

  // Case 2: configWarning (pool < MIN)
  const smallPool = createTestOutfits(2);
  const smallResult = applyFinalSelection(smallPool, createStrictOnlyResult(smallPool));
  assertEquals(smallResult.configError, false);
  assertEquals(smallResult.configWarning, true);

  // Case 3: Normal operation (neither flag)
  const normalPool = createTestOutfits(5);
  const normalResult = applyFinalSelection(normalPool, createStrictOnlyResult(normalPool));
  assertEquals(normalResult.configError, false);
  assertEquals(normalResult.configWarning, false);
});

// ---------------------------------------------------------------------------
// Result Shape Verification
// ---------------------------------------------------------------------------

Deno.test('applyFinalSelection: verifies all result properties are correctly typed', () => {
  const staticPool = createTestOutfits(5);
  const rulesResult = createStrictOnlyResult(staticPool.slice(0, 3));

  const result = applyFinalSelection(staticPool, rulesResult);

  // Verify result shape
  assertEquals(Array.isArray(result.outfits), true);
  assertEquals(typeof result.fallbackCount, 'number');
  assertEquals(typeof result.configError, 'boolean');
  assertEquals(typeof result.configWarning, 'boolean');
  assertEquals(Array.isArray(result.repeatedItemIds), true);

  // Verify outfits have correct structure
  for (const outfit of result.outfits) {
    assertEquals(typeof outfit.id, 'string');
    assertEquals(typeof outfit.userId, 'string');
    assertEquals(Array.isArray(outfit.itemIds), true);
    assertEquals(typeof outfit.reason, 'string');
    assertEquals(typeof outfit.context, 'string');
  }
});

// ---------------------------------------------------------------------------
// Integration Tests
// ---------------------------------------------------------------------------

Deno.test('integration: noRepeatDays clamping flows into bucket correctly', () => {
  // Test the full flow from raw value to bucket
  const testCases: { raw: unknown; expectedClamped: number; expectedBucket: string }[] = [
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

// ============================================================================
// parseContextParams Tests (Story #365)
// ============================================================================

// ---------------------------------------------------------------------------
// Empty Request Body Tests
// ---------------------------------------------------------------------------

Deno.test('parseContextParams: returns defaults for null body', () => {
  const result = parseContextParams(null);

  assertEquals(result.occasion, DEFAULT_OCCASION);
  assertEquals(result.temperatureBand, DEFAULT_TEMPERATURE_BAND);
  assertEquals(result.wasProvided, false);
});

Deno.test('parseContextParams: returns defaults for undefined body', () => {
  const result = parseContextParams(undefined);

  assertEquals(result.occasion, DEFAULT_OCCASION);
  assertEquals(result.temperatureBand, DEFAULT_TEMPERATURE_BAND);
  assertEquals(result.wasProvided, false);
});

// ---------------------------------------------------------------------------
// Missing contextParams Tests
// ---------------------------------------------------------------------------

Deno.test('parseContextParams: returns defaults for empty object body', () => {
  const result = parseContextParams({});

  assertEquals(result.occasion, DEFAULT_OCCASION);
  assertEquals(result.temperatureBand, DEFAULT_TEMPERATURE_BAND);
  assertEquals(result.wasProvided, false);
});

Deno.test('parseContextParams: returns defaults for body without contextParams key', () => {
  const result = parseContextParams({ someOtherField: 'value' });

  assertEquals(result.occasion, DEFAULT_OCCASION);
  assertEquals(result.temperatureBand, DEFAULT_TEMPERATURE_BAND);
  assertEquals(result.wasProvided, false);
});

Deno.test('parseContextParams: returns defaults for body with null contextParams', () => {
  const result = parseContextParams({ contextParams: null });

  assertEquals(result.occasion, DEFAULT_OCCASION);
  assertEquals(result.temperatureBand, DEFAULT_TEMPERATURE_BAND);
  assertEquals(result.wasProvided, false);
});

Deno.test('parseContextParams: returns defaults for body with undefined contextParams', () => {
  const result = parseContextParams({ contextParams: undefined });

  assertEquals(result.occasion, DEFAULT_OCCASION);
  assertEquals(result.temperatureBand, DEFAULT_TEMPERATURE_BAND);
  assertEquals(result.wasProvided, false);
});

// ---------------------------------------------------------------------------
// Non-Object Body Tests
// ---------------------------------------------------------------------------

Deno.test('parseContextParams: returns defaults for string body', () => {
  const result = parseContextParams('not an object');

  assertEquals(result.occasion, DEFAULT_OCCASION);
  assertEquals(result.temperatureBand, DEFAULT_TEMPERATURE_BAND);
  assertEquals(result.wasProvided, false);
});

Deno.test('parseContextParams: returns defaults for number body', () => {
  const result = parseContextParams(42);

  assertEquals(result.occasion, DEFAULT_OCCASION);
  assertEquals(result.temperatureBand, DEFAULT_TEMPERATURE_BAND);
  assertEquals(result.wasProvided, false);
});

Deno.test('parseContextParams: returns defaults for boolean body', () => {
  const result = parseContextParams(true);

  assertEquals(result.occasion, DEFAULT_OCCASION);
  assertEquals(result.temperatureBand, DEFAULT_TEMPERATURE_BAND);
  assertEquals(result.wasProvided, false);
});

Deno.test('parseContextParams: returns defaults for array body', () => {
  // Note: arrays are typeof 'object', but don't have contextParams property
  const result = parseContextParams([1, 2, 3]);

  assertEquals(result.occasion, DEFAULT_OCCASION);
  assertEquals(result.temperatureBand, DEFAULT_TEMPERATURE_BAND);
  assertEquals(result.wasProvided, false);
});

// ---------------------------------------------------------------------------
// Non-Object contextParams Tests
// ---------------------------------------------------------------------------

Deno.test(
  'parseContextParams: returns defaults with wasProvided=true for string contextParams',
  () => {
    const result = parseContextParams({ contextParams: 'not an object' });

    assertEquals(result.occasion, DEFAULT_OCCASION);
    assertEquals(result.temperatureBand, DEFAULT_TEMPERATURE_BAND);
    assertEquals(result.wasProvided, true);
  }
);

Deno.test(
  'parseContextParams: returns defaults with wasProvided=true for number contextParams',
  () => {
    const result = parseContextParams({ contextParams: 123 });

    assertEquals(result.occasion, DEFAULT_OCCASION);
    assertEquals(result.temperatureBand, DEFAULT_TEMPERATURE_BAND);
    assertEquals(result.wasProvided, true);
  }
);

Deno.test(
  'parseContextParams: returns defaults with wasProvided=true for boolean contextParams',
  () => {
    const result = parseContextParams({ contextParams: false });

    assertEquals(result.occasion, DEFAULT_OCCASION);
    assertEquals(result.temperatureBand, DEFAULT_TEMPERATURE_BAND);
    assertEquals(result.wasProvided, true);
  }
);

Deno.test(
  'parseContextParams: returns defaults with wasProvided=true for array contextParams',
  () => {
    const result = parseContextParams({ contextParams: ['everyday', 'cool'] });

    assertEquals(result.occasion, DEFAULT_OCCASION);
    assertEquals(result.temperatureBand, DEFAULT_TEMPERATURE_BAND);
    assertEquals(result.wasProvided, true);
  }
);

// ---------------------------------------------------------------------------
// Unknown/Invalid Occasion Tests
// ---------------------------------------------------------------------------

Deno.test('parseContextParams: falls back to default for unknown occasion string', () => {
  const result = parseContextParams({
    contextParams: { occasion: 'unknown_occasion', temperatureBand: 'cool' },
  });

  assertEquals(result.occasion, DEFAULT_OCCASION);
  assertEquals(result.temperatureBand, 'cool');
  assertEquals(result.wasProvided, true);
});

Deno.test('parseContextParams: falls back to default for numeric occasion', () => {
  const result = parseContextParams({
    contextParams: { occasion: 42, temperatureBand: 'mild' },
  });

  assertEquals(result.occasion, DEFAULT_OCCASION);
  assertEquals(result.temperatureBand, 'mild');
  assertEquals(result.wasProvided, true);
});

Deno.test('parseContextParams: falls back to default for null occasion', () => {
  const result = parseContextParams({
    contextParams: { occasion: null, temperatureBand: 'warm' },
  });

  assertEquals(result.occasion, DEFAULT_OCCASION);
  assertEquals(result.temperatureBand, 'warm');
  assertEquals(result.wasProvided, true);
});

Deno.test('parseContextParams: falls back to default for object occasion', () => {
  const result = parseContextParams({
    contextParams: { occasion: { type: 'work' }, temperatureBand: 'auto' },
  });

  assertEquals(result.occasion, DEFAULT_OCCASION);
  assertEquals(result.temperatureBand, 'auto');
  assertEquals(result.wasProvided, true);
});

Deno.test('parseContextParams: falls back to default for empty string occasion', () => {
  const result = parseContextParams({
    contextParams: { occasion: '', temperatureBand: 'cool' },
  });

  assertEquals(result.occasion, DEFAULT_OCCASION);
  assertEquals(result.temperatureBand, 'cool');
  assertEquals(result.wasProvided, true);
});

// ---------------------------------------------------------------------------
// Unknown/Invalid TemperatureBand Tests
// ---------------------------------------------------------------------------

Deno.test('parseContextParams: falls back to default for unknown temperatureBand string', () => {
  const result = parseContextParams({
    contextParams: { occasion: 'date', temperatureBand: 'freezing' },
  });

  assertEquals(result.occasion, 'date');
  assertEquals(result.temperatureBand, DEFAULT_TEMPERATURE_BAND);
  assertEquals(result.wasProvided, true);
});

Deno.test('parseContextParams: falls back to default for numeric temperatureBand', () => {
  const result = parseContextParams({
    contextParams: { occasion: 'weekend', temperatureBand: 25 },
  });

  assertEquals(result.occasion, 'weekend');
  assertEquals(result.temperatureBand, DEFAULT_TEMPERATURE_BAND);
  assertEquals(result.wasProvided, true);
});

Deno.test('parseContextParams: falls back to default for null temperatureBand', () => {
  const result = parseContextParams({
    contextParams: { occasion: 'event', temperatureBand: null },
  });

  assertEquals(result.occasion, 'event');
  assertEquals(result.temperatureBand, DEFAULT_TEMPERATURE_BAND);
  assertEquals(result.wasProvided, true);
});

Deno.test('parseContextParams: falls back to default for object temperatureBand', () => {
  const result = parseContextParams({
    contextParams: { occasion: 'work_meeting', temperatureBand: { temp: 'cold' } },
  });

  assertEquals(result.occasion, 'work_meeting');
  assertEquals(result.temperatureBand, DEFAULT_TEMPERATURE_BAND);
  assertEquals(result.wasProvided, true);
});

// ---------------------------------------------------------------------------
// Partial Object Tests (only one field provided)
// ---------------------------------------------------------------------------

Deno.test('parseContextParams: uses default temperatureBand when only occasion provided', () => {
  const result = parseContextParams({
    contextParams: { occasion: 'date' },
  });

  assertEquals(result.occasion, 'date');
  assertEquals(result.temperatureBand, DEFAULT_TEMPERATURE_BAND);
  assertEquals(result.wasProvided, true);
});

Deno.test('parseContextParams: uses default occasion when only temperatureBand provided', () => {
  const result = parseContextParams({
    contextParams: { temperatureBand: 'cool' },
  });

  assertEquals(result.occasion, DEFAULT_OCCASION);
  assertEquals(result.temperatureBand, 'cool');
  assertEquals(result.wasProvided, true);
});

Deno.test('parseContextParams: handles empty contextParams object', () => {
  const result = parseContextParams({
    contextParams: {},
  });

  assertEquals(result.occasion, DEFAULT_OCCASION);
  assertEquals(result.temperatureBand, DEFAULT_TEMPERATURE_BAND);
  assertEquals(result.wasProvided, true);
});

// ---------------------------------------------------------------------------
// Valid Complete Object Tests
// ---------------------------------------------------------------------------

Deno.test('parseContextParams: accepts valid everyday occasion', () => {
  const result = parseContextParams({
    contextParams: { occasion: 'everyday', temperatureBand: 'mild' },
  });

  assertEquals(result.occasion, 'everyday');
  assertEquals(result.temperatureBand, 'mild');
  assertEquals(result.wasProvided, true);
});

Deno.test('parseContextParams: accepts valid work_meeting occasion', () => {
  const result = parseContextParams({
    contextParams: { occasion: 'work_meeting', temperatureBand: 'cool' },
  });

  assertEquals(result.occasion, 'work_meeting');
  assertEquals(result.temperatureBand, 'cool');
  assertEquals(result.wasProvided, true);
});

Deno.test('parseContextParams: accepts valid date occasion', () => {
  const result = parseContextParams({
    contextParams: { occasion: 'date', temperatureBand: 'warm' },
  });

  assertEquals(result.occasion, 'date');
  assertEquals(result.temperatureBand, 'warm');
  assertEquals(result.wasProvided, true);
});

Deno.test('parseContextParams: accepts valid weekend occasion', () => {
  const result = parseContextParams({
    contextParams: { occasion: 'weekend', temperatureBand: 'auto' },
  });

  assertEquals(result.occasion, 'weekend');
  assertEquals(result.temperatureBand, 'auto');
  assertEquals(result.wasProvided, true);
});

Deno.test('parseContextParams: accepts valid event occasion', () => {
  const result = parseContextParams({
    contextParams: { occasion: 'event', temperatureBand: 'mild' },
  });

  assertEquals(result.occasion, 'event');
  assertEquals(result.temperatureBand, 'mild');
  assertEquals(result.wasProvided, true);
});

Deno.test('parseContextParams: accepts all valid temperatureBand values', () => {
  const bands = ['cool', 'mild', 'warm', 'auto'] as const;

  for (const band of bands) {
    const result = parseContextParams({
      contextParams: { occasion: 'everyday', temperatureBand: band },
    });

    assertEquals(result.temperatureBand, band, `Should accept temperatureBand '${band}'`);
  }
});

Deno.test('parseContextParams: accepts all valid occasion values', () => {
  const occasions = ['everyday', 'work_meeting', 'date', 'weekend', 'event'] as const;

  for (const occasion of occasions) {
    const result = parseContextParams({
      contextParams: { occasion, temperatureBand: 'auto' },
    });

    assertEquals(result.occasion, occasion, `Should accept occasion '${occasion}'`);
  }
});

// ---------------------------------------------------------------------------
// wasProvided Flag Tests
// ---------------------------------------------------------------------------

Deno.test('parseContextParams: wasProvided is false when body is null', () => {
  const result = parseContextParams(null);
  assertEquals(result.wasProvided, false);
});

Deno.test('parseContextParams: wasProvided is false when contextParams is missing', () => {
  const result = parseContextParams({ otherField: 123 });
  assertEquals(result.wasProvided, false);
});

Deno.test('parseContextParams: wasProvided is true when contextParams is present but empty', () => {
  const result = parseContextParams({ contextParams: {} });
  assertEquals(result.wasProvided, true);
});

Deno.test('parseContextParams: wasProvided is true when contextParams has invalid values', () => {
  const result = parseContextParams({
    contextParams: { occasion: 'invalid', temperatureBand: 'invalid' },
  });
  assertEquals(result.wasProvided, true);
});

Deno.test('parseContextParams: wasProvided is true when contextParams is a non-object type', () => {
  const result = parseContextParams({ contextParams: 'string' });
  assertEquals(result.wasProvided, true);
});

// ---------------------------------------------------------------------------
// Edge Cases and Determinism Tests
// ---------------------------------------------------------------------------

Deno.test('parseContextParams: is deterministic - same input produces same output', () => {
  const body = { contextParams: { occasion: 'date', temperatureBand: 'cool' } };

  const result1 = parseContextParams(body);
  const result2 = parseContextParams(body);
  const result3 = parseContextParams(body);

  assertEquals(result1.occasion, result2.occasion);
  assertEquals(result2.occasion, result3.occasion);
  assertEquals(result1.temperatureBand, result2.temperatureBand);
  assertEquals(result1.wasProvided, result2.wasProvided);
});

Deno.test('parseContextParams: is pure - does not modify input object', () => {
  const body = {
    contextParams: { occasion: 'weekend', temperatureBand: 'warm' },
    otherField: 'preserved',
  };

  const originalContextParams = { ...body.contextParams };
  const originalOtherField = body.otherField;

  parseContextParams(body);

  assertEquals(body.contextParams.occasion, originalContextParams.occasion);
  assertEquals(body.contextParams.temperatureBand, originalContextParams.temperatureBand);
  assertEquals(body.otherField, originalOtherField);
});

Deno.test('parseContextParams: ignores extra fields in contextParams', () => {
  const result = parseContextParams({
    contextParams: {
      occasion: 'event',
      temperatureBand: 'mild',
      extraField: 'ignored',
      anotherField: 123,
    },
  });

  assertEquals(result.occasion, 'event');
  assertEquals(result.temperatureBand, 'mild');
  assertEquals(result.wasProvided, true);
});

Deno.test('parseContextParams: handles deeply nested invalid structures gracefully', () => {
  const result = parseContextParams({
    contextParams: {
      occasion: { nested: { deep: 'value' } },
      temperatureBand: [['array', 'of', 'arrays']],
    },
  });

  assertEquals(result.occasion, DEFAULT_OCCASION);
  assertEquals(result.temperatureBand, DEFAULT_TEMPERATURE_BAND);
  assertEquals(result.wasProvided, true);
});

Deno.test('parseContextParams: case-sensitive occasion validation', () => {
  // Occasion values should be exact matches (case-sensitive)
  const result = parseContextParams({
    contextParams: { occasion: 'EVERYDAY', temperatureBand: 'cool' },
  });

  assertEquals(result.occasion, DEFAULT_OCCASION, 'EVERYDAY should not match everyday');
  assertEquals(result.temperatureBand, 'cool');
});

Deno.test('parseContextParams: case-sensitive temperatureBand validation', () => {
  // TemperatureBand values should be exact matches (case-sensitive)
  const result = parseContextParams({
    contextParams: { occasion: 'date', temperatureBand: 'COOL' },
  });

  assertEquals(result.occasion, 'date');
  assertEquals(result.temperatureBand, DEFAULT_TEMPERATURE_BAND, 'COOL should not match cool');
});

Deno.test('parseContextParams: handles whitespace in string values', () => {
  const result = parseContextParams({
    contextParams: { occasion: ' everyday ', temperatureBand: ' cool ' },
  });

  // Whitespace-padded values should not match (exact match required)
  assertEquals(result.occasion, DEFAULT_OCCASION);
  assertEquals(result.temperatureBand, DEFAULT_TEMPERATURE_BAND);
});
