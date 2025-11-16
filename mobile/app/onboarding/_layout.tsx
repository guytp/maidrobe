import { Stack } from 'expo-router';
import React from 'react';

/**
 * Onboarding flow layout container.
 *
 * This layout provides the routing shell for the onboarding flow, managing
 * the navigation stack for all onboarding steps.
 *
 * Current functionality (Step 1):
 * - Provides a Stack navigator for onboarding routes
 * - Sets screen options (headerShown: false for custom UI)
 * - No state management or shell logic yet (deferred to later steps)
 *
 * Future functionality (Steps 2-5):
 * - Step 2: Integration with onboarding state store
 * - Step 3: Shell container logic with hasOnboarded gate
 * - Step 4: Navigation controls and completion handler
 * - Step 5: Back navigation, resumption, and analytics
 *
 * Route structure:
 * - /onboarding/welcome - Welcome/value proposition step
 * - /onboarding/prefs - Style and usage preferences step
 * - /onboarding/first-item - First wardrobe item capture step
 * - /onboarding/success - Onboarding completion step
 *
 * @returns Onboarding layout component
 */
export default function OnboardingLayout(): React.JSX.Element {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        gestureEnabled: true,
      }}
    >
      <Stack.Screen name="welcome" />
      <Stack.Screen name="prefs" />
      <Stack.Screen name="first-item" />
      <Stack.Screen name="success" />
    </Stack>
  );
}
