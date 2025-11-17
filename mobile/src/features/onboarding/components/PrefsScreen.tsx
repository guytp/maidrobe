import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../../../core/theme';
import { t } from '../../../core/i18n';
import { OnboardingShell } from './OnboardingShell';
import { useOnboardingContext } from '../context/OnboardingContext';
import { useUserPrefs } from '../api/useUserPrefs';
import { toFormData } from '../utils/prefsMapping';
import { EXCLUSION_TAGS, DEFAULT_PREFS_FORM_DATA } from '../utils/prefsTypes';
import type { PrefsFormData, ColourTendency, ExclusionTag, NoRepeatWindow } from '../utils/prefsTypes';
import { MAX_COMFORT_NOTES_LENGTH } from '../utils/prefsValidation';
import { trackPrefsViewed } from '../utils/onboardingAnalytics';

/**
 * Style and Usage Preferences screen for onboarding flow.
 *
 * This screen collects lightweight style and usage preferences to inform
 * future outfit recommendations. It captures:
 * - Colour tendencies (single-select)
 * - Item/style exclusions (checklist + free-text)
 * - No-repeat window preference (single-select)
 * - Comfort and style notes (free-text, 500 char max)
 *
 * Features:
 * - Loads existing preferences if available
 * - Local state for responsive interactions
 * - Accessible form controls with proper labelling
 * - Dynamic text scaling support
 * - 500-character limit on comfort notes
 * - Integrates with OnboardingShell for consistent layout and navigation
 *
 * @returns Preferences screen component
 */
