/**
 * Styling Preferences screen for managing no-repeat window and mode settings.
 *
 * This screen allows users to configure:
 * - No-repeat window: How many days before outfit/item repeats (preset buttons + custom)
 * - No-repeat mode: Whether to avoid repeating key items or exact outfits
 *
 * Features:
 * - Preset buttons for common values (Off, 3, 7, 14, 30 days)
 * - Advanced section with custom numeric input (0-90)
 * - Scope selector for repeat avoidance granularity
 * - Optimistic updates with rollback on error
 * - Accessible form controls with proper labelling
 * - Analytics tracking for preference changes
 *
 * Validation ranges for no_repeat_days:
 * - Input: maxLength=2 (intentional - max valid value 90 is exactly 2 digits)
 * - UI validation: 0-90 days enforced with inline error messaging
 * - Backend: 0-180 days supported in DB for future flexibility
 *
 * The maxLength=2 was deliberately chosen as all valid values (0-90) fit within
 * 2 digits, and it prevents users from typing obviously invalid 3-digit numbers.
 * The UI validation (0-90) is intentionally stricter than the backend (0-180) to
 * provide a sensible default experience while allowing server-side flexibility
 * for future features or admin overrides.
 *
 * @module features/profile/components/StylingPreferencesScreen
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { trackCaptureEvent } from '../../../core/telemetry';
import { logError } from '../../../core/telemetry';
import { useStore } from '../../../core/state/store';
import { useUserPrefs } from '../../onboarding/api/useUserPrefs';
import { useSavePrefs } from '../../onboarding/api/useSavePrefs';
import { toFormData, toPrefsRow } from '../../onboarding/utils/prefsMapping';
import { DEFAULT_PREFS_FORM_DATA } from '../../onboarding/utils/prefsTypes';
import type { PrefsFormData, NoRepeatMode, PrefsRow } from '../../onboarding/utils/prefsTypes';
import { clampNoRepeatDays } from '../../onboarding/utils/prefsValidation';

/**
 * Minimum touch target size for accessibility (WCAG 2.1 AA).
 */
const TOUCH_TARGET_SIZE = 44;

/**
 * Preset button values for the no-repeat window.
 */
const PRESET_BUTTONS = [
  { key: 'off', value: 0, label: 'Off' },
  { key: '3days', value: 3, label: '3' },
  { key: '7days', value: 7, label: '7' },
  { key: '14days', value: 14, label: '14' },
  { key: '30days', value: 30, label: '30' },
] as const;

/**
 * Styling Preferences screen component.
 *
 * Provides controls for no-repeat window and mode settings.
 * Implements WCAG 2.1 AA accessibility standards.
 *
 * @returns Styling Preferences screen component
 */
