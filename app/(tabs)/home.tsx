import { View, Text, StyleSheet, Button } from 'react-native';
import { useUser } from '../../src/features/user';
import { useUIStore } from '../../src/stores/useUIStore';
import { textSecondary, borderLight } from '../../src/theme/tokens';

export default function HomeScreen() {
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
      <Text
        style={styles.title}
        accessibilityLabel="App title: Welcome to Maidrobe"
      >
        Welcome to Maidrobe
      </Text>
      <Text
        style={styles.subtitle}
        accessibilityLabel="App description: Your personal closet assistant"
      >
        Your personal closet assistant
      </Text>

      <View style={styles.demoSection}>
        <Text
          style={styles.sectionTitle}
          accessibilityLabel="Section: React Query Demo"
        >
          React Query Demo:
        </Text>
        {isLoading && (
          <Text accessibilityLabel="Loading user data">Loading user...</Text>
        )}
        {error && (
          <Text accessibilityLabel={`Error: ${getErrorMessage(error)}`}>
            {getErrorMessage(error)}
          </Text>
        )}
        {user && (
          <View>
            <Text accessibilityLabel={`User ID: ${user.id}`}>
              User ID: {user.id}
            </Text>
            <Text accessibilityLabel={`Name: ${user.name}`}>
              Name: {user.name}
            </Text>
            <Text accessibilityLabel={`Email: ${user.email}`}>
              Email: {user.email}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.demoSection}>
        <Text
          style={styles.sectionTitle}
          accessibilityLabel="Section: Zustand Demo"
        >
          Zustand Demo:
        </Text>
        <Text accessibilityLabel={`Current theme is ${theme}`}>
          Current theme: {theme}
        </Text>
        <Button title="Toggle Theme" onPress={toggleTheme} />
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
