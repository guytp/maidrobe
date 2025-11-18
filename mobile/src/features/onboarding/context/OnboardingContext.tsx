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
  /** Optional custom primary handler (overrides onNext for specific steps) */
  customPrimaryHandler?: (() => void) | null;
  /** Set custom primary handler */
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
 * Supports custom primary handlers for steps that need special behavior
 * (e.g., opening camera before advancing).
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
