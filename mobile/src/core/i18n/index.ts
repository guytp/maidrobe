/**
 * @fileoverview Internationalization (i18n) utilities for app-wide translations.
 * @module core/i18n
 */

import translations from './en.json';

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
 * @param key - Dot-notation path to the translation (e.g., 'screens.home.title')
 * @returns The translated string
 *
 * @example
 * const title = t('screens.home.title'); // Returns "Maidrobe"
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
