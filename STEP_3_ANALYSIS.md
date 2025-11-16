# Step 3 Analysis: Wire Welcome Screen Primary CTA to Navigation

## Date: 2025-11-16
## Story: #110 - Onboarding Welcome and Value Proposition Screen

---

## Objective

Wire the "Get started" button on the welcome screen to properly navigate to the Style & Usage Preferences step using existing navigation infrastructure.

Requirements:
- Tapping "Get started" advances to prefs step
- Sets currentStep = 'prefs'
- Navigates to /onboarding/prefs route
- Does NOT modify hasOnboarded (remains false)
- Uses existing navigation abstractions (handleNext)
- Disables button while navigation in progress (debouncing)
- Preserves idempotent behavior on rapid presses
- Proper accessibility props already in place

---

## Current State Analysis

### Existing Navigation Infrastructure

**OnboardingContext (already provides):**
- `onNext()` - Handler passed to footer via context
- Connected to `handleNext()` in _layout.tsx
- Already wired to OnboardingFooter buttons

**handleNext() Implementation (_layout.tsx:203-213):**
```typescript
const handleNext = useCallback(() => {
  if (!currentStep) return;

  if (currentStep === 'success') {
    // Final step - complete onboarding
    handleOnboardingComplete();
  } else {
    // Regular step - mark completed and advance
    markStepCompleted(currentStep);
  }
}, [currentStep, markStepCompleted, handleOnboardingComplete]);
```

**markStepCompleted() Flow (onboardingSlice.ts:292-299):**
```typescript
markStepCompleted: (stepId) =>
  set((state) => {
    const skippedSteps = removeFromArray(state.skippedSteps, stepId);
    const completedSteps = addToArrayUnique(state.completedSteps, stepId);
    const currentStep = getNextStep(stepId);  // welcome -> prefs

    return { completedSteps, skippedSteps, currentStep };
  })
```

**Navigation Effect (_layout.tsx:403-456):**
- Watches currentStep changes
- Automatically navigates to corresponding route
- When currentStep = 'prefs', navigates to /onboarding/prefs

### OnboardingFooter Current State

**Lines 59-77:**
```typescript
<Button
  onPress={onNext}
  variant="primary"
  accessibilityLabel={
    isFinalStep || isWelcomeStep
      ? t('screens.onboarding.footer.accessibility.getStartedLabel')
      : t('screens.onboarding.footer.accessibility.nextLabel')
  }
  accessibilityHint={
    isFinalStep || isWelcomeStep
      ? t('screens.onboarding.footer.accessibility.getStartedHint')
      : t('screens.onboarding.footer.accessibility.nextHint')
  }
>
  {primaryLabel}
</Button>
```

### Button Component Features (Button.tsx)

**Built-in Capabilities:**
- `disabled` prop - prevents multiple presses when true
- `loading` prop - shows spinner, disables interaction
- Accessibility role="button" automatically set
- Accessibility state includes disabled status
- Already prevents double-tap via disabled state

**Key Props:**
```typescript
interface ButtonProps {
  onPress: () => void;
  disabled?: boolean;    // Prevents interaction
  loading?: boolean;     // Shows spinner + disables
  accessibilityLabel?: string;
  accessibilityHint?: string;
}
```

---

## Analysis: What's Already Working

### 1. Navigation Flow ALREADY COMPLETE

The navigation infrastructure is FULLY IMPLEMENTED and WORKING:

```
User taps "Get started"
  -> onNext() called (from OnboardingContext)
  -> handleNext() executes (_layout.tsx)
  -> markStepCompleted('welcome') called
  -> State updated: currentStep = 'prefs', completedSteps = ['welcome']
  -> Navigation effect triggers (watches currentStep)
  -> router.replace('/onboarding/prefs') executed
  -> User sees prefs screen
```

### 2. Accessibility ALREADY COMPLETE

OnboardingFooter already has:
- Proper accessibility labels for welcome step
- Correct accessibility hints
- Button component provides role="button"
- Logical focus order (already correct)

### 3. State Management ALREADY CORRECT

- hasOnboarded remains false (only changed by handleOnboardingComplete)
- markStepCompleted only updates completedSteps, not hasOnboarded
- Idempotent: multiple calls to markStepCompleted safe (uses addToArrayUnique)

