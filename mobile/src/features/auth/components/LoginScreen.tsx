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
  Alert,
} from 'react-native';
import { useTheme } from '../../../core/theme';
import { t } from '../../../core/i18n';
import { validateEmail, validateLoginPassword } from '../utils/validation';

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
 * Password Validation:
 * - Non-empty check only (no complexity requirements for login)
 * - Server handles credential verification
 *
 * Error Handling:
 * - Invalid credentials: "Invalid email or password."
 * - Network errors: "Network error. Please try again."
 * - Version mismatch: "Please update your app."
 */
export function LoginScreen() {
  // TODO: Step 2 - useRouter will be used for navigation after successful login
  // const router = useRouter();
  const { colors, spacing, radius } = useTheme();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // TODO: Replace with useLogin hook in Step 2
  const isPending = false;

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

    // TODO: Step 2 - Call useLogin mutation with normalized email and password
    // For now, just show an alert
    Alert.alert('Login', 'Login functionality will be implemented in Step 2', [{ text: 'OK' }]);
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
          borderColor: '#d32f2f',
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
          color: '#d32f2f',
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
