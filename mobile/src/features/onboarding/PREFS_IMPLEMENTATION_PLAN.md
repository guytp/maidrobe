# Prefs Screen Implementation Plan

## Overview

This document captures the analysis of the existing onboarding structure and outlines the implementation plan for Story #116: Style and Usage Preferences Capture.

## Existing Architecture Analysis

### 1. Onboarding Flow Control

**Location:** `app/onboarding/_layout.tsx`

The onboarding shell manages:
- hasOnboarded gate check (redirects to /home if completed)
- State initialization and resumption from AsyncStorage
- Route normalization (navigation based on currentStep, not URLs)
- Two-effect pattern: initialization effect + navigation effect
- Navigation handlers provided via OnboardingProvider context
- Analytics tracking for all onboarding events

**Key Flow:**
1. Wait for auth hydration
2. Check hasOnboarded flag -> redirect to /home if true
3. Check currentStep from persisted state
4. Initialize (startOnboarding) or resume
5. Navigate to appropriate route

### 2. State Management

**Location:** `src/features/onboarding/store/onboardingSlice.ts`

**State Shape:**
```typescript
interface OnboardingState {
  currentStep: OnboardingStep | null;
  completedSteps: OnboardingStep[];
  skippedSteps: OnboardingStep[];
}

type OnboardingStep = 'welcome' | 'prefs' | 'firstItem' | 'success';
```

**Step Order:**
welcome -> prefs -> firstItem -> success

**Actions:**
- startOnboarding(): Set currentStep to 'welcome'
- markStepCompleted(stepId): Mark complete, advance to next
- markStepSkipped(stepId): Mark skipped, advance to next
- setCurrentStep(stepId): Explicit set (for back navigation)
- resetOnboardingState(): Clear all state

**Persistence:**
- AsyncStorage key: 'maidrobe-onboarding-state'
- Version 1 with validation and migration
- Enforces invariants (no duplicates, no overlap)

### 3. Step Registration

**Prefs Step Current Status:**
- Route: `app/onboarding/prefs.tsx` (REGISTERED)
- Component: `PrefsScreen` (PLACEHOLDER)
- Step Type: Optional (can be skipped)
- Position: Second step after welcome

**Route Pattern:**
```typescript
export default function PrefsRoute() {
  const isAuthorized = useOnboardingProtection();
  if (!isAuthorized) return <LoadingIndicator />;
  return <PrefsScreen />;
}
```

### 4. Component Structure

**OnboardingShell Pattern:**
All steps wrap content in OnboardingShell which provides:
- Main content area (flex: 1, scrollable)
- Automatic footer with navigation buttons

**Current PrefsScreen (Placeholder):**
- Displays title, subtitle, description
- Uses OnboardingShell wrapper
- Has i18n translations
- Accessibility labels present
- Needs complete replacement

### 5. Navigation Context

**Location:** `src/features/onboarding/context/OnboardingContext.tsx`

**Provides:**
- currentStep: OnboardingStep | null
- onNext: () => void
- onSkipStep: () => void
- onSkipOnboarding: () => void
- onBack: () => void

**Usage:**
```typescript
const { currentStep, onNext, onSkipStep } = useOnboardingContext();
```

### 6. Footer Behavior

**Location:** `src/features/onboarding/components/OnboardingFooter.tsx`

**For 'prefs' step:**
- Primary button: "Next"
- Step skip: "Skip this step"
- Global skip: "Skip for now"
- Loading state: 500ms debounce on all buttons
- Timeout cleanup on unmount

**Button Logic:**
- isOptionalStep = currentStep === 'prefs' || currentStep === 'firstItem'
- Shows step skip only for optional steps
- Shows global skip for all non-final steps

### 7. Analytics

**Location:** `src/features/onboarding/utils/onboardingAnalytics.ts`

**Available Functions:**
- trackStepViewed(stepId, isResumed?)
- trackStepSkipped(stepId)
- trackOnboardingCompleted(completed, skipped, duration?)
- trackOnboardingSkippedAll(currentStep, completed, skipped)