---

## Analysis: What's Missing (Debouncing)

### Current Gap: No Loading State

The Button component supports `loading` prop, but it's not used:
- Button can be pressed multiple times rapidly
- Each press calls markStepCompleted('welcome')
- While idempotent (no duplicate in completedSteps), it's inefficient
- Best practice: show loading state during navigation

### Solution: Add Loading State to Footer

**Current OnboardingFooter:**
- No local state tracking navigation in progress
- Doesn't pass `loading` prop to Button

**Proposed Enhancement:**
- Add useState to track if navigation is in progress
- Wrap onNext with loading state management
- Pass loading state to Button component

---

## Implementation Plan

### Option A: Add Loading State to OnboardingFooter (RECOMMENDED)

**Changes to OnboardingFooter.tsx:**

1. Add state to track navigation in progress:
```typescript
const [isNavigating, setIsNavigating] = useState(false);
```

2. Wrap onNext handler:
```typescript
const handleNext = useCallback(async () => {
  if (isNavigating) return;  // Already navigating

  setIsNavigating(true);

  try {
    onNext();

    // Small delay to ensure navigation starts
    // before re-enabling button (prevents double-tap)
    await new Promise(resolve => setTimeout(resolve, 300));
  } finally {
    setIsNavigating(false);
  }
}, [onNext, isNavigating]);
```

3. Pass loading prop to Button:
```typescript
<Button
  onPress={handleNext}  // Use wrapped handler
  loading={isNavigating}  // Show spinner
  // ... rest of props
```

**Pros:**
- Centralized in footer (affects all steps)
- Visual feedback (spinner) during navigation
- Prevents rapid double-taps effectively
- Uses existing Button loading state

**Cons:**
- Adds small delay (300ms) but improves UX
- Slightly more complex than current implementation

### Option B: Rely on Existing Idempotency (NO CHANGES)

**Current behavior:**
- markStepCompleted is idempotent
- Navigation effect debounced by React's effect batching
- Multiple presses safe, just inefficient

**Pros:**
- No code changes needed
- Already works correctly
- Simple

**Cons:**
- No visual feedback during navigation
- Allows rapid button presses (poor UX)
- Not best practice for production apps

---

## Recommended Approach: Option A with Refinements

### Refined Implementation

**OnboardingFooter.tsx changes:**

```typescript
import React, { useMemo, useState, useCallback } from 'react';

export function OnboardingFooter(): React.JSX.Element {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const { currentStep, onNext, onSkipStep, onSkipOnboarding } = useOnboardingContext();

  // Track navigation/action in progress
  const [isActionInProgress, setIsActionInProgress] = useState(false);

  // ... existing logic for buttons ...

  // Wrap onNext with loading state
  const handlePrimaryAction = useCallback(() => {
    if (isActionInProgress) return;

    setIsActionInProgress(true);
    onNext();

    // Reset after brief delay to prevent double-tap
    setTimeout(() => {
      setIsActionInProgress(false);
    }, 500);
  }, [onNext, isActionInProgress]);

  // Wrap onSkipStep with loading state
  const handleSkipStepAction = useCallback(() => {
    if (isActionInProgress) return;

    setIsActionInProgress(true);
    onSkipStep();

    setTimeout(() => {
      setIsActionInProgress(false);
    }, 500);
  }, [onSkipStep, isActionInProgress]);

  // Wrap onSkipOnboarding with loading state
  const handleSkipOnboardingAction = useCallback(() => {
    if (isActionInProgress) return;

    setIsActionInProgress(true);
    onSkipOnboarding();

    setTimeout(() => {
      setIsActionInProgress(false);
    }, 500);
  }, [onSkipOnboarding, isActionInProgress]);

  return (
    <View style={styles.footer}>
      <Button
        onPress={handlePrimaryAction}
        loading={isActionInProgress}
        // ... rest of props
      />

      {isOptionalStep && (
        <Button
          onPress={handleSkipStepAction}
          loading={isActionInProgress}
          // ... rest of props
        />
      )}

      {showGlobalSkip && (
        <Button
          onPress={handleSkipOnboardingAction}
          loading={isActionInProgress}
          // ... rest of props
        />
      )}
    </View>
  );
}
```

