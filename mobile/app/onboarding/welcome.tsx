import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { WelcomeScreen, useOnboardingProtection } from '../../src/features/onboarding';
import { useTheme } from '../../src/core/theme';

/**
 * Welcome route for onboarding flow.
 *
 * This route wraps the WelcomeScreen component and applies auth protection
 * to ensure only authenticated users can access onboarding.
 *
 * Protected route: requires authenticated user.
 * Later steps will add hasOnboarded gate to redirect completed users to home.
 *
 * @returns Welcome route component
 */
export default function WelcomeRoute(): React.JSX.Element {
  const isAuthorized = useOnboardingProtection();
  const { colors } = useTheme();

  if (!isAuthorized) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ActivityIndicator
          size="large"
          color={colors.textPrimary}
          accessibilityLabel="Loading onboarding"
        />
      </View>
    );
  }

  return <WelcomeScreen />;
}
