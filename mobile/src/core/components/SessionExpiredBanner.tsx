import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useStore } from '../state/store';
import { useTheme } from '../theme';

/**
 * SessionExpiredBanner component - Displays session expiration messages
 *
 * This banner displays at the top of the login screen when a user has been
 * forcefully logged out due to session expiration or token refresh failures.
 * It provides clear feedback about why the user needs to log in again.
 *
 * Features:
 * - Displays logout reason from store (e.g., "Session expired. Please log in again.")
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
 * - Set logoutReason via useStore().setLogoutReason(reason)
 * - Clear on dismiss or successful login
 *
 * @example
 * ```tsx
 * // In login route
 * <View>
 *   <SessionExpiredBanner />
 *   <LoginScreen />
 * </View>
 * ```
 */
export function SessionExpiredBanner() {
  const logoutReason = useStore((state) => state.logoutReason);
  const setLogoutReason = useStore((state) => state.setLogoutReason);
  const { spacing } = useTheme();

  // Don't render if no logout reason
  if (!logoutReason) {
    return null;
  }

  const handleDismiss = () => {
    setLogoutReason(null);
  };

  const styles = StyleSheet.create({
    container: {
      backgroundColor: '#D32F2F', // Material Design Red 700 for error
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
      color: '#FFFFFF',
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
      color: '#FFFFFF',
      fontSize: 18,
      fontWeight: 'bold',
    },
  });

  return (
    <View style={styles.container} accessibilityRole="alert">
      <View style={styles.messageContainer}>
        <Text style={styles.message} allowFontScaling={true} maxFontSizeMultiplier={2}>
          {logoutReason}
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
