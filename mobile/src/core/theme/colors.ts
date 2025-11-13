/**
 * @fileoverview Color token definitions for light and dark themes.
 * @module core/theme/colors
 */

/**
 * Color palette for light theme.
 */
export const lightColors = {
  background: '#ffffff',
  textPrimary: '#333333',
  textSecondary: '#666666',
};

/**
 * Color palette for dark theme.
 */
export const darkColors = {
  background: '#000000',
  textPrimary: '#ffffff',
  textSecondary: '#cccccc',
};

export type ColorScheme = 'light' | 'dark';
export type Colors = typeof lightColors;
