import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../../../core/theme';
import { t } from '../../../core/i18n';
import { validateEmail } from '../utils/validation';
import { useRequestPasswordReset } from '../api/useRequestPasswordReset';

/**
 * ForgotPasswordScreen component - Request password reset email
 *
 * Presentational component responsible for:
 * - Rendering email input field with validation
 * - Client-side validation (email format)
 * - Submitting password reset request via useRequestPasswordReset
 * - Displaying generic success message to prevent account enumeration
 * - Surfacing inline error states for network/rate limit issues only
 * - Accessibility support (WCAG 2.1 AA)
 * - Loading and error states display
 * - Navigation back to login screen
 *
 * SECURITY: Generic Messaging to Prevent Account Enumeration
 * - Always shows "If an account exists, we've sent a link." on success
 * - Only exceptions: rate limiting and network errors (user can retry)
 * - This prevents attackers from discovering valid email addresses
 *
 * The useRequestPasswordReset mutation handles:
 * - Rate limiting (5 requests per hour per email)
 * - Telemetry event logging
 * - Supabase API call to send reset email
 * - Error classification
 *
 * @example
 * ```typescript
 * // Used in /app/auth/forgot-password.tsx route
 * <ForgotPasswordScreen />
 * ```
 */
export function ForgotPasswordScreen() {
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  const { mutate: requestReset, isPending } = useRequestPasswordReset();

  /**
   * Validates email field and updates error state
   * Normalizes email (trim and lowercase) before validation
   */
  const handleEmailBlur = () => {
    const normalizedEmail = email.trim().toLowerCase();
    const validation = validateEmail(normalizedEmail);
    if (!validation.isValid) {
      setEmailError(validation.error || t('screens.auth.forgotPassword.errors.invalidEmail'));
    } else {
      setEmailError(null);
    }
  };

  /**
   * Handles form submission with validation and password reset request
   * Normalizes email (trim and lowercase) before validation and submission
   *
   * SECURITY:
   * - Shows generic success message regardless of whether email exists
   * - Only reveals specific errors for rate limiting and network issues
   * - This prevents account enumeration attacks
   */
  const handleSubmit = () => {
    // Clear previous errors
    setEmailError(null);

    // Normalize email to ensure consistent casing and no whitespace
    const normalizedEmail = email.trim().toLowerCase();

    // Validate email
    const emailValidation = validateEmail(normalizedEmail);
    if (!emailValidation.isValid) {
      setEmailError(emailValidation.error || t('screens.auth.forgotPassword.errors.invalidEmail'));
      return;
    }

    // Call password reset mutation
    requestReset(
      { email: normalizedEmail },
      {
        onSuccess: () => {
          // SECURITY: Always show generic success message
          // This prevents account enumeration - we don't reveal if email exists
          setShowSuccessMessage(true);
        },
        onError: (error) => {
          // Error is already logged by useRequestPasswordReset mutation
          // Only display error for rate limit and network issues
          // All other errors result in success message (handled by mutation)
          setEmailError(error.message);
        },
      }
    );
  };

  /**
   * Navigate back to login screen
   */
  const handleBackToLogin = () => {
    router.push('/auth/login');
  };

  // Dynamic styles based on theme
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        scrollContent: {
          flexGrow: 1,
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
          marginBottom: spacing.xs,
        },
        subtitle: {
          fontSize: 18,
          color: colors.textSecondary,
          marginBottom: spacing.md,
        },
        description: {
          fontSize: 16,
          color: colors.textSecondary,
          lineHeight: 24,
        },
        formGroup: {
          marginBottom: spacing.lg,
        },
        label: {
          fontSize: 16,
          fontWeight: '600',
          color: colors.textPrimary,
          marginBottom: spacing.sm,
        },
        input: {
          backgroundColor: colors.background,
          borderWidth: 1,
          borderColor: colors.textSecondary,
          borderRadius: radius.md,
          padding: spacing.md,
          fontSize: 16,
          color: colors.textPrimary,
          minHeight: 44,
        },
        inputError: {
          borderColor: colors.error,
        },
        errorText: {
          color: colors.error,
          fontSize: 14,
          marginTop: spacing.xs,
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
        backButton: {
          marginTop: spacing.lg,
          alignItems: 'center',
          minHeight: 44,
          justifyContent: 'center',
        },
        backButtonText: {
          color: colors.textSecondary,
          fontSize: 16,
          fontWeight: '600',
        },
        successContainer: {
          backgroundColor: colors.background,
          padding: spacing.lg,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.textSecondary,
        },
        successTitle: {
          fontSize: 24,
          fontWeight: 'bold',
          color: colors.textPrimary,
          marginBottom: spacing.md,
        },
        successMessage: {
          fontSize: 16,
          color: colors.textSecondary,
          lineHeight: 24,
          marginBottom: spacing.md,
        },
        successInstruction: {
          fontSize: 14,
          color: colors.textSecondary,
          lineHeight: 20,
        },
      }),
    [colors, spacing, radius]
  );

  const isFormValid = email.trim() !== '';

  // Show success message view
  if (showSuccessMessage) {
    return (
      <SafeAreaView
        style={styles.container}
        accessibilityLabel={t('screens.auth.forgotPassword.accessibility.screenLabel')}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text
              style={styles.title}
              accessibilityRole="header"
              allowFontScaling={true}
              maxFontSizeMultiplier={3}
            >
              {t('screens.auth.forgotPassword.title')}
            </Text>
          </View>

          <View style={styles.successContainer} accessibilityLiveRegion="polite">
            <Text style={styles.successTitle} allowFontScaling={true} maxFontSizeMultiplier={2.5}>
              {t('screens.auth.forgotPassword.successTitle')}
            </Text>
            <Text style={styles.successMessage} allowFontScaling={true} maxFontSizeMultiplier={2}>
              {t('screens.auth.forgotPassword.successMessage')}
            </Text>
            <Text
              style={styles.successInstruction}
              allowFontScaling={true}
              maxFontSizeMultiplier={2}
            >
              {t('screens.auth.forgotPassword.successInstruction')}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBackToLogin}
            accessibilityRole="button"
            accessibilityLabel={t('screens.auth.forgotPassword.backToLogin')}
            accessibilityHint={t('screens.auth.forgotPassword.accessibility.backToLoginHint')}
          >
            <Text style={styles.backButtonText} allowFontScaling={true} maxFontSizeMultiplier={2}>
              {t('screens.auth.forgotPassword.backToLogin')}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Show form view
  return (
    <SafeAreaView
      style={styles.container}
      accessibilityLabel={t('screens.auth.forgotPassword.accessibility.screenLabel')}
      accessibilityHint={t('screens.auth.forgotPassword.accessibility.screenHint')}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text
            style={styles.title}
            accessibilityRole="header"
            allowFontScaling={true}
            maxFontSizeMultiplier={3}
          >
            {t('screens.auth.forgotPassword.title')}
          </Text>
          <Text style={styles.subtitle} allowFontScaling={true} maxFontSizeMultiplier={2.5}>
            {t('screens.auth.forgotPassword.subtitle')}
          </Text>
          <Text style={styles.description} allowFontScaling={true} maxFontSizeMultiplier={2}>
            {t('screens.auth.forgotPassword.description')}
          </Text>
        </View>

        {/* Email Input */}
        <View style={styles.formGroup}>
          <Text style={styles.label} allowFontScaling={true} maxFontSizeMultiplier={2}>
            {t('screens.auth.forgotPassword.emailLabel')}
          </Text>
          <TextInput
            style={[styles.input, emailError ? styles.inputError : null]}
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (emailError) setEmailError(null);
            }}
            onBlur={handleEmailBlur}
            placeholder={t('screens.auth.forgotPassword.emailPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            editable={!isPending}
            accessibilityLabel={t('screens.auth.forgotPassword.accessibility.emailInput')}
            accessibilityHint={t('screens.auth.forgotPassword.accessibility.emailInputHint')}
            allowFontScaling={true}
            maxFontSizeMultiplier={2}
          />
          {emailError && (
            <Text
              style={styles.errorText}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              allowFontScaling={true}
              maxFontSizeMultiplier={2}
            >
              {emailError}
            </Text>
          )}
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.button, (isPending || !isFormValid) && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={isPending || !isFormValid}
          accessibilityRole="button"
          accessibilityLabel={t('screens.auth.forgotPassword.accessibility.submitButton')}
          accessibilityHint={t('screens.auth.forgotPassword.accessibility.submitButtonHint')}
          accessibilityState={{ disabled: isPending || !isFormValid }}
        >
          {isPending ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={colors.background} />
              <Text style={styles.loadingText}>{t('screens.auth.forgotPassword.submitting')}</Text>
            </View>
          ) : (
            <Text style={styles.buttonText}>{t('screens.auth.forgotPassword.submitButton')}</Text>
          )}
        </TouchableOpacity>

        {/* Back to Login Link */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBackToLogin}
          accessibilityRole="button"
          accessibilityLabel={t('screens.auth.forgotPassword.backToLogin')}
          accessibilityHint={t('screens.auth.forgotPassword.accessibility.backToLoginHint')}
        >
          <Text style={styles.backButtonText} allowFontScaling={true} maxFontSizeMultiplier={2}>
            {t('screens.auth.forgotPassword.backToLogin')}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
