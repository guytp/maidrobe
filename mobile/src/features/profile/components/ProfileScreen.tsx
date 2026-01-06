/**
 * Profile screen component for accessing user profile features and settings.
 *
 * This screen provides navigation to various profile-related features:
 * - Wear history: View what you've worn and when
 * - Styling preferences: Manage outfit repeat settings
 *
 * Entry point for the Profile feature area, following the existing
 * information architecture patterns used throughout the app.
 *
 * @module features/profile/components/ProfileScreen
 */

import React, { useCallback, useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { trackCaptureEvent } from '../../../core/telemetry';
import { useStore } from '../../../core/state/store';
import { useCalendarIntegration } from '../hooks/useCalendarIntegration';
import type { CalendarIntegration } from '../types';

/**
 * Minimum touch target size for accessibility (WCAG 2.1 AA).
 */
const TOUCH_TARGET_SIZE = 44;

/**
 * Navigation debounce time in milliseconds.
 * Prevents double-tap navigation issues.
 */
const NAVIGATION_DEBOUNCE_MS = 500;

/**
 * Profile screen component.
 *
 * Provides access to profile-related features including wear history
 * and styling preferences.
 * Implements WCAG 2.1 AA accessibility standards.
 *
 * @returns Profile screen component
 */
export function ProfileScreen(): React.JSX.Element {
  const { colors, colorScheme, spacing, fontSize } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isNavigatingRef = useRef(false);

  // Get user for telemetry
  const user = useStore((state) => state.user);

  /**
   * Handles back navigation to home screen.
   */
  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/home');
    }
  }, [router]);

  /**
   * Handles navigation to wear history screen.
   */
  const handleNavigateToWearHistory = useCallback(() => {
    // Prevent double-tap navigation
    if (isNavigatingRef.current) {
      return;
    }

    isNavigatingRef.current = true;

    // Track navigation event
    trackCaptureEvent('wear_history_navigation_clicked', {
      userId: user?.id,
      metadata: { source: 'profile_screen' },
    });

    router.push('/history');

    // Reset navigation lock after debounce period
    setTimeout(() => {
      isNavigatingRef.current = false;
    }, NAVIGATION_DEBOUNCE_MS);
  }, [router, user?.id]);

  /**
   * Handles navigation to styling preferences screen.
   */
  const handleNavigateToStylingPreferences = useCallback(() => {
    // Prevent double-tap navigation
    if (isNavigatingRef.current) {
      return;
    }

    isNavigatingRef.current = true;

    // Track navigation event
    trackCaptureEvent('styling_preferences_navigation_clicked', {
      userId: user?.id,
      metadata: { source: 'profile_screen' },
    });

    router.push('/profile/styling-preferences');

    // Reset navigation lock after debounce period
    setTimeout(() => {
      isNavigatingRef.current = false;
    }, NAVIGATION_DEBOUNCE_MS);
  }, [router, user?.id]);

  /**
   * Handles navigation to calendar integration screen.
   */
  const handleNavigateToCalendarIntegration = useCallback(() => {
    // Prevent double-tap navigation
    if (isNavigatingRef.current) {
      return;
    }

    isNavigatingRef.current = true;

    // Track navigation event
    trackCaptureEvent('calendar_integration_navigation_clicked', {
      userId: user?.id,
      metadata: { source: 'profile_screen' },
    });

    router.push('/profile/calendar-integration');

    // Reset navigation lock after debounce period
    setTimeout(() => {
      isNavigatingRef.current = false;
    }, NAVIGATION_DEBOUNCE_MS);
  }, [router, user?.id]);

  /**
   * Subcomponent that renders the calendar connection status.
   *
   * Shows different states based on the integration status:
   * - Loading: Activity indicator
   * - Connected: Green text with email address
   * - Disconnected: Gray text indicating no connection
   * - Error: Red text indicating connection failed
   */
  const CalendarConnectionStatus = useCallback(() => {
    const { integration, isLoading, isError } = useCalendarIntegration('google');

    if (isLoading) {
      return (
        <ActivityIndicator
          size="small"
          color={colors.textSecondary}
          style={{ marginTop: 4 }}
        />
      );
    }

    if (isError) {
      return (
        <Text
          style={[styles.navigationItemSubtitle, { color: colors.error }]}
          allowFontScaling
          maxFontSizeMultiplier={1.5}
        >
          {t('screens.profile.navigation.googleCalendarError')}
        </Text>
      );
    }

    if (integration?.isConnected) {
      return (
        <Text
          style={[styles.navigationItemSubtitle, { color: colors.success }]}
          allowFontScaling
          maxFontSizeMultiplier={1.5}
        >
          {t('screens.profile.navigation.googleCalendarConnected')}
          {integration.connectedEmail && ` • ${integration.connectedEmail}`}
        </Text>
      );
    }

    return (
      <Text
        style={styles.navigationItemSubtitle}
        allowFontScaling
        maxFontSizeMultiplier={1.5}
      >
        {t('screens.profile.navigation.googleCalendarDisconnected')}
      </Text>
    );
  }, [colors]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: insets.top + spacing.sm,
          paddingHorizontal: spacing.md,
          paddingBottom: spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: colors.textSecondary + '20',
          backgroundColor: colors.background,
        },
        backButton: {
          width: TOUCH_TARGET_SIZE,
          height: TOUCH_TARGET_SIZE,
          justifyContent: 'center',
          alignItems: 'center',
          marginRight: spacing.sm,
        },
        backButtonPressed: {
          opacity: 0.6,
        },
        backIcon: {
          fontSize: fontSize.xl,
          color: colors.textPrimary,
        },
        headerTitleContainer: {
          flex: 1,
        },
        headerTitle: {
          fontSize: fontSize.xl,
          fontWeight: '600',
          color: colors.textPrimary,
        },
        scrollContent: {
          flexGrow: 1,
          paddingBottom: insets.bottom + spacing.lg,
        },
        section: {
          paddingTop: spacing.lg,
        },
        sectionTitle: {
          fontSize: fontSize.sm,
          fontWeight: '600',
          color: colors.textSecondary,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          paddingHorizontal: spacing.md,
          marginBottom: spacing.sm,
        },
        navigationItem: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.md,
          backgroundColor: colors.background,
          borderBottomWidth: 1,
          borderBottomColor: colors.textSecondary + '15',
          minHeight: TOUCH_TARGET_SIZE,
        },
        navigationItemPressed: {
          backgroundColor: colors.textSecondary + '10',
        },
        navigationItemContent: {
          flex: 1,
        },
        navigationItemTitle: {
          fontSize: fontSize.base,
          color: colors.textPrimary,
        },
        navigationItemSubtitle: {
          fontSize: fontSize.sm,
          color: colors.textSecondary,
          marginTop: spacing.xs,
        },
        navigationItemArrow: {
          fontSize: fontSize.base,
          color: colors.textSecondary,
          marginLeft: spacing.sm,
        },
      }),
    [colors, spacing, fontSize, insets.top, insets.bottom]
  );

  return (
    <View
      style={styles.container}
      accessibilityLabel={t('screens.profile.accessibility.screenLabel')}
      accessibilityHint={t('screens.profile.accessibility.screenHint')}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          onPress={handleBack}
          accessibilityLabel={t('screens.profile.accessibility.backButton')}
          accessibilityHint={t('screens.profile.accessibility.backButtonHint')}
          accessibilityRole="button"
        >
          <Text style={styles.backIcon}>{'<'}</Text>
        </Pressable>
        <View style={styles.headerTitleContainer}>
          <Text
            style={styles.headerTitle}
            accessibilityRole="header"
            allowFontScaling
            maxFontSizeMultiplier={1.5}
          >
            {t('screens.profile.title')}
          </Text>
        </View>
      </View>

      {/* Content */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Activity Section */}
        <View style={styles.section}>
          <Text
            style={styles.sectionTitle}
            allowFontScaling
            maxFontSizeMultiplier={1.5}
          >
            {t('screens.profile.sections.activity')}
          </Text>

          {/* Wear History Navigation Item */}
          <Pressable
            style={({ pressed }) => [
              styles.navigationItem,
              pressed && styles.navigationItemPressed,
            ]}
            onPress={handleNavigateToWearHistory}
            accessibilityLabel={t('screens.profile.navigation.wearHistoryLabel')}
            accessibilityHint={t('screens.profile.navigation.wearHistoryHint')}
            accessibilityRole="button"
          >
            <View style={styles.navigationItemContent}>
              <Text
                style={styles.navigationItemTitle}
                allowFontScaling
                maxFontSizeMultiplier={1.5}
              >
                {t('screens.profile.navigation.wearHistory')}
              </Text>
              <Text
                style={styles.navigationItemSubtitle}
                allowFontScaling
                maxFontSizeMultiplier={1.5}
              >
                {t('screens.profile.navigation.wearHistoryDescription')}
              </Text>
            </View>
            <Text style={styles.navigationItemArrow}>→</Text>
          </Pressable>
        </View>

        {/* Preferences Section */}
        <View style={styles.section}>
          <Text
            style={styles.sectionTitle}
            allowFontScaling
            maxFontSizeMultiplier={1.5}
          >
            {t('screens.profile.sections.preferences')}
          </Text>

          {/* Styling Preferences Navigation Item */}
          <Pressable
            style={({ pressed }) => [
              styles.navigationItem,
              pressed && styles.navigationItemPressed,
            ]}
            onPress={handleNavigateToStylingPreferences}
            accessibilityLabel={t('screens.profile.navigation.stylingPreferencesLabel')}
            accessibilityHint={t('screens.profile.navigation.stylingPreferencesHint')}
            accessibilityRole="button"
          >
            <View style={styles.navigationItemContent}>
              <Text
                style={styles.navigationItemTitle}
                allowFontScaling
                maxFontSizeMultiplier={1.5}
              >
                {t('screens.profile.navigation.stylingPreferences')}
              </Text>
              <Text
                style={styles.navigationItemSubtitle}
                allowFontScaling
                maxFontSizeMultiplier={1.5}
              >
                {t('screens.profile.navigation.stylingPreferencesDescription')}
              </Text>
            </View>
            <Text style={styles.navigationItemArrow}>→</Text>
          </Pressable>
        </View>

        {/* Integrations Section */}
        <View style={styles.section}>
          <Text
            style={styles.sectionTitle}
            allowFontScaling
            maxFontSizeMultiplier={1.5}
          >
            {t('screens.profile.sections.integrations')}
          </Text>

          {/* Google Calendar Integration Item */}
          <Pressable
            style={({ pressed }) => [
              styles.navigationItem,
              pressed && styles.navigationItemPressed,
            ]}
            onPress={handleNavigateToCalendarIntegration}
            accessibilityLabel={t('screens.profile.navigation.googleCalendar')}
            accessibilityHint="Manage Google Calendar connection"
            accessibilityRole="button"
          >
            <View style={styles.navigationItemContent}>
              <Text
                style={styles.navigationItemTitle}
                allowFontScaling
                maxFontSizeMultiplier={1.5}
              >
                {t('screens.profile.navigation.googleCalendar')}
              </Text>
              <CalendarConnectionStatus />
            </View>
            <Text style={styles.navigationItemArrow}>→</Text>
          </Pressable>
        </View>
      </ScrollView>

      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}
