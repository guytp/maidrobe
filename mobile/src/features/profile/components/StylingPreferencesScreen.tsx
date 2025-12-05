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
 * @module features/profile/components/StylingPreferencesScreen
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { trackCaptureEvent } from '../../../core/telemetry';
import { logError } from '../../../core/telemetry';
import { useStore } from '../../../core/state/store';
import { useUserPrefs } from '../../onboarding/api/useUserPrefs';
import { useSavePrefs } from '../../onboarding/api/useSavePrefs';
import { toFormData } from '../../onboarding/utils/prefsMapping';
import { DEFAULT_PREFS_FORM_DATA } from '../../onboarding/utils/prefsTypes';
import type { PrefsFormData, NoRepeatMode } from '../../onboarding/utils/prefsTypes';
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

  // Fetch existing preferences
  const { data: prefsRow, isLoading } = useUserPrefs();

  // Save preferences mutation
  const savePrefs = useSavePrefs();

  // Local form state
  const [formData, setFormData] = useState<PrefsFormData>(DEFAULT_PREFS_FORM_DATA);

  // Track initial form data for PATCH comparison
  const [initialFormData, setInitialFormData] = useState<PrefsFormData>(DEFAULT_PREFS_FORM_DATA);

  // Advanced section expanded state
  const [isAdvancedExpanded, setIsAdvancedExpanded] = useState(false);

  // Custom days input value (string for TextInput)
  const [customDaysInput, setCustomDaysInput] = useState('');

  // Saving state and feedback
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Initialize form data from fetched prefs
  useEffect(() => {
    if (prefsRow !== undefined) {
      const mappedData = toFormData(prefsRow);
      setFormData(mappedData);
      setInitialFormData(mappedData);
      setCustomDaysInput(mappedData.noRepeatDays.toString());

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
   * Saves the current preferences to the server.
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

      setIsSaving(true);
      setSaveError(null);
      setSaveSuccess(false);

      try {
        await savePrefs.mutateAsync({
          userId,
          data: newFormData,
          existingData: initialFormData,
        });

        // Track analytics event
        trackCaptureEvent('no_repeat_prefs_changed', {
          userId,
          metadata: {
            noRepeatDays: newFormData.noRepeatDays,
            noRepeatMode: newFormData.noRepeatMode,
            source: 'styling_preferences_screen',
          },
        });

        // Update initial form data for future comparisons
        setInitialFormData(newFormData);
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
        setSaveError(t('screens.stylingPreferences.errors.saveFailed'));

        // Rollback to initial form data
        setFormData(initialFormData);
        setCustomDaysInput(initialFormData.noRepeatDays.toString());

        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [userId, initialFormData, savePrefs]
  );

  /**
   * Handles preset button press.
   */
  const handlePresetPress = useCallback(
    (value: number) => {
      const newFormData = {
        ...formData,
        noRepeatDays: value,
        noRepeatWindow: null, // Clear legacy field
      };
      setFormData(newFormData);
      setCustomDaysInput(value.toString());
      saveCurrentPrefs(newFormData);
    },
    [formData, saveCurrentPrefs]
  );

  /**
   * Handles custom days input change.
   */
  const handleCustomDaysChange = useCallback((text: string) => {
    // Allow only numeric input
    const numericText = text.replace(/[^0-9]/g, '');
    setCustomDaysInput(numericText);
  }, []);

  /**
   * Handles custom days input blur (save on blur).
   */
  const handleCustomDaysBlur = useCallback(() => {
    const parsed = parseInt(customDaysInput, 10);

    if (isNaN(parsed)) {
      // Reset to current value if invalid
      setCustomDaysInput(formData.noRepeatDays.toString());
      return;
    }

    const clamped = clampNoRepeatDays(parsed);
    setCustomDaysInput(clamped.toString());

    if (clamped !== formData.noRepeatDays) {
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
          marginBottom: spacing.lg,
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
        errorText: {
          fontSize: fontSize.sm,
          color: colors.error,
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
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Feedback Messages */}
        {(saveSuccess || saveError) && (
          <View style={styles.feedbackContainer}>
            {saveSuccess && (
              <Text style={styles.successText} accessibilityLiveRegion="polite">
                {t('screens.stylingPreferences.saved')}
              </Text>
            )}
            {saveError && (
              <Text style={styles.errorText} accessibilityLiveRegion="assertive">
                {saveError}
              </Text>
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
          <Text
            style={styles.sectionDescription}
            allowFontScaling
            maxFontSizeMultiplier={1.5}
          >
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
                    style={[
                      styles.presetButtonText,
                      isSelected && styles.presetButtonTextSelected,
                    ]}
                    allowFontScaling
                    maxFontSizeMultiplier={1.5}
                  >
                    {preset.label}
                  </Text>
                  {preset.value > 0 && (
                    <Text
                      style={[
                        styles.presetLabel,
                        isSelected && styles.presetLabelSelected,
                      ]}
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
          <Text
            style={styles.advancedToggleText}
            allowFontScaling
            maxFontSizeMultiplier={1.5}
          >
            {t('screens.stylingPreferences.advanced.title')}
          </Text>
          <Text style={styles.advancedToggleArrow}>
            {isAdvancedExpanded ? '▼' : '▶'}
          </Text>
        </Pressable>

        {/* Advanced Section Content */}
        {isAdvancedExpanded && (
          <View style={styles.advancedSection}>
            {/* Custom Days Input */}
            <View style={styles.inputRow}>
              <Text
                style={styles.inputLabel}
                allowFontScaling
                maxFontSizeMultiplier={1.5}
              >
                {t('screens.stylingPreferences.advanced.customDays')}
              </Text>
              <TextInput
                style={styles.customInput}
                value={customDaysInput}
                onChangeText={handleCustomDaysChange}
                onBlur={handleCustomDaysBlur}
                keyboardType="number-pad"
                maxLength={2}
                accessibilityLabel={t('screens.stylingPreferences.advanced.customDaysLabel')}
                accessibilityHint={t('screens.stylingPreferences.advanced.customDaysHint')}
                allowFontScaling
                maxFontSizeMultiplier={1.5}
              />
              <Text
                style={styles.inputSuffix}
                allowFontScaling
                maxFontSizeMultiplier={1.5}
              >
                {t('screens.stylingPreferences.advanced.daysSuffix')}
              </Text>
            </View>
            <Text
              style={styles.inputHint}
              allowFontScaling
              maxFontSizeMultiplier={1.5}
            >
              {t('screens.stylingPreferences.advanced.rangeHint')}
            </Text>

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
                      {' '}{t('screens.stylingPreferences.mode.recommended')}
                    </Text>
                  </Text>
                  <Text
                    style={styles.modeDescription}
                    allowFontScaling
                    maxFontSizeMultiplier={1.5}
                  >
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
                  <Text
                    style={styles.modeDescription}
                    allowFontScaling
                    maxFontSizeMultiplier={1.5}
                  >
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