**Need to Add:**
- trackPrefsSaved(metadata) for successful prefs save

### 8. i18n Integration

**Location:** `src/core/i18n/`

**Pattern:**
```typescript
import { t } from '../../../core/i18n';
const title = t('screens.onboarding.prefs.title');
```

**Existing Translations:**
- screens.onboarding.prefs.title: "Preferences"
- screens.onboarding.prefs.subtitle: "Step 2 of 4"
- screens.onboarding.prefs.description: (placeholder text)
- screens.onboarding.prefs.accessibility.screenLabel

**Need to Add:**
- All new UI labels for form fields
- Helper text
- Error messages
- Success messages

### 9. Core Infrastructure

**Supabase Client:** `src/services/supabase.ts`
- Singleton client with RLS
- SecureStore for session persistence
- Custom 401 interceptor

**React Query:** `src/core/query/client.ts`
- Stale-while-revalidate: 30s stale, 5min cache
- Exponential backoff: 3 retries
- No retry on 4xx errors
- Cache keys MUST include userId

**Telemetry:** `src/core/telemetry/index.ts`
- logError(error, classification, context)
- logSuccess(feature, operation, metadata)
- PII sanitization automatic
- Error classification: user, network, server, schema

**Theme:** `src/core/theme/`
- Token-based design (colors, spacing)
- Dark mode support
- Accessible by default

**Components:** `src/core/components/`
- Button: primary/text variants, loading, accessibility
- Toast: non-blocking messages
- All accessible by default

## Implementation Plan

### Step 2: Define Prefs Domain Types and Mapping Utilities

**Create:** `src/features/onboarding/utils/prefsMapping.ts`

**Types:**
```typescript
// Supabase schema (snake_case)
type PrefsRow = {
  userId: string;
  noRepeatDays: number | null;
  colourPrefs: string[];
  exclusions: string[];
  comfortNotes: string | null;
}

// UI view model (camelCase)
type PrefsFormData = {
  colourTendency: 'neutrals' | 'some_colour' | 'bold_colours' | 'not_sure';
  exclusions: {
    checklist: string[]; // canonical tags
    freeText: string;    // user input
  };
  noRepeatWindow: 0 | 7 | 14 | null;
  comfortNotes: string;
}
```

**Functions:**
- toFormData(row: PrefsRow): PrefsFormData
- toPrefsRow(form: PrefsFormData, userId: string): Partial<PrefsRow>
- getChangedFields(current, previous): Partial<PrefsRow>

**Mapping Rules:**
1. Colour Prefs:
   - ["neutrals"] <-> 'neutrals'
   - ["some_colour"] <-> 'some_colour'
   - ["bold_colours"] <-> 'bold_colours'
   - [] or null <-> 'not_sure'

2. Exclusions:
   - Checklist tags: direct mapping (skirts, shorts, crop_tops, etc.)
   - Free-text: stored with "free:" prefix
   - On read: split by prefix, strip for UI

3. No-Repeat Days:
   - 0 <-> 0
   - 1-10 <-> 7
   - 11-21 <-> 14
   - null <-> null

4. Comfort Notes:
   - Trim whitespace
   - Max 500 chars
   - Empty string <-> null

**Create:** `src/features/onboarding/utils/prefsValidation.ts`

**Zod Schemas:**
- PrefsRowSchema: Validate Supabase response
- PrefsFormDataSchema: Validate UI state
- CreatePrefsSchema: Validate create payload
- UpdatePrefsSchema: Validate update payload

### Step 3: Implement Data Access for Prefs

**Create:** `src/features/onboarding/api/useUserPrefs.ts`

**Implementation:**
```typescript
export function useUserPrefs() {
  const userId = useStore((state) => state.user?.id);

  return useQuery({
    queryKey: ['prefs', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('prefs')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data ? PrefsRowSchema.parse(data) : null;
    },
    enabled: !!userId,
  });
}
```

**Create:** `src/features/onboarding/api/useSavePrefs.ts`

