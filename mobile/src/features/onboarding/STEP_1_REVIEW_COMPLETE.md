# Step 1 Review: Existing Onboarding Prefs Infrastructure

**Date:** 2025-11-17
**Story:** #116 - Onboarding Style and Usage Preferences Capture
**Step:** 1 - Review existing onboarding feature structure

## Executive Summary

The existing onboarding prefs infrastructure is **COMPLETE and PRODUCTION-READY**. All data access, mapping, validation, and domain logic utilities exist and fully implement the requirements from the user story. No refinements are needed to the existing code.

## Infrastructure Review

### 1. Data Access Layer (mobile/src/features/onboarding/api/)

#### useUserPrefs.ts - COMPLETE

- **Purpose:** Fetch current user's preferences from Supabase
- **Status:** Fully implemented with all required features
- **Key Features:**
  - Uses React Query with cache key pattern: `['prefs', userId]`
  - Returns `PrefsRow | null` (null when user has no prefs)
  - Supabase query uses `maybeSingle()` for null safety
  - Error classification: network, server, schema
  - Privacy-compliant logging (no free-text)
  - Stale-while-revalidate: 30s stale, 5min cache
  - Only runs when user is authenticated
- **Alignment:** Meets AC2 requirements for loading existing prefs

#### useSavePrefs.ts - COMPLETE

- **Purpose:** Create or update user preferences
- **Status:** Fully implemented with all required features
- **Key Features:**
  - Request type: `SavePrefsRequest{userId, data, existingData}`
  - Uses Supabase upsert for atomic insert-or-update
  - Computes PATCH delta via `getChangedFields(data, existingData)`
  - Validates payloads with Zod schemas
  - Retry strategy: 3 retries with exponential backoff (1s, 2s, 4s) + jitter
  - Does NOT retry validation errors (permanent failures)
  - Privacy-safe success logging: boolean flags only
  - Never logs free-text content (comfort_notes, exclusions.freeText)
  - Invalidates cache on success
- **Alignment:** Meets AC4, AC5, AC7 requirements for save operations

### 2. Domain Types (mobile/src/features/onboarding/utils/prefsTypes.ts)

#### Type Definitions - COMPLETE

- **PrefsRow:** Database schema (snake_case)
  - `user_id: string`
  - `no_repeat_days: number | null`
  - `colour_prefs: string[]`
  - `exclusions: string[]`
  - `comfort_notes: string | null`
  - `created_at?: string`
  - `updated_at?: string`

- **PrefsFormData:** UI model (camelCase)
  - `colourTendency: ColourTendency` ('neutrals' | 'some_colour' | 'bold_colours' | 'not_sure')
  - `exclusions: ExclusionsData` ({checklist: ExclusionTag[], freeText: string})
  - `noRepeatWindow: NoRepeatWindow` (0 | 7 | 14 | null)
  - `comfortNotes: string`

- **PrefsUpdatePayload:** Partial update (PATCH semantics)
  - All fields optional except user_id/timestamps

#### Constants - COMPLETE

- `EXCLUSION_TAGS`: ['skirts', 'shorts', 'crop_tops', 'heels', 'suits_blazers', 'sleeveless_tops']
- `COLOUR_TAGS`: ['neutrals', 'some_colour', 'bold_colours']
- `DEFAULT_PREFS_FORM_DATA`: Empty/neutral state for new users

**Alignment:** Exactly matches user story domain model section

### 3. Validation (mobile/src/features/onboarding/utils/prefsValidation.ts)

#### Zod Schemas - COMPLETE

- `PrefsRowSchema`: Validates database responses
- `PrefsFormDataSchema`: Validates UI form data
- `PrefsUpdatePayloadSchema`: Validates partial updates
- `ExclusionsDataSchema`: Validates exclusions structure
- `ColourTendencySchema`: Validates colour tendency options
- `NoRepeatWindowSchema`: Validates no-repeat window values

#### Constants

- `MAX_COMFORT_NOTES_LENGTH = 500`

#### Type Guards - COMPLETE

- `isValidExclusionTag(tag): tag is ExclusionTag`
- `isValidColourTag(tag): tag is ColourTag`

#### Validators - COMPLETE

- `validateFormData(data): PrefsFormData`
- `validatePrefsRow(data): PrefsRow`
- `validateUpdatePayload(data): PrefsUpdatePayload`

**Alignment:** Provides runtime safety for all data transformations

### 4. Mapping Utilities (mobile/src/features/onboarding/utils/prefsMapping.ts)

#### Database <-> UI Transformations - COMPLETE

**toFormData(row: PrefsRow | null): PrefsFormData**

- Converts database row to UI form data
- Returns DEFAULT_PREFS_FORM_DATA when row is null
- Maps colour_prefs array to single ColourTendency
- Splits exclusions into checklist + freeText
- Maps no_repeat_days ranges to window buckets
- Trims comfort_notes and converts null to empty string

**toPrefsRow(form: PrefsFormData, userId: string): PrefsRow**

