import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ResetPasswordScreen } from '../../src/features/auth/components/ResetPasswordScreen';

/**
 * Reset Password route component.
 *
 * This route renders the ResetPasswordScreen component which handles password
 * reset via deep link. The screen extracts the reset token from URL parameters,
 * validates it, and either shows the password reset form or an error state.
 *
 * Deep link format:
 * - maidrobe://reset-password?token={token}&type=recovery
 * - OR: maidrobe://reset-password#access_token={token}&type=recovery
 *
 * The ResetPasswordScreen component handles:
 * - Token extraction from URL parameters
 * - Token validation
 * - Password reset form with policy enforcement
 * - Real-time password strength feedback
 * - Error states for invalid/expired tokens
 * - Navigation back to forgot password or login
 */
export default function ResetPasswordRoute() {
  return (
    <View style={styles.container}>
      <ResetPasswordScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
