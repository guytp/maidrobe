import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LoginScreen } from '../../src/features/auth/components/LoginScreen';
import { SessionExpiredBanner } from '../../src/core/components/SessionExpiredBanner';

/**
 * Login route component with session expired banner.
 *
 * This component wraps the LoginScreen with a SessionExpiredBanner that
 * displays when users are forced to logout due to session expiration or
 * token refresh failures.
 *
 * The banner:
 * - Automatically appears when logoutReason is set in store
 * - Displays "Session expired. Please log in again." message
 * - Can be dismissed by user
 * - Automatically clears on successful login
 */
export default function LoginRoute() {
  return (
    <View style={styles.container}>
      <SessionExpiredBanner />
      <LoginScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
