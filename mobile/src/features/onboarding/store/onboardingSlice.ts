import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Onboarding step identifiers.
 *
 * Represents the four distinct steps in the onboarding flow:
 * - welcome: Welcome/value proposition step
 * - prefs: Style and usage preferences step
 * - firstItem: First wardrobe item capture step
 * - success: Onboarding completion step
 */
export type OnboardingStep = 'welcome' | 'prefs' | 'firstItem' | 'success';

/**
 * Canonical step order for the onboarding flow.
 * Used to determine step advancement and navigation.
 */
const STEP_ORDER: OnboardingStep[] = ['welcome', 'prefs', 'firstItem', 'success'];

/**
 * Export step order for external use.
 */
export { STEP_ORDER };

/**
 * Onboarding state interface.
 *
 * Represents the current progress through the onboarding flow.
 * This state is persisted to AsyncStorage for resumption across app restarts.
 */
interface OnboardingState {
  /** Current active step, or null if onboarding is not in progress */
  currentStep: OnboardingStep | null;
  /** Steps that have been completed via primary action */
  completedSteps: OnboardingStep[];
  /** Steps that have been skipped via skip action */
  skippedSteps: OnboardingStep[];
}

/**
 * Onboarding slice interface with state and actions.
 *
 * Provides operations for managing onboarding progress with enforced invariants:
 * - No duplicates in completedSteps or skippedSteps
 * - A step cannot be in both completedSteps and skippedSteps
 * - currentStep must be a valid OnboardingStep or null
 */
export interface OnboardingSlice extends OnboardingState {
  /** Initialize onboarding state for a new flow run */
  startOnboarding: () => void;
  /** Mark a step as completed and advance to next step */
  markStepCompleted: (stepId: OnboardingStep) => void;
  /** Mark a step as skipped and advance to next step */
  markStepSkipped: (stepId: OnboardingStep) => void;
  /** Explicitly set the current step (for back navigation and resumption) */
  setCurrentStep: (stepId: OnboardingStep | null) => void;
  /** Clear all onboarding state (for completion and logout) */
  resetOnboardingState: () => void;
}

/**
 * Initial onboarding state.
 * Used for fresh starts and when resetting invalid persisted state.
 */
const initialState: OnboardingState = {
  currentStep: null,
  completedSteps: [],
  skippedSteps: [],
};

/**
 * Get the next step in the onboarding flow sequence.
 *
 * @param currentStep - The current step, or null
 * @returns The next step in sequence, or null if at the end or invalid step
 * @internal Exported for testing purposes only
 */
export function getNextStep(currentStep: OnboardingStep | null): OnboardingStep | null {
  if (!currentStep) return 'welcome';

  const currentIndex = STEP_ORDER.indexOf(currentStep);
  if (currentIndex === -1 || currentIndex === STEP_ORDER.length - 1) {
    return null; // Invalid step or last step
  }

  return STEP_ORDER[currentIndex + 1];
}

/**
 * Get the previous step in the onboarding flow sequence.
 *
 * @param currentStep - The current step, or null
 * @returns The previous step in sequence, or null if at the beginning or invalid step
 */
export function getPreviousStep(currentStep: OnboardingStep | null): OnboardingStep | null {
  if (!currentStep) return null;

  const currentIndex = STEP_ORDER.indexOf(currentStep);
  if (currentIndex === -1 || currentIndex === 0) {
    return null; // Invalid step or first step
  }

  return STEP_ORDER[currentIndex - 1];
}

/**
 * Remove an item from an array immutably.
 *
 * @param array - Source array
 * @param item - Item to remove
 * @returns New array without the item
 */
function removeFromArray<T>(array: T[], item: T): T[] {
  return array.filter((i) => i !== item);
}

/**
 * Add an item to an array uniquely (no duplicates).
 *
 * @param array - Source array
 * @param item - Item to add
 * @returns New array with item added, or original array if item already exists
 */
function addToArrayUnique<T>(array: T[], item: T): T[] {
  if (array.includes(item)) return array;
  return [...array, item];
}

/**
 * Type guard to check if a value is a valid OnboardingStep.
 *
 * @param step - Value to check
 * @returns true if step is a valid OnboardingStep, false otherwise
 */
function isValidStep(step: unknown): step is OnboardingStep {
  return (
    typeof step === 'string' &&
    (step === 'welcome' || step === 'prefs' || step === 'firstItem' || step === 'success')
  );
}

/**
 * Validate and sanitize persisted onboarding state.
 *
 * This function ensures that state loaded from AsyncStorage is valid and safe to use.
 * If any field is invalid or corrupted, it returns the initial state to prevent crashes.
 *
 * Validation rules:
 * - currentStep must be a valid OnboardingStep or null
 * - completedSteps must be an array containing only valid steps
 * - skippedSteps must be an array containing only valid steps
 * - No step should appear in both completedSteps and skippedSteps
 * - Arrays should not contain duplicates
 *
 * @param state - Persisted state from AsyncStorage
 * @returns Validated state or initial state if invalid
 * @internal Exported for testing purposes only
 */
