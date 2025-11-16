import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { FirstItemScreen, useOnboardingProtection } from '../../src/features/onboarding';
import { useTheme } from '../../src/core/theme';

/**
 * First Wardrobe Item Capture route for onboarding flow.
 *
 * This route wraps the FirstItemScreen component and applies auth protection
 * to ensure only authenticated users can access onboarding.
 *
 * Protected route: requires authenticated user.
 * Later steps will add hasOnboarded gate to redirect completed users to home.
 *
 * @returns First item capture route component
 */
export default function FirstItemRoute(): React.JSX.Element {
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
          accessibilityLabel="Loading first item capture"
        />
      </View>
    );
  }

  return <FirstItemScreen />;
}
