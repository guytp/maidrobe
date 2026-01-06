/**
 * Calendar Integration Screen Component
 *
 * Provides a detailed view for managing Google Calendar integration.
 * Shows connection status and allows users to disconnect their calendar.
 *
 * Features:
 * - Display current connection status
 * - Show connected email address
 * - Disconnect action with confirmation
 * - Error and loading states
 * - Toast notifications for feedback
 *
 * Security:
 * - Only shows connection status (no token details)
 * - Requires confirmation before disconnect
 * - Shows appropriate error messages
 *
 * @module features/profile/components/CalendarIntegrationScreen
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../../../core/state/store';
import { useTheme } from '../../../core/theme';
import { t } from '../../../core/i18n';
import { trackCaptureEvent } from '../../../core/telemetry';
import { Toast } from '../../../core/components';
import { useCalendarIntegration } from '../hooks/useCalendarIntegration';

/**
 * Minimum touch target size for accessibility (WCAG 2.1 AA)
 */
const TOUCH_TARGET_SIZE = 44;

/**
 * Calendar Integration Screen Component
 *
 * Allows users to view and manage their Google Calendar connection status.
 * Provides disconnect functionality with confirmation dialog.
 *
 * @returns Calendar Integration screen component
 */
export function CalendarIntegrationScreen(): React.JSX.Element {
  const { colors, colorScheme, spacing, fontSize } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const user = useStore((state) => state.user);

  // Local UI state
  const [showDisconnectSuccess, setShowDisconnectSuccess] = useState(false);
  const [showDisconnectError, setShowDisconnectError] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // Fetch calendar integration status
  const { integration, isLoading, isError, refetch } = useCalendarIntegration('google');

  /**
   * Handles back navigation to profile screen
   */
  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  /**
   * Handles successful disconnection
   */
  const handleDisconnectSuccess = useCallback(() => {
    // Show success toast
    setShowDisconnectSuccess(true);

    // Track successful disconnection
    trackCaptureEvent('calendar_disconnected', {
      userId: user?.id,
      provider: 'google',
    });

    // Refetch integration status to update UI
    setTimeout(() => {
      refetch();
    }, 100);
  }, [user?.id, refetch]);

  /**
   * Handles disconnection failure
   */
  const handleDisconnectError = useCallback(() => {
    // Show error toast
    setShowDisconnectError(true);

    // Track disconnection failure
    trackCaptureEvent('calendar_disconnect_failed', {
      userId: user?.id,
      provider: 'google',
      error_type: 'network',
    });
  }, [user?.id]);

  /**
   * Calls the backend disconnect Edge Function
   */
  const disconnectCalendar = useCallback(async () => {
    if (!user?.id) {
      handleDisconnectError();
      return;
    }

    setIsDisconnecting(true);

    try {
      // Import supabase client
      const { supabase } = await import('../../../../services/supabase');

      // Call the disconnect Edge Function
      const { error } = await supabase.functions.invoke(
        'disconnect-google-calendar',
        {
          body: { provider: 'google' },
        }
      );

      if (error) {
        console.error('Disconnect error:', error);
        handleDisconnectError();
      } else {
        handleDisconnectSuccess();
      }
    } catch (err) {
      console.error('Unexpected disconnect error:', err);
      handleDisconnectError();
    } finally {
      setIsDisconnecting(false);
    }
  }, [user?.id, handleDisconnectSuccess, handleDisconnectError]);

  /**
   * Shows confirmation dialog before disconnect
   */
  const handleDisconnectPress = useCallback(() => {
    // Track disconnect button click
    trackCaptureEvent('calendar_disconnect_clicked', {
      userId: user?.id,
      provider: 'google',
    });

    // Show confirmation dialog following existing patterns
    Alert.alert(
      t('screens.profile.calendar.disconnectTitle'),
      t('screens.profile.calendar.disconnectMessage'),
      [
        {
          text: t('screens.profile.calendar.disconnectCancel'),
          style: 'cancel',
          onPress: () => {
            // Track cancellation
            trackCaptureEvent('calendar_disconnect_cancelled', {
              userId: user?.id,
              provider: 'google',
            });
          },
        },
        {
          text: t('screens.profile.calendar.disconnectConfirm'),
          style: 'destructive',
          onPress: () => {
            // Track confirmation
            trackCaptureEvent('calendar_disconnect_confirmed', {
              userId: user?.id,
              provider: 'google',
            });

            // Execute disconnect
            disconnectCalendar();
          },
        },
      ]
    );
  }, [user?.id, disconnectCalendar]);

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
        statusCard: {
          marginHorizontal: spacing.md,
          padding: spacing.lg,
          backgroundColor: colors.background,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.textSecondary + '15',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2,
        },
        statusHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: spacing.sm,
        },
        statusTitle: {
          fontSize: fontSize.lg,
          fontWeight: '600',
          color: colors.textPrimary,
        },
        statusBadge: {
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.xs,
          borderRadius: 12,
          backgroundColor: colors.success + '20',
        },
        statusBadgeText: {
          fontSize: fontSize.sm,
          fontWeight: '600',
          color: colors.success,
        },
        statusBadgeDisconnected: {
          backgroundColor: colors.textSecondary + '20',
        },
        statusBadgeTextDisconnected: {
          color: colors.textSecondary,
        },
        statusEmail: {
          fontSize: fontSize.base,
          color: colors.textPrimary,
          marginBottom: spacing.xs,
        },
        statusSubtitle: {
          fontSize: fontSize.sm,
          color: colors.textSecondary,
        },
        actionButton: {
          marginHorizontal: spacing.md,
          marginTop: spacing.lg,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          borderRadius: 8,
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: TOUCH_TARGET_SIZE,
        },
        actionButtonPrimary: {
          backgroundColor: colors.success,
        },
        actionButtonDestructive: {
          backgroundColor: colors.error,
        },
        actionButtonDisabled: {
          opacity: 0.5,
        },
        actionButtonText: {
          fontSize: fontSize.base,
          fontWeight: '600',
          color: colors.background,
        },
        loadingContainer: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingVertical: spacing.xl,
        },
        errorContainer: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: spacing.lg,
        },
        errorText: {
          fontSize: fontSize.base,
          color: colors.error,
          textAlign: 'center',
        },
      }),
    [colors, spacing, fontSize, insets.top, insets.bottom]
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.textPrimary} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>
          {t('screens.profile.calendar.errorLoading')}
        </Text>
      </View>
    );
  }

  const isConnected = integration?.isConnected ?? false;
  const connectedEmail = integration?.connectedEmail;

  return (
    <View
      style={styles.container}
      accessibilityLabel={t('screens.profile.calendar.accessibility.screenLabel')}
      accessibilityHint={t('screens.profile.calendar.accessibility.screenHint')}
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
            {t('screens.profile.navigation.googleCalendar')}
          </Text>
        </View>
      </View>

      {/* Content */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Card */}
        <View style={styles.section}>
          <Text
            style={styles.sectionTitle}
            allowFontScaling
            maxFontSizeMultiplier={1.5}
          >
            {t('screens.profile.calendar.statusSection')}
          </Text>

          <View style={styles.statusCard}>
            <View style={styles.statusHeader}>
              <Text
                style={styles.statusTitle}
                allowFontScaling
                maxFontSizeMultiplier={1.5}
              >
                {t('screens.profile.navigation.googleCalendar')}
              </Text>

              <View
                style={[
                  styles.statusBadge,
                  !isConnected && styles.statusBadgeDisconnected,
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    !isConnected && styles.statusBadgeTextDisconnected,
                  ]}
                  allowFontScaling
                  maxFontSizeMultiplier={1.5}
                >
                  {isConnected
                    ? t('screens.profile.navigation.googleCalendarConnected')
                    : t('screens.profile.navigation.googleCalendarDisconnected')}
                </Text>
              </View>
            </View>

            {connectedEmail && (
              <Text
                style={styles.statusEmail}
                allowFontScaling
                maxFontSizeMultiplier={1.5}
              >
                {connectedEmail}
              </Text>
            )}

            <Text
              style={styles.statusSubtitle}
              allowFontScaling
              maxFontSizeMultiplier={1.5}
            >
              {isConnected
                ? t('screens.profile.calendar.connectedDescription')
                : t('screens.profile.calendar.disconnectedDescription')}
            </Text>
          </View>
        </View>

        {/* Action Button */}
        {isConnected ? (
          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              styles.actionButtonDestructive,
              (pressed || isDisconnecting) && styles.actionButtonDisabled,
            ]}
            onPress={handleDisconnectPress}
            disabled={isDisconnecting}
            accessibilityLabel={t('screens.profile.calendar.disconnectButton')}
            accessibilityHint={t('screens.profile.calendar.disconnectButtonHint')}
            accessibilityRole="button"
          >
            {isDisconnecting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text
                style={styles.actionButtonText}
                allowFontScaling
                maxFontSizeMultiplier={1.5}
              >
                {t('screens.profile.calendar.disconnectButton')}
              </Text>
            )}
          </Pressable>
        ) : (
          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              styles.actionButtonPrimary,
              pressed && styles.actionButtonDisabled,
            ]}
            onPress={() => {
              // TODO: Implement OAuth connection flow in Step 5
              trackCaptureEvent('calendar_connect_clicked', {
                userId: user?.id,
                provider: 'google',
              });
            }}
            accessibilityLabel={t('screens.profile.calendar.connectButton')}
            accessibilityHint={t('screens.profile.calendar.connectButtonHint')}
            accessibilityRole="button"
          >
            <Text
              style={styles.actionButtonText}
              allowFontScaling
              maxFontSizeMultiplier={1.5}
            >
              {t('screens.profile.calendar.connectButton')}
            </Text>
          </Pressable>
        )}
      </ScrollView>

      {/* StatusBar */}
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

      {/* Toast Notifications */}
      <Toast
        visible={showDisconnectSuccess}
        message={t('screens.profile.calendar.disconnectedSuccess')}
        type="success"
        onDismiss={() => setShowDisconnectSuccess(false)}
      />

      <Toast
        visible={showDisconnectError}
        message={t('screens.profile.calendar.disconnectedError')}
        type="error"
        onDismiss={() => setShowDisconnectError(false)}
      />
    </View>
  );
}
