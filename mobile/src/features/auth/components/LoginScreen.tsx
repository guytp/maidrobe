import React, { useState, useMemo } from 'react';
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
import { validateEmail, validateLoginPassword } from '../utils/validation';
import { useLogin } from '../api/useLogin';

/**
 * LoginScreen component - User authentication with email and password
 *
 * Presentational component responsible for:
 * - Rendering email and password input fields
 * - Client-side validation (email format, password non-empty)
 * - Password visibility toggle
 * - Accessibility support (WCAG AA)
 * - Loading and error states display
 * - Navigation to protected routes on successful login
 *
 * Business logic (authentication and token storage) is handled by the
 * useLogin mutation hook. This component focuses purely on UI concerns.
 *
 * Post-Login Navigation:
 * - Supports optional 'redirect' query parameter for flexible navigation
 * - Example: /auth/login?redirect=/profile redirects to /profile after login
 * - Defaults to /home if no redirect parameter provided
 * - Validates redirect to prevent open redirect vulnerabilities (internal routes only)
 * - Useful for deep-link flows and protected route redirects
 *
 * Password Validation:
 * - Non-empty check only (no complexity requirements for login)
 * - Server handles credential verification
 *
 * Error Handling:
 * - Invalid credentials: "Invalid email or password."
 * - Network errors: "Network error. Please try again."
 * - Version mismatch: "Please update your app."
 */
/**
 * Sanitizes redirect parameter to prevent open redirect vulnerabilities.
 *
 * Security checks:
 * - Only allows internal routes (must start with /)
 * - Rejects external URLs, javascript:, data:, and other dangerous schemes
 * - Returns default path if redirect is invalid or missing
 *
 * @param redirect - Redirect path from query parameter
 * @param defaultPath - Default path to use if redirect is invalid
 * @returns Sanitized redirect path (internal route only) or default
 */
function sanitizeRedirect(redirect: string | string[] | undefined, defaultPath: string): string {
  // Handle array or undefined
  if (!redirect || Array.isArray(redirect)) {
    return defaultPath;
  }

  // Only allow internal routes (must start with /)
  if (!redirect.startsWith('/')) {
    return defaultPath;
  }

  // Reject dangerous schemes (case-insensitive check)
  const lowerRedirect = redirect.toLowerCase();
  if (
    lowerRedirect.includes('javascript:') ||
    lowerRedirect.includes('data:') ||
    lowerRedirect.includes('vbscript:') ||
    lowerRedirect.includes('file:')
  ) {
    return defaultPath;
  }

  // Reject protocol-relative URLs (starting with //)
  if (redirect.startsWith('//')) {
    return defaultPath;
  }

  return redirect;
}

