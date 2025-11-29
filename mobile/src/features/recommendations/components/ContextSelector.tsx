import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import {
  OccasionKey,
  TemperatureBandKey,
  OCCASION_OPTIONS,
  TEMPERATURE_BAND_OPTIONS,
} from '../types';

/**
 * Props for the ContextSelector component.
 */
export interface ContextSelectorProps {
  /** Currently selected occasion */
  occasion: OccasionKey;
  /** Currently selected temperature band */
  temperatureBand: TemperatureBandKey;
  /** Handler called when occasion selection changes */
  onOccasionChange: (occasion: OccasionKey) => void;
  /** Handler called when temperature band selection changes */
  onTemperatureBandChange: (temperatureBand: TemperatureBandKey) => void;
  /** Whether the selector is disabled (e.g., during loading) */
  disabled?: boolean;
}

/**
 * Context selector component for outfit recommendations.
 *
 * Displays two horizontal scrollable rows of pill-style buttons for selecting
 * occasion and temperature band context. Used on the Home screen to capture
 * user intent before requesting outfit recommendations.
 *
 * Features:
 * - Horizontal scrollable pills for compact display on small screens
 * - Immediate visual feedback on selection
 * - WCAG AA compliant touch targets (44px minimum height)
 * - Full accessibility support with proper roles, labels, and hints
 * - Disabled state during loading
 * - i18n for all labels
 *
 * @example
 * ```tsx
 * <ContextSelector
 *   occasion="everyday"
 *   temperatureBand="auto"
 *   onOccasionChange={(occasion) => setOccasion(occasion)}
 *   onTemperatureBandChange={(temp) => setTemperatureBand(temp)}
 *   disabled={isLoading}
 * />
 * ```
 */
export function ContextSelector({
  occasion,
  temperatureBand,
  onOccasionChange,
  onTemperatureBandChange,
  disabled = false,
}: ContextSelectorProps): React.JSX.Element {
  const { colors, spacing, radius, fontSize } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          marginBottom: spacing.md,
        },
        selectorRow: {
          marginBottom: spacing.sm,
        },
        selectorLabel: {
          fontSize: fontSize.xs,
          fontWeight: '600',
          color: colors.textSecondary,
          marginBottom: spacing.xs,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        },
        pillsScrollView: {
          flexGrow: 0,
        },
        pillsContainer: {
          flexDirection: 'row',
          gap: spacing.sm,
          paddingRight: spacing.md,
        },
        pill: {
          minHeight: 44,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderRadius: radius.lg,
          borderWidth: 1.5,
          borderColor: colors.textSecondary,
          backgroundColor: 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        },
        pillSelected: {
          borderColor: colors.textPrimary,
          backgroundColor: colors.textPrimary,
        },
        pillDisabled: {
          opacity: 0.5,
        },
        pillText: {
          fontSize: fontSize.sm,
          fontWeight: '500',
          color: colors.textPrimary,
        },
        pillTextSelected: {
          color: colors.background,
        },
      }),
    [colors, spacing, radius, fontSize]
  );

  /**
   * Gets the translated label for an occasion key.
   */
  const getOccasionLabel = (key: OccasionKey): string => {
    return t(`screens.home.contextSelector.occasions.${key}`);
  };

  /**
   * Gets the translated label for a temperature band key.
   */
  const getTemperatureLabel = (key: TemperatureBandKey): string => {
    return t(`screens.home.contextSelector.temperatures.${key}`);
  };

  return (
    <View style={styles.container}>
      {/* Occasion Selector */}
      <View
        style={styles.selectorRow}
        accessibilityLabel={t('screens.home.contextSelector.accessibility.occasionSelector')}
        accessibilityHint={t('screens.home.contextSelector.accessibility.occasionSelectorHint')}
      >
        <Text style={styles.selectorLabel} allowFontScaling={true} maxFontSizeMultiplier={2}>
          {t('screens.home.contextSelector.occasionLabel')}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pillsScrollView}
          contentContainerStyle={styles.pillsContainer}
        >
          {OCCASION_OPTIONS.map((optionKey) => {
            const isSelected = occasion === optionKey;
            const label = getOccasionLabel(optionKey);

            return (
              <Pressable
                key={optionKey}
                style={[
                  styles.pill,
                  isSelected && styles.pillSelected,
                  disabled && styles.pillDisabled,
                ]}
                onPress={() => onOccasionChange(optionKey)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityHint={t(
                  'screens.home.contextSelector.accessibility.selectOccasion'
                ).replace('{label}', label)}
                accessibilityState={{ selected: isSelected, disabled }}
              >
                <Text
                  style={[styles.pillText, isSelected && styles.pillTextSelected]}
                  allowFontScaling={true}
                  maxFontSizeMultiplier={2}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Temperature Band Selector */}
      <View
        style={styles.selectorRow}
        accessibilityLabel={t('screens.home.contextSelector.accessibility.temperatureSelector')}
        accessibilityHint={t('screens.home.contextSelector.accessibility.temperatureSelectorHint')}
      >
        <Text style={styles.selectorLabel} allowFontScaling={true} maxFontSizeMultiplier={2}>
          {t('screens.home.contextSelector.temperatureLabel')}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pillsScrollView}
          contentContainerStyle={styles.pillsContainer}
        >
          {TEMPERATURE_BAND_OPTIONS.map((optionKey) => {
            const isSelected = temperatureBand === optionKey;
            const label = getTemperatureLabel(optionKey);

            return (
              <Pressable
                key={optionKey}
                style={[
                  styles.pill,
                  isSelected && styles.pillSelected,
                  disabled && styles.pillDisabled,
                ]}
                onPress={() => onTemperatureBandChange(optionKey)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityHint={t(
                  'screens.home.contextSelector.accessibility.selectTemperature'
                ).replace('{label}', label)}
                accessibilityState={{ selected: isSelected, disabled }}
              >
                <Text
                  style={[styles.pillText, isSelected && styles.pillTextSelected]}
                  allowFontScaling={true}
                  maxFontSizeMultiplier={2}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}