export function PrefsScreen(): React.JSX.Element {
  const { colors, colorScheme, spacing } = useTheme();
  const { currentStep } = useOnboardingContext();

  // Fetch existing preferences
  const { data: prefsRow, isLoading, error } = useUserPrefs();

  // Local form state
  const [formData, setFormData] = useState<PrefsFormData>(DEFAULT_PREFS_FORM_DATA);

  // Track if prefs_viewed has been fired to prevent duplicates
  const hasTrackedView = useRef(false);

  // Initialize form data from fetched prefs
  useEffect(() => {
    if (prefsRow !== undefined) {
      const mappedData = toFormData(prefsRow);
      setFormData(mappedData);
    }
  }, [prefsRow]);

  // Track prefs screen view once on mount
  useEffect(() => {
    if (!hasTrackedView.current && currentStep === 'prefs') {
      // Determine if this is a resume based on whether prefs exist
      const isResume = prefsRow !== null && prefsRow !== undefined;
      trackPrefsViewed(isResume);
      hasTrackedView.current = true;
    }
  }, [currentStep, prefsRow]);

  // Event handlers
  const handleColourTendencyChange = (tendency: ColourTendency) => {
    setFormData((prev) => ({ ...prev, colourTendency: tendency }));
  };

  const handleExclusionToggle = (tag: ExclusionTag) => {
    setFormData((prev) => {
      const checklist = prev.exclusions.checklist.includes(tag)
        ? prev.exclusions.checklist.filter((t) => t !== tag)
        : [...prev.exclusions.checklist, tag];
      return {
        ...prev,
        exclusions: { ...prev.exclusions, checklist },
      };
    });
  };

  const handleExclusionsFreeTextChange = (text: string) => {
    setFormData((prev) => ({
      ...prev,
      exclusions: { ...prev.exclusions, freeText: text },
    }));
  };

  const handleNoRepeatWindowChange = (window: NoRepeatWindow) => {
    setFormData((prev) => ({ ...prev, noRepeatWindow: window }));
  };

  const handleComfortNotesChange = (text: string) => {
    setFormData((prev) => ({ ...prev, comfortNotes: text }));
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scrollView: {
          flex: 1,
          backgroundColor: colors.background,
        },
        scrollContent: {
          flexGrow: 1,
        },
        container: {
          flex: 1,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.xl,
          paddingBottom: spacing.xl,
        },
        loadingContainer: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.background,
        },
        title: {
          fontSize: 28,
          fontWeight: 'bold',
          color: colors.textPrimary,
          marginBottom: spacing.sm,
        },
        subtitle: {
          fontSize: 16,
          color: colors.textSecondary,
          marginBottom: spacing.xl,
        },
        section: {
          marginBottom: spacing.xl,
        },
        sectionLabel: {
          fontSize: 18,
          fontWeight: '600',
          color: colors.textPrimary,
          marginBottom: spacing.md,
        },
        optionRow: {
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: 44,
          paddingVertical: spacing.sm,
        },
        radioOuter: {
          width: 24,
          height: 24,
          borderRadius: 12,
          borderWidth: 2,
          borderColor: colors.textPrimary,
          marginRight: spacing.md,
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
        checkboxOuter: {
          width: 24,
          height: 24,
          borderRadius: 4,
          borderWidth: 2,
          borderColor: colors.textPrimary,
          marginRight: spacing.md,
          alignItems: 'center',
          justifyContent: 'center',
        },
        checkboxOuterSelected: {
          backgroundColor: colors.textPrimary,
        },
        checkboxInner: {
          width: 12,
          height: 12,
          backgroundColor: colors.background,
        },
        optionText: {
          fontSize: 16,
          color: colors.textPrimary,
          flex: 1,
        },
        textInput: {
          borderWidth: 1,
          borderColor: colors.textSecondary,
          borderRadius: 8,
          padding: spacing.md,
          fontSize: 16,
          color: colors.textPrimary,
          backgroundColor: colors.background,
          minHeight: 44,
        },
        textInputMultiline: {
          minHeight: 100,
          textAlignVertical: 'top',
        },
        helperText: {
          fontSize: 14,
          color: colors.textSecondary,
          marginTop: spacing.xs,
        },
        characterCount: {
          fontSize: 12,
          color: colors.textSecondary,
          marginTop: spacing.xs,
          textAlign: 'right',
        },
      }),
    [colors, spacing]
  );

  // Show loading spinner while fetching
  if (isLoading) {
    return (
      <OnboardingShell>
        <View style={styles.loadingContainer}>
          <ActivityIndicator
            size="large"
            color={colors.textPrimary}
            accessibilityLabel={t('screens.onboarding.prefs.accessibility.loading')}
          />
        </View>
      </OnboardingShell>
    );
  }

  // Show error state if fetch failed (but still allow user to proceed)
  const showError = error && !prefsRow;

  return (
    <OnboardingShell>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        accessibilityLabel={t('screens.onboarding.prefs.accessibility.screenLabel')}
      >
        <View style={styles.container}>
          <Text
            style={styles.title}
            accessibilityRole="header"
            allowFontScaling={true}
            maxFontSizeMultiplier={3}
          >
            {t('screens.onboarding.prefs.title')}
          </Text>
          <Text
            style={styles.subtitle}
            allowFontScaling={true}
            maxFontSizeMultiplier={2}
          >
            {t('screens.onboarding.prefs.subtitle')}
          </Text>

          {showError && (
            <Text
              style={styles.helperText}
              allowFontScaling={true}
              maxFontSizeMultiplier={2}
            >
              {t('screens.onboarding.prefs.errorLoading')}
            </Text>
          )}

          {/* Section 1: Colour Tendencies */}
          <View style={styles.section}>
            <Text
              style={styles.sectionLabel}
              accessibilityRole="header"
              allowFontScaling={true}
              maxFontSizeMultiplier={2}
            >
              {t('screens.onboarding.prefs.colourTendency.label')}
            </Text>

            <Pressable
              style={styles.optionRow}
              onPress={() => handleColourTendencyChange('neutrals')}
              accessibilityRole="radio"
              accessibilityState={{ checked: formData.colourTendency === 'neutrals' }}
              accessibilityLabel={t('screens.onboarding.prefs.colourTendency.neutrals')}
            >
              <View style={[styles.radioOuter, formData.colourTendency === 'neutrals' && styles.radioOuterSelected]}>
                {formData.colourTendency === 'neutrals' && <View style={styles.radioInner} />}
              </View>
              <Text style={styles.optionText} allowFontScaling={true} maxFontSizeMultiplier={2}>
                {t('screens.onboarding.prefs.colourTendency.neutrals')}
              </Text>
            </Pressable>

            <Pressable
              style={styles.optionRow}
              onPress={() => handleColourTendencyChange('some_colour')}
              accessibilityRole="radio"
              accessibilityState={{ checked: formData.colourTendency === 'some_colour' }}
              accessibilityLabel={t('screens.onboarding.prefs.colourTendency.someColour')}
            >
              <View style={[styles.radioOuter, formData.colourTendency === 'some_colour' && styles.radioOuterSelected]}>
                {formData.colourTendency === 'some_colour' && <View style={styles.radioInner} />}
              </View>
              <Text style={styles.optionText} allowFontScaling={true} maxFontSizeMultiplier={2}>
                {t('screens.onboarding.prefs.colourTendency.someColour')}
              </Text>
            </Pressable>

            <Pressable
              style={styles.optionRow}
              onPress={() => handleColourTendencyChange('bold_colours')}
              accessibilityRole="radio"
              accessibilityState={{ checked: formData.colourTendency === 'bold_colours' }}
              accessibilityLabel={t('screens.onboarding.prefs.colourTendency.boldColours')}
            >
              <View style={[styles.radioOuter, formData.colourTendency === 'bold_colours' && styles.radioOuterSelected]}>
                {formData.colourTendency === 'bold_colours' && <View style={styles.radioInner} />}
              </View>
              <Text style={styles.optionText} allowFontScaling={true} maxFontSizeMultiplier={2}>
                {t('screens.onboarding.prefs.colourTendency.boldColours')}
              </Text>
            </Pressable>

            <Pressable
              style={styles.optionRow}
              onPress={() => handleColourTendencyChange('not_sure')}
              accessibilityRole="radio"
              accessibilityState={{ checked: formData.colourTendency === 'not_sure' }}
              accessibilityLabel={t('screens.onboarding.prefs.colourTendency.notSure')}
            >
              <View style={[styles.radioOuter, formData.colourTendency === 'not_sure' && styles.radioOuterSelected]}>
                {formData.colourTendency === 'not_sure' && <View style={styles.radioInner} />}
              </View>
              <Text style={styles.optionText} allowFontScaling={true} maxFontSizeMultiplier={2}>
                {t('screens.onboarding.prefs.colourTendency.notSure')}
              </Text>
            </Pressable>
          </View>

          {/* Section 2: Item/Style Exclusions */}
          <View style={styles.section}>
            <Text
              style={styles.sectionLabel}
              accessibilityRole="header"
              allowFontScaling={true}
              maxFontSizeMultiplier={2}
            >
              {t('screens.onboarding.prefs.exclusions.label')}
            </Text>

            {EXCLUSION_TAGS.map((tag) => {
              const isChecked = formData.exclusions.checklist.includes(tag);
              return (
                <Pressable
                  key={tag}
                  style={styles.optionRow}
                  onPress={() => handleExclusionToggle(tag)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isChecked }}
                  accessibilityLabel={t(`screens.onboarding.prefs.exclusions.${tag}`)}
                >
                  <View style={[styles.checkboxOuter, isChecked && styles.checkboxOuterSelected]}>
                    {isChecked && <View style={styles.checkboxInner} />}
                  </View>
                  <Text style={styles.optionText} allowFontScaling={true} maxFontSizeMultiplier={2}>
                    {t(`screens.onboarding.prefs.exclusions.${tag}`)}
                  </Text>
                </Pressable>
              );
            })}

            <Text
              style={[styles.sectionLabel, { marginTop: spacing.md }]}
              allowFontScaling={true}
              maxFontSizeMultiplier={2}
            >
              {t('screens.onboarding.prefs.exclusions.freeTextLabel')}
            </Text>
            <TextInput
              style={[styles.textInput, styles.textInputMultiline]}
              value={formData.exclusions.freeText}
              onChangeText={handleExclusionsFreeTextChange}
              placeholder={t('screens.onboarding.prefs.exclusions.freeTextPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              multiline={true}
              numberOfLines={3}
              accessibilityLabel={t('screens.onboarding.prefs.exclusions.freeTextLabel')}
              accessibilityHint={t('screens.onboarding.prefs.exclusions.freeTextHint')}
              allowFontScaling={true}
              maxFontSizeMultiplier={2}
            />
          </View>

          {/* Section 3: No-Repeat Window */}
          <View style={styles.section}>
            <Text
              style={styles.sectionLabel}
              accessibilityRole="header"
              allowFontScaling={true}
              maxFontSizeMultiplier={2}
            >
              {t('screens.onboarding.prefs.noRepeat.label')}
            </Text>

            <Pressable
              style={styles.optionRow}
              onPress={() => handleNoRepeatWindowChange(0)}
              accessibilityRole="radio"
              accessibilityState={{ checked: formData.noRepeatWindow === 0 }}
              accessibilityLabel={t('screens.onboarding.prefs.noRepeat.okayWithRepeats')}
            >
              <View style={[styles.radioOuter, formData.noRepeatWindow === 0 && styles.radioOuterSelected]}>
                {formData.noRepeatWindow === 0 && <View style={styles.radioInner} />}
              </View>
              <Text style={styles.optionText} allowFontScaling={true} maxFontSizeMultiplier={2}>
                {t('screens.onboarding.prefs.noRepeat.okayWithRepeats')}
              </Text>
            </Pressable>

            <Pressable
              style={styles.optionRow}
              onPress={() => handleNoRepeatWindowChange(7)}
              accessibilityRole="radio"
              accessibilityState={{ checked: formData.noRepeatWindow === 7 }}
              accessibilityLabel={t('screens.onboarding.prefs.noRepeat.oneWeek')}
            >
              <View style={[styles.radioOuter, formData.noRepeatWindow === 7 && styles.radioOuterSelected]}>
                {formData.noRepeatWindow === 7 && <View style={styles.radioInner} />}
              </View>
              <Text style={styles.optionText} allowFontScaling={true} maxFontSizeMultiplier={2}>
                {t('screens.onboarding.prefs.noRepeat.oneWeek')}
              </Text>
            </Pressable>

            <Pressable
              style={styles.optionRow}
              onPress={() => handleNoRepeatWindowChange(14)}
              accessibilityRole="radio"
              accessibilityState={{ checked: formData.noRepeatWindow === 14 }}
              accessibilityLabel={t('screens.onboarding.prefs.noRepeat.twoWeeks')}
            >
              <View style={[styles.radioOuter, formData.noRepeatWindow === 14 && styles.radioOuterSelected]}>
                {formData.noRepeatWindow === 14 && <View style={styles.radioInner} />}
              </View>
              <Text style={styles.optionText} allowFontScaling={true} maxFontSizeMultiplier={2}>
                {t('screens.onboarding.prefs.noRepeat.twoWeeks')}
              </Text>
            </Pressable>
          </View>

          {/* Section 4: Comfort/Style Notes */}
          <View style={styles.section}>
            <Text
              style={styles.sectionLabel}
              accessibilityRole="header"
              allowFontScaling={true}
              maxFontSizeMultiplier={2}
            >
              {t('screens.onboarding.prefs.comfortNotes.label')}
            </Text>
            <TextInput
              style={[styles.textInput, styles.textInputMultiline]}
              value={formData.comfortNotes}
              onChangeText={handleComfortNotesChange}
              placeholder={t('screens.onboarding.prefs.comfortNotes.placeholder')}
              placeholderTextColor={colors.textSecondary}
              multiline={true}
              numberOfLines={4}
              maxLength={MAX_COMFORT_NOTES_LENGTH}
              accessibilityLabel={t('screens.onboarding.prefs.comfortNotes.label')}
              accessibilityHint={t('screens.onboarding.prefs.comfortNotes.hint')}
              allowFontScaling={true}
              maxFontSizeMultiplier={2}
            />
            <Text style={styles.characterCount} allowFontScaling={true} maxFontSizeMultiplier={1.5}>
              {formData.comfortNotes.length} / {MAX_COMFORT_NOTES_LENGTH}
            </Text>
          </View>
        </View>

        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </ScrollView>
    </OnboardingShell>
  );
}
