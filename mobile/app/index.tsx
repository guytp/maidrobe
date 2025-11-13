import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { t } from '../src/core/i18n';
import { useTheme } from '../src/core/theme';

/**
 * Home screen component displaying the app title and description.
 * Uses i18n for text content and theme for colors.
 *
 * @returns The home screen component
 */
export default function App(): React.JSX.Element {
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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('screens.home.title')}</Text>
      <Text style={styles.subtitle}>{t('screens.home.subtitle')}</Text>
      <Text style={styles.description}>{t('screens.home.description')}</Text>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}
