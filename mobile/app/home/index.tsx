import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { t } from '../../src/core/i18n';
import { useTheme } from '../../src/core/theme';
import { Button } from '../../src/core/components/Button';
import { trackCaptureEvent } from '../../src/core/telemetry';
import {
  checkFeatureFlagSync,
  useOutfitRecommendationStubFlag,
  canAccessRecommendations,
} from '../../src/core/featureFlags';
import { getAppEnvironment } from '../../src/core/featureFlags/config';
import { trackRecommendationEvent } from '../../src/core/telemetry';
import { useStore } from '../../src/core/state/store';
import { useHealthcheck } from '../../src/features/home/api/useHealthcheck';
import { useProtectedRoute } from '../../src/features/auth/hooks/useProtectedRoute';
import {
  useOutfitRecommendations,
  useContextParams,
  SuggestionsSection,
  ContextSelector,
} from '../../src/features/recommendations';

/**
 * Navigation debounce time in milliseconds.
 * Prevents double-tap navigation issues.
 */
const NAVIGATION_DEBOUNCE_MS = 500;

/**
 * Home screen component displaying app title, CTA, and outfit suggestions.
 * Implements i18n, theming, and WCAG 2.1 AA accessibility standards.
 * Demonstrates server-state integration with healthcheck and recommendations.
 *
 * Protected route: requires authenticated user with verified email.
 *
 * LAYOUT:
 * - App title and description (above the fold)
 * - "Get outfit ideas" CTA button (prominent, above the fold, feature-flagged)
 * - Suggestions section (scrollable, shows empty/loading/success/error states, feature-flagged)
 * - Server status indicator (bottom)
 *
 * FEATURE FLAG GATING:
 * The outfit recommendation UI (CTA button, context selector, suggestions section) is
 * gated by the `outfit_recommendation_stub` feature flag. This flag supports:
 * - Environment-specific defaults (dev: ON, staging: internal only, prod: OFF)
 * - Cohort-based targeting (internal, beta, standard users)
 * - Safe fallback behaviour when the flag service is unavailable
 *
 * When the flag is OFF or evaluating, these elements are hidden from the UI.
 * The flag value is cached per-session for stability and across sessions for
 * fast UI decisions on subsequent app launches.
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
  const router = useRouter();
  const isNavigatingRef = useRef(false);
  const {
    data: healthcheck,
    isLoading: isHealthcheckLoading,
    error: healthcheckError,
  } = useHealthcheck();

  // Check if context selector feature flag is enabled
  const isContextSelectorEnabled = checkFeatureFlagSync('recommendations.contextSelector').enabled;

  // Get user for telemetry
  const user = useStore((state) => state.user);

  // Check if outfit recommendation stub feature is enabled for this user
  // This gates the entire recommendation UI (CTA, context selector, suggestions)
  // While loading, isEnabled defaults to false so UI is hidden until flag is evaluated
  const { isEnabled: isOutfitRecommendationEnabled, result: flagResult } =
    useOutfitRecommendationStubFlag();

  // Context selector state - persisted to AsyncStorage via Zustand
  const { occasion, temperatureBand, isHydrated, setOccasion, setTemperatureBand } =
    useContextParams();

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

  // Handle CTA button press - pass current context params when feature flag is on
  // Includes defensive guard check even though button is hidden when flag is OFF
  const handleGetOutfitIdeas = useCallback(() => {
    // Defensive guard: check flag before proceeding
    //
    // TRANSIENT STATE NOTE:
    // During the hook's background refresh (triggered after cache initialization),
    // resetSessionCache() briefly clears the module-level cache. In this window
    // (typically <500ms), canAccessRecommendations() returns:
    //   { allowed: false, reason: 'flag_not_evaluated' }
    // even for users who should have access. This is harmless here because:
    // 1. The CTA button is already hidden while isEnabled is false
    // 2. The hook's React state preserves the cached value during refresh
    // 3. Once evaluation completes, canAccessRecommendations() returns correctly
    //
    // Deep-link handlers should be aware of this transient state and either:
    // - Wait for flag evaluation to complete before checking access, or
    // - Use getOutfitRecommendationStubFlagWithFallback() for a never-null value
    //
    // See: outfitRecommendationStubFlag.ts module docs for full details.
    const guard = canAccessRecommendations();
    if (!guard.allowed) {
      // Silently no-op - button should already be hidden when flag is OFF
      return;
    }

    // Track CTA click event for analytics
    trackRecommendationEvent('outfit_recommendation_cta_clicked', {
      userId: user?.id,
      environment: getAppEnvironment(),
      flagEnabled: flagResult?.enabled ?? false,
      flagSource: flagResult?.source,
      userRole: flagResult?.userRole,
      occasion: isContextSelectorEnabled ? occasion : undefined,
      temperatureBand: isContextSelectorEnabled ? temperatureBand : undefined,
    });

    if (isContextSelectorEnabled) {
      // Send context params when feature is enabled
      fetchRecommendations({ occasion, temperatureBand });
    } else {
      // Preserve existing behaviour when feature flag is off
      fetchRecommendations();
    }
  }, [
    fetchRecommendations,
    isContextSelectorEnabled,
    occasion,
    temperatureBand,
    user?.id,
    flagResult,
  ]);

  // Handle retry from error state - use same context handling as CTA
  // Includes defensive guard check for consistency with CTA handler
  const handleRetry = useCallback(() => {
    // Defensive guard: check flag before proceeding
    // Note: See handleGetOutfitIdeas for explanation of transient 'flag_not_evaluated' state
    const guard = canAccessRecommendations();
    if (!guard.allowed) {
      // Silently no-op - retry button should be hidden when flag is OFF
      return;
    }

    // Track retry click event for analytics (mirrors CTA telemetry)
    trackRecommendationEvent('outfit_recommendation_retry_clicked', {
      userId: user?.id,
      environment: getAppEnvironment(),
      flagEnabled: flagResult?.enabled ?? false,
      flagSource: flagResult?.source,
      userRole: flagResult?.userRole,
      occasion: isContextSelectorEnabled ? occasion : undefined,
      temperatureBand: isContextSelectorEnabled ? temperatureBand : undefined,
    });

    if (isContextSelectorEnabled) {
      fetchRecommendations({ occasion, temperatureBand });
    } else {
      fetchRecommendations();
    }
  }, [
    fetchRecommendations,
    isContextSelectorEnabled,
    occasion,
    temperatureBand,
    user?.id,
    flagResult,
  ]);

  // Handle navigation to profile screen
  const handleNavigateToProfile = useCallback(() => {
    // Prevent double-tap navigation
    if (isNavigatingRef.current) {
      return;
    }

    isNavigatingRef.current = true;

    // Track navigation event
    trackCaptureEvent('profile_navigation_clicked', {
      userId: user?.id,
      metadata: { source: 'home_screen' },
    });

    router.push('/profile');

    // Reset navigation lock after debounce period
    setTimeout(() => {
      isNavigatingRef.current = false;
    }, NAVIGATION_DEBOUNCE_MS);
  }, [router, user?.id]);

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
        navigationSection: {
          marginTop: spacing.xl,
          paddingTop: spacing.lg,
          borderTopWidth: 1,
          borderTopColor: colors.textSecondary + '20',
        },
        navigationLink: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.sm,
          borderRadius: radius.md,
          minHeight: 44, // WCAG 2.1 AA touch target
        },
        navigationLinkPressed: {
          backgroundColor: colors.textSecondary + '10',
        },
        navigationLinkText: {
          fontSize: fontSize.base,
          color: colors.textPrimary,
        },
        navigationLinkArrow: {
          fontSize: fontSize.base,
          color: colors.textSecondary,
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

        {/* Context Selector (gated by both feature flags) */}
        {/* Only shown when outfit recommendations AND context selector are enabled */}
        {isOutfitRecommendationEnabled && isContextSelectorEnabled && (
          <ContextSelector
            occasion={occasion}
            temperatureBand={temperatureBand}
            onOccasionChange={setOccasion}
            onTemperatureBandChange={setTemperatureBand}
            disabled={isRecommendationsLoading || !isHydrated}
          />
        )}

        {/* Get Outfit Ideas CTA */}
        {/* Only shown when outfit recommendations feature is enabled */}
        {/* Disabled while loading OR while context is hydrating (context selector on) */}
        {isOutfitRecommendationEnabled && (
          <View style={styles.ctaContainer}>
            <Button
              onPress={handleGetOutfitIdeas}
              loading={isRecommendationsLoading}
              disabled={isRecommendationsLoading || (isContextSelectorEnabled && !isHydrated)}
              accessibilityLabel={t('screens.home.accessibility.ctaButton')}
              accessibilityHint={t('screens.home.accessibility.ctaButtonHint')}
            >
              {t('screens.home.recommendations.ctaButton')}
            </Button>
          </View>
        )}

        {/* Suggestions Section */}
        {/* Only shown when outfit recommendations feature is enabled */}
        {isOutfitRecommendationEnabled && (
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
        )}

        {/* Server Status Indicator */}
        <View
          style={styles.healthcheckContainer}
          accessibilityLabel="Server status indicator"
          accessibilityRole="text"
        >
          <Text style={styles.healthcheckLabel} allowFontScaling={true} maxFontSizeMultiplier={1.5}>
            {t('screens.home.serverStatus.label')}
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

        {/* Navigation Section */}
        <View style={styles.navigationSection}>
          <Pressable
            style={({ pressed }) => [
              styles.navigationLink,
              pressed && styles.navigationLinkPressed,
            ]}
            onPress={handleNavigateToProfile}
            accessibilityLabel={t('screens.home.navigation.profileLabel')}
            accessibilityHint={t('screens.home.navigation.profileHint')}
            accessibilityRole="button"
          >
            <Text
              style={styles.navigationLinkText}
              allowFontScaling={true}
              maxFontSizeMultiplier={1.5}
            >
              {t('screens.home.navigation.profile')}
            </Text>
            <Text style={styles.navigationLinkArrow}>→</Text>
          </Pressable>
        </View>
      </ScrollView>

      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}