**Implementation:**
```typescript
export function useSavePrefs() {
  const userId = useStore((state) => state.user?.id);

  return useMutation({
    mutationFn: async (payload: Partial<PrefsRow>) => {
      // Determine if insert or update needed
      const { data: existing } = await supabase
        .from('prefs')
        .select('user_id')
        .eq('user_id', userId)
        .single();

      if (existing) {
        // Update
        return await supabase
          .from('prefs')
          .update(payload)
          .eq('user_id', userId);
      } else {
        // Insert
        return await supabase
          .from('prefs')
          .insert({ ...payload, user_id: userId });
      }
    },
    onError: (error) => {
      logError(error, 'server', {
        feature: 'onboarding',
        operation: 'savePrefs',
      });
    },
  });
}
```

### Step 4: Create PrefsScreen Component

**Replace:** `src/features/onboarding/components/PrefsScreen.tsx`

**Structure:**
1. Fetch existing prefs with useUserPrefs()
2. Initialize local state from fetched data or defaults
3. Render four sections:
   - Colour tendencies (radio/segmented)
   - Exclusions (checklist + text input)
   - No-repeat window (radio/segmented)
   - Comfort notes (textarea)
4. Track field interactions (dirty state)
5. Emit analytics on mount

**UI Components Needed:**
- Radio/SegmentedControl for single-select
- Checkbox for multi-select
- TextInput for free-text and notes
- Use existing theme tokens

### Step 5: Implement Next/Skip Button Behaviors

**In PrefsScreen:**

**Custom handleNext:**
```typescript
const handleNext = async () => {
  const hasExistingPrefs = !!prefsData;
  const hasAnyData = /* check if any field has value */;

  if (!hasExistingPrefs && !hasAnyData) {
    // No data, just navigate
    onNext();
    return;
  }

  // Build payload
  const payload = toPrefsRow(formData, userId);

  try {
    await savePrefsMutation.mutateAsync(payload);

    // Analytics
    trackPrefsSaved({
      noRepeatSet: !!payload.noRepeatDays,
      colourTendencySelected: !!payload.colourPrefs?.length,
      exclusionsSelected: !!payload.exclusions?.length,
      notesPresent: !!payload.comfortNotes,
    });

    // Navigate
    onNext();
  } catch (error) {
    // Show toast, log error, still navigate
    Toast.show('Could not save preferences. You can update them later.');
    onNext();
  }
};
```

**Skip:**
Use default onSkipStep from context (no custom logic needed).

### Step 6: Ensure Accessibility, Offline, Privacy

**Accessibility:**
- accessibilityLabel on all inputs
- accessibilityRole="radiogroup" for radio groups
- accessibilityRole="checkbox" for checkboxes
- Focus order: top to bottom, logical
- Touch targets >= 44px
- allowFontScaling={true}
- maxFontSizeMultiplier={3}

**Offline:**
- Handle useUserPrefs error gracefully (show defaults)
- Handle save error gracefully (toast + navigate)
- No blocking of onboarding flow

**Privacy:**
- Free-text never in analytics
- Analytics only includes boolean flags
- No PII in logs
- Supabase RLS enforced

## Data Model

### Supabase Prefs Table Schema

