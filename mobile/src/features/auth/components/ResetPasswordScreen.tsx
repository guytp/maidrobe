import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../../core/theme';
import { t } from '../../../core/i18n';
import {
  validatePassword,
  validatePasswordConfirmation,
  calculatePasswordStrength,
  checkPasswordPolicyRules,
} from '../utils/validation';
import type { PasswordStrength } from '../utils/validation';
import { useResetPassword } from '../api/useResetPassword';
import { logAuthEvent } from '../../../core/telemetry';
import { Toast } from '../../../core/components/Toast';
import { useRecaptcha } from '../hooks/useRecaptcha';
import {
  checkResetAttemptRateLimit,
  recordResetAttempt,
  clearResetAttempts,
} from '../utils/resetAttemptRateLimit';
import { useStore } from '../../../core/state/store';

/**
 * ResetPasswordScreen component - Complete password reset via deep link
 *
 * Presentational component responsible for:
 * - Extracting reset token from URL parameters (deep link)
 * - Validating token presence and format
 * - Rendering password reset form with two password fields
 * - Real-time password strength indicator
 * - Password policy rules checklist with live feedback
 * - Submitting password reset via useResetPassword
 * - Handling success/error states
 * - Accessibility support (WCAG 2.1 AA)
 * - Navigation to login on success or forgot password on error
 *
 * Deep Link Format:
 * - maidrobe://reset-password?token={token}&type=recovery
 * - OR: maidrobe://reset-password#access_token={token}&type=recovery
 *
 * Three View States:
 * 1. Error View: Token missing, invalid, or expired
 * 2. Form View: Password reset form with validation
 * 3. Success View: Not shown (navigates to login instead)
 *
 * The useResetPassword mutation handles:
 * - Token verification with Supabase
 * - Password policy enforcement
 * - Password reuse checking (stub)
 * - Telemetry event logging
 * - Error classification
 *
 * @example
 * ```typescript
 * // Used in /app/auth/reset-password.tsx route
 * <ResetPasswordScreen />
 * ```
 */
