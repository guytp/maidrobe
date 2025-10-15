import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import en from './locales/en.json';

/**
 * i18n Configuration
 *
 * Initializes i18next with React Native support via expo-localization.
 * All UI strings should use translation keys instead of literals.
 *
 * Usage:
 * import { useTranslation } from 'react-i18next';
 * const { t } = useTranslation();
 * <Text>{t('common.welcome')}</Text>
 */

const resources = {
  en: {
    translation: en,
  },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: Localization.getLocales()[0]?.languageCode || 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React Native handles escaping
    },
  })
  .catch((error) => {
    console.error('i18n initialization failed:', error);
  });

export default i18n;
