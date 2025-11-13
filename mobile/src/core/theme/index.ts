/**
 * @fileoverview Theme system providing light/dark mode support with color tokens.
 * @module core/theme
 */

import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { darkColors, lightColors, type ColorScheme, type Colors } from './colors';

/**
 * Theme context value containing current colors and color scheme.
 */
interface ThemeContextValue {
  colors: Colors;
  colorScheme: ColorScheme;
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
 * Theme provider that manages color scheme and provides theme context to child components.
 * Automatically detects system color scheme if not explicitly set.
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

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: colorScheme === 'dark' ? darkColors : lightColors,
      colorScheme,
    }),
    [colorScheme]
  );

  return React.createElement(ThemeContext.Provider, { value }, children);
}

/**
 * Hook to access the current theme context.
 *
 * @returns Theme context value with colors and color scheme
 * @throws Error if used outside of ThemeProvider
 *
 * @example
 * const { colors } = useTheme();
 * <View style={{ backgroundColor: colors.background }} />
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
