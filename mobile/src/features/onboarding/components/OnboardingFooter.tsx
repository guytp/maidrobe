import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../../core/components';
import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { useOnboardingContext } from '../context/OnboardingContext';
import {
  trackWelcomeGetStartedClicked,
  trackWelcomeSkipped,
  trackFirstItemSkipped,
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
 * The timeout is properly cleaned up on component unmount to prevent
 * memory leaks and state updates on unmounted components.
 *
 * @returns Footer component with navigation buttons
 */
export function OnboardingFooter(): React.JSX.Element {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const { currentStep, onNext, onSkipStep, onSkipOnboarding, customPrimaryHandler } =
    useOnboardingContext();

  // Track if any action is in progress (prevents double-tap)
  const [isActionInProgress, setIsActionInProgress] = useState(false);

  // Store timeout ID for cleanup on unmount
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Clear any pending timeout when component unmounts.
   * This prevents memory leaks and state updates on unmounted components.
   */
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

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
    : currentStep === 'firstItem'
    ? t('screens.onboarding.firstItem.primaryAction')
    : t('screens.onboarding.footer.buttons.next');

  /**
   * Handler for primary action (Get Started / Next).
   *
   * Wraps the onNext callback with loading state management to prevent
   * double-taps and provide visual feedback during navigation.
   *
   * Supports custom primary handlers for steps that need special behavior
   * (e.g., opening camera before advancing).
   *
   * Analytics:
   * - Fires welcome_get_started_clicked for welcome step
   * - Duplicate prevention via isActionInProgress check
   *
   * Debouncing strategy:
   * - Immediately sets loading state (disables all buttons)
   * - Calls customPrimaryHandler if set, otherwise calls onNext()
   * - Resets loading state after 500ms timeout
   * - Timeout stored in ref for cleanup on unmount
   * - Early return if already in progress
   */
  const handlePrimaryAction = useCallback(() => {
    if (isActionInProgress) return;

    // Fire analytics for welcome-specific "Get started" click
    if (isWelcomeStep) {
      trackWelcomeGetStartedClicked();
    }

    setIsActionInProgress(true);

    // Use custom handler if provided, otherwise use default onNext
    if (customPrimaryHandler) {
      customPrimaryHandler();
    } else {
      onNext();
    }

    // Clear any existing timeout before setting new one
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Reset loading state after brief delay
    // Store timeout ID for cleanup on unmount
    timeoutRef.current = setTimeout(() => {
      setIsActionInProgress(false);
      timeoutRef.current = null;
    }, 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isActionInProgress intentionally omitted to prevent callback recreation
  }, [onNext, isWelcomeStep, customPrimaryHandler]);

  /**
   * Handler for step-level skip action.
   *
   * Wraps the onSkipStep callback with loading state management.
   *
   * Analytics:
   * - Fires first_item_skipped with reason 'pure_skip' for firstItem step
   * - Duplicate prevention via isActionInProgress check
   *
   * Same debouncing strategy as primary action.
   */
  const handleSkipStepAction = useCallback(() => {
    if (isActionInProgress) return;

    // Fire first-item-specific analytics if on firstItem step
    if (currentStep === 'firstItem') {
      trackFirstItemSkipped('pure_skip');
    }

    setIsActionInProgress(true);
    onSkipStep();

    // Clear any existing timeout before setting new one
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Reset loading state after brief delay
    // Store timeout ID for cleanup on unmount
    timeoutRef.current = setTimeout(() => {
      setIsActionInProgress(false);
      timeoutRef.current = null;
    }, 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isActionInProgress intentionally omitted to prevent callback recreation
  }, [onSkipStep, currentStep]);

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

    // Clear any existing timeout before setting new one
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Reset loading state after brief delay
    // Store timeout ID for cleanup on unmount
    timeoutRef.current = setTimeout(() => {
      setIsActionInProgress(false);
      timeoutRef.current = null;
    }, 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isActionInProgress intentionally omitted to prevent callback recreation
  }, [onSkipOnboarding, isWelcomeStep]);

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
            : currentStep === 'firstItem'
            ? t('screens.onboarding.firstItem.accessibility.primaryActionLabel')
            : t('screens.onboarding.footer.accessibility.nextLabel')
        }
        accessibilityHint={
          isFinalStep || isWelcomeStep
            ? t('screens.onboarding.footer.accessibility.getStartedHint')
            : currentStep === 'firstItem'
            ? t('screens.onboarding.firstItem.accessibility.primaryActionHint')
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
