# Onboarding Feature

## Overview

The onboarding feature provides a multi-step guided flow for new users to set up their Maidrobe experience. It collects essential preferences and guides users through their first interactions with the app, ensuring a smooth introduction to core functionality.

## Architecture

### Shell Container (`app/onboarding/_layout.tsx`)

The onboarding shell is the single control point for the entire onboarding lifecycle. It manages:

**Responsibilities:**

- **hasOnboarded Gate Check**: Redirects users who have already completed onboarding to `/home`, preventing unnecessary re-runs
- **State Initialization/Resumption**: Starts fresh onboarding or resumes from persisted state
- **Route Normalization**: Ensures all navigation is based on `currentStep` from the store, not URL paths
- **No-Flicker Loading**: Shows loading indicator during auth hydration and initialization to prevent brief flashes of onboarding screens
- **Navigation Orchestration**: Provides handlers for next, skip, and back actions through `OnboardingProvider`
- **Analytics Tracking**: Tracks step views, skips, completions, and session resumptions

**Flow Logic:**

1. Wait for auth hydration to complete
2. Check `hasOnboarded` flag from user profile
   - If `true`: redirect to `/home` and clear onboarding state
   - If `false`: proceed to initialization
3. Check `currentStep` from persisted state
   - If `null`: call `startOnboarding()` to begin at welcome step
   - If valid step: resume at that step
4. Navigate to the appropriate route based on `currentStep`

**Route Normalization:**
Direct navigation to child routes (e.g., `/onboarding/prefs`) is normalized to behave as if the user entered `/onboarding`. The shell always routes based on `currentStep` from the store, preventing arbitrary deep-link step jumps and maintaining flow integrity.

### State Management

The onboarding feature uses **Zustand** with **AsyncStorage persistence** for state management.

**Store Location:** `src/features/onboarding/store/onboardingSlice.ts`

**State Shape:**

```typescript
interface OnboardingState {
  currentStep: OnboardingStep | null; // Current active step
  completedSteps: OnboardingStep[]; // Steps completed via primary action
  skippedSteps: OnboardingStep[]; // Steps skipped via skip action
}
```

**State Actions:**

- `startOnboarding()`: Initialize fresh onboarding (sets currentStep to 'welcome')
- `markStepCompleted(stepId)`: Mark step as completed and advance to next step
- `markStepSkipped(stepId)`: Mark step as skipped and advance to next step
- `setCurrentStep(stepId)`: Explicitly set current step (for back navigation)
- `resetOnboardingState()`: Clear all onboarding state (on completion or logout)

**Persistence:**

- Storage key: `maidrobe-onboarding-state`
- Version: 1
- Persists: `currentStep`, `completedSteps`, `skippedSteps`
- Validation: `validatePersistedState()` ensures data integrity on rehydration
- Migration: Version-aware migration function handles schema evolution

**Invariants Enforced:**

- No duplicates in `completedSteps` or `skippedSteps`
- A step cannot be in both `completedSteps` and `skippedSteps`
- `currentStep` must be a valid `OnboardingStep` or `null`

## Step Sequence

### Canonical Order

The onboarding flow follows this strict sequence defined in `STEP_ORDER`:

```
welcome -> prefs -> firstItem -> success
```

**Step Descriptions:**

1. **welcome** (Required)
   - Route: `app/onboarding/welcome.tsx`
   - Component: `WelcomeScreen`
   - Purpose: Welcome message and value proposition
   - Skip: Global skip only (not step-level)

2. **prefs** (Optional)
   - Route: `app/onboarding/prefs.tsx`
   - Component: `PrefsScreen`
   - Purpose: Style and usage preferences collection
   - Skip: Step-level skip or global skip
   - Future: Story #116 will implement preference forms

3. **firstItem** (Optional)
   - Route: `app/onboarding/first-item.tsx`
   - Component: `FirstItemScreen`
   - Purpose: First wardrobe item capture with camera
   - Skip: Step-level skip or global skip
   - Future: Story #123 will implement camera integration

4. **success** (Required)
   - Route: `app/onboarding/success.tsx`
   - Component: `SuccessScreen`
   - Purpose: Completion celebration and transition to main app
   - Skip: No skip buttons (final step)
   - Future: Story #129 will implement celebration visuals

