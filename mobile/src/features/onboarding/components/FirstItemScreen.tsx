import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../../../core/theme';

/**
 * First Wardrobe Item Capture screen placeholder for onboarding flow.
 *
 * This is a temporary placeholder that displays the step name and description.
 * Story #123 will provide the full implementation with camera integration,
 * image capture, and item processing.
 *
 * Current functionality:
 * - Displays step identifier
 * - Shows placeholder content
 * - Uses app theme and accessibility standards
 *
 * @returns First item capture screen component
 */
export function FirstItemScreen(): React.JSX.Element {
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
        skipPlaceholder: {
          marginTop: spacing.md,
          padding: spacing.sm,
        },
        skipText: {
          fontSize: 14,
          color: colors.textSecondary,
          textDecorationLine: 'underline',
        },
      }),
    [colors, spacing]
  );

  return (
    <View
      style={styles.container}
      accessibilityLabel="First wardrobe item capture"
    >
      <Text
        style={styles.title}
        accessibilityRole="header"
        allowFontScaling={true}
        maxFontSizeMultiplier={3}
      >
        First Item
      </Text>
      <Text style={styles.subtitle} allowFontScaling={true} maxFontSizeMultiplier={3}>
        Step 3 of 4
      </Text>
      <Text style={styles.description} allowFontScaling={true} maxFontSizeMultiplier={3}>
        This is a placeholder for the First Wardrobe Item Capture screen. Story #123 will provide
        the full implementation with camera integration and guided item capture.
      </Text>

      <View style={styles.buttonPlaceholder}>
        <Text style={styles.buttonText} allowFontScaling={true} maxFontSizeMultiplier={2}>
          Complete (Placeholder)
        </Text>
      </View>

      <View style={styles.skipPlaceholder}>
        <Text style={styles.skipText} allowFontScaling={true} maxFontSizeMultiplier={2}>
          Skip this step (Placeholder)
        </Text>
      </View>

      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}
