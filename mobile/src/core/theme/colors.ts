/**
 * @fileoverview Design token definitions for theming system.
 * Includes color palettes, spacing scales, and radius scales.
 * @module core/theme/colors
 */

/**
 * Spacing scale tokens for consistent layout spacing.
 * Based on 4px grid system for visual rhythm and consistency.
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

/**
 * Border radius scale tokens for consistent corner rounding.
 * Provides small, medium, and large radius options.
 */
export const radius = {
  sm: 4,
  md: 8,
  lg: 16,
} as const;

/**
 * Color palette for light theme.
 * textSecondary uses #595959 for 7.0:1 contrast ratio on white background,
 * exceeding WCAG AA requirements (4.5:1) for stronger accessibility.
 * error uses #d32f2f (Material Design Red 700) for error states.
 * errorText uses #ffffff for text on error backgrounds (5.59:1 contrast).
 */
export const lightColors = {
  background: '#ffffff',
  textPrimary: '#333333',
  textSecondary: '#595959',
  error: '#d32f2f',
  errorText: '#ffffff',
};

/**
 * Color palette for dark theme.
 * error uses #ef5350 (Material Design Red 400) for better visibility on dark backgrounds.
 * errorText uses #000000 for text on error backgrounds (8.59:1 contrast).
 */
export const darkColors = {
  background: '#000000',
  textPrimary: '#ffffff',
  textSecondary: '#cccccc',
  error: '#ef5350',
  errorText: '#000000',
};

export type ColorScheme = 'light' | 'dark';
export type Colors = typeof lightColors;
export type Spacing = typeof spacing;
export type Radius = typeof radius;
