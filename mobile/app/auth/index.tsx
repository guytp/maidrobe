import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { t } from '../../src/core/i18n';
import { useTheme } from '../../src/core/theme';
import { useStore } from '../../src/core/state/store';

/**
 * Authentication screen placeholder.
 * Implements i18n, theming, and WCAG 2.1 AA accessibility standards.
 *
 * Demonstrates Zustand state management with a toggle button that sets/clears
 * a demo user. The state change can be observed across navigation to prove
 * the store works correctly.
 *
 * @returns Auth screen placeholder component with accessibility support
 */
export default function AuthScreen(): React.JSX.Element {
  const { colors, colorScheme } = useTheme();
  const user = useStore((state) => state.user);
  const setUser = useStore((state) => state.setUser);
  const clearUser = useStore((state) => state.clearUser);

  const handleToggleUser = () => {
    if (user) {
      clearUser();
    } else {
      setUser({
        id: 'demo-123',
        email: 'demo@example.com',
        emailVerified: true,
        hasOnboarded: false,
      });
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
        },
        title: {
          fontSize: 32,
          fontWeight: 'bold',
          marginBottom: 8,
          color: colors.textPrimary,
        },
        subtitle: {
          fontSize: 18,
          marginBottom: 16,
          color: colors.textSecondary,
        },
        description: {
          fontSize: 14,
          color: colors.textSecondary,
          textAlign: 'center',
        },
        userStatusContainer: {
          marginTop: 32,
          padding: 16,
          borderRadius: 8,
          backgroundColor: colors.background,
          borderWidth: 1,
          borderColor: colors.textSecondary,
          minWidth: 250,
          alignItems: 'center',
        },
        userStatusLabel: {
          fontSize: 12,
          color: colors.textSecondary,
          marginBottom: 8,
          textTransform: 'uppercase',
          letterSpacing: 1,
        },
        userStatusValue: {
          fontSize: 16,
          fontWeight: '600',
          color: colors.textPrimary,
          marginBottom: 16,
        },
        button: {
          backgroundColor: colors.textPrimary,
          paddingHorizontal: 24,
          paddingVertical: 12,
          borderRadius: 8,
          minHeight: 44,
          minWidth: 120,
          justifyContent: 'center',
          alignItems: 'center',
        },
        buttonText: {
          color: colors.background,
          fontSize: 16,
          fontWeight: '600',
        },
      }),
    [colors]
  );

  return (
    <View
      style={styles.container}
      accessibilityLabel={t('screens.auth.accessibility.screenLabel')}
      accessibilityHint={t('screens.auth.accessibility.screenHint')}
    >
      <Text
        style={styles.title}
        accessibilityRole="header"
        allowFontScaling={true}
        maxFontSizeMultiplier={3}
      >
        {t('screens.auth.title')}
      </Text>
      <Text style={styles.subtitle} allowFontScaling={true} maxFontSizeMultiplier={3}>
        {t('screens.auth.subtitle')}
      </Text>
      <Text style={styles.description} allowFontScaling={true} maxFontSizeMultiplier={3}>
        {t('screens.auth.description')}
      </Text>

      <View
        style={styles.userStatusContainer}
        accessibilityLabel="User state demonstration"
        accessibilityRole="text"
      >
        <Text style={styles.userStatusLabel} allowFontScaling={true} maxFontSizeMultiplier={2}>
          Current User
        </Text>
        <Text style={styles.userStatusValue} allowFontScaling={true} maxFontSizeMultiplier={2}>
          {user ? user.email : 'Not logged in'}
        </Text>

        <TouchableOpacity
          style={styles.button}
          onPress={handleToggleUser}
          accessibilityRole="button"
          accessibilityLabel={user ? 'Clear user button' : 'Set demo user button'}
          accessibilityHint={
            user ? 'Tap to clear the current user' : 'Tap to set a demo user for testing'
          }
        >
          <Text style={styles.buttonText} allowFontScaling={true} maxFontSizeMultiplier={2}>
            {user ? 'Clear User' : 'Set User'}
          </Text>
        </TouchableOpacity>
      </View>

      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}
