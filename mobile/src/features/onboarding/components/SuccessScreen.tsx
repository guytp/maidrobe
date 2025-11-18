import React, { useMemo, useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { useStore } from '../../../core/state/store';
import { OnboardingShell } from './OnboardingShell';
import { useHasWardrobeItems } from '../api/useHasWardrobeItems';
import { useOnboardingContext } from '../context/OnboardingContext';
import { useCompleteOnboarding } from '../utils/completeOnboarding';
import { Toast } from '../../../core/components/Toast';

/**
 * Onboarding Success/End screen.
 *
 * Displays the final onboarding summary screen as a terminal step in the
 * onboarding flow. This screen is shown when the user completes the last
 * defined onboarding step without skipping the entire flow.
 *
 * Story #129 implementation:
 * - Step 1: Success step configured as terminal (complete)
 * - Step 2: Final summary UI with completion messaging (complete)
 * - Step 3: Wardrobe-aware messaging variant (complete)
 * - Step 4: Item query error handling (complete)
 * - Step 5: Completion logic via handleOnboardingComplete in _layout.tsx
 * - Step 6: Analytics events integration
 *
 * Current functionality:
 * - Displays completion confirmation with clear headline
 * - Shows wardrobe-aware summary based on item count
 * - Queries user's wardrobe items non-blocking via useHasWardrobeItems
 * - Renders safe default (no items) initially and on query errors
 * - Updates to richer message when user has items
 * - Uses app theme and accessibility standards
 * - Integrates with OnboardingShell for consistent layout and navigation
 * - Primary CTA ("Get Started") triggers completion via OnboardingContext.onNext
 * - Simple centered layout consistent with PrefsScreen pattern
 *
 * UI Structure:
 * - Title: Completion confirmation ("You're all set!")
 * - Headline: Brief summary ("Your closet is ready")
 * - Body: Wardrobe-aware message (no items vs has items variant)
 * - CTA: Footer provides "Get Started" button (no skip options)
 *
 * Wardrobe-aware messaging:
 * - Default (no items or error): Encourages adding items to wardrobe
 * - Has items (>=1 item): Acknowledges first item and encourages more
 * - Query runs non-blocking, safe default shown immediately
 * - All errors handled gracefully, screen remains interactive
 *
 * Terminal step behavior:
 * - No further steps after success (getNextStep returns null)
 * - Footer shows Get Started button without skip options
 * - Tapping Get Started calls handleOnboardingComplete in _layout.tsx
 * - Only reachable when hasOnboarded=false (enforced by _layout.tsx gate)
 * - Back navigation disabled (terminal step)
 *
 * @returns Success screen component
 */
export function SuccessScreen(): React.JSX.Element {
  const { colors, colorScheme, spacing } = useTheme();
  const { setCustomPrimaryHandler, onboardingDuration } = useOnboardingContext();

  // Query whether user has any wardrobe items for contextual messaging
  // This runs non-blocking - component renders with default while query executes
  // On error or while loading, we use safe default (no items variant)
  const { data: wardrobeData } = useHasWardrobeItems();
  const hasItems = wardrobeData?.hasItems ?? false;

  // Get onboarding state from store to determine completion type
  const completedSteps = useStore((state) => state.completedSteps);
  const skippedSteps = useStore((state) => state.skippedSteps);

  // Get shared completion helper
  const completeOnboarding = useCompleteOnboarding();

  // Toast state for backend sync failures
  const [syncFailureToast, setSyncFailureToast] = useState<{
    visible: boolean;
    message: string;
  }>({
    visible: false,
    message: '',
  });

  /*
   * CUSTOM PRIMARY HANDLER PATTERN
   *
   * Why this is needed:
   * SuccessScreen needs to pass hasItems (from the local wardrobe query) to the
   * completion analytics. The default _layout.handleNext -> handleOnboardingComplete
   * flow doesn't have access to this component-specific data.
   *
   * How it works:
   * 1. SuccessScreen queries wardrobe items via useHasWardrobeItems hook
   * 2. SuccessScreen creates handleComplete with hasItems in closure
   * 3. SuccessScreen registers handleComplete via setCustomPrimaryHandler (from context)
   * 4. OnboardingContext stores the custom handler and passes it to children
   * 5. OnboardingFooter checks for customPrimaryHandler in context
   * 6. When user taps "Get Started", OnboardingFooter calls customPrimaryHandler
   *    instead of the default onNext handler
   * 7. handleComplete calls completeOnboarding directly with hasItems included
   *
   * Component interaction flow:
   * User taps button -> OnboardingFooter.handlePrimaryAction
   *                  -> checks customPrimaryHandler from OnboardingContext
   *                  -> calls SuccessScreen.handleComplete (this function)
   *                  -> completeOnboarding with hasItems
   *
   * Alternative considered:
   * Passing hasItems through context would work, but custom handlers provide
   * a more flexible pattern for any step that needs component-specific data
   * at completion time (e.g., FirstItem could use this for capture metadata).
   *
   * Lifecycle:
   * - Custom handler registered on mount via useEffect
   * - Automatically unregistered on unmount to prevent stale closures
   * - Re-registered when dependencies change (hasItems, completedSteps, etc.)
   */
  const handleComplete = useCallback(() => {
    // Call completion helper directly with full context including hasItems
    void completeOnboarding({
      isGlobalSkip: false,
      completedSteps,
      skippedSteps,
      duration: onboardingDuration,
      hasItems, // This is why we need a custom handler - injecting component-local data
      onSyncFailure: (message) => {
        setSyncFailureToast({
          visible: true,
          message,
        });
      },
    });
  }, [completeOnboarding, completedSteps, skippedSteps, onboardingDuration, hasItems]);

  // Register custom handler on mount, unregister on unmount
  // This tells OnboardingFooter to use our handleComplete instead of _layout.handleNext
  useEffect(() => {
    if (setCustomPrimaryHandler) {
      setCustomPrimaryHandler(handleComplete);

      // Cleanup: unregister handler when component unmounts
      return () => {
        setCustomPrimaryHandler(null);
      };
    }
  }, [setCustomPrimaryHandler, handleComplete]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing.lg,
        },
        title: {
          fontSize: 32,
          fontWeight: 'bold',
          marginBottom: spacing.sm,
          color: colors.textPrimary,
          textAlign: 'center',
        },
        headline: {
          fontSize: 20,
          fontWeight: '600',
          marginBottom: spacing.lg,
          color: colors.textPrimary,
          textAlign: 'center',
        },
        body: {
          fontSize: 16,
          lineHeight: 24,
          color: colors.textSecondary,
          textAlign: 'center',
          maxWidth: 400,
        },
      }),
    [colors, spacing]
  );

  return (
    <>
      <OnboardingShell>
        <View
          style={styles.container}
          accessibilityLabel={t('screens.onboarding.success.accessibility.screenLabel')}
        >
          <Text
            style={styles.title}
            accessibilityRole="header"
            allowFontScaling={true}
            maxFontSizeMultiplier={3}
          >
            {t('screens.onboarding.success.title')}
          </Text>
          <Text
            style={styles.headline}
            accessibilityLabel={t('screens.onboarding.success.accessibility.headlineLabel')}
            allowFontScaling={true}
            maxFontSizeMultiplier={3}
          >
            {t('screens.onboarding.success.headline')}
          </Text>
          <Text
            style={styles.body}
            accessibilityLabel={t('screens.onboarding.success.accessibility.bodyLabel')}
            allowFontScaling={true}
            maxFontSizeMultiplier={3}
          >
            {hasItems
              ? t('screens.onboarding.success.bodyHasItems')
              : t('screens.onboarding.success.bodyNoItems')}
          </Text>

          <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
        </View>
      </OnboardingShell>

      {/* Toast for backend sync failures */}
      <Toast
        visible={syncFailureToast.visible}
        message={syncFailureToast.message}
        type="info"
        duration={5000}
        onDismiss={() =>
          setSyncFailureToast({
            visible: false,
            message: '',
          })
        }
      />
    </>
  );
}
