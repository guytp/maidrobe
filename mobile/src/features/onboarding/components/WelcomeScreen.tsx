import React, { useEffect, useMemo, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../../../core/theme';
import { t } from '../../../core/i18n';
import { OnboardingShell } from './OnboardingShell';
import { trackWelcomeViewed } from '../utils/onboardingAnalytics';
import { useOnboardingContext } from '../context/OnboardingContext';

/**
 * Welcome screen for onboarding flow.
 *
 * This screen serves as the entry point to the Maidrobe onboarding experience.
 * It communicates the core value proposition, sets expectations about upcoming
 * steps, and provides privacy reassurance to build trust with new users.
 *
 * Features:
 * - App name/wordmark with strong visual hierarchy
 * - 3 value proposition statements emphasizing decision fatigue reduction
 * - Brief description of upcoming onboarding steps
 * - Privacy reassurance aligned with actual app behavior
 * - Primary CTA: "Get started" (via footer)
 * - Secondary CTA: "Skip for now" (via footer)
 * - Full accessibility support with dynamic font scaling
 * - WCAG AA contrast compliance in light and dark modes
 *
 * Layout:
 * - Portrait-only orientation
 * - Scrollable content for font scaling support
 * - Safe area insets for notch/status bar
 * - OnboardingShell wrapper provides footer with CTAs
 *
 * @returns Welcome screen component
 */
export function WelcomeScreen(): React.JSX.Element {
  const { colors, colorScheme, spacing } = useTheme();
  const { currentStep } = useOnboardingContext();

  // Track if welcome_viewed has been fired to prevent duplicates on re-renders
  const hasTrackedView = useRef(false);

  // Track welcome screen view once on mount
  useEffect(() => {
    // Guard: Check both conditions to ensure analytics fire correctly
    // - hasTrackedView.current: Prevents duplicate events on re-renders
    // - currentStep === 'welcome': Prevents firing if currentStep changes while
    //   component is still mounted (can occur during navigation transitions when
    //   React hasn't unmounted this component yet but routing has advanced)
    if (!hasTrackedView.current && currentStep === 'welcome') {
      // For welcome screen, isResume is always false as it's the first step
      trackWelcomeViewed(false);
      hasTrackedView.current = true;
    }
  }, [currentStep]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scrollView: {
          flex: 1,
          backgroundColor: colors.background,
        },
        scrollContent: {
          flexGrow: 1,
        },
        container: {
          flex: 1,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.xl,
          paddingBottom: spacing.xl,
        },
        appName: {
          fontSize: 40,
          fontWeight: 'bold',
          color: colors.textPrimary,
          textAlign: 'center',
          marginBottom: spacing.xl,
        },
        valuePropsContainer: {
          gap: spacing.md,
          marginBottom: spacing.xl,
        },
        valueProp: {
          fontSize: 18,
          fontWeight: '600',
          color: colors.textPrimary,
          textAlign: 'center',
        },
        section: {
          marginBottom: spacing.xl,
        },
        sectionTitle: {
          fontSize: 16,
          fontWeight: '600',
          color: colors.textPrimary,
          marginBottom: spacing.sm,
        },
        sectionBody: {
          fontSize: 14,
          color: colors.textSecondary,
          lineHeight: 20,
        },
      }),
    [colors, spacing]
  );

  return (
    <OnboardingShell>
      <SafeAreaView style={styles.scrollView} edges={['top']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          accessibilityLabel={t('screens.onboarding.welcome.accessibility.screenLabel')}
        >
          <View style={styles.container}>
            {/* App Name */}
            <Text
              style={styles.appName}
              accessibilityRole="header"
              accessibilityLabel={t('screens.onboarding.welcome.accessibility.appNameLabel')}
              allowFontScaling={true}
              maxFontSizeMultiplier={3}
            >
              {t('screens.onboarding.welcome.appName')}
            </Text>

            {/* Value Propositions */}
            <View
              style={styles.valuePropsContainer}
              accessibilityLabel={t('screens.onboarding.welcome.accessibility.valuePropLabel')}
            >
              {(
                [
                  'screens.onboarding.welcome.valueProps.1',
                  'screens.onboarding.welcome.valueProps.2',
                  'screens.onboarding.welcome.valueProps.3',
                ] as const
              ).map((key) => (
                <Text
                  key={key}
                  style={styles.valueProp}
                  allowFontScaling={true}
                  maxFontSizeMultiplier={3}
                >
                  {t(key)}
                </Text>
              ))}
            </View>

            {/* Upcoming Steps Section */}
            <View
              style={styles.section}
              accessibilityLabel={t('screens.onboarding.welcome.accessibility.upcomingStepsLabel')}
            >
              <Text style={styles.sectionTitle} allowFontScaling={true} maxFontSizeMultiplier={3}>
                {t('screens.onboarding.welcome.upcomingSteps.title')}
              </Text>
              <Text style={styles.sectionBody} allowFontScaling={true} maxFontSizeMultiplier={3}>
                {t('screens.onboarding.welcome.upcomingSteps.description')}
              </Text>
            </View>

            {/* Privacy Section */}
            <View
              style={styles.section}
              accessibilityLabel={t('screens.onboarding.welcome.accessibility.privacyLabel')}
            >
              <Text style={styles.sectionTitle} allowFontScaling={true} maxFontSizeMultiplier={3}>
                {t('screens.onboarding.welcome.privacy.title')}
              </Text>
              <Text style={styles.sectionBody} allowFontScaling={true} maxFontSizeMultiplier={3}>
                {t('screens.onboarding.welcome.privacy.description')}
              </Text>
            </View>
          </View>

          <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
        </ScrollView>
      </SafeAreaView>
    </OnboardingShell>
  );
}
