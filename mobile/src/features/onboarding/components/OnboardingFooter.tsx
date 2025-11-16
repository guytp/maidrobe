import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../../core/components';
import { useTheme } from '../../../core/theme';
import { useOnboardingContext } from '../context/OnboardingContext';

/**
 * Onboarding footer component with navigation controls.
 *
 * Renders appropriate navigation buttons based on the current step:
 * - Welcome: Next, Global Skip
 * - Preferences: Next, Skip Step, Global Skip
 * - First Item: Next, Skip Step, Global Skip
 * - Success: Get Started (no skips)
 *
 * Features:
 * - Conditional button rendering based on step
 * - Primary action (Next/Continue/Get Started)
 * - Step-level skip (optional steps only)
 * - Global skip (all non-terminal steps)
 * - Safe area insets for proper bottom padding
 *
 * @returns Footer component with navigation buttons
 */
export function OnboardingFooter(): React.JSX.Element {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const { currentStep, onNext, onSkipStep, onSkipOnboarding } = useOnboardingContext();

  // Determine which buttons to show
  const isOptionalStep = currentStep === 'prefs' || currentStep === 'firstItem';
  const isFinalStep = currentStep === 'success';
  const showGlobalSkip = !isFinalStep;

  // Determine primary button label
  const primaryLabel = isFinalStep ? 'Get Started' : 'Next';

  const styles = useMemo(
    () =>
      StyleSheet.create({
        footer: {
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.lg,
          paddingBottom: Math.max(spacing.lg, insets.bottom),
          backgroundColor: colors.background,
          gap: spacing.sm,
        },
      }),
    [colors, spacing, insets]
  );

  return (
    <View style={styles.footer}>
      {/* Primary action button */}
      <Button
        onPress={onNext}
        variant="primary"
        accessibilityLabel={primaryLabel}
        accessibilityHint={
          isFinalStep
            ? 'Complete onboarding and go to home screen'
            : 'Continue to next onboarding step'
        }
      >
        {primaryLabel}
      </Button>

      {/* Step-level skip (only on optional steps) */}
      {isOptionalStep && (
        <Button
          onPress={onSkipStep}
          variant="text"
          accessibilityLabel="Skip this step"
          accessibilityHint="Skip this step and continue to the next one"
        >
          Skip this step
        </Button>
      )}

      {/* Global skip onboarding (all non-terminal steps) */}
      {showGlobalSkip && (
        <Button
          onPress={onSkipOnboarding}
          variant="text"
          accessibilityLabel="Skip onboarding"
          accessibilityHint="Skip the entire onboarding process and go directly to the app"
        >
          Skip onboarding
        </Button>
      )}
    </View>
  );
}
