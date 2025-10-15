import { View, Text, StyleSheet, Button } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useUser } from '../../src/features/user';
import { useUIStore } from '../../src/stores/useUIStore';
import { textSecondary, borderLight } from '../../src/theme/tokens';
import '../../src/i18n';

export default function HomeScreen() {
  const { t } = useTranslation();
  const { data: user, isLoading, error } = useUser('user-123');
  const theme = useUIStore((state) => state.theme);
  const setTheme = useUIStore((state) => state.setTheme);

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  const classifyError = (error: Error): string => {
    const errorMessage = error.message.toLowerCase();

    if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
      return 'network';
    } else if (
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('forbidden')
    ) {
      return 'user';
    } else if (
      errorMessage.includes('server') ||
      errorMessage.includes('500') ||
      errorMessage.includes('503')
    ) {
      return 'server';
    } else if (
      errorMessage.includes('ai') ||
      errorMessage.includes('model') ||
      errorMessage.includes('timeout')
    ) {
      return 'ai';
    }
    return 'server';
  };

  const getErrorMessage = (error: Error): string => {
    const errorType = classifyError(error);
    const baseMessage = error.message || 'An error occurred';

    switch (errorType) {
      case 'network':
        return `Network error: ${baseMessage}`;
      case 'user':
        return `Authentication error: ${baseMessage}`;
      case 'server':
        return `Server error: ${baseMessage}`;
      case 'ai':
        return `AI service error: ${baseMessage}`;
      default:
        return baseMessage;
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title} accessibilityLabel={t('home.title')}>
        {t('home.title')}
      </Text>
      <Text style={styles.subtitle} accessibilityLabel={t('home.subtitle')}>
        {t('home.subtitle')}
      </Text>

      <View style={styles.demoSection}>
        <Text
          style={styles.sectionTitle}
          accessibilityLabel={t('home.reactQueryDemo')}
        >
          {t('home.reactQueryDemo')}
        </Text>
        {isLoading && (
          <Text accessibilityLabel={t('home.loadingUser')}>
            {t('home.loadingUser')}
          </Text>
        )}
        {error && (
          <Text accessibilityLabel={`Error: ${getErrorMessage(error)}`}>
            {getErrorMessage(error)}
          </Text>
        )}
        {user && (
          <View>
            <Text accessibilityLabel={t('home.userId', { id: user.id })}>
              {t('home.userId', { id: user.id })}
            </Text>
            <Text accessibilityLabel={t('home.userName', { name: user.name })}>
              {t('home.userName', { name: user.name })}
            </Text>
            <Text
              accessibilityLabel={t('home.userEmail', { email: user.email })}
            >
              {t('home.userEmail', { email: user.email })}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.demoSection}>
        <Text
          style={styles.sectionTitle}
          accessibilityLabel={t('home.zustandDemo')}
        >
          {t('home.zustandDemo')}
        </Text>
        <Text accessibilityLabel={t('home.currentTheme', { theme })}>
          {t('home.currentTheme', { theme })}
        </Text>
        <Button title={t('home.toggleTheme')} onPress={toggleTheme} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: textSecondary,
    marginBottom: 30,
  },
  demoSection: {
    marginTop: 20,
    padding: 15,
    borderWidth: 1,
    borderColor: borderLight,
    borderRadius: 8,
    width: '100%',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
  },
});
