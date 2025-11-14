import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTheme } from '../../../core/theme';
import { t } from '../../../core/i18n';
import { useResendVerification } from '../api/useResendVerification';
import { useStore } from '../../../core/state/store';

/**
 * VerificationPromptScreen component - Email verification instructions with resend functionality
 *
 * Features:
 * - Display verification instructions
 * - Resend verification email button
 * - 60-second cooldown timer with live countdown
 * - Success and error message handling
 * - Accessibility support (WCAG AA)
 * - Telemetry instrumentation via useResendVerification hook
 *
 * Cooldown Logic:
 * - 60 seconds after each successful resend
 * - Countdown displayed in real-time
 * - Button disabled during cooldown and loading
 * - Cooldown state tracked in local component state
 */
export function VerificationPromptScreen() {
  const { colors, spacing, radius } = useTheme();
  const user = useStore((state) => state.user);

  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);

  const { mutate: resendVerification, isPending } = useResendVerification();

  /**
   * Cooldown timer effect - counts down from 60 to 0
   */
  useEffect(() => {
    if (cooldownSeconds > 0) {
      const timer = setInterval(() => {
        setCooldownSeconds((prev) => Math.max(0, prev - 1));
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [cooldownSeconds]);

  /**
   * Auto-dismiss success message after 3 seconds
   */
  useEffect(() => {
    if (showSuccess) {
      const timer = setTimeout(() => {
        setShowSuccess(false);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [showSuccess]);

  /**
   * Handle resend verification email button press
   */
  const handleResend = () => {
    // Check if user email is available
    if (!user || !user.email) {
      Alert.alert(
        t('screens.auth.verify.errors.noEmail'),
        t('screens.auth.verify.errors.verificationPrompt'),
        [{ text: 'OK' }]
      );
      return;
    }

    // Call resend mutation
    resendVerification(
      { email: user.email },
      {
        onSuccess: () => {
          // Show success message
          setShowSuccess(true);
          // Start 60-second cooldown
          setCooldownSeconds(60);
        },
        onError: (error) => {
          // Show error alert
          Alert.alert(t('screens.auth.verify.errors.resendFailed'), error.message, [
            { text: 'OK' },
          ]);
        },
      }
    );
  };

  /**
   * Check if resend button should be disabled
   */
  const isResendDisabled = isPending || cooldownSeconds > 0;

  /**
   * Get button text based on current state
   */
  const getButtonText = () => {
    if (isPending) {
      return t('screens.auth.verify.resending');
    }
    if (cooldownSeconds > 0) {
      return t('screens.auth.verify.cooldownMessage').replace(
        '{seconds}',
        cooldownSeconds.toString()
      );
    }
    return t('screens.auth.verify.resendButton');
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
          padding: spacing.lg,
          justifyContent: 'center',
        },
        content: {
          marginBottom: spacing.xl,
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
          marginBottom: spacing.lg,
        },
        button: {
          backgroundColor: colors.textPrimary,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          borderRadius: radius.md,
          minHeight: 44,
          justifyContent: 'center',
          alignItems: 'center',
          marginTop: spacing.md,
        },
        buttonDisabled: {
          opacity: 0.5,
        },
        buttonText: {
          color: colors.background,
          fontSize: 16,
          fontWeight: '600',
          textAlign: 'center',
        },
        loadingContainer: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
        },
        loadingText: {
          color: colors.background,
          fontSize: 16,
          fontWeight: '600',
          marginLeft: spacing.sm,
        },
        successMessage: {
          backgroundColor: '#4caf50',
          padding: spacing.md,
          borderRadius: radius.md,
          marginTop: spacing.md,
        },
        successText: {
          color: '#ffffff',
          fontSize: 14,
          fontWeight: '600',
          textAlign: 'center',
        },
      }),
    [colors, spacing, radius]
  );

  return (
    <SafeAreaView
      style={styles.container}
      accessibilityLabel={t('screens.auth.verify.accessibility.screenLabel')}
      accessibilityHint={t('screens.auth.verify.accessibility.screenHint')}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <Text
            style={styles.title}
            accessibilityRole="header"
            allowFontScaling={true}
            maxFontSizeMultiplier={3}
          >
            {t('screens.auth.verify.title')}
          </Text>
          <Text style={styles.subtitle} allowFontScaling={true} maxFontSizeMultiplier={2.5}>
            {t('screens.auth.verify.subtitle')}
          </Text>
          <Text style={styles.description} allowFontScaling={true} maxFontSizeMultiplier={2}>
            {t('screens.auth.verify.description')}
          </Text>
        </View>

        {/* Resend Button */}
        <TouchableOpacity
          style={[styles.button, isResendDisabled && styles.buttonDisabled]}
          onPress={handleResend}
          disabled={isResendDisabled}
          accessibilityRole="button"
          accessibilityLabel={t('screens.auth.verify.accessibility.resendButton')}
          accessibilityHint={
            cooldownSeconds > 0
              ? `Cooldown: ${cooldownSeconds} seconds remaining`
              : 'Tap to resend verification email'
          }
          accessibilityState={{ disabled: isResendDisabled }}
        >
          {isPending ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={colors.background} />
              <Text style={styles.loadingText}>{t('screens.auth.verify.resending')}</Text>
            </View>
          ) : (
            <Text style={styles.buttonText} allowFontScaling={true} maxFontSizeMultiplier={2}>
              {getButtonText()}
            </Text>
          )}
        </TouchableOpacity>

        {/* Success Message */}
        {showSuccess && (
          <View
            style={styles.successMessage}
            accessibilityLabel={t('screens.auth.verify.accessibility.successMessage')}
            accessibilityLiveRegion="polite"
          >
            <Text style={styles.successText} allowFontScaling={true} maxFontSizeMultiplier={2}>
              {t('screens.auth.verify.resendSuccess')}
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
