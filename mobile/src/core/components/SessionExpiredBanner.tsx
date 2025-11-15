import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useStore } from '../state/store';
import { useTheme } from '../theme';
import { t } from '../i18n';

/**
 * Maps logout reason codes to i18n translation keys.
 *
 * This function provides centralized mapping between logout reason codes
 * (stored in state) and their corresponding user-facing translations.
 *
 * Supported reason codes:
 * - session_expired: Token expired, requires re-authentication
 * - session_restore_failed: Session restoration failed (network/offline)
 * - session_invalid: Session data is invalid or corrupted
 * - session_error: Generic session error
 *
 * @param reason - Logout reason code (e.g., 'session_expired')
 * @returns Translated user-facing message
 *
 * @example
 * ```typescript
 * const message = getSessionMessage('session_expired');
 * // Returns: "Your session has expired. Please log in again."
 * ```
 */
function getSessionMessage(reason: string): string {
  // Map reason codes to i18n translation keys
  const keyMap: Record<string, string> = {
    session_expired: 'screens.auth.login.sessionMessages.sessionExpired',
    session_restore_failed: 'screens.auth.login.sessionMessages.sessionRestoreFailed',
    session_invalid: 'screens.auth.login.sessionMessages.sessionInvalid',
    session_error: 'screens.auth.login.sessionMessages.sessionError',
  };

  // Get translation key, fallback to generic error if unknown reason
  const translationKey = keyMap[reason] || 'screens.auth.login.sessionMessages.sessionError';

  // Return translated message
  return t(translationKey as never);
}

/**
 * SessionExpiredBanner component - Displays session expiration messages
 *
 * This banner displays at the top of the login screen when a user has been
 * forcefully logged out due to session expiration or token refresh failures.
 * It provides clear feedback about why the user needs to log in again.
 *
 * Features:
 * - Displays translated logout reason from store using i18n layer
 * - Maps reason codes to user-facing messages (e.g., 'session_expired' -> translated text)
 * - Dismissable with X button
 * - Auto-clears on successful login
 * - Uses theme colors for consistent styling
 * - Accessible with proper ARIA labels
 *
 * Visibility:
 * - Only visible when logoutReason exists in store
 * - Automatically hidden when logoutReason is null
 *
 * Integration:
 * - Set logoutReason via useStore().setLogoutReason(reasonCode)
 * - Use reason codes: 'session_expired', 'session_invalid', etc.
 * - Clear on dismiss or successful login
 *
 * @example
 * ```tsx
 * // In login route
 * <View>
 *   <SessionExpiredBanner />
 *   <LoginScreen />
 * </View>
 *
 * // Setting logout reason with code
 * useStore.getState().setLogoutReason('session_expired');
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
          {getSessionMessage(logoutReason)}
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