---

## Accessibility Verification

### Already Compliant (No Changes Needed):

**Button role:**
- Button component sets accessibilityRole="button" ✓

**Labels:**
- Welcome step has "Get Started" label ✓
- Accessibility hint describes action ✓

**Focus order:**
- OnboardingShell provides logical order ✓
- Footer is last in reading order ✓

**Loading state:**
- Button component sets accessibilityState with disabled ✓
- Screen readers announce "disabled" when loading ✓

---

## Testing Scenarios

### Manual Testing:

1. **Single tap "Get started":**
   - Shows spinner
   - Navigates to prefs screen
   - hasOnboarded remains false ✓

2. **Rapid double-tap "Get started":**
   - First tap: spinner shows
   - Second tap: ignored (button disabled)
   - Navigation happens once ✓

3. **Triple-tap scenario:**
   - Only first tap processed
   - Visual feedback via spinner
   - No duplicate navigation ✓

4. **Screen reader usage:**
   - Button announced as "Get Started, button"
   - Hint describes navigation action
   - Loading state announced as disabled ✓

5. **Verify state:**
   - completedSteps includes 'welcome'
   - currentStep is 'prefs'
   - hasOnboarded is false ✓

---

## Files to Modify

### Only One File Needs Changes:

**src/features/onboarding/components/OnboardingFooter.tsx**
- Add useState for isActionInProgress
- Add handlePrimaryAction wrapper
- Add handleSkipStepAction wrapper
- Add handleSkipOnboardingAction wrapper
- Pass loading prop to all Button components

**No other files need changes:**
- Navigation already works (handleNext in _layout.tsx)
- State management already correct (markStepCompleted)
- Accessibility already complete (existing props)
- WelcomeScreen.tsx unchanged (uses OnboardingShell)

---

## Code Quality Checklist

- [ ] Add useState import
- [ ] Add useCallback import (already imported)
- [ ] Implement handlePrimaryAction wrapper
- [ ] Implement handleSkipStepAction wrapper
- [ ] Implement handleSkipOnboardingAction wrapper
- [ ] Pass loading prop to primary button
- [ ] Pass loading prop to skip step button
- [ ] Pass loading prop to skip onboarding button
- [ ] Update dependencies in useCallback
- [ ] Add JSDoc comments for new handlers
- [ ] Verify TypeScript compilation
- [ ] Verify ESLint passes
- [ ] Test debouncing behavior

---

## Alternative: Minimal Change Approach

If we want MINIMAL changes (rely on existing idempotency):

**No code changes needed.**

Justification:
- Navigation already works perfectly
- markStepCompleted is idempotent
- React effect batching prevents multiple navigations
- User story doesn't explicitly require loading state
- Current implementation is functionally correct

However, adding loading state is **best practice** and provides:
- Better user experience (visual feedback)
- Industry-standard behavior (buttons show loading)
- Prevents perceived "broken" behavior from rapid taps

---

## Decision: Implement Loading State

**Rationale:**
- Improves UX significantly
- Minimal code change (one file, ~40 lines)
- Industry best practice
- Better perceived performance
- Prevents user confusion from rapid taps

**Implementation:**
- Add loading state to OnboardingFooter
- Wrap all three action handlers
- Use 500ms timeout for debouncing
- Pass loading to Button components

---

## Summary

### What Already Works:
- ✓ Navigation from welcome to prefs
- ✓ State management (currentStep, completedSteps)
- ✓ hasOnboarded remains false
- ✓ Accessibility labels and hints
- ✓ Button role and focus order
- ✓ Idempotent behavior

### What Needs Enhancement:
- Add loading state for better UX
- Debounce rapid button presses
- Show visual feedback during navigation

### Implementation:
- Modify OnboardingFooter.tsx only
- Add useState for tracking action in progress
- Wrap all three handlers (next, skipStep, skipOnboarding)
- Pass loading prop to Button components
- 500ms timeout for debouncing

### Result:
- Professional UX with loading spinners
- Prevents double-tap issues
- All requirements met
- No changes to navigation logic needed
