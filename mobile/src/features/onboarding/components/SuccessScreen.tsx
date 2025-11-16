import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../../../core/theme';

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
      accessibilityLabel="Onboarding complete"
    >
      <Text
        style={styles.title}
        accessibilityRole="header"
        allowFontScaling={true}
        maxFontSizeMultiplier={3}
      >
        All Set!
      </Text>
      <Text style={styles.subtitle} allowFontScaling={true} maxFontSizeMultiplier={3}>
        Step 4 of 4
      </Text>
      <Text style={styles.description} allowFontScaling={true} maxFontSizeMultiplier={3}>
        This is a placeholder for the Onboarding Success screen. Story #129 will provide the full
        implementation with celebration visuals and transition to the main app.
      </Text>

      <View style={styles.buttonPlaceholder}>
        <Text style={styles.buttonText} allowFontScaling={true} maxFontSizeMultiplier={2}>
          Get Started (Placeholder)
        </Text>
      </View>

      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}