### Navigation Helpers

- `getNextStep(currentStep)`: Returns next step in sequence or `null` if at end
- `getPreviousStep(currentStep)`: Returns previous step in sequence or `null` if at beginning

## Directory Structure

```
src/features/onboarding/
├── components/
│   ├── WelcomeScreen.tsx       # Welcome step component
│   ├── PrefsScreen.tsx         # Preferences step component
│   ├── FirstItemScreen.tsx     # First item capture component
│   ├── SuccessScreen.tsx       # Success/completion component
│   ├── OnboardingFooter.tsx    # Navigation buttons (Next, Skip Step, Skip All)
│   └── OnboardingShell.tsx     # Content container with footer
├── context/
│   └── OnboardingContext.tsx   # Context provider for navigation handlers
├── hooks/
│   └── useOnboardingProtection.ts  # Auth gate hook
├── store/
│   └── onboardingSlice.ts      # Zustand store with persistence
├── utils/
│   └── onboardingAnalytics.ts  # Analytics tracking helpers
├── index.ts                    # Public API exports
└── README.md                   # This file
```

## Adding or Modifying Steps

### Adding a New Step

To add a new step to the onboarding flow:

1. **Update STEP_ORDER** in `store/onboardingSlice.ts`:

   ```typescript
   const STEP_ORDER: OnboardingStep[] = [
     'welcome',
     'prefs',
     'firstItem',
     'newStep', // Add new step
     'success',
   ];
   ```

2. **Update OnboardingStep type**:

   ```typescript
   export type OnboardingStep = 'welcome' | 'prefs' | 'firstItem' | 'newStep' | 'success';
   ```

3. **Create route file** at `app/onboarding/new-step.tsx`:

   ```typescript
   import { NewStepScreen } from '../../src/features/onboarding';

   export default function NewStepRoute() {
     const isAuthorized = useOnboardingProtection();
     if (!isAuthorized) return <LoadingIndicator />;
     return <NewStepScreen />;
   }
   ```

4. **Create screen component** at `components/NewStepScreen.tsx`:
   - Use `OnboardingShell` wrapper for consistent layout
   - Add i18n translations to `core/i18n/en.json`
   - Include accessibility labels

5. **Update OnboardingFooter logic** if step has special skip behavior:
   - Modify `isOptionalStep` logic if needed
   - Add to optional steps list if skippable

6. **Add tests**:
   - Unit tests: Verify `getNextStep` and `getPreviousStep` handle new step
   - Component tests: Test screen rendering and interactions
   - Integration tests: Test navigation through new step

### Modifying Existing Steps

To modify an existing step:

1. **Screen Components**: Edit files in `components/` directory
2. **i18n Strings**: Update translations in `core/i18n/en.json`
3. **Navigation Logic**: If changing optional/required status, update `OnboardingFooter.tsx`
4. **Tests**: Update existing tests to reflect changes

## Integration Points

### Auth System

**Integration:** `hooks/useOnboardingProtection.ts`

The onboarding flow requires authentication:

- All onboarding routes are protected with `useOnboardingProtection()` hook
- Returns `false` if user is not authenticated
- Routes show loading indicator while checking auth status
- Unauthenticated users are redirected by the hook

**Usage in Routes:**

```typescript
const isAuthorized = useOnboardingProtection();
if (!isAuthorized) {
  return <ActivityIndicator />;
}
return <OnboardingScreen />;
```

### Profile System

**hasOnboarded Flag:**

The profile system maintains a `hasOnboarded` boolean flag that determines whether a user should see onboarding:

- **Location**: User profile in Zustand store (`core/state/store.ts`)
- **Initial Value**: `false` for new users
- **Update**: Set to `true` when onboarding completes or is globally skipped
- **Gate Check**: `_layout.tsx` checks this flag and redirects to `/home` if `true`

**Optimistic Update Pattern:**
When completing onboarding, the app:

