/**
 * Design Tokens
 *
 * Centralized design system tokens for colors, supporting theming and dark mode.
 * All color literals should be replaced with these named constants.
 *
 * Naming convention:
 * - Semantic color names (e.g., primary, secondary)
 * - Grayscale colors use numerical scale (100-900, lighter to darker)
 * - Functional names describe usage context
 */

// Base Colors - Grayscale
export const white = '#FFFFFF';
export const black = '#000000';

// Grayscale Palette (100 = lightest, 900 = darkest)
export const grey100 = '#F5F5F5';
export const grey200 = '#EEEEEE';
export const grey300 = '#DDDDDD';
export const grey400 = '#BDBDBD';
export const grey500 = '#9E9E9E';
export const grey600 = '#666666';
export const grey700 = '#424242';
export const grey800 = '#303030';
export const grey900 = '#212121';

// Brand & Primary Colors
export const blue = '#007AFF'; // iOS-style primary blue
export const primary = blue;

// Semantic Colors
export const success = '#4CAF50';
export const error = '#F44336';
export const warning = '#FF9800';
export const info = '#2196F3';

// Text Colors
export const textPrimary = grey900;
export const textSecondary = grey600;
export const textLight = white;
export const textDisabled = grey400;

// Background Colors
export const backgroundPrimary = white;
export const backgroundSecondary = grey100;
export const backgroundDark = grey900;

// Border Colors
export const borderLight = grey300;
export const borderMedium = grey400;
export const borderDark = grey600;

// Button Colors
export const buttonPrimary = blue;
export const buttonPrimaryText = white;
export const buttonSecondary = grey300;
export const buttonSecondaryText = grey900;
export const buttonDisabled = grey300;
export const buttonDisabledText = grey500;
