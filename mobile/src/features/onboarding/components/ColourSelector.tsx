import React, { useMemo } from 'react';
import { StyleSheet, Text, View, Pressable, ScrollView } from 'react-native';
import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { WARDROBE_COLOUR_PALETTE } from '../types/itemMetadata';

/**
 * Colour selector component props.
 */
export interface ColourSelectorProps {
  /** Currently selected colour ID */
  value: string | null;
  /** Handler for colour selection */
  onChange: (colourId: string) => void;
  /** Error message to display */
  error?: string | null;
}

/**
 * Colour selector component for wardrobe item colour selection.
 *
 * Displays the canonical wardrobe colour palette as a grid of swatches.
 * Each swatch shows the colour visually with its name below, ensuring
 * accessibility for users who cannot distinguish colours.
 *
 * Features:
 * - Grid layout with 4 swatches per row
 * - Visual colour swatches (40x40 rounded squares)
 * - Colour name labels below each swatch
 * - Selection indicator (border highlight)
 * - WCAG AA compliant touch targets (44x44 minimum)
 * - Does not rely on colour alone (includes labels)
 * - Accessibility support with proper labels and hints
 * - Error state display
 * - i18n for all labels
 *
 * @param props - Component props
 * @returns Colour selector component
 */
export function ColourSelector({
  value,
  onChange,
  error,
}: ColourSelectorProps): React.JSX.Element {
  const { colors, spacing, radius } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          marginBottom: spacing.lg,
        },
        label: {
          fontSize: 16,
          fontWeight: '600',
          color: colors.textPrimary,
          marginBottom: spacing.sm,
        },
        required: {
          color: colors.error,
        },
        helper: {
          fontSize: 14,
          color: colors.textSecondary,
          marginBottom: spacing.md,
        },
        scrollContainer: {
          maxHeight: 300,
        },
        gridContainer: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: spacing.md,
        },
        swatchButton: {
          width: 64,
          alignItems: 'center',
          justifyContent: 'flex-start',
          minHeight: 44,
        },
        swatchCircle: {
          width: 40,
          height: 40,
          borderRadius: 20,
          borderWidth: 2,
          borderColor: 'transparent',
          marginBottom: spacing.xs,
        },
        swatchCircleSelected: {
          borderColor: colors.textPrimary,
          borderWidth: 3,
        },
        swatchCircleWhite: {
          borderColor: colors.textSecondary,
        },
        swatchLabel: {
          fontSize: 12,
          color: colors.textSecondary,
          textAlign: 'center',
        },
        swatchLabelSelected: {
          fontWeight: '600',
          color: colors.textPrimary,
        },
        errorText: {
          color: colors.error,
          fontSize: 14,
          marginTop: spacing.xs,
        },
      }),
    [colors, spacing, radius]
  );

  return (
    <View style={styles.container}>
      <Text
        style={styles.label}
        accessibilityRole="header"
        allowFontScaling={true}
        maxFontSizeMultiplier={2}
      >
        {t('screens.onboarding.firstItem.metadata.colourLabel')}
        <Text style={styles.required}> *</Text>
      </Text>

      <Text
        style={styles.helper}
        allowFontScaling={true}
        maxFontSizeMultiplier={2}
      >
        {t('screens.onboarding.firstItem.metadata.colourHelper')}
      </Text>

      <ScrollView
        style={styles.scrollContainer}
        showsVerticalScrollIndicator={true}
        accessibilityLabel={t('screens.onboarding.firstItem.accessibility.colourSelector')}
        accessibilityHint={t('screens.onboarding.firstItem.accessibility.colourSelectorHint')}
      >
        <View style={styles.gridContainer}>
          {WARDROBE_COLOUR_PALETTE.map((colour) => {
            const isSelected = value === colour.id;
            const colourLabel = t(colour.name);

            return (
              <Pressable
                key={colour.id}
                style={styles.swatchButton}
                onPress={() => onChange(colour.id)}
                accessibilityRole="button"
                accessibilityLabel={`${colourLabel} colour swatch`}
                accessibilityHint={t('screens.onboarding.firstItem.accessibility.colourSwatchHint')}
                accessibilityState={{ selected: isSelected }}
              >
                <View
                  style={[
                    styles.swatchCircle,
                    { backgroundColor: colour.hex },
                    isSelected && styles.swatchCircleSelected,
                    colour.id === 'white' && !isSelected && styles.swatchCircleWhite,
                  ]}
                />
                <Text
                  style={[
                    styles.swatchLabel,
                    isSelected && styles.swatchLabelSelected,
                  ]}
                  allowFontScaling={true}
                  maxFontSizeMultiplier={2}
                  numberOfLines={1}
                >
                  {colourLabel}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {error && (
        <Text
          style={styles.errorText}
          accessibilityRole="alert"
          allowFontScaling={true}
          maxFontSizeMultiplier={2}
        >
          {error}
        </Text>
      )}
    </View>
  );
}