export function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ redirect?: string }>();
  const { colors, spacing, radius } = useTheme();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const { mutate: login, isPending } = useLogin();

  // Determine post-login redirect destination
  // Sanitize redirect parameter to prevent open redirect vulnerabilities
  const redirectTo = sanitizeRedirect(params.redirect, '/home');

  /**
   * Validates email field and updates error state
   * Normalizes email (trim and lowercase) before validation
   */
  const handleEmailBlur = () => {
    const normalizedEmail = email.trim().toLowerCase();
    const validation = validateEmail(normalizedEmail);
    if (!validation.isValid) {
      setEmailError(validation.error || t('screens.auth.login.errors.invalidEmail'));
    } else {
      setEmailError(null);
    }
  };

  /**
   * Validates password field and updates error state
   * Only checks for non-empty password
   */
  const handlePasswordBlur = () => {
    const validation = validateLoginPassword(password);
    if (!validation.isValid) {
      setPasswordError(validation.error || t('screens.auth.login.errors.passwordRequired'));
    } else {
      setPasswordError(null);
    }
  };

  /**
   * Handles form submission with validation and login API call
   * Normalizes email (trim and lowercase) before validation and submission
   */
  const handleLogin = () => {
    // Clear previous errors
    setEmailError(null);
    setPasswordError(null);

    // Normalize email to ensure consistent casing and no whitespace
    const normalizedEmail = email.trim().toLowerCase();

    // Validate email
    const emailValidation = validateEmail(normalizedEmail);
    if (!emailValidation.isValid) {
      setEmailError(emailValidation.error || t('screens.auth.login.errors.invalidEmail'));
      return;
    }

    // Validate password
    const passwordValidation = validateLoginPassword(password);
    if (!passwordValidation.isValid) {
      setPasswordError(passwordValidation.error || t('screens.auth.login.errors.passwordRequired'));
      return;
    }

    // Call login mutation with normalized email and password
    login(
      { email: normalizedEmail, password },
      {
        onSuccess: () => {
          // User is automatically set in store by useLogin mutation
          // Navigate to redirect destination (or /home if no redirect specified)
          router.replace(redirectTo);
        },
        onError: (error) => {
          // Error is already logged by useLogin mutation
          // Display user-friendly error message
          setPasswordError(error.message);
        },
      }
    );
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
        forgotPasswordContainer: {
          alignItems: 'flex-end',
          marginTop: spacing.sm,
          marginBottom: spacing.md,
        },
        forgotPasswordLink: {
          minHeight: 44,
          minWidth: 44,
          justifyContent: 'center',
          alignItems: 'flex-end',
          paddingHorizontal: spacing.sm,
        },
        forgotPasswordText: {
          color: colors.textSecondary,
          fontSize: 14,
          fontWeight: '600',
        },
      }),
    [colors, spacing, radius]
  );

  const isFormValid = email.trim() !== '' && password.trim() !== '';

  return (
    <SafeAreaView
      style={styles.container}
      accessibilityLabel={t('screens.auth.login.accessibility.screenLabel')}
      accessibilityHint={t('screens.auth.login.accessibility.screenHint')}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text
            style={styles.title}
            accessibilityRole="header"
            allowFontScaling={true}
            maxFontSizeMultiplier={3}
          >
            {t('screens.auth.login.title')}
          </Text>
          <Text style={styles.subtitle} allowFontScaling={true} maxFontSizeMultiplier={2.5}>
            {t('screens.auth.login.subtitle')}
          </Text>
        </View>

        {/* Email Input */}
        <View style={styles.formGroup}>
          <Text style={styles.label} allowFontScaling={true} maxFontSizeMultiplier={2}>
            {t('screens.auth.login.emailLabel')}
          </Text>
          <TextInput
            style={[styles.input, emailError ? styles.inputError : null]}
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (emailError) setEmailError(null);
            }}
            onBlur={handleEmailBlur}
            placeholder={t('screens.auth.login.emailPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            editable={!isPending}
            accessibilityLabel={t('screens.auth.login.accessibility.emailInput')}
            accessibilityHint="Enter your email address"
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

        {/* Password Input */}
        <View style={styles.formGroup}>
          <Text style={styles.label} allowFontScaling={true} maxFontSizeMultiplier={2}>
            {t('screens.auth.login.passwordLabel')}
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
              placeholder={t('screens.auth.login.passwordPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="password"
              autoCorrect={false}
              editable={!isPending}
              accessibilityLabel={t('screens.auth.login.accessibility.passwordInput')}
              accessibilityHint="Enter your password"
              allowFontScaling={true}
              maxFontSizeMultiplier={2}
            />
            <TouchableOpacity
              style={styles.passwordToggle}
              onPress={() => setShowPassword(!showPassword)}
              accessibilityRole="button"
              accessibilityLabel={t('screens.auth.login.accessibility.passwordToggle')}
              accessibilityHint={
                showPassword
                  ? t('screens.auth.login.hidePassword')
                  : t('screens.auth.login.showPassword')
              }
            >
              <Text style={styles.passwordToggleText}>
                {showPassword
                  ? t('screens.auth.login.hidePassword')
                  : t('screens.auth.login.showPassword')}
              </Text>
            </TouchableOpacity>
          </View>
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

        {/* Forgot Password Link */}
        <View style={styles.forgotPasswordContainer}>
          <TouchableOpacity
            style={styles.forgotPasswordLink}
            onPress={() => router.push('/auth/forgot-password')}
            accessibilityRole="link"
            accessibilityLabel={t('screens.auth.login.accessibility.forgotPasswordLink')}
            accessibilityHint={t('screens.auth.login.accessibility.forgotPasswordLinkHint')}
          >
            <Text
              style={styles.forgotPasswordText}
              allowFontScaling={true}
              maxFontSizeMultiplier={2}
            >
              {t('screens.auth.login.forgotPasswordLink')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.button, (isPending || !isFormValid) && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={isPending || !isFormValid}
          accessibilityRole="button"
          accessibilityLabel={t('screens.auth.login.accessibility.submitButton')}
          accessibilityHint="Log in to your account"
          accessibilityState={{ disabled: isPending || !isFormValid }}
        >
          {isPending ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={colors.background} />
              <Text style={styles.loadingText}>{t('screens.auth.login.submitting')}</Text>
            </View>
          ) : (
            <Text style={styles.buttonText}>{t('screens.auth.login.submitButton')}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