1. Optimistically sets `hasOnboarded = true` via `updateHasOnboarded(true)`
2. Clears local onboarding state via `resetOnboardingState()`
3. Navigates to `/home`
4. Server-side update (future - Story #95)

If server update fails (when implemented):

- Rollback optimistic state update
- Log failure to telemetry
- User remains on `/home` (navigation not reverted for better UX)
- Profile refresh will sync authoritative server state on next launch

### Analytics Integration

**Analytics Module:** `utils/onboardingAnalytics.ts`

Tracking functions available:

- `trackStepViewed(stepId)`: Track when user views a step
- `trackStepSkipped(stepId)`: Track when user skips a step
- `trackOnboardingCompleted(durationMs)`: Track successful completion
- `trackOnboardingSkippedAll()`: Track when user skips entire flow
- `trackStateReset()`: Track when onboarding state is cleared
- `trackStateResumed(stepId)`: Track when user resumes from persisted state

All analytics use OpenTelemetry/Sentry via `core/telemetry`.

## Key Features

### Resumption on App Restart

The onboarding state is persisted to AsyncStorage, allowing users to resume where they left off:

- State is automatically saved when actions are performed
- On app restart, `_layout.tsx` checks for persisted `currentStep`
- If `currentStep` exists, user is navigated to that step
- Analytics tracks resumed sessions separately from fresh starts

### Skip Functionality

Two types of skip actions are available:

**Step-Level Skip** (Optional Steps Only):

- Available on `prefs` and `firstItem` steps
- Button text: "Skip this step"
- Action: Marks step as skipped, advances to next step
- Added to `skippedSteps` array

**Global Skip** (All Non-Final Steps):

- Available on `welcome`, `prefs`, and `firstItem` steps
- Button text: "Skip onboarding"
- Action: Completes onboarding immediately, navigates to `/home`
- Sets `hasOnboarded = true`

Skip buttons are rendered conditionally by `OnboardingFooter` based on current step.

### Navigation

**Forward Navigation:**

- Primary button: "Next" or "Get Started" (on final step)
- Calls `markStepCompleted(currentStep)`
- Automatically advances to next step via `getNextStep()`

**Back Navigation:**

- Hardware back button on Android
- Uses `getPreviousStep()` to determine target
- Calls `setCurrentStep(previousStep)` to navigate
- Disabled on first step (welcome)

**Route Protection:**

- All routes use `useOnboardingProtection()` for auth gate
- Prevents access by unauthenticated users

## Testing

### Unit Tests

**Location:** `__tests__/onboarding/onboardingSlice.test.ts`

**Coverage (55 tests):**

- `validatePersistedState`: 28 tests covering valid states, invalid types, duplicates, overlaps, corrupted data
- `getNextStep`: 7 tests covering all transitions and boundaries
- `getPreviousStep`: 7 tests covering reverse navigation and boundaries
- State mutations: 6 behavior verification tests
- Integration: 7 tests for step order, navigation invariants, boundaries

### Component Tests

**Location:** `__tests__/onboarding/OnboardingFooter.test.tsx`

**Coverage (47 tests):**

- Welcome step: 7 tests (first step, no step skip)
- Preferences step: 8 tests (optional, all buttons)
- First Item step: 8 tests (optional, all buttons)
- Success step: 7 tests (final step, no skips)
- i18n integration: 8 tests (all labels from translations)
- Button variants: 3 tests (primary vs text)
- Conditional rendering: 6 tests (step-specific logic)

**Total Test Coverage:** 102 tests

## Future Enhancements

### Planned Stories

- **Story #95**: Server-side `hasOnboarded` sync with rollback on failure
- **Story #116**: Style and usage preferences form implementation
- **Story #123**: First wardrobe item capture with camera integration
- **Story #129**: Success screen celebration visuals and transition animations

### Potential Improvements

- Add progress indicator showing step X of Y
- Support for conditional step flows based on user choices
- A/B testing integration for onboarding variations
- Onboarding completion metrics dashboard
- Multi-language support expansion

## Related Documentation

- **Zustand**: State management library - https://docs.pmnd.rs/zustand
- **Expo Router**: File-based routing - https://docs.expo.dev/router
- **AsyncStorage**: Persistence layer - https://react-native-async-storage.github.io/async-storage/
- **i18n Integration**: `core/i18n/README.md` (if available)
- **Analytics**: `core/telemetry/README.md` (if available)

## Questions or Issues?

For questions about the onboarding feature architecture or to report issues, please refer to:

- Code comments in `app/onboarding/_layout.tsx` for shell logic details
- JSDoc comments in `store/onboardingSlice.ts` for state management
- Test files for usage examples and edge cases
