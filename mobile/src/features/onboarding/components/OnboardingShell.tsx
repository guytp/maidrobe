import React from 'react';
import { StyleSheet, View } from 'react-native';
import { OnboardingFooter } from './OnboardingFooter';

/**
 * Onboarding shell component props.
 */
export interface OnboardingShellProps {
  /** Step content to render */
  children: React.ReactNode;
}

/**
 * Onboarding shell wrapper component.
 *
 * Provides consistent layout structure for all onboarding steps:
 * - Main content area (flexible, scrollable if needed)
 * - Footer with navigation buttons
 *
 * The shell automatically includes the OnboardingFooter, which provides
 * context-aware navigation buttons based on the current step.
 *
 * Usage:
 * Wrap step content in this shell to get consistent layout and navigation.
 * The shell handles footer rendering and spacing automatically.
 *
 * @param props - Shell props
 * @returns Shell component with content and footer
 *
 * @example
 * <OnboardingShell>
 *   <Text>Step content goes here</Text>
 * </OnboardingShell>
 */
export function OnboardingShell({ children }: OnboardingShellProps): React.JSX.Element {
  return (
    <View style={styles.container}>
      {/* Main content area */}
      <View style={styles.content}>{children}</View>

      {/* Footer with navigation buttons */}
      <OnboardingFooter />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});
