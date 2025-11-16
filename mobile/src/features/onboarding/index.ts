/**
 * @fileoverview Onboarding feature module.
 * Provides the onboarding flow shell, step screens, and state management.
 * @module features/onboarding
 */

// Components
export { WelcomeScreen } from './components/WelcomeScreen';
export { PrefsScreen } from './components/PrefsScreen';
export { FirstItemScreen } from './components/FirstItemScreen';
export { SuccessScreen } from './components/SuccessScreen';
export { OnboardingShell } from './components/OnboardingShell';
export { OnboardingFooter } from './components/OnboardingFooter';

// Context
export { OnboardingProvider, useOnboardingContext } from './context/OnboardingContext';
export type { OnboardingContextValue } from './context/OnboardingContext';

// Hooks
export { useOnboardingProtection } from './hooks/useOnboardingProtection';

// Store
export type { OnboardingStep, OnboardingSlice } from './store/onboardingSlice';
