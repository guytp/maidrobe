import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useStore } from '../state/store';
import { useTheme } from '../theme';
import { t } from '../i18n';

/**
 * SessionExpiredBanner component - Displays session expiration messages
 *
 * This banner displays at the top of the login screen when a user has been
 * forcefully logged out due to session expiration or token refresh failures.
 * It provides clear feedback about why the user needs to log in again.
 *
 * Features:
 * - Displays translated logout reason from store using i18n layer
 * - Accepts i18n translation keys directly from auth state
 * - Dismissable with X button
 * - Auto-clears on successful login
 * - Uses theme colors for consistent styling
 * - Accessible with proper ARIA labels
 *
 * Visibility:
 * - Only visible when logoutReason exists in store
 * - Automatically hidden when logoutReason is null
 *
 * Integration Contract:
 * - Auth subsystem provides i18n translation keys (not internal codes)
 * - Use full i18n keys: 'screens.auth.login.sessionMessages.sessionExpired'
 * - Banner translates keys to user-facing messages via t() function
 * - Clear on dismiss or successful login
 *
 * Supported i18n Keys:
 * - screens.auth.login.sessionMessages.sessionExpired
 * - screens.auth.login.sessionMessages.sessionRestoreFailed
 * - screens.auth.login.sessionMessages.sessionInvalid
 * - screens.auth.login.sessionMessages.sessionError
 *
 * @example
 * ```tsx
 * // In login route
 * <View>
 *   <SessionExpiredBanner />
 *   <LoginScreen />
 * </View>
 *
 * // Setting logout reason with i18n key
 * useStore.getState().setLogoutReason('screens.auth.login.sessionMessages.sessionExpired');
 * ```
 */
export function SessionExpiredBanner() {
  const logoutReason = useStore((state) => state.logoutReason);
  const setLogoutReason = useStore((state) => state.setLogoutReason);
  const { colors, spacing } = useTheme();

  // Don't render if no logout reason
  if (!logoutReason) {
    return null;
  }

  const handleDismiss = () => {
    setLogoutReason(null);
  };

  const styles = StyleSheet.create({
    container: {
      backgroundColor: colors.error,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    messageContainer: {
      flex: 1,
      marginRight: spacing.md,
    },
    message: {
      color: colors.errorText,
      fontSize: 14,
      fontWeight: '500',
    },
    dismissButton: {
      padding: spacing.xs,
      minWidth: 44,
      minHeight: 44,
      justifyContent: 'center',
      alignItems: 'center',
    },
    dismissText: {
      color: colors.errorText,
      fontSize: 18,
      fontWeight: 'bold',
    },
  });

  return (
    <View style={styles.container} accessibilityRole="alert">
      <View style={styles.messageContainer}>
        <Text style={styles.message} allowFontScaling={true} maxFontSizeMultiplier={2}>
          {t(logoutReason as never)}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.dismissButton}
        onPress={handleDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss session expired message"
        accessibilityHint="Closes the session expired notification"
      >
        <Text style={styles.dismissText} allowFontScaling={true} maxFontSizeMultiplier={2}>
          ×
        </Text>
      </TouchableOpacity>
    </View>
  );
}
