/**
 * @fileoverview Internationalization (i18n) utilities for app-wide translations.
 * @module core/i18n
 *
 * INTERPOLATION STRATEGY:
 * This i18n implementation uses manual string replacement for dynamic values rather
 * than automatic interpolation. This keeps the system simple, lightweight, and
 * dependency-free while providing full control over value formatting.
 *
 * Template Syntax:
 * - Use single curly braces: {placeholder}
 * - Example: "Please wait {seconds} seconds"
 * - NOT supported: {{placeholder}}, ${placeholder}, %s, etc.
 *
 * How to Use Dynamic Values:
 * 1. Define translation with placeholder: "Cooldown: {seconds} seconds"
 * 2. Retrieve translation: t('screens.auth.verify.cooldownMessage')
 * 3. Replace manually: .replace('{seconds}', value.toString())
 *
 * Example Usage:
 * ```typescript
 * // In en.json:
 * "message": "Hello {name}, you have {count} items"
 *
 * // In component:
 * const msg = t('message')
 *   .replace('{name}', userName)
 *   .replace('{count}', itemCount.toString());
 * ```
 *
 * Why Manual Interpolation?
 * - Simple: No additional dependencies or complex configuration
 * - Explicit: Clear what values are being inserted where
 * - Flexible: Full control over formatting, type conversion, and escaping
 * - Type-safe: TypeScript validates translation keys at compile time
 * - Lightweight: Minimal bundle size impact
 *
 * Limitations:
 * - No automatic pluralization (must define separate keys for singular/plural)
 * - No automatic number/date formatting (handle in component before .replace())
 * - No nested object interpolation (use multiple .replace() calls)
 * - No automatic HTML escaping (ensure values are safe before interpolation)
 *
 * Future Migration:
 * If advanced interpolation features are needed (pluralization, date formatting,
 * gender agreement), consider migrating to i18next or react-intl. The current
 * {placeholder} syntax is compatible with most i18n libraries.
 *
 * @see en.json for translation file structure and placeholder conventions
 */

import { I18nManager } from 'react-native';
import translations from './en.json';

/**
 * List of locale codes that use Right-to-Left text direction.
 * Includes Arabic, Hebrew, Persian, Urdu, and Yiddish.
 */
const RTL_LOCALES = ['ar', 'he', 'fa', 'ur', 'yi', 'iw'] as const;

type TranslationKeys = typeof translations;

/**
 * Type-safe translation key helper that traverses nested translation objects.
 */
type NestedKeyOf<T> = T extends object
  ? {
      [K in keyof T]: K extends string
        ? T[K] extends object
          ? `${K}.${NestedKeyOf<T[K]>}`
          : K
        : never;
    }[keyof T]
  : never;

type TranslationKey = NestedKeyOf<TranslationKeys>;

/**
 * Retrieves a translation string by its nested key path.
 *
 * This function returns plain strings WITHOUT automatic interpolation.
 * For dynamic values, use manual .replace() calls on the returned string.
 *
 * @param key - Dot-notation path to the translation (e.g., 'screens.home.title')
 * @returns The translated string with placeholders intact (e.g., "Wait {seconds}s")
 *
 * @example
 * // Simple translation (no placeholders)
 * const title = t('screens.home.title'); // Returns "Maidrobe"
 *
 * @example
 * // Translation with manual interpolation
 * const cooldown = t('screens.auth.verify.cooldownMessage')
 *   .replace('{seconds}', '30'); // Returns "Please wait 30 seconds before resending"
 *
 * @example
 * // Multiple placeholders
 * const message = t('some.message')
 *   .replace('{name}', userName)
 *   .replace('{count}', itemCount.toString());
 *
 * @remarks
 * The function does NOT perform automatic interpolation. Placeholders like {seconds}
 * will be returned as-is in the string. You must manually call .replace() to
 * substitute dynamic values.
 */
export function t(key: TranslationKey): string {
  const keys = key.split('.');
  let value: unknown = translations;

  for (const k of keys) {
    if (typeof value === 'object' && value !== null && k in value) {
      value = (value as Record<string, unknown>)[k];
    } else {
      return key; // Fallback to key if not found
    }
  }

  return typeof value === 'string' ? value : key;
}

/**
 * Gets all available translations.
 *
 * @returns The complete translations object
 */
export function getTranslations(): TranslationKeys {
  return translations;
}

/**
 * Checks if a given locale uses Right-to-Left text direction.
 *
 * @param locale - BCP 47 language tag (e.g., 'ar', 'ar-SA', 'he-IL')
 * @returns true if the locale is RTL, false otherwise
 *
 * @example
 * isRTL('ar'); // true (Arabic)
 * isRTL('ar-SA'); // true (Arabic - Saudi Arabia)
 * isRTL('he'); // true (Hebrew)
 * isRTL('en'); // false (English)
 * isRTL('en-US'); // false (English - United States)
 */
export function isRTL(locale: string): boolean {
  const baseLocale = locale.split('-')[0].toLowerCase();
  return RTL_LOCALES.includes(baseLocale as (typeof RTL_LOCALES)[number]);
}

/**
 * Configures the app's layout direction based on the chosen locale.
 *
 * Call this function during app initialization or when the user changes their
 * language preference. It enables RTL support and forces RTL layout if the
 * locale requires it.
 *
 * IMPORTANT: On iOS, changing RTL direction requires an app reload to take
 * effect. On Android, it applies immediately.
 *
 * @param locale - BCP 47 language tag (e.g., 'ar', 'en-US', 'he-IL')
 *
 * @example
 * // During app initialization or language change
 * configureRTL('ar'); // Enables RTL for Arabic
 * configureRTL('en'); // Disables RTL for English
 *
 * @remarks
 * Layout behavior in RTL mode:
 * - Flex direction reverses (row starts from right)
 * - Margin/padding properties mirror (marginLeft becomes marginRight)
 * - Text alignment reverses (textAlign: 'left' becomes 'right')
 * - Absolute positioning mirrors (left becomes right)
 * - Icons and images may need manual flipping for semantic correctness
 *
 * To check current direction in components:
 * - Use I18nManager.isRTL for conditional rendering
 * - Use I18nManager.getConstants().isRTL for initial values
 */
export function configureRTL(locale: string): void {
  I18nManager.allowRTL(true);
  if (isRTL(locale)) {
    I18nManager.forceRTL(true);
  } else {
    I18nManager.forceRTL(false);
  }
}

/**
 * Forces RTL layout direction for testing and development purposes.
 *
 * Use this function to test RTL layouts without changing the app locale.
 * Useful for UI testing and verifying layout behavior in RTL mode.
 *
 * IMPORTANT: On iOS, this requires an app reload to take effect.
 *
 * @param enabled - true to force RTL, false to force LTR
 *
 * @example
 * // Enable RTL for testing
 * forceRTL(true);
 *
 * // Disable RTL after testing
 * forceRTL(false);
 *
 * @remarks
 * This is primarily for development and testing. In production, use
 * configureRTL() which automatically detects the locale's direction.
 */
export function forceRTL(enabled: boolean): void {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(enabled);
}
