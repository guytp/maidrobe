import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, ActivityIndicator } from 'react-native';
import { useTheme } from '../theme';

/**
 * Button variant types.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'text';

/**
 * Button component props.
 */
export interface ButtonProps {
  /** Button text label */
  children: string;
  /** Press handler */
  onPress: () => void;
  /** Visual variant */
  variant?: ButtonVariant;
  /** Disabled state */
  disabled?: boolean;
  /** Loading state */
  loading?: boolean;
  /** Accessibility label (defaults to children) */
  accessibilityLabel?: string;
  /** Accessibility hint */
  accessibilityHint?: string;
}

/**
 * Reusable button component with accessibility support.
 *
 * Provides three visual variants:
 * - primary: Filled button with background color (default)
 * - secondary: Outlined button with border
 * - text: Plain text button without background or border
 *
 * Features:
 * - WCAG AA compliant (minimum 44x44 touch target)
 * - Theme integration
 * - Loading state support
 * - Disabled state support
 * - Proper accessibility labels and roles
 * - Font scaling support
 *
 * @param props - Button props
 * @returns Button component
 *
 * @example
 * <Button onPress={handleNext}>Next</Button>
 * <Button onPress={handleSkip} variant="text">Skip</Button>
 */
export function Button({
  children,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  accessibilityLabel,
  accessibilityHint,
}: ButtonProps): React.JSX.Element {
  const { colors } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        button: {
          minHeight: 44,
          minWidth: 44,
          paddingHorizontal: 24,
          paddingVertical: 12,
          borderRadius: 8,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
        },
        primary: {
          backgroundColor: colors.textPrimary,
        },
        secondary: {
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderColor: colors.textPrimary,
        },
        text: {
          backgroundColor: 'transparent',
          paddingHorizontal: 12,
        },
        disabled: {
          opacity: 0.5,
        },
        buttonText: {
          fontSize: 16,
          fontWeight: '600',
        },
        primaryText: {
          color: colors.background,
        },
        secondaryText: {
          color: colors.textPrimary,
        },
        textText: {
          color: colors.textSecondary,
        },
      }),
    [colors]
  );

  const buttonStyle = [
    styles.button,
    variant === 'primary' && styles.primary,
    variant === 'secondary' && styles.secondary,
    variant === 'text' && styles.text,
    (disabled || loading) && styles.disabled,
  ];

  const textStyle = [
    styles.buttonText,
    variant === 'primary' && styles.primaryText,
    variant === 'secondary' && styles.secondaryText,
    variant === 'text' && styles.textText,
  ];

  return (
    <Pressable
      style={buttonStyle}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || children}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || loading }}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? colors.background : colors.textPrimary}
        />
      ) : (
        <Text
          style={textStyle}
          allowFontScaling={true}
          maxFontSizeMultiplier={2}
        >
          {children}
        </Text>
      )}
    </Pressable>
  );
}
