import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../../core/components';
import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { useOnboardingContext } from '../context/OnboardingContext';
import {
  trackWelcomeGetStartedClicked,
  trackWelcomeSkipped,
} from '../utils/onboardingAnalytics';

/**
 * Onboarding footer component with navigation controls.
 *
 * Renders appropriate navigation buttons based on the current step:
 * - Welcome: Get Started, Skip for now
 * - Preferences: Next, Skip Step, Skip for now
 * - First Item: Next, Skip Step, Skip for now
 * - Success: Get Started (no skips)
 *
 * Features:
 * - Conditional button rendering based on step
 * - Primary action (Get Started/Next) with loading state
 * - Step-level skip (optional steps only) with loading state
 * - Global skip (all non-terminal steps) with loading state
 * - Debouncing via loading state prevents rapid double-taps
 * - Safe area insets for proper bottom padding
 * - Full accessibility support
 *
 * Loading State:
 * When any button is pressed, all buttons enter loading state for 500ms
 * to prevent rapid multiple taps and provide visual feedback during
 * navigation. The loading state automatically clears after the timeout.
 *
 * @returns Footer component with navigation buttons
 */
export function OnboardingFooter(): React.JSX.Element {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const { currentStep, onNext, onSkipStep, onSkipOnboarding } = useOnboardingContext();

  // Track if any action is in progress (prevents double-tap)
  const [isActionInProgress, setIsActionInProgress] = useState(false);

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

  /**
   * Handler for primary action (Get Started / Next).
   *
   * Wraps the onNext callback with loading state management to prevent
   * double-taps and provide visual feedback during navigation.
   *
   * Analytics:
   * - Fires welcome_get_started_clicked for welcome step
   * - Duplicate prevention via isActionInProgress check
   *
   * Debouncing strategy:
   * - Immediately sets loading state (disables all buttons)
   * - Calls onNext() to trigger navigation
   * - Resets loading state after 500ms timeout
   * - Early return if already in progress
   */
  const handlePrimaryAction = useCallback(() => {
    if (isActionInProgress) return;

    // Fire analytics for welcome-specific "Get started" click
    if (isWelcomeStep) {
      trackWelcomeGetStartedClicked();
    }

    setIsActionInProgress(true);
    onNext();

    // Reset loading state after brief delay
    // This prevents double-tap while providing visual feedback
    setTimeout(() => {
      setIsActionInProgress(false);
    }, 500);
  }, [onNext, isActionInProgress, isWelcomeStep]);

  /**
   * Handler for step-level skip action.
   *
   * Wraps the onSkipStep callback with loading state management.
   * Same debouncing strategy as primary action.
   */
  const handleSkipStepAction = useCallback(() => {
    if (isActionInProgress) return;

    setIsActionInProgress(true);
    onSkipStep();

    setTimeout(() => {
      setIsActionInProgress(false);
    }, 500);
  }, [onSkipStep, isActionInProgress]);

  /**
   * Handler for global skip onboarding action.
   *
   * Wraps the onSkipOnboarding callback with loading state management.
   *
   * Analytics:
   * - Fires welcome_skipped for welcome step
   * - Duplicate prevention via isActionInProgress check
   *
   * Same debouncing strategy as primary action.
   */
  const handleSkipOnboardingAction = useCallback(() => {
    if (isActionInProgress) return;

    // Fire analytics for welcome-specific skip
    if (isWelcomeStep) {
      trackWelcomeSkipped();
    }

    setIsActionInProgress(true);
    onSkipOnboarding();

    setTimeout(() => {
      setIsActionInProgress(false);
    }, 500);
  }, [onSkipOnboarding, isActionInProgress, isWelcomeStep]);

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
        onPress={handlePrimaryAction}
        variant="primary"
        loading={isActionInProgress}
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
          onPress={handleSkipStepAction}
          variant="text"
          loading={isActionInProgress}
          accessibilityLabel={t('screens.onboarding.footer.accessibility.skipStepLabel')}
          accessibilityHint={t('screens.onboarding.footer.accessibility.skipStepHint')}
        >
          {t('screens.onboarding.footer.buttons.skipStep')}
        </Button>
      )}

      {/* Global skip onboarding (all non-terminal steps) */}
      {showGlobalSkip && (
        <Button
          onPress={handleSkipOnboardingAction}
          variant="text"
          loading={isActionInProgress}
          accessibilityLabel={t('screens.onboarding.footer.accessibility.skipOnboardingLabel')}
          accessibilityHint={t('screens.onboarding.footer.accessibility.skipOnboardingHint')}
        >
          {t('screens.onboarding.footer.buttons.skipOnboarding')}
        </Button>
      )}
    </View>
  );
}
