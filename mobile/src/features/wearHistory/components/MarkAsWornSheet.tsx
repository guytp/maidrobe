/**
 * Mark As Worn bottom sheet component.
 *
 * Provides a modal interface for marking an outfit as worn with:
 * - Quick date selection (Today, Yesterday)
 * - Date picker for dates within the last 30 days
 * - Optional free-text context/occasion input
 * - Submit and Cancel actions
 *
 * ACCESSIBILITY:
 * - Proper focus management when sheet opens
 * - Screen reader announcements for date selection
 * - Keyboard-accessible input fields
 * - WCAG AA compliant touch targets
 *
 * @module features/wearHistory/components/MarkAsWornSheet
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../core/theme';
import { t } from '../../../core/i18n';
import { Button } from '../../../core/components/Button';
import { getTodayDateString, validateWearDate } from '../api/wearHistoryClient';

// ============================================================================
// Types
// ============================================================================

/**
 * Props for MarkAsWornSheet component.
 */
export interface MarkAsWornSheetProps {
  /** Whether the sheet is visible */
  visible: boolean;
  /** Callback when sheet is closed (cancelled) */
  onClose: () => void;
  /** Callback when user submits with selected date and optional context */
  onSubmit: (date: string, context?: string) => void;
  /** Whether a mutation is in progress */
  isPending?: boolean;
  /** Optional test ID for testing */
  testID?: string;
  /** Optional initial value for the context field (e.g., from previous wear event) */
  initialContext?: string;
}

/**
 * Date option for the picker.
 */
