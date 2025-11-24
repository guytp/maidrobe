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
 * Typography scale tokens for consistent text sizing.
 * Based on a modular scale for visual hierarchy and readability.
 */
export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 28,
  '4xl': 32,
  '5xl': 64,
} as const;

/**
 * Sizing tokens for consistent component dimensions.
 * Includes accessibility-compliant touch targets and control areas.
 */
export const sizing = {
  /** Minimum touch target size per WCAG AA guidelines (44x44px) */
  touchTarget: 44,
  /** Standard control area height (touch target + vertical padding) */
  controlAreaHeight: 92,
} as const;

/**
 * Color palette for light theme.
 * textSecondary uses #595959 for 7.0:1 contrast ratio on white background,
 * exceeding WCAG AA requirements (4.5:1) for stronger accessibility.
 * error uses #d32f2f (Material Design Red 700) for error states.
 * errorText uses #ffffff for text on error backgrounds (5.59:1 contrast).
 * warning uses #F59E0B (Amber 500) for medium-severity states like medium password strength.
 * success uses #10B981 (Emerald 500) for positive states like strong passwords and satisfied rules.
 */
export const lightColors = {
  background: '#ffffff',
  textPrimary: '#333333',
  textSecondary: '#595959',
  error: '#d32f2f',
  errorText: '#ffffff',
  warning: '#F59E0B',
  success: '#10B981',
  /** Mask overlay opacity for dimming areas outside crop frames */
  maskOverlay: 0.5,
};

/**
 * Color palette for dark theme.
 * error uses #ef5350 (Material Design Red 400) for better visibility on dark backgrounds.
 * errorText uses #000000 for text on error backgrounds (8.59:1 contrast).
 * warning uses #FCD34D (Amber 300) for medium-severity states, brighter for dark backgrounds.
 * success uses #34D399 (Emerald 400) for positive states, brighter for dark backgrounds.
 */
export const darkColors = {
  background: '#000000',
  textPrimary: '#ffffff',
  textSecondary: '#cccccc',
  error: '#ef5350',
  errorText: '#000000',
  warning: '#FCD34D',
  success: '#34D399',
  /** Mask overlay opacity for dimming areas outside crop frames (darker for better contrast on dark backgrounds) */
  maskOverlay: 0.7,
};

export type ColorScheme = 'light' | 'dark';
export type Colors = typeof lightColors;
export type Spacing = typeof spacing;
export type Radius = typeof radius;
export type FontSize = typeof fontSize;
export type Sizing = typeof sizing;
