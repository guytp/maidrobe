import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../../../core/theme';
import { t } from '../../../core/i18n';
import { OnboardingShell } from './OnboardingShell';

/**
 * Welcome screen placeholder for onboarding flow.
 *
 * This is a temporary placeholder that displays the step name and description.
 * Story #110 will provide the full implementation with rich content, visuals,
 * and proper value proposition messaging.
 *
 * Current functionality:
 * - Displays step identifier
 * - Shows placeholder content
 * - Uses app theme and accessibility standards
 * - Integrates with OnboardingShell for consistent layout and navigation
 *
 * @returns Welcome screen component
 */
export function WelcomeScreen(): React.JSX.Element {
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
        accessibilityLabel={t('screens.onboarding.welcome.accessibility.screenLabel')}
      >
        <Text
          style={styles.title}
          accessibilityRole="header"
          allowFontScaling={true}
          maxFontSizeMultiplier={3}
        >
          {t('screens.onboarding.welcome.title')}
        </Text>
        <Text style={styles.subtitle} allowFontScaling={true} maxFontSizeMultiplier={3}>
          {t('screens.onboarding.welcome.subtitle')}
        </Text>
        <Text style={styles.description} allowFontScaling={true} maxFontSizeMultiplier={3}>
          {t('screens.onboarding.welcome.description')}
        </Text>

        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </View>
    </OnboardingShell>
  );
}