interface DateOption {
  /** Date string in YYYY-MM-DD format */
  date: string;
  /** Human-readable label for display */
  label: string;
  /** Whether this is a quick option (Today/Yesterday) */
  isQuickOption: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/** Maximum context input length */
const MAX_CONTEXT_LENGTH = 200;

/** Number of days back to allow for date selection */
const MAX_DAYS_BACK = 30;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Formats a Date object to YYYY-MM-DD string.
 *
 * @param date - Date to format
 * @returns Date string in YYYY-MM-DD format
 */
function formatDateToString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats a date for display using the device's locale.
 *
 * Uses `undefined` as the locale to leverage the JavaScript Intl API's
 * automatic locale detection, which uses the device's language settings.
 * This ensures dates are displayed in the user's preferred format and
 * supports RTL languages correctly.
 *
 * @param date - Date to format
 * @returns Locale-appropriate date string (e.g., "Dec 3", "3 déc.", "3 ديس")
 */
function formatDisplayDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Generates date options for the last 30 days.
 *
 * @returns Array of date options with labels
 */
function generateDateOptions(): DateOption[] {
  const options: DateOption[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i <= MAX_DAYS_BACK; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const dateString = formatDateToString(date);

    let label: string;
    let isQuickOption = false;

    if (i === 0) {
      label = t('screens.wearHistory.markAsWornSheet.today');
      isQuickOption = true;
    } else if (i === 1) {
      label = t('screens.wearHistory.markAsWornSheet.yesterday');
      isQuickOption = true;
    } else {
      label = formatDisplayDate(date);
    }

    options.push({ date: dateString, label, isQuickOption });
  }

  return options;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Mark As Worn bottom sheet.
 *
 * Displays a modal with date selection and context input for marking
 * an outfit as worn. Supports quick options (Today, Yesterday) and
 * a scrollable list of dates for the last 30 days.
 *
 * @param props - Component props
 * @returns Modal component
 */
export function MarkAsWornSheet({
  visible,
  onClose,
  onSubmit,
  isPending = false,
  testID = 'mark-as-worn-sheet',
  initialContext,
}: MarkAsWornSheetProps): React.JSX.Element {
  const { colors, spacing, radius, fontSize } = useTheme();
  const insets = useSafeAreaInsets();

  // State - context initializes from prop when provided
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString());
  const [context, setContext] = useState<string>(initialContext ?? '');

  // Sync state when initialContext prop changes (e.g., different outfit selected)
  // Reset both context and selectedDate to ensure predictable defaults for each outfit
  useEffect(() => {
    setContext(initialContext ?? '');
    setSelectedDate(getTodayDateString());
  }, [initialContext]);

  // Generate date options
  const dateOptions = useMemo(() => generateDateOptions(), []);

  // Quick options (Today, Yesterday)
  const quickOptions = useMemo(() => dateOptions.filter((opt) => opt.isQuickOption), [dateOptions]);

  // Other date options
  const otherOptions = useMemo(
    () => dateOptions.filter((opt) => !opt.isQuickOption),
    [dateOptions]
  );

  // Styles
  const styles = useMemo(
    () =>
      StyleSheet.create({
        overlay: {
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          justifyContent: 'flex-end',
        },
        sheet: {
          backgroundColor: colors.background,
          borderTopLeftRadius: radius.lg,
          borderTopRightRadius: radius.lg,
          paddingTop: spacing.lg,
          paddingBottom: insets.bottom + spacing.lg,
          maxHeight: '80%',
        },
        header: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: spacing.lg,
          marginBottom: spacing.md,
        },
        title: {
          fontSize: fontSize.xl,
          fontWeight: '600',
          color: colors.textPrimary,
        },
        closeButton: {
          padding: spacing.xs,
        },
        closeButtonText: {
          fontSize: fontSize.lg,
          color: colors.textSecondary,
        },
        section: {
          paddingHorizontal: spacing.lg,
          marginBottom: spacing.lg,
        },
        sectionLabel: {
          fontSize: fontSize.sm,
          fontWeight: '600',
          color: colors.textSecondary,
          marginBottom: spacing.sm,
        },
        quickOptionsRow: {
          flexDirection: 'row',
          gap: spacing.sm,
        },
        quickOption: {
          flex: 1,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.md,
          borderRadius: radius.md,
          borderWidth: 2,
          borderColor: colors.textSecondary + '30',
          alignItems: 'center',
          minHeight: 44,
          justifyContent: 'center',
        },
        quickOptionSelected: {
          borderColor: colors.textPrimary,
          backgroundColor: colors.textPrimary + '10',
        },
        quickOptionText: {
          fontSize: fontSize.base,
          fontWeight: '500',
          color: colors.textPrimary,
        },
        quickOptionTextSelected: {
          fontWeight: '600',
        },
        dateList: {
          maxHeight: 200,
        },
        dateListContent: {
          paddingHorizontal: spacing.lg,
          gap: spacing.xs,
        },
        dateOption: {
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          borderRadius: radius.sm,
          minHeight: 44,
          justifyContent: 'center',
        },
        dateOptionSelected: {
          backgroundColor: colors.textPrimary + '10',
        },
        dateOptionText: {
          fontSize: fontSize.base,
          color: colors.textPrimary,
        },
        dateOptionTextSelected: {
          fontWeight: '600',
        },
        contextInput: {
          borderWidth: 1,
          borderColor: colors.textSecondary + '30',
          borderRadius: radius.md,
          padding: spacing.md,
          fontSize: fontSize.base,
          color: colors.textPrimary,
          minHeight: 80,
          textAlignVertical: 'top',
        },
        contextHint: {
          fontSize: fontSize.xs,
          color: colors.textSecondary,
          marginTop: spacing.xs,
          textAlign: 'right',
        },
        buttonRow: {
          flexDirection: 'row',
          gap: spacing.md,
          paddingHorizontal: spacing.lg,
          marginTop: spacing.md,
        },
        buttonFlex: {
          flex: 1,
        },
        pickDateLabel: {
          fontSize: fontSize.sm,
          fontWeight: '600',
          color: colors.textSecondary,
          paddingHorizontal: spacing.lg,
          marginBottom: spacing.sm,
          marginTop: spacing.md,
        },
      }),
    [colors, spacing, radius, fontSize, insets.bottom]
  );

  // Handlers
  const handleDateSelect = useCallback((date: string) => {
    setSelectedDate(date);
  }, []);

  const handleContextChange = useCallback((text: string) => {
    if (text.length <= MAX_CONTEXT_LENGTH) {
      setContext(text);
    }
  }, []);

  const handleSubmit = useCallback(() => {
    // Validate date before submitting
    const validation = validateWearDate(selectedDate);
    if (!validation.isValid) {
      // Date validation failed - this shouldn't happen with our constrained picker
      return;
    }

    onSubmit(selectedDate, context.trim() || undefined);
  }, [selectedDate, context, onSubmit]);

  const handleClose = useCallback(() => {
    // Reset state when closing - restore to initial values
    setSelectedDate(getTodayDateString());
    setContext(initialContext ?? '');
    onClose();
  }, [onClose, initialContext]);

