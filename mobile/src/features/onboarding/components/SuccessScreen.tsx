import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { OnboardingShell } from './OnboardingShell';

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
 * - Step 3: Wardrobe-aware messaging variant (hasItems vs no items)
 * - Step 4: Item query error handling
 * - Step 5: Completion logic via handleOnboardingComplete in _layout.tsx
 * - Step 6: Analytics events integration
 *
 * Current functionality:
 * - Displays completion confirmation with clear headline
 * - Shows summary of what's configured and next steps
 * - Uses app theme and accessibility standards
 * - Integrates with OnboardingShell for consistent layout and navigation
 * - Primary CTA ("Get Started") triggers completion via OnboardingContext.onNext
 * - Simple centered layout consistent with PrefsScreen pattern
 *
 * UI Structure:
 * - Title: Completion confirmation ("You're all set!")
 * - Headline: Brief summary ("Your closet is ready")
 * - Body: Explanation of what's configured and encouragement to add items
 * - CTA: Footer provides "Get Started" button (no skip options)
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
          {t('screens.onboarding.success.body')}
        </Text>

        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </View>
    </OnboardingShell>
  );
}
