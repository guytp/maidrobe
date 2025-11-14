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
import { useRouter } from 'expo-router';
import { useTheme } from '../../../core/theme';
import { t } from '../../../core/i18n';
import { useSignUp } from '../api/useSignUp';
import { validateEmail, validatePassword } from '../utils/validation';

/**
 * SignupScreen component - User registration with email and password
 *
 * Presentational component responsible for:
 * - Rendering email and password input fields
 * - Client-side validation (email format, password policy)
 * - Password visibility toggle
 * - Accessibility support (WCAG AA)
 * - Loading and error states display
 * - Navigation to verification screen on successful signup
 *
 * Business logic (setting user in Zustand store) is handled automatically
 * by the useSignUp mutation. This component focuses purely on UI concerns.
 *
 * Password Policy:
 * - Minimum 8 characters
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 number
 */
export function SignupScreen() {
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const { mutate: signUp, isPending } = useSignUp();

  /**
   * Validates email field and updates error state
   * Normalizes email (trim and lowercase) before validation
   */
  const handleEmailBlur = () => {
    const normalizedEmail = email.trim().toLowerCase();
    const validation = validateEmail(normalizedEmail);
    if (!validation.isValid) {
      setEmailError(validation.error || t('screens.auth.signup.errors.invalidEmail'));
    } else {
      setEmailError(null);
    }
  };

  /**
   * Validates password field and updates error state
   */
  const handlePasswordBlur = () => {
    const validation = validatePassword(password);
    if (!validation.isValid) {
      setPasswordError(t('screens.auth.signup.errors.weakPassword'));
    } else {
      setPasswordError(null);
    }
  };

  /**
   * Handles form submission with validation and signup API call
   * Normalizes email (trim and lowercase) before validation and submission
   */
  const handleSignUp = () => {
    // Clear previous errors
    setEmailError(null);
    setPasswordError(null);

    // Normalize email to ensure consistent casing and no whitespace
    const normalizedEmail = email.trim().toLowerCase();

    // Validate email
    const emailValidation = validateEmail(normalizedEmail);
    if (!emailValidation.isValid) {
      setEmailError(emailValidation.error || t('screens.auth.signup.errors.invalidEmail'));
      return;
    }

    // Validate password
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      setPasswordError(t('screens.auth.signup.errors.weakPassword'));
      return;
    }

    // Submit signup request with normalized email
    signUp(
      { email: normalizedEmail, password },
      {
        onSuccess: () => {
          // User is automatically set in store by useSignUp mutation
          // Handle UI-specific concern: navigation to verification screen
          router.push('/auth/verify');
        },
        onError: (error) => {
          // Error already logged and user-friendly message set by useSignUp
          Alert.alert(t('screens.auth.signup.errors.signupFailed'), error.message, [
            { text: 'OK' },
          ]);
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
        requirementsText: {
          color: colors.textSecondary,
          fontSize: 12,
          marginTop: spacing.xs,
          lineHeight: 18,
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
      accessibilityLabel={t('screens.auth.signup.accessibility.screenLabel')}
      accessibilityHint={t('screens.auth.signup.accessibility.screenHint')}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text
            style={styles.title}
            accessibilityRole="header"
            allowFontScaling={true}
            maxFontSizeMultiplier={3}
          >
            {t('screens.auth.signup.title')}
          </Text>
          <Text style={styles.subtitle} allowFontScaling={true} maxFontSizeMultiplier={2.5}>
            {t('screens.auth.signup.subtitle')}
          </Text>
        </View>

        {/* Email Input */}
        <View style={styles.formGroup}>
          <Text style={styles.label} allowFontScaling={true} maxFontSizeMultiplier={2}>
            {t('screens.auth.signup.emailLabel')}
          </Text>
          <TextInput
            style={[styles.input, emailError ? styles.inputError : null]}
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (emailError) setEmailError(null);
            }}
            onBlur={handleEmailBlur}
            placeholder={t('screens.auth.signup.emailPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            editable={!isPending}
            accessibilityLabel={t('screens.auth.signup.accessibility.emailInput')}
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
            {t('screens.auth.signup.passwordLabel')}
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
              placeholder={t('screens.auth.signup.passwordPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="password-new"
              autoCorrect={false}
              editable={!isPending}
              accessibilityLabel={t('screens.auth.signup.accessibility.passwordInput')}
              accessibilityHint="Enter your password"
              allowFontScaling={true}
              maxFontSizeMultiplier={2}
            />
            <TouchableOpacity
              style={styles.passwordToggle}
              onPress={() => setShowPassword(!showPassword)}
              accessibilityRole="button"
              accessibilityLabel={t('screens.auth.signup.accessibility.passwordToggle')}
              accessibilityHint={
                showPassword
                  ? t('screens.auth.signup.hidePassword')
                  : t('screens.auth.signup.showPassword')
              }
            >
              <Text style={styles.passwordToggleText}>
                {showPassword
                  ? t('screens.auth.signup.hidePassword')
                  : t('screens.auth.signup.showPassword')}
              </Text>
            </TouchableOpacity>
          </View>
          {passwordError ? (
            <Text
              style={styles.errorText}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              allowFontScaling={true}
              maxFontSizeMultiplier={2}
            >
              {passwordError}
            </Text>
          ) : (
            <Text style={styles.requirementsText} allowFontScaling={true} maxFontSizeMultiplier={2}>
              {t('screens.auth.signup.passwordRequirements')}
            </Text>
          )}
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.button, (isPending || !isFormValid) && styles.buttonDisabled]}
          onPress={handleSignUp}
          disabled={isPending || !isFormValid}
          accessibilityRole="button"
          accessibilityLabel={t('screens.auth.signup.accessibility.submitButton')}
          accessibilityHint="Create your account"
          accessibilityState={{ disabled: isPending || !isFormValid }}
        >
          {isPending ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={colors.background} />
              <Text style={styles.loadingText}>{t('screens.auth.signup.submitting')}</Text>
            </View>
          ) : (
            <Text style={styles.buttonText}>{t('screens.auth.signup.submitButton')}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
