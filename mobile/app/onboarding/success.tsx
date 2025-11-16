import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SuccessScreen, useOnboardingProtection } from '../../src/features/onboarding';
import { useTheme } from '../../src/core/theme';

/**
 * Onboarding Success/Completion route.
 *
 * This route wraps the SuccessScreen component and applies auth protection
 * to ensure only authenticated users can access onboarding.
 *
 * Protected route: requires authenticated user.
 * Later steps will add hasOnboarded gate to redirect completed users to home.
 *
 * @returns Success route component
 */
export default function SuccessRoute(): React.JSX.Element {
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
        <ActivityIndicator size="large" color={colors.textPrimary} />
      </View>
    );
  }

  return <SuccessScreen />;
}
