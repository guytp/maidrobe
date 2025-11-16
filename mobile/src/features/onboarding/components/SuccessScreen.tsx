import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { OnboardingShell } from './OnboardingShell';

/**
 * Onboarding Success/End screen placeholder.
 *
 * This is a temporary placeholder that displays completion messaging.
 * Story #129 will provide the full implementation with success messaging,
 * visual celebration, and proper transition to the main app.
 *
 * Current functionality:
 * - Displays completion message
 * - Shows placeholder content
 * - Uses app theme and accessibility standards
 * - Integrates with OnboardingShell for consistent layout and navigation
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
