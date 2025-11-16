import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { PrefsScreen, useOnboardingProtection } from '../../src/features/onboarding';
import { useTheme } from '../../src/core/theme';

/**
 * Style and Usage Preferences route for onboarding flow.
 *
 * This route wraps the PrefsScreen component and applies auth protection
 * to ensure only authenticated users can access onboarding.
 *
 * Protected route: requires authenticated user.
 * Later steps will add hasOnboarded gate to redirect completed users to home.
 *
 * @returns Preferences route component
 */
export default function PrefsRoute(): React.JSX.Element {
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
          accessibilityLabel="Loading preferences"
        />
      </View>
    );
  }

  return <PrefsScreen />;
}
