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
 * - Step 2: Wardrobe-aware messaging variant (hasItems vs no items)
 * - Step 3: Item query error handling
 * - Step 4: Completion logic via handleOnboardingComplete in _layout.tsx
 * - Step 5: Analytics events integration
 *
 * Current functionality:
 * - Displays completion message using i18n strings
 * - Shows placeholder content (to be enhanced in Steps 2-3)
 * - Uses app theme and accessibility standards
 * - Integrates with OnboardingShell for consistent layout and navigation
 * - Primary CTA triggers completion via OnboardingContext.onNext
 *
 * Terminal step behavior:
 * - No further steps after success (getNextStep returns null)
 * - Footer shows Get Started button without skip options
 * - Tapping Get Started calls handleOnboardingComplete in _layout.tsx
 * - Only reachable when hasOnboarded=false (enforced by _layout.tsx gate)
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
          marginBottom: spacing.md,
          color: colors.textPrimary,
          textAlign: 'center',
        },
        subtitle: {
          fontSize: 18,
          marginBottom: spacing.lg,
          color: colors.textSecondary,
          textAlign: 'center',
        },
        description: {
          fontSize: 14,
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
        <Text style={styles.subtitle} allowFontScaling={true} maxFontSizeMultiplier={3}>
          {t('screens.onboarding.success.subtitle')}
        </Text>
        <Text style={styles.description} allowFontScaling={true} maxFontSizeMultiplier={3}>
          {t('screens.onboarding.success.description')}
        </Text>

        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </View>
    </OnboardingShell>
  );
}
