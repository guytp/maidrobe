import React, { createContext, useContext } from 'react';
import { OnboardingStep } from '../store/onboardingSlice';

/**
 * Onboarding context value interface.
 *
 * Provides navigation handlers and current step information to child components
 * within the onboarding flow.
 */
export interface OnboardingContextValue {
  /** Current active step, or null if not in onboarding */
  currentStep: OnboardingStep | null;
  /** Handler for primary action (Next/Continue/Get Started) */
  onNext: () => void;
  /** Handler for step-level skip (only on optional steps) */
  onSkipStep: () => void;
  /** Handler for global skip onboarding */
  onSkipOnboarding: () => void;
  /** Handler for back navigation */
  onBack: () => void;
  /**
   * Optional custom primary handler that overrides onNext for specific steps.
   *
   * Use this when a step needs to inject component-specific data that isn't
   * available in the default _layout.handleNext flow. The step component
   * registers its custom handler via setCustomPrimaryHandler, and
   * OnboardingFooter will call this instead of onNext when present.
   *
   * Example: SuccessScreen uses this to inject hasItems from its local
   * wardrobe query into the completion analytics.
   *
   * @see SuccessScreen.tsx for detailed usage example
   */
  customPrimaryHandler?: (() => void) | null;
  /**
   * Set custom primary handler for the current step.
   *
   * Steps should register their handler on mount and unregister on unmount:
   * ```
   * useEffect(() => {
   *   if (setCustomPrimaryHandler) {
   *     setCustomPrimaryHandler(myHandler);
   *     return () => setCustomPrimaryHandler(null);
   *   }
   * }, [setCustomPrimaryHandler, myHandler]);
   * ```
   */
  setCustomPrimaryHandler?: (handler: (() => void) | null) => void;
  /** Onboarding duration in milliseconds (undefined if not yet started) */
  onboardingDuration?: number;
}

/**
 * Onboarding context.
 * Provides navigation handlers throughout the onboarding flow.
 */
const OnboardingContext = createContext<OnboardingContextValue | null>(null);

/**
 * Onboarding context provider props.
 */
export interface OnboardingProviderProps {
  /** Current active step */
  currentStep: OnboardingStep | null;
  /** Handler for primary action */
  onNext: () => void;
  /** Handler for step-level skip */
  onSkipStep: () => void;
  /** Handler for global skip */
  onSkipOnboarding: () => void;
  /** Handler for back navigation */
  onBack: () => void;
  /** Optional custom primary handler */
  customPrimaryHandler?: (() => void) | null;
  /** Set custom primary handler */
  setCustomPrimaryHandler?: (handler: (() => void) | null) => void;
  /** Onboarding duration in milliseconds */
  onboardingDuration?: number;
  /** Child components */
  children: React.ReactNode;
}

/**
 * Onboarding context provider.
 *
 * Provides navigation handlers to all child components in the onboarding flow.
 * This allows the shell and footer components to access navigation functions
 * without prop drilling.
 *
 * Custom Primary Handler Pattern:
 * Supports custom primary handlers for steps that need to inject component-specific
 * data into their completion or navigation logic. Steps register their handler via
 * setCustomPrimaryHandler, and OnboardingFooter will call it instead of the default
 * onNext when present.
 *
 * Common use cases:
 * - SuccessScreen: Injects hasItems from local wardrobe query into completion analytics
 * - FirstItem: Could inject capture metadata (camera vs gallery, image dimensions, etc.)
 * - Any step with component-local state that affects completion behavior
 *
 * Interaction flow:
 * 1. _layout.tsx creates onNext, passes to OnboardingProvider
 * 2. Step component (e.g., SuccessScreen) registers custom handler via context
 * 3. OnboardingFooter receives both onNext and customPrimaryHandler from context
 * 4. OnboardingFooter.handlePrimaryAction checks customPrimaryHandler first
 * 5. If present, calls customPrimaryHandler; otherwise calls default onNext
 * 6. Step unmounts and unregisters handler, restoring default behavior
 *
 * @param props - Provider props
 * @returns Provider component
 */
export function OnboardingProvider({
  currentStep,
  onNext,
  onSkipStep,
  onSkipOnboarding,
  onBack,
  customPrimaryHandler,
  setCustomPrimaryHandler,
  onboardingDuration,
  children,
}: OnboardingProviderProps): React.JSX.Element {
  const value: OnboardingContextValue = {
    currentStep,
    onNext,
    onSkipStep,
    onSkipOnboarding,
    onBack,
    customPrimaryHandler,
    setCustomPrimaryHandler,
    onboardingDuration,
  };

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

/**
 * Hook to access onboarding context.
 *
 * Provides navigation handlers and current step information.
 * Must be used within an OnboardingProvider.
 *
 * @returns Onboarding context value
 * @throws Error if used outside OnboardingProvider
 *
 * @example
 * const { currentStep, onNext, onSkipStep } = useOnboardingContext();
 */
export function useOnboardingContext(): OnboardingContextValue {
  const context = useContext(OnboardingContext);

  if (!context) {
    throw new Error('useOnboardingContext must be used within OnboardingProvider');
  }

  return context;
}
