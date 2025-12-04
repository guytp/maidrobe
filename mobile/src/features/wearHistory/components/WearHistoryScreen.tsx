/**
 * Wear History screen component for viewing outfit wear timeline.
 *
 * This screen displays a reverse-chronological list of wear events,
 * grouped by date, with navigation to outfit details.
 *
 * Features (to be implemented in subsequent steps):
 * - Date-grouped list with sticky headers
 * - Outfit thumbnails and context display
 * - Infinite scroll pagination
 * - Empty state with CTA
 * - Error handling with retry
 *
 * @module features/wearHistory/components/WearHistoryScreen
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { trackCaptureEvent } from '../../../core/telemetry';
import { useStore } from '../../../core/state/store';

/**
 * Minimum touch target size for accessibility (WCAG 2.1 AA).
 */
const TOUCH_TARGET_SIZE = 44;

/**
 * Wear History screen - displays timeline of worn outfits.
 *
 * Protected route: requires authenticated user (enforced by route wrapper).
 *
 * @returns Wear History screen component
 */
export function WearHistoryScreen(): React.JSX.Element {
  const { colors, colorScheme, spacing, fontSize } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const hasTrackedScreenView = useRef(false);

  // Global state
  const user = useStore((state) => state.user);

  /**
   * Track screen view on mount (once per session).
   */
  useEffect(() => {
    if (!hasTrackedScreenView.current && user?.id) {
      hasTrackedScreenView.current = true;
      trackCaptureEvent('wear_history_screen_viewed', {
        userId: user.id,
      });
    }
  }, [user?.id]);

  /**
   * Handles back navigation.
   */
  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/home');
    }
  }, [router]);

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
        headerTitle: {
          flex: 1,
          fontSize: fontSize.xl,
          fontWeight: '600',
          color: colors.textPrimary,
        },
        content: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: spacing.lg,
        },
        placeholderText: {
          fontSize: fontSize.base,
          color: colors.textSecondary,
          textAlign: 'center',
        },
      }),
    [colors, spacing, fontSize, insets.top]
  );

  return (
    <View
      style={styles.container}
      accessibilityLabel={t('screens.history.accessibility.screenLabel')}
      accessibilityHint={t('screens.history.accessibility.screenHint')}
    >
      {/* Header with back button and title */}
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          onPress={handleBack}
          accessibilityLabel={t('screens.history.accessibility.backButton')}
          accessibilityHint={t('screens.history.accessibility.backButtonHint')}
          accessibilityRole="button"
        >
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <Text
          style={styles.headerTitle}
          accessibilityRole="header"
          allowFontScaling
          maxFontSizeMultiplier={1.5}
        >
          {t('screens.history.title')}
        </Text>
      </View>

      {/* Content area - placeholder for now */}
      <View style={styles.content}>
        <Text
          style={styles.placeholderText}
          allowFontScaling
          maxFontSizeMultiplier={2}
        >
          {t('screens.history.placeholder')}
        </Text>
      </View>

      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}
