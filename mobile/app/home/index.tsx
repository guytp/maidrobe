import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { t } from '../../src/core/i18n';
import { useTheme } from '../../src/core/theme';

/**
 * Home screen component displaying app title and description.
 * Implements i18n, theming, and WCAG 2.1 AA accessibility standards.
 *
 * @returns Home screen component with accessibility support
 */
export default function HomeScreen(): React.JSX.Element {
  const { colors, colorScheme } = useTheme();

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
      }),
    [colors]
  );

  // Note: useTheme provides isReduceMotionEnabled for future animation implementations
  // This screen currently has no animations, so it is not destructured from the hook

  return (
    <View
      style={styles.container}
      accessibilityLabel={t('screens.home.accessibility.screenLabel')}
      accessibilityHint={t('screens.home.accessibility.screenHint')}
    >
      <Text
        style={styles.title}
        accessibilityRole="header"
        allowFontScaling={true}
        maxFontSizeMultiplier={3}
      >
        {t('screens.home.title')}
      </Text>
      <Text style={styles.subtitle} allowFontScaling={true} maxFontSizeMultiplier={3}>
        {t('screens.home.subtitle')}
      </Text>
      <Text style={styles.description} allowFontScaling={true} maxFontSizeMultiplier={3}>
        {t('screens.home.description')}
      </Text>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}
