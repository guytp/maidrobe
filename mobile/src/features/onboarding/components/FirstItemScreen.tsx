import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { OnboardingShell } from './OnboardingShell';
import { useOnboardingContext } from '../context/OnboardingContext';
import { trackFirstItemViewed } from '../utils/onboardingAnalytics';
import { useWardrobeItemCount } from '../utils/wardrobeUtils';

/**
 * First Wardrobe Item Capture screen for onboarding flow.
 *
 * This screen guides users through adding their first wardrobe item during onboarding.
 * It serves as an optional but encouraged step to help users understand the core value
 * of the app by starting to build their digital closet.
 *
 * Features:
 * - Clear value proposition for adding an item now
 * - Explicit messaging that the step is optional
 * - Primary CTA: "Add your first item" (via footer, will trigger camera in future steps)
 * - Secondary CTA: "Skip this step" (via footer)
 * - Tertiary CTA: "Skip for now" (via footer, global skip)
 * - Analytics tracking with hasExistingItems flag
 * - Full accessibility support with dynamic font scaling
 * - WCAG AA contrast compliance in light and dark modes
 *
 * Implementation status:
 * - Step 1: Analytics integration, UI copy, and onboarding flow integration (current)
 * - Steps 2-5: Camera integration, metadata capture, and item persistence (future)
 *
 * Layout:
 * - Portrait-only orientation
 * - Centered content for clear hierarchy
 * - OnboardingShell wrapper provides footer with CTAs
 *
 * @returns First item capture screen component
 */
export function FirstItemScreen(): React.JSX.Element {
  const { colors, colorScheme, spacing } = useTheme();
  const { currentStep } = useOnboardingContext();

  // Track if first_item_viewed has been fired to prevent duplicates on re-renders
  const hasTrackedView = useRef(false);

  // Get wardrobe item count for analytics (returns 0 as placeholder until Feature #3)
  const itemCount = useWardrobeItemCount();

  // Track first item screen view once on mount
  useEffect(() => {
    // Guard: Check all conditions to ensure analytics fire correctly
    // - hasTrackedView.current: Prevents duplicate events on re-renders
    // - currentStep === 'firstItem': Prevents firing if currentStep changes while
    //   component is still mounted (can occur during navigation transitions when
    //   React hasn't unmounted this component yet but routing has advanced)
    // - itemCount !== null: Wait for wardrobe count to load (currently immediate,
    //   but will be async when Feature #3 is implemented)
    if (!hasTrackedView.current && currentStep === 'firstItem' && itemCount !== null) {
      // For first-item screen during fresh onboarding, isResume is typically false
      // The shell-level trackStepViewed handles resume detection; this event tracks
      // first-item-specific metrics including whether user already has items
      const hasExistingItems = itemCount > 0;
      trackFirstItemViewed(false, hasExistingItems);
      hasTrackedView.current = true;
    }
  }, [currentStep, itemCount]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.xl,
        },
        title: {
          fontSize: 32,
          fontWeight: 'bold',
          marginBottom: spacing.lg,
          color: colors.textPrimary,
          textAlign: 'center',
        },
        headline: {
          fontSize: 18,
          fontWeight: '600',
          marginBottom: spacing.md,
          color: colors.textPrimary,
          textAlign: 'center',
          lineHeight: 26,
        },
        optional: {
          fontSize: 14,
          color: colors.textSecondary,
          textAlign: 'center',
          lineHeight: 20,
        },
      }),
    [colors, spacing]
  );

  return (
    <OnboardingShell>
      <View
        style={styles.container}
        accessibilityLabel={t('screens.onboarding.firstItem.accessibility.screenLabel')}
        accessibilityHint={t('screens.onboarding.firstItem.accessibility.screenHint')}
      >
        {/* Title */}
        <Text
          style={styles.title}
          accessibilityRole="header"
          allowFontScaling={true}
          maxFontSizeMultiplier={3}
        >
          {t('screens.onboarding.firstItem.title')}
        </Text>

        {/* Headline - Value proposition */}
        <Text
          style={styles.headline}
          accessibilityLabel={t('screens.onboarding.firstItem.accessibility.headlineLabel')}
          allowFontScaling={true}
          maxFontSizeMultiplier={3}
        >
          {t('screens.onboarding.firstItem.headline')}
        </Text>

        {/* Optional notice */}
        <Text
          style={styles.optional}
          accessibilityLabel={t('screens.onboarding.firstItem.accessibility.optionalLabel')}
          allowFontScaling={true}
          maxFontSizeMultiplier={3}
        >
          {t('screens.onboarding.firstItem.optional')}
        </Text>

        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </View>
    </OnboardingShell>
  );
}