export function StylingPreferencesScreen(): React.JSX.Element {
  const { colors, colorScheme, spacing, fontSize, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Get user for telemetry and save operations
  const user = useStore((state) => state.user);
  const userId = user?.id;

  // Query client for optimistic updates
  const queryClient = useQueryClient();

  // Fetch existing preferences
  const { data: prefsRow, isLoading } = useUserPrefs();

  // Save preferences mutation
  const savePrefs = useSavePrefs();

  // Local form state
  const [formData, setFormData] = useState<PrefsFormData>(DEFAULT_PREFS_FORM_DATA);

  // Track initial form data for PATCH comparison and rollback
  const [initialFormData, setInitialFormData] = useState<PrefsFormData>(DEFAULT_PREFS_FORM_DATA);

  // Advanced section expanded state
  const [isAdvancedExpanded, setIsAdvancedExpanded] = useState(false);

  // Custom days input value (string for TextInput)
  const [customDaysInput, setCustomDaysInput] = useState('');

  // Saving state and feedback
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Validation error for custom days input
  const [daysInputError, setDaysInputError] = useState<string | null>(null);

  // Pending retry data - stores the intended form data when a save fails
  const [pendingRetryData, setPendingRetryData] = useState<PrefsFormData | null>(null);

  // Ref to track previous form data for analytics (before the current save)
  const previousFormDataRef = useRef<PrefsFormData>(DEFAULT_PREFS_FORM_DATA);

  // Initialize form data from fetched prefs
  useEffect(() => {
    if (prefsRow !== undefined) {
      const mappedData = toFormData(prefsRow);
      setFormData(mappedData);
      setInitialFormData(mappedData);
      setCustomDaysInput(mappedData.noRepeatDays.toString());
      previousFormDataRef.current = mappedData;

      // Auto-expand advanced section if user has custom value
      const isPresetValue = PRESET_BUTTONS.some((p) => p.value === mappedData.noRepeatDays);
      if (!isPresetValue && mappedData.noRepeatDays > 0) {
        setIsAdvancedExpanded(true);
      }
    }
  }, [prefsRow]);

  /**
   * Handles back navigation.
   */
  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/profile');
    }
  }, [router]);

  /**
   * Query key for prefs cache - matches useUserPrefs hook
   */
  const prefsQueryKey = useMemo(() => ['prefs', userId ?? 'anonymous'], [userId]);

  /**
   * Saves the current preferences to the server with optimistic updates.
   *
   * Flow:
   * 1. Snapshot previous query cache state
   * 2. Apply optimistic update to query cache
   * 3. Call mutation
   * 4. On success: update baseline, track analytics with prev/new values
   * 5. On failure: rollback cache and UI, store pending data for retry
   */
  const saveCurrentPrefs = useCallback(
    async (newFormData: PrefsFormData) => {
      if (!userId) {
        logError(new Error('User ID not available'), 'user', {
          feature: 'profile',
          operation: 'styling_prefs_save',
          metadata: { reason: 'no_user_id' },
        });
        setSaveError(t('screens.stylingPreferences.errors.saveFailed'));
        return false;
      }

      // Capture previous values for analytics before any state changes
      const previousNoRepeatDays = previousFormDataRef.current.noRepeatDays;
      const previousNoRepeatMode = previousFormDataRef.current.noRepeatMode;

      // Snapshot current query cache for rollback
      const previousCacheData = queryClient.getQueryData<PrefsRow | null>(prefsQueryKey);

      // Apply optimistic update to query cache
      const optimisticPrefsRow = toPrefsRow(newFormData, userId);
      queryClient.setQueryData<PrefsRow | null>(prefsQueryKey, (oldData) => {
        if (oldData) {
          return {
            ...oldData,
            no_repeat_days: optimisticPrefsRow.no_repeat_days,
            no_repeat_mode: optimisticPrefsRow.no_repeat_mode,
          };
        }
        return optimisticPrefsRow;
      });

      setIsSaving(true);
      setSaveError(null);
      setSaveSuccess(false);
      setPendingRetryData(null);

      try {
        await savePrefs.mutateAsync({
          userId,
          data: newFormData,
          existingData: initialFormData,
        });

        // Track analytics event with previous and new values
        trackCaptureEvent('no_repeat_prefs_changed', {
          userId,
          metadata: {
            previousNoRepeatDays,
            newNoRepeatDays: newFormData.noRepeatDays,
            previousNoRepeatMode,
            newNoRepeatMode: newFormData.noRepeatMode,
            source: 'styling_preferences_screen',
          },
        });

        // Update baseline for future comparisons and analytics
        setInitialFormData(newFormData);
        previousFormDataRef.current = newFormData;
        setSaveSuccess(true);

        // Clear success message after a delay
        setTimeout(() => setSaveSuccess(false), 2000);

        return true;
      } catch (err) {
        logError(err instanceof Error ? err : new Error(String(err)), 'network', {
          feature: 'profile',
          operation: 'styling_prefs_save',
          metadata: { userId },
        });

        // Rollback query cache to previous state
        queryClient.setQueryData<PrefsRow | null>(prefsQueryKey, previousCacheData);

        // Rollback UI to last known server state
        setFormData(initialFormData);
        setCustomDaysInput(initialFormData.noRepeatDays.toString());

        // Store intended data for retry
        setPendingRetryData(newFormData);
        setSaveError(t('screens.stylingPreferences.errors.saveFailed'));

        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [userId, initialFormData, savePrefs, queryClient, prefsQueryKey]
  );

  /**
   * Handles retry after a failed save.
   * Re-invokes saveCurrentPrefs with the original intended values.
   */
  const handleRetry = useCallback(() => {
    if (pendingRetryData) {
      // Clear error before retry
      setSaveError(null);
      // Re-apply the intended form data to UI
      setFormData(pendingRetryData);
      setCustomDaysInput(pendingRetryData.noRepeatDays.toString());
      // Retry the save
      saveCurrentPrefs(pendingRetryData);
    }
  }, [pendingRetryData, saveCurrentPrefs]);

  /**
   * Handles preset button press.
   */
  const handlePresetPress = useCallback(
    (value: number) => {
      /**
       * DEPRECATION: noRepeatWindow dual-field migration (Story #446)
       *
       * This screen uses the new `noRepeatDays` field as the canonical source of truth
       * for no-repeat window settings. The legacy `noRepeatWindow` field is explicitly
       * set to null to signal that the new field should be used.
       *
       * Migration phases (see ADR-0001):
       * - Phase 1 (current): Both fields exist, noRepeatDays is canonical
       * - Phase 2 (future): noRepeatWindow becomes optional
       * - Phase 3 (future): noRepeatWindow removed entirely
       *
       * Setting noRepeatWindow: null here ensures:
       * 1. Legacy code paths that check noRepeatWindow skip their bucket logic
       * 2. The PrefsFormData clearly indicates this is a "new model" save
       * 3. toPrefsRow() uses noRepeatDays directly for database storage
       *
       * @see docs/adr/0001-no-repeat-preferences-model-migration.md
       * @see src/features/onboarding/utils/prefsTypes.ts (NoRepeatWindow deprecation)
       */
      const newFormData = {
        ...formData,
        noRepeatDays: value,
        noRepeatWindow: null,
      };
      setFormData(newFormData);
      setCustomDaysInput(value.toString());
      saveCurrentPrefs(newFormData);
    },
    [formData, saveCurrentPrefs]
  );

  /**
   * Validates a custom days value and returns an error message if invalid.
   * Returns null if the value is valid.
   */
  const validateDaysInput = useCallback((value: string): string | null => {
    if (value === '') {
      return null; // Empty is allowed during typing, validated on blur
    }

    const parsed = parseInt(value, 10);

    if (isNaN(parsed)) {
      return t('screens.stylingPreferences.errors.invalidDays');
    }

    if (parsed < 0 || parsed > 90) {
      return t('screens.stylingPreferences.errors.invalidDays');
    }

    return null;
  }, []);

  /**
   * Handles custom days input change.
   */
  const handleCustomDaysChange = useCallback(
    (text: string) => {
      // Allow only numeric input
      const numericText = text.replace(/[^0-9]/g, '');
      setCustomDaysInput(numericText);

      // Validate and show inline error if invalid
      const error = validateDaysInput(numericText);
      setDaysInputError(error);
    },
    [validateDaysInput]
  );

  /**
   * Handles custom days input blur (save on blur).
   * Validates input and either saves valid values or resets invalid ones.
   */
  const handleCustomDaysBlur = useCallback(() => {
    const parsed = parseInt(customDaysInput, 10);

    // Handle empty or non-numeric input
    if (isNaN(parsed) || customDaysInput === '') {
      // Reset to current value if invalid
      setCustomDaysInput(formData.noRepeatDays.toString());
      setDaysInputError(null);
      return;
    }

    // Validate range (0-90)
    if (parsed < 0 || parsed > 90) {
      // Show error and reset to valid value
      setDaysInputError(t('screens.stylingPreferences.errors.invalidDays'));
      setCustomDaysInput(formData.noRepeatDays.toString());
      // Clear error after a delay
      setTimeout(() => setDaysInputError(null), 3000);
      return;
    }

    // Clear any validation error
    setDaysInputError(null);

    // Clamp to valid range (should already be valid, but defensive)
    const clamped = clampNoRepeatDays(parsed);
    setCustomDaysInput(clamped.toString());

    // Only save if value changed
    if (clamped !== formData.noRepeatDays) {
      /**
       * DEPRECATION: noRepeatWindow dual-field migration (Story #446)
       *
       * Same migration pattern as handlePresetPress - see detailed comment there.
       * Setting noRepeatWindow: null signals that noRepeatDays is the canonical value.
       *
       * @see handlePresetPress for full deprecation documentation
       * @see docs/adr/0001-no-repeat-preferences-model-migration.md
       */
      const newFormData = {
        ...formData,
        noRepeatDays: clamped,
        noRepeatWindow: null,
      };
      setFormData(newFormData);
      saveCurrentPrefs(newFormData);
    }
  }, [customDaysInput, formData, saveCurrentPrefs]);

  /**
   * Handles no-repeat mode change.
   */
  const handleModeChange = useCallback(
    (mode: NoRepeatMode) => {
      if (mode !== formData.noRepeatMode) {
        const newFormData = {
          ...formData,
          noRepeatMode: mode,
        };
        setFormData(newFormData);
        saveCurrentPrefs(newFormData);
      }
    },
    [formData, saveCurrentPrefs]
  );

  /**
   * Toggles advanced section visibility.
   */
  const toggleAdvanced = useCallback(() => {
    setIsAdvancedExpanded((prev) => !prev);
  }, []);

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
        savingIndicator: {
          marginLeft: spacing.sm,
        },
        scrollContent: {
          flexGrow: 1,
          paddingBottom: insets.bottom + spacing.lg,
        },
        section: {
          paddingTop: spacing.lg,
          paddingHorizontal: spacing.md,
        },
        sectionTitle: {
          fontSize: fontSize.lg,
          fontWeight: '600',
          color: colors.textPrimary,
          marginBottom: spacing.sm,
        },
        sectionDescription: {
          fontSize: fontSize.sm,
          color: colors.textSecondary,
          marginBottom: spacing.md,
          lineHeight: fontSize.sm * 1.5,
        },
        presetContainer: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          marginHorizontal: -spacing.xs,
        },
        presetButton: {
          minWidth: 56,
          minHeight: TOUCH_TARGET_SIZE,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          marginHorizontal: spacing.xs,
          marginBottom: spacing.sm,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.textSecondary + '40',
          backgroundColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
        },
        presetButtonSelected: {
          backgroundColor: colors.textPrimary,
          borderColor: colors.textPrimary,
        },
        presetButtonPressed: {
          opacity: 0.8,
        },
        presetButtonText: {
          fontSize: fontSize.base,
          fontWeight: '500',
          color: colors.textPrimary,
        },
        presetButtonTextSelected: {
          color: colors.background,
        },
        presetLabel: {
          fontSize: fontSize.xs,
          color: colors.textSecondary,
          marginTop: 2,
        },
        presetLabelSelected: {
          color: colors.background + 'CC',
        },
        advancedToggle: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.md,
          marginTop: spacing.md,
          borderTopWidth: 1,
          borderTopColor: colors.textSecondary + '15',
        },
        advancedToggleText: {
          flex: 1,
          fontSize: fontSize.base,
          fontWeight: '500',
          color: colors.textPrimary,
        },
        advancedToggleArrow: {
          fontSize: fontSize.base,
          color: colors.textSecondary,
        },
        advancedSection: {
          paddingTop: spacing.md,
          paddingHorizontal: spacing.md,
          borderTopWidth: 1,
          borderTopColor: colors.textSecondary + '15',
        },
        inputRow: {
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: spacing.md,
        },
        inputLabel: {
          fontSize: fontSize.base,
          color: colors.textPrimary,
          marginRight: spacing.md,
        },
        customInput: {
          width: 80,
          height: TOUCH_TARGET_SIZE,
          borderWidth: 1,
          borderColor: colors.textSecondary + '40',
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          fontSize: fontSize.base,
          color: colors.textPrimary,
          textAlign: 'center',
          backgroundColor: colors.background,
        },
        customInputFocused: {
          borderColor: colors.textPrimary,
        },
        inputSuffix: {
          fontSize: fontSize.base,
          color: colors.textSecondary,
          marginLeft: spacing.sm,
        },
        inputHint: {
          fontSize: fontSize.sm,
          color: colors.textSecondary,
          marginBottom: spacing.sm,
        },
        inputError: {
          fontSize: fontSize.sm,
          color: colors.error,
          marginBottom: spacing.lg,
        },
        customInputError: {
          borderColor: colors.error,
        },
        modeSection: {
          marginTop: spacing.md,
        },
        modeSectionTitle: {
          fontSize: fontSize.base,
          fontWeight: '600',
          color: colors.textPrimary,
          marginBottom: spacing.sm,
        },
        modeOption: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          paddingVertical: spacing.sm,
          minHeight: TOUCH_TARGET_SIZE,
        },
        radioOuter: {
          width: 24,
          height: 24,
          borderRadius: 12,
          borderWidth: 2,
          borderColor: colors.textSecondary,
          marginRight: spacing.md,
          marginTop: 2,
          alignItems: 'center',
          justifyContent: 'center',
        },
        radioOuterSelected: {
          borderColor: colors.textPrimary,
        },
        radioInner: {
          width: 12,
          height: 12,
          borderRadius: 6,
          backgroundColor: colors.textPrimary,
        },
        modeContent: {
          flex: 1,
        },
        modeLabel: {
          fontSize: fontSize.base,
          color: colors.textPrimary,
          fontWeight: '500',
        },
        modeDescription: {
          fontSize: fontSize.sm,
          color: colors.textSecondary,
          marginTop: 2,
          lineHeight: fontSize.sm * 1.4,
        },
        recommendedBadge: {
          fontSize: fontSize.xs,
          color: colors.success,
          fontWeight: '600',
          marginLeft: spacing.xs,
        },
        feedbackContainer: {
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
        },
        successText: {
          fontSize: fontSize.sm,
          color: colors.success,
        },
        errorContainer: {
          flexDirection: 'row',
          alignItems: 'center',
          flexWrap: 'wrap',
        },
        errorText: {
          fontSize: fontSize.sm,
          color: colors.error,
        },
        retryButton: {
          marginLeft: spacing.sm,
          paddingVertical: spacing.xs,
          paddingHorizontal: spacing.sm,
          minHeight: TOUCH_TARGET_SIZE,
          justifyContent: 'center',
        },
        retryButtonPressed: {
          opacity: 0.6,
        },
        retryText: {
          fontSize: fontSize.sm,
          color: colors.textPrimary,
          textDecorationLine: 'underline',
        },
        loadingContainer: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.background,
        },
      }),
    [colors, spacing, fontSize, radius, insets.top, insets.bottom]
  );

  // Show loading spinner while fetching
  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
            onPress={handleBack}
            accessibilityLabel={t('screens.stylingPreferences.accessibility.backButton')}
            accessibilityHint={t('screens.stylingPreferences.accessibility.backButtonHint')}
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
              {t('screens.stylingPreferences.title')}
            </Text>
          </View>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator
            size="large"
            color={colors.textPrimary}
            accessibilityLabel={t('screens.stylingPreferences.loading')}
          />
        </View>
      </View>
    );
  }

  return (
    <View
      style={styles.container}
      accessibilityLabel={t('screens.stylingPreferences.accessibility.screenLabel')}
      accessibilityHint={t('screens.stylingPreferences.accessibility.screenHint')}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          onPress={handleBack}
          accessibilityLabel={t('screens.stylingPreferences.accessibility.backButton')}
          accessibilityHint={t('screens.stylingPreferences.accessibility.backButtonHint')}
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
            {t('screens.stylingPreferences.title')}
          </Text>
        </View>
        {isSaving && (
          <ActivityIndicator
            size="small"
            color={colors.textSecondary}
            style={styles.savingIndicator}
            accessibilityLabel={t('screens.stylingPreferences.saving')}
          />
        )}
      </View>

      {/* Content */}
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Feedback Messages */}
        {(saveSuccess || saveError) && (
          <View style={styles.feedbackContainer}>
            {saveSuccess && (
              <Text style={styles.successText} accessibilityLiveRegion="polite">
                {t('screens.stylingPreferences.saved')}
              </Text>
            )}
            {saveError && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText} accessibilityLiveRegion="assertive">
                  {saveError}
                </Text>
                {pendingRetryData && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.retryButton,
                      pressed && styles.retryButtonPressed,
                    ]}
                    onPress={handleRetry}
                    accessibilityRole="button"
                    accessibilityLabel={t('screens.stylingPreferences.retry')}
                    accessibilityHint={t('screens.stylingPreferences.retryHint')}
                    disabled={isSaving}
                  >
                    <Text style={styles.retryText}>{t('screens.stylingPreferences.retry')}</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        )}

        {/* No-Repeat Window Section */}
        <View style={styles.section}>
          <Text
            style={styles.sectionTitle}
            accessibilityRole="header"
            allowFontScaling
            maxFontSizeMultiplier={1.5}
          >
            {t('screens.stylingPreferences.noRepeat.title')}
          </Text>
          <Text style={styles.sectionDescription} allowFontScaling maxFontSizeMultiplier={1.5}>
            {t('screens.stylingPreferences.noRepeat.description')}
          </Text>

          {/* Preset Buttons */}
          <View style={styles.presetContainer} accessibilityRole="radiogroup">
            {PRESET_BUTTONS.map((preset) => {
              const isSelected = formData.noRepeatDays === preset.value;
              return (
                <Pressable
                  key={preset.key}
                  style={({ pressed }) => [
                    styles.presetButton,
                    isSelected && styles.presetButtonSelected,
                    pressed && styles.presetButtonPressed,
                  ]}
                  onPress={() => handlePresetPress(preset.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected }}
                  accessibilityLabel={t(`screens.stylingPreferences.presets.${preset.key}`)}
                  accessibilityHint={t('screens.stylingPreferences.presets.hint')}
                >
                  <Text
                    style={[styles.presetButtonText, isSelected && styles.presetButtonTextSelected]}
                    allowFontScaling
                    maxFontSizeMultiplier={1.5}
                  >
                    {preset.label}
                  </Text>
                  {preset.value > 0 && (
                    <Text
                      style={[styles.presetLabel, isSelected && styles.presetLabelSelected]}
                      allowFontScaling
                      maxFontSizeMultiplier={1.5}
                    >
                      {t('screens.stylingPreferences.presets.days')}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Advanced Section Toggle */}
        <Pressable
          style={styles.advancedToggle}
          onPress={toggleAdvanced}
          accessibilityRole="button"
          accessibilityState={{ expanded: isAdvancedExpanded }}
          accessibilityLabel={t('screens.stylingPreferences.advanced.toggle')}
          accessibilityHint={t('screens.stylingPreferences.advanced.toggleHint')}
        >
          <Text style={styles.advancedToggleText} allowFontScaling maxFontSizeMultiplier={1.5}>
            {t('screens.stylingPreferences.advanced.title')}
          </Text>
          <Text style={styles.advancedToggleArrow}>{isAdvancedExpanded ? '▼' : '▶'}</Text>
        </Pressable>

        {/* Advanced Section Content */}
        {isAdvancedExpanded && (
          <View style={styles.advancedSection}>
            {/* Custom Days Input */}
            <View style={styles.inputRow}>
              <Text style={styles.inputLabel} allowFontScaling maxFontSizeMultiplier={1.5}>
                {t('screens.stylingPreferences.advanced.customDays')}
              </Text>
              {/*
               * No-repeat days input constraints (INTENTIONAL DESIGN):
               *
               * maxLength={2} is deliberately chosen because:
               * - The valid UI range is 0-90, and 90 (the maximum) is exactly 2 digits
               * - All valid values can be entered without restriction
               * - Prevents users from typing 3-digit numbers (100+) that would always
               *   be invalid, providing immediate feedback via input blocking
               * - Keeps the input field compact and appropriately sized
               *
               * Validation layers:
               * - Input: maxLength={2} blocks entry beyond 2 characters
               * - UI: validateDaysInput() enforces 0-90 with inline error messaging
               * - Backend: Database accepts 0-180 for future flexibility
               *
               * This configuration was reviewed and confirmed as the optimal UX choice.
               */}
              <TextInput
                style={[styles.customInput, daysInputError != null && styles.customInputError]}
                value={customDaysInput}
                onChangeText={handleCustomDaysChange}
                onBlur={handleCustomDaysBlur}
                keyboardType="number-pad"
                maxLength={2}
                accessibilityLabel={
                  daysInputError != null
                    ? `${t('screens.stylingPreferences.advanced.customDaysLabel')}, ${daysInputError}`
                    : t('screens.stylingPreferences.advanced.customDaysLabel')
                }
                accessibilityHint={t('screens.stylingPreferences.advanced.customDaysHint')}
                allowFontScaling
                maxFontSizeMultiplier={1.5}
              />
              <Text style={styles.inputSuffix} allowFontScaling maxFontSizeMultiplier={1.5}>
                {t('screens.stylingPreferences.advanced.daysSuffix')}
              </Text>
            </View>
            {daysInputError != null ? (
              <Text
                style={styles.inputError}
                allowFontScaling
                maxFontSizeMultiplier={1.5}
                accessibilityLiveRegion="assertive"
              >
                {daysInputError}
              </Text>
            ) : (
              <Text style={styles.inputHint} allowFontScaling maxFontSizeMultiplier={1.5}>
                {t('screens.stylingPreferences.advanced.rangeHint')}
              </Text>
            )}

            {/* Mode Selector */}
            <View style={styles.modeSection}>
              <Text
                style={styles.modeSectionTitle}
                accessibilityRole="header"
                allowFontScaling
                maxFontSizeMultiplier={1.5}
              >
                {t('screens.stylingPreferences.mode.title')}
              </Text>

              {/* Item Mode */}
              <Pressable
                style={styles.modeOption}
                onPress={() => handleModeChange('item')}
                accessibilityRole="radio"
                accessibilityState={{ checked: formData.noRepeatMode === 'item' }}
                accessibilityLabel={t('screens.stylingPreferences.mode.item.label')}
              >
                <View
                  style={[
                    styles.radioOuter,
                    formData.noRepeatMode === 'item' && styles.radioOuterSelected,
                  ]}
                >
                  {formData.noRepeatMode === 'item' && <View style={styles.radioInner} />}
                </View>
                <View style={styles.modeContent}>
                  <Text style={styles.modeLabel} allowFontScaling maxFontSizeMultiplier={1.5}>
                    {t('screens.stylingPreferences.mode.item.label')}
                    <Text style={styles.recommendedBadge}>
                      {' '}
                      {t('screens.stylingPreferences.mode.recommended')}
                    </Text>
                  </Text>
                  <Text style={styles.modeDescription} allowFontScaling maxFontSizeMultiplier={1.5}>
                    {t('screens.stylingPreferences.mode.item.description')}
                  </Text>
                </View>
              </Pressable>

              {/* Outfit Mode */}
              <Pressable
                style={styles.modeOption}
                onPress={() => handleModeChange('outfit')}
                accessibilityRole="radio"
                accessibilityState={{ checked: formData.noRepeatMode === 'outfit' }}
                accessibilityLabel={t('screens.stylingPreferences.mode.outfit.label')}
              >
                <View
                  style={[
                    styles.radioOuter,
                    formData.noRepeatMode === 'outfit' && styles.radioOuterSelected,
                  ]}
                >
                  {formData.noRepeatMode === 'outfit' && <View style={styles.radioInner} />}
                </View>
                <View style={styles.modeContent}>
                  <Text style={styles.modeLabel} allowFontScaling maxFontSizeMultiplier={1.5}>
                    {t('screens.stylingPreferences.mode.outfit.label')}
                  </Text>
                  <Text style={styles.modeDescription} allowFontScaling maxFontSizeMultiplier={1.5}>
                    {t('screens.stylingPreferences.mode.outfit.description')}
                  </Text>
                </View>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>

      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}
