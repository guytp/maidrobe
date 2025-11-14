import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ForgotPasswordScreen } from '../../src/features/auth/components/ForgotPasswordScreen';

/**
 * Forgot Password route component.
 *
 * This route renders the ForgotPasswordScreen component which allows users
 * to request a password reset email. The screen handles email validation,
 * rate limiting, and displays generic success messages to prevent account
 * enumeration.
 */
export default function ForgotPasswordRoute() {
  return (
    <View style={styles.container}>
      <ForgotPasswordScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
