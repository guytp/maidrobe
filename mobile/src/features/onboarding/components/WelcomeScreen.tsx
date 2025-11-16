import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../../../core/theme';
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
      {/* TODO(#110): Move to i18n - accessibility label for welcome screen */}
      <View style={styles.container} accessibilityLabel="Welcome to onboarding">
        {/* TODO(#110): Move to i18n - welcome screen title */}
        <Text
          style={styles.title}
          accessibilityRole="header"
          allowFontScaling={true}
          maxFontSizeMultiplier={3}
        >
          Welcome
        </Text>
        {/* TODO(#110): Move to i18n - step progress indicator */}
        <Text style={styles.subtitle} allowFontScaling={true} maxFontSizeMultiplier={3}>
          Step 1 of 4
        </Text>
        {/* TODO(#110): Move to i18n - welcome screen description */}
        <Text style={styles.description} allowFontScaling={true} maxFontSizeMultiplier={3}>
          This is a placeholder for the Welcome screen. Story #110 will provide the full
          implementation with value proposition, imagery, and engaging copy.
        </Text>

        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </View>
    </OnboardingShell>
  );
}