export function validatePersistedState(state: unknown): OnboardingState {
  // Check if state is an object
  if (!state || typeof state !== 'object') {
    return initialState;
  }

  const stateObj = state as Record<string, unknown>;

  // Validate currentStep
  const currentStep = stateObj.currentStep;
  if (currentStep !== null && !isValidStep(currentStep)) {
    return initialState;
  }

  // Validate completedSteps
  const completedSteps = stateObj.completedSteps;
  if (!Array.isArray(completedSteps)) {
    return initialState;
  }
  const validCompletedSteps = completedSteps.filter(isValidStep);
  if (validCompletedSteps.length !== completedSteps.length) {
    return initialState; // Found invalid steps
  }
  // Check for duplicates
  if (new Set(validCompletedSteps).size !== validCompletedSteps.length) {
    return initialState;
  }

  // Validate skippedSteps
  const skippedSteps = stateObj.skippedSteps;
  if (!Array.isArray(skippedSteps)) {
    return initialState;
  }
  const validSkippedSteps = skippedSteps.filter(isValidStep);
  if (validSkippedSteps.length !== skippedSteps.length) {
    return initialState; // Found invalid steps
  }
  // Check for duplicates
  if (new Set(validSkippedSteps).size !== validSkippedSteps.length) {
    return initialState;
  }

  // Check that no step is in both lists
  const overlap = validCompletedSteps.filter((step) => validSkippedSteps.includes(step));
  if (overlap.length > 0) {
    return initialState;
  }

  // All validations passed
  return {
    currentStep: currentStep as OnboardingStep | null,
    completedSteps: validCompletedSteps,
    skippedSteps: validSkippedSteps,
  };
}

/**
 * Create the onboarding state slice with persistence.
 *
 * This slice manages onboarding progress with local AsyncStorage persistence.
 * State is automatically saved on changes and restored on app restart.
 *
 * Persistence features:
 * - Stores state in AsyncStorage under 'maidrobe-onboarding-state' key
 * - Validates state on rehydration to prevent crashes from corrupted data
 * - Gracefully handles migration between app versions
 * - Resets to initial state if persisted data is invalid
 *
 * @param set - Zustand set function
 * @param get - Zustand get function
 * @returns Onboarding slice with state and actions
 */
export const createOnboardingSlice = persist<OnboardingSlice>(
  (set) => ({
    ...initialState,

    /**
     * Initialize onboarding state for a new flow run.
     *
     * Sets currentStep to 'welcome' and clears all completed/skipped tracking.
     */
    startOnboarding: () =>
      set({
        currentStep: 'welcome',
        completedSteps: [],
        skippedSteps: [],
      }),

    /**
     * Mark a step as completed and advance to the next step.
     *
     * Enforces invariants:
     * - Removes step from skippedSteps if present
     * - Adds step to completedSteps without duplicates
     * - Advances currentStep to next step in sequence
     *
     * @param stepId - Step to mark as completed
     */
    markStepCompleted: (stepId) =>
      set((state) => {
        const skippedSteps = removeFromArray(state.skippedSteps, stepId);
        const completedSteps = addToArrayUnique(state.completedSteps, stepId);
        const currentStep = getNextStep(stepId);

        return { completedSteps, skippedSteps, currentStep };
      }),

    /**
     * Mark a step as skipped and advance to the next step.
     *
     * Enforces invariants:
     * - Removes step from completedSteps if present
     * - Adds step to skippedSteps without duplicates
     * - Advances currentStep to next step in sequence
     *
     * @param stepId - Step to mark as skipped
     */
    markStepSkipped: (stepId) =>
      set((state) => {
        const completedSteps = removeFromArray(state.completedSteps, stepId);
        const skippedSteps = addToArrayUnique(state.skippedSteps, stepId);
        const currentStep = getNextStep(stepId);

        return { completedSteps, skippedSteps, currentStep };
      }),

    /**
     * Explicitly set the current step.
     *
     * Used for back navigation and resumption scenarios.
     * Does not modify completedSteps or skippedSteps.
     *
     * @param stepId - Step to set as current, or null for no active step
     */
    setCurrentStep: (stepId) => set({ currentStep: stepId }),

    /**
     * Clear all onboarding state.
     *
     * Resets to initial state (no current step, empty completed/skipped lists).
     * Called on onboarding completion, global skip, and logout.
     */
    resetOnboardingState: () => set(initialState),
  }),
  {
    name: 'maidrobe-onboarding-state',
    storage: createJSONStorage(() => AsyncStorage),
    version: 1,

    // Only persist state fields, not action functions
    partialize: (state) =>
      ({
        currentStep: state.currentStep,
        completedSteps: state.completedSteps,
        skippedSteps: state.skippedSteps,
      }) as OnboardingSlice,

    // Validate and migrate persisted state
    migrate: (persistedState: unknown, version: number) => {
      // For version 1, validate the state structure
      const validated = validatePersistedState(persistedState);
      return validated as OnboardingSlice;
    },
  }
);