  // Render quick option button
  const renderQuickOption = useCallback(
    (option: DateOption) => {
      const isSelected = selectedDate === option.date;
      return (
        <Pressable
          key={option.date}
          style={[styles.quickOption, isSelected && styles.quickOptionSelected]}
          onPress={() => handleDateSelect(option.date)}
          accessibilityRole="button"
          accessibilityState={{ selected: isSelected }}
          accessibilityLabel={option.label}
          testID={`${testID}-quick-${option.date}`}
        >
          <Text
            style={[styles.quickOptionText, isSelected && styles.quickOptionTextSelected]}
            allowFontScaling={true}
            maxFontSizeMultiplier={1.5}
          >
            {option.label}
          </Text>
        </Pressable>
      );
    },
    [selectedDate, styles, handleDateSelect, testID]
  );

  // Render date option in list
  const renderDateOption = useCallback(
    (option: DateOption) => {
      const isSelected = selectedDate === option.date;
      return (
        <Pressable
          key={option.date}
          style={[styles.dateOption, isSelected && styles.dateOptionSelected]}
          onPress={() => handleDateSelect(option.date)}
          accessibilityRole="button"
          accessibilityState={{ selected: isSelected }}
          accessibilityLabel={option.label}
          testID={`${testID}-date-${option.date}`}
        >
          <Text
            style={[styles.dateOptionText, isSelected && styles.dateOptionTextSelected]}
            allowFontScaling={true}
            maxFontSizeMultiplier={1.5}
          >
            {option.label}
          </Text>
        </Pressable>
      );
    },
    [selectedDate, styles, handleDateSelect, testID]
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
      testID={testID}
    >
      <Pressable
        style={styles.overlay}
        onPress={handleClose}
        accessibilityLabel={t('screens.wearHistory.markAsWornSheet.cancel')}
        accessibilityHint="Tap to close without saving"
      >
        <Pressable
          style={styles.sheet}
          onPress={(e) => e.stopPropagation()}
          accessibilityViewIsModal={true}
          testID={`${testID}-content`}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text
              style={styles.title}
              accessibilityRole="header"
              allowFontScaling={true}
              maxFontSizeMultiplier={1.5}
            >
              {t('screens.wearHistory.markAsWornSheet.title')}
            </Text>
            <Pressable
              style={styles.closeButton}
              onPress={handleClose}
              accessibilityRole="button"
              accessibilityLabel={t('screens.wearHistory.markAsWornSheet.cancel')}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              testID={`${testID}-close`}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </Pressable>
          </View>

          {/* Date Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel} allowFontScaling={true} maxFontSizeMultiplier={1.5}>
              {t('screens.wearHistory.markAsWornSheet.dateLabel')}
            </Text>
            <View style={styles.quickOptionsRow}>{quickOptions.map(renderQuickOption)}</View>
          </View>

          {/* Pick a Date Section */}
          <Text style={styles.pickDateLabel} allowFontScaling={true} maxFontSizeMultiplier={1.5}>
            {t('screens.wearHistory.markAsWornSheet.pickDate')}
          </Text>
          <ScrollView
            style={styles.dateList}
            contentContainerStyle={styles.dateListContent}
            showsVerticalScrollIndicator={true}
            accessibilityRole="list"
            accessibilityLabel={t('screens.wearHistory.accessibility.datePickerLabel')}
            testID={`${testID}-date-list`}
          >
            {otherOptions.map(renderDateOption)}
          </ScrollView>

          {/* Context Input */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel} allowFontScaling={true} maxFontSizeMultiplier={1.5}>
              {t('screens.wearHistory.markAsWornSheet.contextLabel')}
            </Text>
            <TextInput
              style={styles.contextInput}
              value={context}
              onChangeText={handleContextChange}
              placeholder={t('screens.wearHistory.markAsWornSheet.contextPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              multiline={true}
              maxLength={MAX_CONTEXT_LENGTH}
              accessibilityLabel={t('screens.wearHistory.accessibility.contextInputLabel')}
              testID={`${testID}-context-input`}
            />
            <Text style={styles.contextHint} allowFontScaling={true} maxFontSizeMultiplier={1.5}>
              {context.length}/{MAX_CONTEXT_LENGTH}
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonRow}>
            <View style={styles.buttonFlex}>
              <Button
                onPress={handleClose}
                variant="secondary"
                disabled={isPending}
                accessibilityHint="Cancel and close without marking"
              >
                {t('screens.wearHistory.markAsWornSheet.cancel')}
              </Button>
            </View>
            <View style={styles.buttonFlex}>
              <Button
                onPress={handleSubmit}
                variant="primary"
                loading={isPending}
                disabled={isPending}
                accessibilityHint="Mark outfit as worn for the selected date"
              >
                {t('screens.wearHistory.markAsWornSheet.submit')}
              </Button>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