- Converts UI form data to complete database row
- Used for INSERT operations
- Maps ColourTendency to colour_prefs array
- Joins exclusions with "free:" prefix
- Maps window to exact days
- Converts empty notes to null

**toUpdatePayload(form: PrefsFormData): PrefsUpdatePayload**

- Converts UI form data to partial update payload
- Used for full UPDATE operations
- Omits user_id and timestamps

**hasAnyData(form: PrefsFormData): boolean**

- Checks if form contains meaningful user input
- Returns false when all fields are default/empty
- Used to decide whether to INSERT a prefs row

**getChangedFields(current: PrefsFormData, previous: PrefsFormData): PrefsUpdatePayload**

- Computes delta between two form states
- Returns only changed fields
- Implements PATCH semantics
- Deep comparison for arrays and objects

#### Field-Specific Mapping - COMPLETE

**Colour Tendencies**

- `mapColourPrefsToTendency(tags): ColourTendency`
  - [] -> 'not_sure'
  - ["neutrals"] -> 'neutrals'
  - ["some_colour"] -> 'some_colour'
  - ["bold_colours"] -> 'bold_colours'
  - Unknown tags -> 'not_sure' (graceful degradation)

- `mapColourTendencyToPrefs(tendency): string[]`
  - 'not_sure' -> []
  - Others -> [tendency]

**Exclusions**

- `splitExclusions(tags): ExclusionsData`
  - Separates known checklist tags from "free:" prefixed entries
  - Joins free-text entries with newlines
  - Unknown tags silently ignored

- `joinExclusions(data): string[]`
  - Combines checklist tags and free-text entries
  - Prefixes free-text with "free:"
  - Avoids double-prefixing
  - Filters empty lines

**No-Repeat Window**

- `mapNoRepeatDaysToWindow(days): NoRepeatWindow`
  - 0 -> 0
  - 1-10 -> 7
  - 11-21 -> 14
  - null, negative, 22+ -> null

- `mapNoRepeatWindowToDays(window): number | null`
  - Direct passthrough (0, 7, 14, null)

**Comfort Notes**

- `trimNotes(notes): string` - Database null -> UI empty string
- `notesToDatabase(notes): string | null` - UI empty -> Database null

**Alignment:** Implements all mapping behaviours specified in user story

### 5. Current PrefsScreen Component

**Status:** PLACEHOLDER ONLY

**Current Implementation:**

- Renders title, subtitle, description via i18n
- Wrapped in OnboardingShell
- No form inputs
- No state management
- No Next/Skip handling

**Requires:** Full implementation in subsequent steps

### 6. Onboarding Infrastructure

#### OnboardingContext - COMPLETE

- Provides: currentStep, onNext, onSkipStep, onSkipOnboarding, onBack
- Used by OnboardingFooter and screen components
- No changes needed

#### OnboardingFooter - COMPLETE

- Renders conditional buttons based on currentStep
- Prefs step gets: Next, Skip Step, Skip for now
- Debouncing via isActionInProgress (500ms)
- No changes needed

#### onboardingSlice - COMPLETE

- State: currentStep, completedSteps[], skippedSteps[]
- Actions: markStepCompleted, markStepSkipped
- STEP_ORDER: ['welcome', 'prefs', 'firstItem', 'success']
- No changes needed

#### onboardingAnalytics.ts - NEEDS EXTENSION

- Existing: trackStepViewed, trackStepSkipped (generic)
- Missing: trackPrefsViewed, trackPrefsSaved, trackPrefsSkipped
- Action: Add prefs-specific analytics functions

### 7. Route Configuration

**mobile/app/onboarding/prefs.tsx - COMPLETE**

- Auth protection via useOnboardingProtection
- Loading state with spinner
- Renders PrefsScreen when authorized
- No changes needed

## Domain Rules Verification

### User Story Requirement: Colour Tendencies

**Specified Mapping:**

- "Mostly neutrals" -> colour_prefs = ["neutrals"]
- "Enjoy some colour" -> colour_prefs = ["some_colour"]
- "Love bold colours" -> colour_prefs = ["bold_colours"]
- "Not sure yet" -> colour_prefs = []

**Implementation:** MATCHES EXACTLY

- mapColourTendencyToPrefs('neutrals') returns ["neutrals"]
- mapColourTendencyToPrefs('some_colour') returns ["some_colour"]
- mapColourTendencyToPrefs('bold_colours') returns ["bold_colours"]
- mapColourTendencyToPrefs('not_sure') returns []

### User Story Requirement: Exclusions

**Specified Mapping:**

- Checklist items -> lowercase tags (e.g., "skirts")
- Free-text -> "free:" prefix (e.g., "free:no wool")

**Implementation:** MATCHES EXACTLY

- EXCLUSION_TAGS = ['skirts', 'shorts', 'crop_tops', 'heels', 'suits_blazers', 'sleeveless_tops']
- FREE_TEXT_PREFIX = 'free:'
- joinExclusions() adds prefix to free-text entries
- splitExclusions() separates and removes prefix

### User Story Requirement: No-Repeat Window

**Specified Mapping:**

