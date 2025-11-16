# Step 1 Analysis: Review Existing Onboarding Implementation

## Date: 2025-11-16
## Story: #110 - Onboarding Welcome and Value Proposition Screen

---

## Executive Summary

**Decision: ENHANCE existing WelcomeScreen component**

The onboarding feature has a well-structured implementation with:
- Existing WelcomeScreen.tsx placeholder component explicitly marked for Story #110
- Complete navigation infrastructure via OnboardingContext
- Established analytics patterns via onboardingAnalytics.ts
- Consistent accessibility conventions (WCAG AA compliant)
- i18n system for all user-facing strings

---

## Current Architecture

### File Structure
```
app/onboarding/
  _layout.tsx                      - Shell container with routing logic
  welcome.tsx                      - Route wrapper for WelcomeScreen
  prefs.tsx                        - Preferences route
  first-item.tsx                   - First item capture route
  success.tsx                      - Success route

src/features/onboarding/
  components/
    WelcomeScreen.tsx              - PLACEHOLDER (Story #110 target)
    OnboardingShell.tsx            - Layout wrapper
    OnboardingFooter.tsx           - Footer with CTAs
    PrefsScreen.tsx                - Preferences screen
    FirstItemScreen.tsx            - First item screen
    SuccessScreen.tsx              - Success screen
  store/
    onboardingSlice.ts             - Zustand state management
  utils/
    onboardingAnalytics.ts         - Analytics helpers
  context/
    OnboardingContext.tsx          - Navigation context
```

### Step Sequence
Defined in onboardingSlice.ts line 19:
```
STEP_ORDER = ['welcome', 'prefs', 'firstItem', 'success']
```

---

## Navigation Helpers

### OnboardingContext Provides:
- `currentStep: OnboardingStep | null`
- `onNext()` - Primary action handler
- `onSkipStep()` - Step-level skip (optional steps only)
- `onSkipOnboarding()` - Global skip handler
- `onBack()` - Back navigation handler

### Key Flow Logic (from _layout.tsx):

**handleOnboardingComplete(isGlobalSkip)**
- Fires analytics: trackOnboardingCompleted or trackOnboardingSkippedAll
- Updates hasOnboarded: `updateHasOnboarded(true)` (optimistic)
- Clears state: `resetOnboardingState()`
- Navigates: `router.replace('/home')`
- Server update: TODO for Story #95 (has rollback plan)

**handleNext()**
- If currentStep === 'success': calls handleOnboardingComplete()
- Else: calls markStepCompleted(currentStep)

**handleSkipOnboarding()**
- Calls handleOnboardingComplete(true)

---

## Analytics Patterns

### Existing Events (onboardingAnalytics.ts):
- `trackStepViewed(step, isResume)`
- `trackStepSkipped(step)`
- `trackOnboardingCompleted(completedSteps, skippedSteps, durationMs)`
- `trackOnboardingSkippedAll(atStep, completedSteps, skippedSteps)`
- `trackStateReset(reason, corruptedState)`
- `trackStateResumed(currentStep, completedSteps, skippedSteps)`

### Pattern:
- All use `logSuccess()` from core/telemetry
- Fire-and-forget with try/catch
- Include timestamp in data payload
- No PII beyond pseudonymous user ID

### Event Structure:
```typescript
logSuccess('onboarding', 'event_name', {
  data: {
    step,
    timestamp: new Date().toISOString(),
    // ...other properties
  },
});
```

---

## Accessibility Conventions

### Touch Targets:
- minHeight: 44pt (from Button.tsx)
- minWidth: 44pt
- Meets WCAG AA requirements

### Text Scaling:
- `allowFontScaling={true}` on all Text components
- `maxFontSizeMultiplier={3}` to prevent extreme scaling
- Scrollable containers to accommodate large fonts

### Screen Readers:
- `accessibilityLabel` on all interactive elements
- `accessibilityHint` for button context
- `accessibilityRole="header"` for headings
- Logical focus order

### Contrast:
- Theme system provides colors with adequate contrast
- Supports light and dark modes

---

## Current WelcomeScreen State

### Status: PLACEHOLDER
From WelcomeScreen.tsx lines 8-22:
```
/**
 * Welcome screen placeholder for onboarding flow.
 *
 * This is a temporary placeholder that displays the step name and description.
 * Story #110 will provide the full implementation with rich content, visuals,
 * and proper value proposition messaging.
 */
```

### Current Content:
- Title: "Welcome"
- Subtitle: "Step 1 of 4"
- Description: Placeholder text
- Uses OnboardingShell wrapper (includes footer automatically)

