import React, { useCallback, useEffect, useMemo } from 'react';
import { ActivityIndicator, BackHandler, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { t } from '../../src/core/i18n';
import { useTheme } from '../../src/core/theme';
import { Button } from '../../src/core/components/Button';
import { useHealthcheck } from '../../src/features/home/api/useHealthcheck';
import { useProtectedRoute } from '../../src/features/auth/hooks/useProtectedRoute';
import { useOutfitRecommendations, SuggestionsSection } from '../../src/features/recommendations';

/**
 * Home screen component displaying app title, CTA, and outfit suggestions.
 * Implements i18n, theming, and WCAG 2.1 AA accessibility standards.
 * Demonstrates server-state integration with healthcheck and recommendations.
 *
 * Protected route: requires authenticated user with verified email.
 *
 * LAYOUT:
 * - App title and description (above the fold)
 * - "Get outfit ideas" CTA button (prominent, above the fold)
 * - Suggestions section (scrollable, shows empty/loading/success/error states)
 * - Server status indicator (bottom)
 *
 * BACK NAVIGATION:
 * On Android, the hardware back button exits the app instead of navigating
 * back to the login or loading screen. This prevents confusing navigation flows
 * where users would return to authentication screens after being logged in.
 *
 * @returns Home screen component with accessibility support
 */
export default function HomeScreen(): React.JSX.Element {
  const isAuthorized = useProtectedRoute();
  const { colors, colorScheme, spacing, fontSize, radius } = useTheme();
  const {
    data: healthcheck,
    isLoading: isHealthcheckLoading,
    error: healthcheckError,
  } = useHealthcheck();

  // Outfit recommendations hook
  const {
    outfits,
    isLoading: isRecommendationsLoading,
    isError: isRecommendationsError,
    errorType,
    errorMessage,
    hasData,
    fetchRecommendations,
  } = useOutfitRecommendations();

  // Handle CTA button press
  const handleGetOutfitIdeas = useCallback(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  // Handle retry from error state
  const handleRetry = useCallback(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  // Exit app on back press from home screen
  // Prevents navigation back to login/loading screens which would be confusing
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      BackHandler.exitApp();
      return true; // Prevent default back navigation
    });

    return () => backHandler.remove();
  }, []);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        scrollContent: {
          flexGrow: 1,
          padding: spacing.lg,
        },
        headerSection: {
          alignItems: 'center',
          marginBottom: spacing.lg,
        },
        title: {
          fontSize: fontSize['3xl'],
          fontWeight: 'bold',
          marginBottom: spacing.xs,
          color: colors.textPrimary,
          textAlign: 'center',
        },
        subtitle: {
          fontSize: fontSize.lg,
          marginBottom: spacing.sm,
          color: colors.textSecondary,
          textAlign: 'center',
        },
        description: {
          fontSize: fontSize.sm,
          color: colors.textSecondary,
          textAlign: 'center',
          marginBottom: spacing.lg,
        },
        ctaContainer: {
          marginBottom: spacing.xl,
          alignItems: 'center',
        },
        ctaButton: {
          minWidth: 200,
        },
        suggestionsContainer: {
          flex: 1,
          minHeight: 200,
        },
        healthcheckContainer: {
          marginTop: spacing.xl,
          padding: spacing.md,
          borderRadius: radius.md,
          backgroundColor: colors.background,
          borderWidth: 1,
          borderColor: colors.textSecondary + '30',
          alignItems: 'center',
        },
        healthcheckLabel: {
          fontSize: fontSize.xs,
          color: colors.textSecondary,
          marginBottom: spacing.xs,
          textTransform: 'uppercase',
          letterSpacing: 1,
        },
        healthcheckStatus: {
          fontSize: fontSize.sm,
          fontWeight: '600',
          color: colors.textPrimary,
        },
        healthcheckError: {
          fontSize: fontSize.xs,
          color: colors.error,
          textAlign: 'center',
        },
        loadingContainer: {
          flex: 1,
          backgroundColor: colors.background,
          justifyContent: 'center',
          alignItems: 'center',
        },
      }),
    [colors, spacing, fontSize, radius]
  );

  // Show loading while checking authorization
  if (!isAuthorized) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.textPrimary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header section with title and description */}
        <View
          style={styles.headerSection}
          accessibilityLabel={t('screens.home.accessibility.screenLabel')}
          accessibilityHint={t('screens.home.accessibility.screenHint')}
        >
          <Text
            style={styles.title}
            accessibilityRole="header"
            allowFontScaling={true}
            maxFontSizeMultiplier={2}
          >
            {t('screens.home.title')}
          </Text>
          <Text style={styles.subtitle} allowFontScaling={true} maxFontSizeMultiplier={2}>
            {t('screens.home.subtitle')}
          </Text>
          <Text style={styles.description} allowFontScaling={true} maxFontSizeMultiplier={2}>
            {t('screens.home.description')}
          </Text>
        </View>

        {/* Get Outfit Ideas CTA */}
        <View style={styles.ctaContainer}>
          <Button
            onPress={handleGetOutfitIdeas}
            loading={isRecommendationsLoading}
            disabled={isRecommendationsLoading}
            accessibilityLabel={t('screens.home.accessibility.ctaButton')}
            accessibilityHint={t('screens.home.accessibility.ctaButtonHint')}
          >
            {t('screens.home.recommendations.ctaButton')}
          </Button>
        </View>

        {/* Suggestions Section */}
        <View
          style={styles.suggestionsContainer}
          accessibilityLabel={t('screens.home.accessibility.suggestionsSection')}
        >
          <SuggestionsSection
            outfits={outfits}
            isLoading={isRecommendationsLoading}
            isError={isRecommendationsError}
            errorType={errorType}
            errorMessage={errorMessage}
            hasData={hasData}
            onRetry={handleRetry}
          />
        </View>

        {/* Server Status Indicator */}
        <View
          style={styles.healthcheckContainer}
          accessibilityLabel="Server status indicator"
          accessibilityRole="text"
        >
          <Text style={styles.healthcheckLabel} allowFontScaling={true} maxFontSizeMultiplier={1.5}>
            Server Status
          </Text>
          {isHealthcheckLoading ? (
            <ActivityIndicator size="small" color={colors.textPrimary} />
          ) : healthcheckError ? (
            <Text
              style={styles.healthcheckError}
              allowFontScaling={true}
              maxFontSizeMultiplier={1.5}
              accessibilityRole="alert"
            >
              {healthcheckError.message}
            </Text>
          ) : (
            <Text
              style={styles.healthcheckStatus}
              allowFontScaling={true}
              maxFontSizeMultiplier={1.5}
            >
              {healthcheck?.status || 'Unknown'}
            </Text>
          )}
        </View>
      </ScrollView>

      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}
