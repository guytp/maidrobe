# ADR-0001: No-Repeat Preferences Model Migration

## Status

Accepted

## Date

2025-Q1 (Story #446)

## Context

The original preferences model used a `noRepeatWindow` field with coarse preset buckets (0, 7, 14 days or null). This was implemented in Story #116 for the initial onboarding flow.

Story #446 introduces a Styling Preferences screen that requires:

1. **More granular presets**: Users want options like 3-day and 30-day windows
2. **Custom input**: Power users want exact day values (0-90 range)
3. **Mode selection**: Users can choose between item-level or outfit-level repeat avoidance

The existing bucket-based model cannot support these requirements without significant workarounds.

## Decision

Migrate from the bucket-based `noRepeatWindow` model to a direct `noRepeatDays` model:

### Schema Changes

**Before (Legacy):**

```typescript
interface PrefsFormData {
  noRepeatWindow: 0 | 7 | 14 | null; // Coarse buckets
}
```

**After (Current):**

```typescript
interface PrefsFormData {
  noRepeatWindow: NoRepeatWindow; // Deprecated, kept for compatibility
  noRepeatDays: number; // Exact value (0-90 range)
  noRepeatMode: 'item' | 'outfit'; // Repeat granularity
}
```

### Database Column

The database `prefs` table already uses `no_repeat_days INTEGER` (0-180 range), so no migration is needed at the database level.

### Type Changes

1. **NoRepeatWindowPreset**: New type adding 3 and 30 day presets (0, 3, 7, 14, 30, null)
2. **NoRepeatMode**: New type for repeat granularity ('item' | 'outfit')
3. **NoRepeatWindow**: Deprecated, retained for backward compatibility

### Migration Strategy

1. **Phase 1 (Current)**: Add new fields alongside deprecated field
   - `noRepeatDays` stores exact value
   - `noRepeatWindow` deprecated but still required for backward compatibility
   - New StylingPreferencesScreen uses `noRepeatDays` directly

2. **Phase 2 (Future)**: Make deprecated field optional
   - `noRepeatWindow` becomes optional in PrefsFormData
   - Update onboarding PrefsScreen to use `noRepeatDays`
   - Remove mapping functions

3. **Phase 3 (Future)**: Remove deprecated field
   - Delete `noRepeatWindow` from PrefsFormData
   - Delete `NoRepeatWindow` type
   - Delete related validation schemas

## Consequences

### Positive

- Supports exact day values (0-90) for power users
- Enables new preset options (3, 30 days) without type changes
- Cleaner data model with direct value storage
- Mode selection allows for more personalized recommendations

### Negative

- Temporary duplication during migration (two fields for same concept)
- Legacy onboarding screen needs update in future phase
- Deprecation documentation overhead

### Neutral

- No database migration required (column already supports range)
- Existing user data remains valid (7-day default maps directly)

## Files Affected

### Core Types

- `src/features/onboarding/utils/prefsTypes.ts` - Type definitions
- `src/features/onboarding/utils/prefsValidation.ts` - Zod schemas
- `src/features/onboarding/utils/prefsMapping.ts` - DB/UI mapping

### UI Components

- `src/features/profile/components/StylingPreferencesScreen.tsx` - New screen (uses noRepeatDays)
- `src/features/onboarding/components/PrefsScreen.tsx` - Legacy screen (uses noRepeatWindow)

### Tests

- `__tests__/profile/StylingPreferencesScreen.test.tsx` - New tests
- `__tests__/onboarding/prefsMapping.test.ts` - Mapping tests
- `__tests__/onboarding/prefsValidation.test.ts` - Validation tests

## Related

- Story #116: Style and Usage Preferences Capture (original implementation)
- Story #446: No-Repeat Preferences Backend Model and Styling Preferences UX (this migration)
- `src/features/onboarding/PREFS_IMPLEMENTATION_PLAN.md` - Original implementation plan
