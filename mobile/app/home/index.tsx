import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { t } from '../../src/core/i18n';
import { useTheme } from '../../src/core/theme';
import { useHealthcheck } from '../../src/features/home/api/useHealthcheck';

/**
 * Home screen component displaying app title and description.
 * Implements i18n, theming, and WCAG 2.1 AA accessibility standards.
 * Demonstrates server-state integration with healthcheck status.
 *
 * @returns Home screen component with accessibility support
 */
export default function HomeScreen(): React.JSX.Element {
  const { colors, colorScheme } = useTheme();
  const { data: healthcheck, isLoading, error } = useHealthcheck();

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
        healthcheckContainer: {
          marginTop: 32,
          padding: 16,
          borderRadius: 8,
          backgroundColor: colors.background,
          borderWidth: 1,
          borderColor: colors.textSecondary,
          minWidth: 200,
          alignItems: 'center',
        },
        healthcheckLabel: {
          fontSize: 12,
          color: colors.textSecondary,
          marginBottom: 8,
          textTransform: 'uppercase',
          letterSpacing: 1,
        },
        healthcheckStatus: {
          fontSize: 16,
          fontWeight: '600',
          color: colors.textPrimary,
        },
        healthcheckError: {
          fontSize: 14,
          color: '#ef4444',
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

      <View
        style={styles.healthcheckContainer}
        accessibilityLabel="Server status indicator"
        accessibilityRole="text"
      >
        <Text style={styles.healthcheckLabel} allowFontScaling={true} maxFontSizeMultiplier={2}>
          Server Status
        </Text>
        {isLoading ? (
          <ActivityIndicator size="small" color={colors.textPrimary} />
        ) : error ? (
          <Text
            style={styles.healthcheckError}
            allowFontScaling={true}
            maxFontSizeMultiplier={2}
            accessibilityRole="alert"
          >
            {error.message}
          </Text>
        ) : (
          <Text style={styles.healthcheckStatus} allowFontScaling={true} maxFontSizeMultiplier={2}>
            {healthcheck?.status || 'Unknown'}
          </Text>
        )}
      </View>

      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}
