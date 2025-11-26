/**
 * Search header component for wardrobe screen.
 *
 * Renders a search input with clear button for filtering wardrobe items.
 * Used as a sticky header in the wardrobe grid FlatList.
 *
 * @module features/wardrobe/components/SearchHeader
 */

import React, { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';

/**
 * Content horizontal padding (matches parent screen).
 */
const CONTENT_PADDING = 16;

/**
 * Props for SearchHeader component.
 */
export interface SearchHeaderProps {
  /**
   * Current search query value.
   */
  value: string;

  /**
   * Callback when search text changes.
   */
  onChangeText: (text: string) => void;

  /**
   * Callback when clear button is pressed.
   */
  onClear: () => void;
}

/**
 * Search header with text input and clear button.
 *
 * Features:
 * - Text input with placeholder
 * - Clear button (X) shown when input has text
 * - Focus state styling
 * - WCAG AA touch targets (44px)
 * - Full accessibility support
 *
 * @param props - Component props
 * @returns Search header component
 */
function SearchHeaderComponent({
  value,
  onChangeText,
  onClear,
}: SearchHeaderProps): React.JSX.Element {
  const { colors, spacing, fontSize, radius } = useTheme();
  const [isFocused, setIsFocused] = useState(false);

  const styles = StyleSheet.create({
    container: {
      paddingHorizontal: CONTENT_PADDING,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
      backgroundColor: colors.background,
    },
    inputContainer: {
      position: 'relative',
      flexDirection: 'row',
      alignItems: 'center',
    },
    input: {
      flex: 1,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: isFocused ? colors.textPrimary : colors.textSecondary + '40',
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      paddingRight: 44, // Space for clear button
      fontSize: fontSize.base,
      color: colors.textPrimary,
      minHeight: 44,
    },
    clearButton: {
      position: 'absolute',
      right: 0,
      top: 0,
      bottom: 0,
      width: 44,
      justifyContent: 'center',
      alignItems: 'center',
    },
    clearButtonText: {
      fontSize: fontSize.lg,
      color: colors.textSecondary,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder={t('screens.wardrobe.search.placeholder')}
          placeholderTextColor={colors.textSecondary}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={t('screens.wardrobe.accessibility.searchInput')}
          accessibilityHint={t('screens.wardrobe.accessibility.searchInputHint')}
        />
        {value.length > 0 && (
          <Pressable
            style={styles.clearButton}
            onPress={onClear}
            accessibilityLabel={t('screens.wardrobe.accessibility.clearSearchButton')}
            accessibilityHint={t('screens.wardrobe.accessibility.clearSearchHint')}
            accessibilityRole="button"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.clearButtonText}>✕</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/**
 * Memoized search header component.
 *
 * Memoization prevents unnecessary re-renders when parent component
 * updates but search props haven't changed.
 */
export const SearchHeader = memo(SearchHeaderComponent);
