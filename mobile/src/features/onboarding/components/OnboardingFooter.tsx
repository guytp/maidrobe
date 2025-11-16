import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../../core/components';
import { t } from '../../../core/i18n';
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
  const isWelcomeStep = currentStep === 'welcome';
  const showGlobalSkip = !isFinalStep;

  // Determine primary button label
  const primaryLabel = isFinalStep
    ? t('screens.onboarding.footer.buttons.getStarted')
    : isWelcomeStep
    ? t('screens.onboarding.footer.buttons.getStarted')
    : t('screens.onboarding.footer.buttons.next');

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

      {/* Step-level skip (only on optional steps) */}
      {isOptionalStep && (
        <Button
          onPress={onSkipStep}
          variant="text"
          accessibilityLabel={t('screens.onboarding.footer.accessibility.skipStepLabel')}
          accessibilityHint={t('screens.onboarding.footer.accessibility.skipStepHint')}
        >
          {t('screens.onboarding.footer.buttons.skipStep')}
        </Button>
      )}

      {/* Global skip onboarding (all non-terminal steps) */}
      {showGlobalSkip && (
        <Button
          onPress={onSkipOnboarding}
          variant="text"
          accessibilityLabel={t('screens.onboarding.footer.accessibility.skipOnboardingLabel')}
          accessibilityHint={t('screens.onboarding.footer.accessibility.skipOnboardingHint')}
        >
          {t('screens.onboarding.footer.buttons.skipOnboarding')}
        </Button>
      )}
    </View>
  );
}