### Footer Behavior for Welcome:
- Primary button: "Next" (calls onNext)
- Global skip: "Skip onboarding" (calls onSkipOnboarding)
- No step-level skip (welcome is not optional)

---

## i18n Strings

### Current (en.json):
```json
"screens": {
  "onboarding": {
    "welcome": {
      "title": "Welcome",
      "subtitle": "Step 1 of 4",
      "description": "Placeholder...",
      "accessibility": {
        "screenLabel": "Welcome to onboarding"
      }
    },
    "footer": {
      "buttons": {
        "next": "Next",
        "getStarted": "Get Started",
        "skipStep": "Skip this step",
        "skipOnboarding": "Skip onboarding"
      }
    }
  }
}
```

---

## State Management

### updateHasOnboarded (sessionSlice.ts):
```typescript
updateHasOnboarded: (completed) =>
  set((state) => ({
    user: state.user ? { ...state.user, hasOnboarded: completed } : null,
  }))
```
- Updates local user.hasOnboarded field
- No server call yet (planned for Story #95)
- Used by handleOnboardingComplete in _layout.tsx

### resetOnboardingState (onboardingSlice.ts):
```typescript
resetOnboardingState: () => set(initialState)
```
- Clears currentStep, completedSteps, skippedSteps
- Called on completion or global skip

---

## Identified Gaps

### Gap 1: Button Label for Welcome Step
**Issue:** User story requires "Get started" but footer shows "Next" for welcome step
**Current:** OnboardingFooter line 38-40 uses "Next" for all non-success steps
**Solution:** Add special case for welcome step in primaryLabel logic

### Gap 2: Button Label Consistency
**Issue:** User story says "Skip for now" but implementation uses "Skip onboarding"
**Current:** footer.buttons.skipOnboarding = "Skip onboarding"
**Decision:** Update to "Skip for now" to match user story guidance

### Gap 3: Welcome-Specific Analytics
**Issue:** User story defines onboarding.welcome_viewed, welcome_get_started_clicked, welcome_skipped
**Current:** Generic step_viewed fires for all steps
**Solution:** Add welcome-specific analytics events

### Gap 4: Server-side Update
**Issue:** User story requires server call with UX-first error handling
**Current:** TODO in _layout.tsx (Story #95 dependency)
**Solution:** Pattern already planned in handleOnboardingComplete with rollback logic

---

## Implementation Plan

### Files to Modify:

1. **src/features/onboarding/components/WelcomeScreen.tsx**
   - Replace placeholder content
   - Add value proposition (3 statements)
   - Add upcoming steps preview
   - Add privacy reassurance
   - Add welcome-specific analytics
   - Use ScrollView for accessibility

2. **src/core/i18n/en.json**
   - Add welcome.valueProps (array or numbered keys)
   - Add welcome.upcomingSteps
   - Add welcome.privacyNote
   - Update welcome.title to "Maidrobe" or keep "Welcome"
   - Update footer.buttons.skipOnboarding to "Skip for now"
   - Update footer.buttons.next to "Get started" for welcome context

3. **src/features/onboarding/components/OnboardingFooter.tsx**
   - Update primaryLabel logic for welcome step
   - Show "Get started" when currentStep === 'welcome'

4. **src/features/onboarding/utils/onboardingAnalytics.ts**
   - Add trackWelcomeViewed()
   - Add trackWelcomeGetStartedClicked()
   - Add trackWelcomeSkipped()

### No New Files Required:
- Navigation infrastructure exists
- State management exists
- Component shell exists
- Theme/accessibility patterns established

---

## Decision Rationale

### Why Enhance (Not Create):
1. File explicitly marked as placeholder for Story #110
2. Already integrated with OnboardingShell and routing
3. Follows code guidelines: prefer editing over creating
4. Maintains consistency with existing patterns
5. Route wrapper already configured

### Alignment with User Story:
- All functional requirements can be met by enhancing existing component
- Navigation handlers exist (onNext, onSkipOnboarding)
- State management exists (updateHasOnboarded, resetOnboardingState)
- Analytics infrastructure exists
- Accessibility patterns established

---

## Next Steps

Step 2 will implement the enhanced WelcomeScreen.tsx with:
- Full value proposition content
- Upcoming steps preview
- Privacy reassurance
- Welcome-specific analytics
- Proper accessibility support
- i18n for all strings

---

## Code Quality Checklist

- [x] Reviewed existing architecture
- [x] Identified navigation helpers
- [x] Documented analytics patterns
- [x] Verified accessibility conventions
- [x] Confirmed i18n infrastructure
- [x] Made enhancement vs create decision
- [x] Identified implementation gaps
- [x] Planned modifications (no new files)
- [x] Aligned with code guidelines
- [x] Aligned with user story requirements
