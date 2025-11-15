import React, { useEffect } from 'react';
import { BackHandler } from 'react-native';
import { VerificationPromptScreen } from '../../src/features/auth/components/VerificationPromptScreen';

/**
 * Email verification route component.
 *
 * This route displays the email verification prompt for authenticated users
 * who have not yet verified their email address.
 *
 * BACK NAVIGATION:
 * On Android, the hardware back button exits the app instead of navigating
 * back to the login screen. This prevents confusing navigation flows where
 * users in the middle of signup could accidentally return to login.
 *
 * Navigation flows:
 * - User signs up -> verify screen (this route)
 * - User presses back -> app exits (Android) or no-op (iOS)
 * - User verifies email -> automatically navigated to /home by useAuthStateListener
 *
 * iOS behavior:
 * - No hardware back button, so this handler is never triggered
 * - Users exit via home button/gesture
 *
 * @returns Email verification screen with back handler
 */
export default function VerifyRoute() {
  // Exit app on back press from verification screen
  // Prevents navigation back to login screen which would be confusing
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      BackHandler.exitApp();
      return true; // Prevent default back navigation
    });

    return () => backHandler.remove();
  }, []);

  return <VerificationPromptScreen />;
}
