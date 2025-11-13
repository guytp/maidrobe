import React, { useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { useTheme } from '../../../core/theme';
import { t } from '../../../core/i18n';

/**
 * VerificationPromptScreen component - Email verification instructions
 *
 * This is a placeholder screen that will be enhanced in Step 2 with:
 * - Resend verification email button
 * - 60-second cooldown timer
 * - Email verification status checking
 * - Deep link handling for email confirmation
 *
 * Current implementation shows basic verification instructions.
 */
export function VerificationPromptScreen() {
  const { colors, spacing } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
          padding: spacing.lg,
          justifyContent: 'center',
        },
        header: {
          marginBottom: spacing.xl,
        },
        title: {
          fontSize: 32,
          fontWeight: 'bold',
          color: colors.textPrimary,
          marginBottom: spacing.sm,
        },
        subtitle: {
          fontSize: 18,
          fontWeight: '600',
          color: colors.textSecondary,
          marginBottom: spacing.md,
        },
        description: {
          fontSize: 16,
          color: colors.textPrimary,
          lineHeight: 24,
        },
      }),
    [colors, spacing]
  );

  return (
    <SafeAreaView
      style={styles.container}
      accessibilityLabel={t('screens.auth.verify.accessibility.screenLabel')}
      accessibilityHint={t('screens.auth.verify.accessibility.screenHint')}
    >
      <View style={styles.header}>
        <Text
          style={styles.title}
          accessibilityRole="header"
          allowFontScaling={true}
          maxFontSizeMultiplier={3}
        >
          {t('screens.auth.verify.title')}
        </Text>
        <Text
          style={styles.subtitle}
          allowFontScaling={true}
          maxFontSizeMultiplier={2.5}
        >
          {t('screens.auth.verify.subtitle')}
        </Text>
        <Text
          style={styles.description}
          allowFontScaling={true}
          maxFontSizeMultiplier={2}
        >
          {t('screens.auth.verify.description')}
        </Text>
      </View>
    </SafeAreaView>
  );
}
