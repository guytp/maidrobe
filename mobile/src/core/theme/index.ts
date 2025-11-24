/**
 * @fileoverview Theme system providing design tokens including colors, spacing, and radius.
 * Supports light/dark mode with accessibility preferences.
 * @module core/theme
 */

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';
import {
  darkColors,
  fontSize,
  lightColors,
  radius,
  sizing,
  spacing,
  type ColorScheme,
  type Colors,
  type FontSize,
  type Radius,
  type Sizing,
  type Spacing,
} from './colors';

/**
 * Theme context value containing design tokens and accessibility preferences.
 *
 * Provides access to:
 * - colors: Theme-specific color palette (light/dark)
 * - spacing: Consistent spacing scale (xs to xl)
 * - radius: Border radius scale (sm to lg)
 * - fontSize: Typography scale (xs to 4xl)
 * - sizing: Component dimension tokens (touch targets, control areas)
 * - colorScheme: Current theme mode
 * - isReduceMotionEnabled: Accessibility preference for animations
 */
interface ThemeContextValue {
  colors: Colors;
  spacing: Spacing;
  radius: Radius;
  fontSize: FontSize;
  sizing: Sizing;
  colorScheme: ColorScheme;
  isReduceMotionEnabled: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/**
 * Props for the ThemeProvider component.
 */
interface ThemeProviderProps {
  children: React.ReactNode;
  colorScheme?: ColorScheme;
}

/**
 * Theme provider that manages design tokens and provides theme context to child components.
 * Automatically detects system color scheme and accessibility preferences if not explicitly set.
 *
 * Provides centralized access to:
 * - Color tokens (theme-aware: light/dark)
 * - Spacing tokens (consistent across themes)
 * - Radius tokens (consistent across themes)
 * - Typography tokens (consistent across themes)
 * - Accessibility preferences
 *
 * @param props - Component props
 * @returns Theme provider component
 *
 * @example
 * <ThemeProvider>
 *   <App />
 * </ThemeProvider>
 */
export function ThemeProvider({
  children,
  colorScheme: overrideScheme,
}: ThemeProviderProps): React.JSX.Element {
  const systemColorScheme = useColorScheme();
  const colorScheme: ColorScheme =
    overrideScheme ?? (systemColorScheme === 'dark' ? 'dark' : 'light');

  const [isReduceMotionEnabled, setReduceMotionEnabled] = useState(false);

  useEffect(() => {
    // Detect initial reduce motion preference
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotionEnabled)
      .catch(() => {
        // Gracefully handle platforms where this API is not available
        setReduceMotionEnabled(false);
      });

    // Listen for changes to reduce motion preference
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotionEnabled
    );

    return () => {
      subscription.remove();
    };
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: colorScheme === 'dark' ? darkColors : lightColors,
      spacing,
      radius,
      fontSize,
      sizing,
      colorScheme,
      isReduceMotionEnabled,
    }),
    [colorScheme, isReduceMotionEnabled]
  );

  return React.createElement(ThemeContext.Provider, { value }, children);
}

/**
 * Hook to access the current theme context with design tokens.
 *
 * @returns Theme context value with colors, spacing, radius, fontSize, color scheme, and accessibility preferences
 * @throws Error if used outside of ThemeProvider
 *
 * @example
 * const { colors, spacing, radius, fontSize, isReduceMotionEnabled } = useTheme();
 * <View style={{
 *   backgroundColor: colors.background,
 *   padding: spacing.md,
 *   borderRadius: radius.md,
 * }} />
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
