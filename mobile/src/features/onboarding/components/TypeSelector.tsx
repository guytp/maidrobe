import React, { useMemo } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { ItemType } from '../types/itemMetadata';

/**
 * Type selector component props.
 */
export interface TypeSelectorProps {
  /** Currently selected type */
  value: ItemType | null;
  /** Handler for type selection */
  onChange: (type: ItemType) => void;
  /** Error message to display */
  error?: string | null;
}

/**
 * Type selector component for wardrobe item type selection.
 *
 * Displays a grid of type options (Top, Bottom, Dress, Outerwear, Shoes,
 * Accessories, Other) as pressable buttons. Uses the shared Button pattern
 * but implements custom layout for grid display.
 *
 * Features:
 * - Grid layout with 2 columns
 * - Visual selection state (highlighted when selected)
 * - WCAG AA compliant touch targets (44x44 minimum)
 * - Accessibility support with proper labels and hints
 * - Error state display
 * - i18n for all labels
 *
 * @param props - Component props
 * @returns Type selector component
 */
export function TypeSelector({ value, onChange, error }: TypeSelectorProps): React.JSX.Element {
  const { colors, spacing, radius } = useTheme();

  const types: ItemType[] = [
    ItemType.Top,
    ItemType.Bottom,
    ItemType.Dress,
    ItemType.Outerwear,
    ItemType.Shoes,
    ItemType.Accessories,
    ItemType.Other,
  ];

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
        gridContainer: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: spacing.sm,
        },
        typeButton: {
          flex: 1,
          minWidth: '47%',
          maxWidth: '47%',
          minHeight: 44,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
          borderRadius: radius.md,
          borderWidth: 2,
          borderColor: colors.textSecondary,
          backgroundColor: 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        },
        typeButtonSelected: {
          borderColor: colors.textPrimary,
          backgroundColor: colors.textPrimary,
        },
        typeButtonText: {
          fontSize: 16,
          fontWeight: '600',
          color: colors.textPrimary,
        },
        typeButtonTextSelected: {
          color: colors.background,
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
        {t('screens.onboarding.firstItem.metadata.typeLabel')}
        <Text style={styles.required}> *</Text>
      </Text>

      <Text style={styles.helper} allowFontScaling={true} maxFontSizeMultiplier={2}>
        {t('screens.onboarding.firstItem.metadata.typeHelper')}
      </Text>

      <View
        style={styles.gridContainer}
        accessibilityLabel={t('screens.onboarding.firstItem.accessibility.typeSelector')}
        accessibilityHint={t('screens.onboarding.firstItem.accessibility.typeSelectorHint')}
      >
        {types.map((type) => {
          const isSelected = value === type;
          const typeLabel = t(`screens.auth.itemTypes.${type}`);

          return (
            <Pressable
              key={type}
              style={[styles.typeButton, isSelected && styles.typeButtonSelected]}
              onPress={() => onChange(type)}
              accessibilityRole="button"
              accessibilityLabel={typeLabel}
              accessibilityHint={`Select ${typeLabel} as item type`}
              accessibilityState={{ selected: isSelected }}
            >
              <Text
                style={[styles.typeButtonText, isSelected && styles.typeButtonTextSelected]}
                allowFontScaling={true}
                maxFontSizeMultiplier={2}
              >
                {typeLabel}
              </Text>
            </Pressable>
          );
        })}
      </View>

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