```sql
CREATE TABLE prefs (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  no_repeat_days INTEGER,
  colour_prefs TEXT[],
  exclusions TEXT[],
  comfort_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own prefs"
  ON prefs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### Canonical Exclusion Tags

- skirts
- shorts
- crop_tops
- heels
- suits_blazers
- sleeveless_tops

### Colour Preference Tags

- neutrals
- some_colour
- bold_colours

## Analytics Events

### Existing (in onboardingAnalytics.ts)

- onboarding.step_viewed
- onboarding.step_skipped
- onboarding.completed
- onboarding.skipped_all

### To Add

- onboarding.prefs_saved
  - Metadata: { noRepeatSet, colourTendencySelected, exclusionsSelected, notesPresent }

## i18n Translations to Add

```json
{
  "screens": {
    "onboarding": {
      "prefs": {
        "title": "Your Style Preferences",
        "sections": {
          "colour": {
            "label": "Colour tendencies",
            "options": {
              "neutrals": "Mostly neutrals",
              "someColour": "Enjoy some colour",
              "boldColours": "Love bold colours",
              "notSure": "Not sure yet"
            }
          },
          "exclusions": {
            "label": "Items I never wear",
            "checklistLabel": "Select any that apply",
            "options": {
              "skirts": "Skirts",
              "shorts": "Shorts",
              "cropTops": "Crop tops",
              "heels": "Heels",
              "suitsBazers": "Suits/blazers",
              "sleevelessTops": "Sleeveless tops"
            },
            "freeTextLabel": "Anything else you never wear?",
            "freeTextPlaceholder": "e.g., itchy wool, very high heels"
          },
          "noRepeat": {
            "label": "How do you feel about repeating outfits?",
            "options": {
              "okayWithRepeats": "Okay with repeats",
              "oneWeek": "Avoid repeats within ~1 week",
              "twoWeeks": "Avoid repeats within ~2 weeks"
            }
          },
          "comfort": {
            "label": "Comfort notes (optional)",
            "placeholder": "Anything we should know to keep you comfortable? e.g., no tight waistbands, no very high heels, sensitive to scratchy fabrics",
            "helperText": "Up to 500 characters"
          }
        },
        "errors": {
          "saveFailed": "Could not save your preferences. You can update them later in settings."
        },
        "accessibility": {
          "screenLabel": "Style and usage preferences",
          "colourGroupLabel": "Colour tendency options",
          "exclusionsGroupLabel": "Items to exclude",
          "noRepeatGroupLabel": "Repeat preference options",
          "comfortNotesLabel": "Comfort and style notes"
        }
      }
    }
  }
}
```

## Testing Checklist

### Unit Tests
- [ ] prefsMapping.ts: toFormData, toPrefsRow, getChangedFields
- [ ] prefsValidation.ts: All Zod schemas
- [ ] Edge cases: null, empty arrays, unknown tags

### Component Tests
- [ ] PrefsScreen renders all sections
- [ ] Pre-populates from existing data
- [ ] Falls back to defaults on missing data
- [ ] Handles save success
- [ ] Handles save failure (toast + navigate)
- [ ] Skip behavior (no mutation)

### Integration Tests
- [ ] New user flow (no existing prefs)
- [ ] Existing user flow (with prefs)
- [ ] Offline scenario (load + save failures)
- [ ] Analytics events emitted correctly
- [ ] Navigation to next step

### Accessibility Tests
- [ ] VoiceOver/TalkBack announces all elements
- [ ] Focus order is logical
- [ ] Touch targets >= 44px
- [ ] Dynamic text scaling works
- [ ] Contrast meets WCAG AA

## File Structure

```
mobile/src/features/onboarding/
├── api/
│   ├── useUserPrefs.ts          (NEW)
│   └── useSavePrefs.ts          (NEW)
├── components/
│   ├── PrefsScreen.tsx          (REPLACE)
│   └── ... (existing)
├── utils/
│   ├── prefsMapping.ts          (NEW)
│   ├── prefsValidation.ts       (NEW)
│   └── onboardingAnalytics.ts   (UPDATE - add trackPrefsSaved)
└── PREFS_IMPLEMENTATION_PLAN.md (THIS FILE)
```

## Next Steps

1. Implement Step 2: Define types and mapping utilities
2. Implement Step 3: Data access layer
3. Implement Step 4: PrefsScreen component
4. Implement Step 5: Button behaviors
5. Implement Step 6: Accessibility, offline, privacy
6. Add i18n translations
7. Add analytics event
8. Write tests
9. Manual testing (iOS + Android)
10. Submit for review

## References

- User Story: #116 - Style and Usage Preferences Capture
- Code Guidelines: /home/claude/files/code-guidelines.md
- Onboarding README: mobile/src/features/onboarding/README.md
- Supabase Docs: Row Level Security
- React Query Docs: Mutations, Optimistic Updates
- React Native Accessibility: VoiceOver, TalkBack