export function ResetPasswordScreen() {
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();
  const params = useLocalSearchParams<{
    token?: string;
    access_token?: string;
    refresh_token?: string;
    type?: string;
    email?: string;
  }>();

  // Extract user from store for password reuse checking
  const user = useStore((state) => state.user);

  // Extract tokens from URL parameters
  // Supabase sends access_token and refresh_token in URL fragment when user clicks reset link
  // URL format: maidrobe://reset-password#access_token=XXX&refresh_token=YYY&type=recovery
  const accessToken = (params.access_token || params.token || '') as string;
  const refreshToken = (params.refresh_token || '') as string;
  const isRecoveryType = params.type === 'recovery';
  const emailFromParams = (params.email || '') as string;

  // Component state
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  // Token validation - show error if tokens are missing or invalid format
  // Both access_token and refresh_token are required for password reset
  const hasValidToken = accessToken.trim().length > 0 && refreshToken.trim().length > 0;

  const { mutate: resetPassword, isPending } = useResetPassword();
  const { executeRecaptcha, isLoading: isRecaptchaLoading } = useRecaptcha();

  // Emit telemetry event when component mounts (deep link opened)
  useEffect(() => {
    logAuthEvent('password-reset-link-opened', {
      outcome: hasValidToken ? 'valid_token' : 'invalid_token',
      metadata: {
        hasToken: hasValidToken,
        isRecoveryType,
      },
    });
  }, [hasValidToken, isRecoveryType]);

  // Calculate password strength in real-time
  const passwordStrength = useMemo(() => {
    if (!password) {
      return null;
    }
    return calculatePasswordStrength(password);
  }, [password]);

  // Check password policy rules in real-time
  const policyRules = useMemo(() => {
    if (!password) {
      return null;
    }
    return checkPasswordPolicyRules(password);
  }, [password]);

  /**
   * Validates password field and updates error state
   */
  const handlePasswordBlur = () => {
    const validation = validatePassword(password);
    if (!validation.isValid) {
      setPasswordError(t('screens.auth.resetPassword.errors.weakPassword'));
    } else {
      setPasswordError(null);
    }
  };

  /**
   * Validates confirm password field and updates error state
   */
  const handleConfirmPasswordBlur = () => {
    const validation = validatePasswordConfirmation(password, confirmPassword);
    if (!validation.isValid) {
      setConfirmPasswordError(
        validation.error || t('screens.auth.resetPassword.errors.passwordMismatch')
      );
    } else {
      setConfirmPasswordError(null);
    }
  };

  /**
   * Handles form submission with validation, rate limiting, reCAPTCHA, and password reset
   */
  const handleSubmit = async () => {
    // Clear previous errors
    setPasswordError(null);
    setConfirmPasswordError(null);

    // Validate password
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      setPasswordError(t('screens.auth.resetPassword.errors.weakPassword'));
      return;
    }

    // Validate passwords match
    const confirmValidation = validatePasswordConfirmation(password, confirmPassword);
    if (!confirmValidation.isValid) {
      setConfirmPasswordError(
        confirmValidation.error || t('screens.auth.resetPassword.errors.passwordMismatch')
      );
      return;
    }

    // Check rate limiting (use accessToken as rate limit key)
    const rateLimitCheck = await checkResetAttemptRateLimit(accessToken);
    if (!rateLimitCheck.allowed) {
      const errorMessage = t('screens.auth.resetPassword.errors.rateLimitExceeded').replace(
        '{seconds}',
        rateLimitCheck.remainingSeconds.toString()
      );
      setPasswordError(errorMessage);
      logAuthEvent('password-reset-failed', {
        outcome: 'rate_limited',
        metadata: {
          remainingSeconds: rateLimitCheck.remainingSeconds,
        },
      });
      return;
    }

    // Execute reCAPTCHA challenge
    const recaptchaResult = await executeRecaptcha('password_reset');
    if (!recaptchaResult.success) {
      setPasswordError(t('screens.auth.resetPassword.errors.recaptchaFailed'));
      logAuthEvent('password-reset-failed', {
        outcome: 'recaptcha_failed',
        metadata: {
          error: recaptchaResult.error,
        },
      });
      return;
    }

    // Record attempt for rate limiting
    await recordResetAttempt(accessToken);

    // Call password reset mutation
    // Pass both tokens from deep link and userId from store
    resetPassword(
      { accessToken, refreshToken, password, confirmPassword, userId: user?.id },
      {
        onSuccess: () => {
          // Clear rate limit attempts on success
          clearResetAttempts(accessToken);

          // Show success toast
          setShowSuccessToast(true);

          // Navigate to login after brief delay to show toast
          setTimeout(() => {
            router.push('/auth/login');
          }, 2000);
        },
        onError: (error) => {
          // Error is already logged by useResetPassword mutation
          // Display user-friendly error message
          setPasswordError(error.message);
        },
      }
    );
  };

  /**
   * Navigate back to forgot password screen
   * Optionally pre-fill email if available
   */
  const handleResendEmail = () => {
    if (emailFromParams) {
      router.push(`/auth/forgot-password?email=${encodeURIComponent(emailFromParams)}`);
    } else {
      router.push('/auth/forgot-password');
    }
  };

  /**
   * Navigate to login screen
   */
  const handleBackToLogin = () => {
    router.push('/auth/login');
  };

  /**
   * Get color for password strength indicator
   */
  const getStrengthColor = (strength: PasswordStrength): string => {
    switch (strength) {
      case 'weak':
        return colors.error;
      case 'medium':
        return colors.warning;
      case 'strong':
        return colors.success;
      default:
        return colors.textSecondary;
    }
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
        passwordContainer: {
          position: 'relative',
        },
        passwordToggle: {
          position: 'absolute',
          right: spacing.md,
          top: spacing.md,
          minHeight: 44,
          minWidth: 44,
          justifyContent: 'center',
          alignItems: 'center',
        },
        passwordToggleText: {
          color: colors.textSecondary,
          fontSize: 14,
          fontWeight: '600',
        },
        errorText: {
          color: colors.error,
          fontSize: 14,
          marginTop: spacing.xs,
        },
        strengthContainer: {
          marginTop: spacing.sm,
          flexDirection: 'row',
          alignItems: 'center',
        },
        strengthLabel: {
          fontSize: 14,
          color: colors.textSecondary,
          marginRight: spacing.sm,
        },
        strengthValue: {
          fontSize: 14,
          fontWeight: '600',
        },
        policyRulesContainer: {
          marginTop: spacing.md,
          padding: spacing.md,
          backgroundColor: colors.background,
          borderWidth: 1,
          borderColor: colors.textSecondary,
          borderRadius: radius.md,
        },
        policyRulesTitle: {
          fontSize: 14,
          fontWeight: '600',
          color: colors.textPrimary,
          marginBottom: spacing.sm,
        },
        policyRule: {
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: spacing.xs,
        },
        policyRuleIndicator: {
          width: 16,
          height: 16,
          borderRadius: 8,
          marginRight: spacing.sm,
          justifyContent: 'center',
          alignItems: 'center',
        },
        policyRuleText: {
          fontSize: 14,
          color: colors.textSecondary,
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
        errorContainer: {
          backgroundColor: colors.background,
          padding: spacing.lg,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.error,
        },
        errorTitle: {
          fontSize: 24,
          fontWeight: 'bold',
          color: colors.textPrimary,
          marginBottom: spacing.md,
        },
        errorMessage: {
          fontSize: 16,
          color: colors.textSecondary,
          lineHeight: 24,
          marginBottom: spacing.lg,
        },
      }),
    [colors, spacing, radius]
  );

  const isFormValid =
    password.trim() !== '' && confirmPassword.trim() !== '' && password === confirmPassword;

  // Show error view if token is missing or invalid
  if (!hasValidToken) {
    return (
      <SafeAreaView
        style={styles.container}
        accessibilityLabel={t('screens.auth.resetPassword.accessibility.screenLabel')}
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
              {t('screens.auth.resetPassword.linkExpired.title')}
            </Text>
          </View>

          <View
            style={styles.errorContainer}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            <Text style={styles.errorMessage} allowFontScaling={true} maxFontSizeMultiplier={2}>
              {t('screens.auth.resetPassword.linkExpired.message')}
            </Text>

            <TouchableOpacity
              style={styles.button}
              onPress={handleResendEmail}
              accessibilityRole="button"
              accessibilityLabel="Resend reset email"
              accessibilityHint="Request a new password reset link"
            >
              <Text style={styles.buttonText} allowFontScaling={true} maxFontSizeMultiplier={2}>
                {t('screens.auth.resetPassword.linkExpired.resendButton')}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBackToLogin}
            accessibilityRole="button"
            accessibilityLabel="Back to login"
            accessibilityHint="Return to the login screen"
          >
            <Text style={styles.backButtonText} allowFontScaling={true} maxFontSizeMultiplier={2}>
              Back to Login
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Show password reset form
  return (
    <SafeAreaView
      style={styles.container}
      accessibilityLabel={t('screens.auth.resetPassword.accessibility.screenLabel')}
      accessibilityHint={t('screens.auth.resetPassword.accessibility.screenHint')}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text
            style={styles.title}
            accessibilityRole="header"
            allowFontScaling={true}
            maxFontSizeMultiplier={3}
          >
            {t('screens.auth.resetPassword.title')}
          </Text>
          <Text style={styles.subtitle} allowFontScaling={true} maxFontSizeMultiplier={2.5}>
            {t('screens.auth.resetPassword.subtitle')}
          </Text>
        </View>

        {/* New Password Input */}
        <View style={styles.formGroup}>
          <Text style={styles.label} allowFontScaling={true} maxFontSizeMultiplier={2}>
            {t('screens.auth.resetPassword.newPasswordLabel')}
          </Text>
          <View style={styles.passwordContainer}>
            <TextInput
              style={[styles.input, passwordError ? styles.inputError : null]}
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (passwordError) setPasswordError(null);
              }}
              onBlur={handlePasswordBlur}
              placeholder={t('screens.auth.resetPassword.newPasswordPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="password-new"
              autoCorrect={false}
              editable={!isPending && !isRecaptchaLoading}
              accessibilityLabel={t('screens.auth.resetPassword.accessibility.newPasswordInput')}
              accessibilityHint="Enter your new password"
              allowFontScaling={true}
              maxFontSizeMultiplier={2}
            />
            <TouchableOpacity
              style={styles.passwordToggle}
              onPress={() => setShowPassword(!showPassword)}
              accessibilityRole="button"
              accessibilityLabel={t('screens.auth.resetPassword.accessibility.passwordToggle')}
              accessibilityHint={
                showPassword
                  ? t('screens.auth.resetPassword.hidePassword')
                  : t('screens.auth.resetPassword.showPassword')
              }
            >
              <Text style={styles.passwordToggleText}>
                {showPassword
                  ? t('screens.auth.resetPassword.hidePassword')
                  : t('screens.auth.resetPassword.showPassword')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Password Strength Indicator */}
          {passwordStrength && (
            <View
              style={styles.strengthContainer}
              accessibilityLiveRegion="polite"
              accessibilityLabel={t('screens.auth.resetPassword.accessibility.strengthIndicator')}
              accessibilityValue={{
                text: `${t('screens.auth.resetPassword.passwordStrength.label')}: ${t(`screens.auth.resetPassword.passwordStrength.${passwordStrength.strength}`)}`,
              }}
            >
              <Text style={styles.strengthLabel} allowFontScaling={true} maxFontSizeMultiplier={2}>
                {t('screens.auth.resetPassword.passwordStrength.label')}:
              </Text>
              <Text
                style={[
                  styles.strengthValue,
                  { color: getStrengthColor(passwordStrength.strength) },
                ]}
                allowFontScaling={true}
                maxFontSizeMultiplier={2}
              >
                {t(`screens.auth.resetPassword.passwordStrength.${passwordStrength.strength}`)}
              </Text>
            </View>
          )}

          {passwordError && (
            <Text
              style={styles.errorText}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              allowFontScaling={true}
              maxFontSizeMultiplier={2}
            >
              {passwordError}
            </Text>
          )}
        </View>

        {/* Password Policy Rules Checklist */}
        {policyRules && (
          <View style={styles.policyRulesContainer}>
            <Text style={styles.policyRulesTitle} allowFontScaling={true} maxFontSizeMultiplier={2}>
              {t('screens.auth.resetPassword.policyRules.title')}
            </Text>

            <View style={styles.policyRule}>
              <View
                style={[
                  styles.policyRuleIndicator,
                  {
                    backgroundColor: policyRules.hasMinLength ? colors.success : colors.textSecondary,
                  },
                ]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: policyRules.hasMinLength }}
                accessibilityLabel={t('screens.auth.resetPassword.policyRules.minLength')}
              />
              <Text style={styles.policyRuleText} allowFontScaling={true} maxFontSizeMultiplier={2}>
                {t('screens.auth.resetPassword.policyRules.minLength')}
              </Text>
            </View>

            <View style={styles.policyRule}>
              <View
                style={[
                  styles.policyRuleIndicator,
                  {
                    backgroundColor: policyRules.hasUppercase ? colors.success : colors.textSecondary,
                  },
                ]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: policyRules.hasUppercase }}
                accessibilityLabel={t('screens.auth.resetPassword.policyRules.uppercase')}
              />
              <Text style={styles.policyRuleText} allowFontScaling={true} maxFontSizeMultiplier={2}>
                {t('screens.auth.resetPassword.policyRules.uppercase')}
              </Text>
            </View>

            <View style={styles.policyRule}>
              <View
                style={[
                  styles.policyRuleIndicator,
                  {
                    backgroundColor: policyRules.hasLowercase ? colors.success : colors.textSecondary,
                  },
                ]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: policyRules.hasLowercase }}
                accessibilityLabel={t('screens.auth.resetPassword.policyRules.lowercase')}
              />
              <Text style={styles.policyRuleText} allowFontScaling={true} maxFontSizeMultiplier={2}>
                {t('screens.auth.resetPassword.policyRules.lowercase')}
              </Text>
            </View>

            <View style={styles.policyRule}>
              <View
                style={[
                  styles.policyRuleIndicator,
                  { backgroundColor: policyRules.hasNumber ? colors.success : colors.textSecondary },
                ]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: policyRules.hasNumber }}
                accessibilityLabel={t('screens.auth.resetPassword.policyRules.number')}
              />
              <Text style={styles.policyRuleText} allowFontScaling={true} maxFontSizeMultiplier={2}>
                {t('screens.auth.resetPassword.policyRules.number')}
              </Text>
            </View>

            <View style={styles.policyRule}>
              <View
                style={[
                  styles.policyRuleIndicator,
                  { backgroundColor: policyRules.hasSymbol ? colors.success : colors.textSecondary },
                ]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: policyRules.hasSymbol }}
                accessibilityLabel={t('screens.auth.resetPassword.policyRules.symbol')}
              />
              <Text style={styles.policyRuleText} allowFontScaling={true} maxFontSizeMultiplier={2}>
                {t('screens.auth.resetPassword.policyRules.symbol')}
              </Text>
            </View>
          </View>
        )}

        {/* Confirm Password Input */}
        <View style={styles.formGroup}>
          <Text style={styles.label} allowFontScaling={true} maxFontSizeMultiplier={2}>
            {t('screens.auth.resetPassword.confirmPasswordLabel')}
          </Text>
          <View style={styles.passwordContainer}>
            <TextInput
              style={[styles.input, confirmPasswordError ? styles.inputError : null]}
              value={confirmPassword}
              onChangeText={(text) => {
                setConfirmPassword(text);
                if (confirmPasswordError) setConfirmPasswordError(null);
              }}
              onBlur={handleConfirmPasswordBlur}
              placeholder={t('screens.auth.resetPassword.confirmPasswordPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
              autoComplete="password-new"
              autoCorrect={false}
              editable={!isPending && !isRecaptchaLoading}
              accessibilityLabel={t(
                'screens.auth.resetPassword.accessibility.confirmPasswordInput'
              )}
              accessibilityHint="Re-enter your new password"
              allowFontScaling={true}
              maxFontSizeMultiplier={2}
            />
            <TouchableOpacity
              style={styles.passwordToggle}
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              accessibilityRole="button"
              accessibilityLabel={t('screens.auth.resetPassword.accessibility.passwordToggle')}
              accessibilityHint={
                showConfirmPassword
                  ? t('screens.auth.resetPassword.hidePassword')
                  : t('screens.auth.resetPassword.showPassword')
              }
            >
              <Text style={styles.passwordToggleText}>
                {showConfirmPassword
                  ? t('screens.auth.resetPassword.hidePassword')
                  : t('screens.auth.resetPassword.showPassword')}
              </Text>
            </TouchableOpacity>
          </View>
          {confirmPasswordError && (
            <Text
              style={styles.errorText}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              allowFontScaling={true}
              maxFontSizeMultiplier={2}
            >
              {confirmPasswordError}
            </Text>
          )}
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[
            styles.button,
            (isPending || isRecaptchaLoading || !isFormValid) && styles.buttonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={isPending || isRecaptchaLoading || !isFormValid}
          accessibilityRole="button"
          accessibilityLabel={t('screens.auth.resetPassword.accessibility.submitButton')}
          accessibilityHint={t('screens.auth.resetPassword.accessibility.submitButtonHint')}
          accessibilityState={{ disabled: isPending || isRecaptchaLoading || !isFormValid }}
        >
          {isPending || isRecaptchaLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={colors.background} />
              <Text style={styles.loadingText}>{t('screens.auth.resetPassword.submitting')}</Text>
            </View>
          ) : (
            <Text style={styles.buttonText}>{t('screens.auth.resetPassword.submitButton')}</Text>
          )}
        </TouchableOpacity>

        {/* Back to Login Link */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBackToLogin}
          accessibilityRole="button"
          accessibilityLabel="Back to login"
          accessibilityHint="Return to the login screen"
        >
          <Text style={styles.backButtonText} allowFontScaling={true} maxFontSizeMultiplier={2}>
            Back to Login
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Success Toast */}
      <Toast
        visible={showSuccessToast}
        message={t('screens.auth.resetPassword.success.passwordResetShort')}
        type="success"
        onDismiss={() => setShowSuccessToast(false)}
      />
    </SafeAreaView>
  );
}
