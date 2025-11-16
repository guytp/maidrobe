import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../../../core/theme';

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
        buttonPlaceholder: {
          marginTop: spacing.xl,
          padding: spacing.md,
          backgroundColor: colors.textSecondary,
          borderRadius: 8,
          minWidth: 200,
          alignItems: 'center',
        },
        buttonText: {
          fontSize: 16,
          fontWeight: '600',
          color: colors.background,
        },
      }),
    [colors, spacing]
  );

  return (
    <View
      style={styles.container}
      accessibilityLabel="Welcome to onboarding"
    >
      <Text
        style={styles.title}
        accessibilityRole="header"
        allowFontScaling={true}
        maxFontSizeMultiplier={3}
      >
        Welcome
      </Text>
      <Text style={styles.subtitle} allowFontScaling={true} maxFontSizeMultiplier={3}>
        Step 1 of 4
      </Text>
      <Text style={styles.description} allowFontScaling={true} maxFontSizeMultiplier={3}>
        This is a placeholder for the Welcome screen. Story #110 will provide the full
        implementation with value proposition, imagery, and engaging copy.
      </Text>

      <View style={styles.buttonPlaceholder}>
        <Text style={styles.buttonText} allowFontScaling={true} maxFontSizeMultiplier={2}>
          Next (Placeholder)
        </Text>
      </View>

      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}