- "Okay with repeats" -> noRepeatDays = 0
- "Avoid repeats within ~1 week" -> noRepeatDays = 7
- "Avoid repeats within ~2 weeks" -> noRepeatDays = 14
- Existing values: 1-10 -> map to 7, 11-21 -> map to 14

**Implementation:** MATCHES EXACTLY

- mapNoRepeatDaysToWindow implements bucket mapping
- mapNoRepeatWindowToDays returns exact values

### User Story Requirement: Comfort Notes

**Specified Mapping:**

- Max 500 characters
- Trimmed before saving
- Empty -> null in database

**Implementation:** MATCHES EXACTLY

- MAX_COMFORT_NOTES_LENGTH = 500
- PrefsFormDataSchema enforces max length
- notesToDatabase() trims and converts empty to null

### User Story Requirement: PATCH Semantics

**Specified Behaviour:**

- New Prefs: Only create if hasAnyData
- Existing Prefs: Only update changed fields
- Preserve untouched fields
- Handle explicit clears

**Implementation:** MATCHES EXACTLY

- hasAnyData() checks for meaningful input
- getChangedFields() computes delta
- useSavePrefs uses existingData to determine INSERT vs UPDATE
- Deep comparison for arrays and objects

### User Story Requirement: Privacy

**Specified Behaviour:**

- Never log free-text content
- Only log boolean presence flags

**Implementation:** MATCHES EXACTLY

- useSavePrefs success logging:
  ```typescript
  {
    noRepeatSet: data.no_repeat_days !== null,
    colourTendencySelected: data.colour_prefs.length > 0,
    exclusionsSelected: data.exclusions.length > 0,
    notesPresent: data.comfort_notes !== null && data.comfort_notes.length > 0,
  }
  ```
- Comments explicitly state: NEVER include comfort_notes or exclusions content

### User Story Requirement: Error Handling

**Specified Behaviour:**

- Classify errors (user, network, server, schema)
- User-friendly messages
- Retry network/server errors
- Do NOT retry validation errors
- Non-blocking save failures

**Implementation:** MATCHES EXACTLY

- classifyPrefsError() classifies errors
- getUserFriendlyMessage() provides user messages
- Retry configuration: 3 retries for network/server only
- Returns false for validation errors (no retry)
- Exponential backoff with jitter

## Acceptance Criteria Alignment

**AC1 - Screen Layout:** Foundation ready, PrefsScreen needs implementation
**AC2 - Data Binding:** toFormData() fully implements mapping rules
**AC3 - User Input:** UI components needed in PrefsScreen
**AC4 - New Prefs Persistence:** hasAnyData() + toPrefsRow() ready
**AC5 - Existing Prefs Update:** getChangedFields() + toUpdatePayload() ready
**AC6 - Skip Behaviour:** Context provides onSkipStep, needs screen integration
**AC7 - Offline/Failure:** Error classification and non-blocking ready
**AC8 - Security/Privacy:** RLS assumed, privacy-safe logging implemented
**AC9 - Accessibility:** UI components need proper labels/roles
**AC10 - Analytics:** Generic events exist, prefs-specific needed

## Gaps and Next Steps

### Immediate Gaps (Step 2+)

1. **Analytics Functions**
   - Add trackPrefsViewed(isResume)
   - Add trackPrefsSaved(metadata)
   - Add trackPrefsSkipped()
   - Location: mobile/src/features/onboarding/utils/onboardingAnalytics.ts

2. **PrefsScreen Implementation**
   - Form state management (React.useState or local slice)
   - Four UI sections with proper controls
   - Load initial data from useUserPrefs
   - Next handler with save and navigation
   - Skip handler with navigation only
   - Error/loading states
   - Offline toast/message

3. **i18n Keys**
   - All screen labels, hints, errors
   - Accessibility labels and hints
   - Check existing i18n structure

4. **UI Components Verification**
   - Radio/SegmentedControl for single-select
   - Checkbox/CheckboxList for multi-select
   - TextInput for text fields
   - Toast/Snackbar for messages

### No Changes Required

- mobile/src/features/onboarding/api/useUserPrefs.ts
- mobile/src/features/onboarding/api/useSavePrefs.ts
- mobile/src/features/onboarding/utils/prefsTypes.ts
- mobile/src/features/onboarding/utils/prefsValidation.ts
- mobile/src/features/onboarding/utils/prefsMapping.ts
- mobile/src/features/onboarding/context/OnboardingContext.tsx
- mobile/src/features/onboarding/components/OnboardingShell.tsx
- mobile/src/features/onboarding/components/OnboardingFooter.tsx
- mobile/src/features/onboarding/store/onboardingSlice.ts
- mobile/app/onboarding/prefs.tsx

## Conclusion

**CONFIRMATION:** The existing prefs data access layer, mapping utilities, and validation schemas are complete and production-ready. They fully support the domain rules specified in the user story.

**REFINEMENT NEEDED:** None for existing utilities.

**IMPLEMENTATION WORK:** Focused on PrefsScreen UI component, analytics functions, and i18n keys.

**READY FOR STEP 2:** Yes, proceed with designing/refining form data model (already exists, just needs UI binding).
