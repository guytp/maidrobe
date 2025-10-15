import { View, Text, StyleSheet, Button } from 'react-native';
import { useUser } from '../../src/features/user';
import { useUIStore } from '../../src/stores/useUIStore';

export default function HomeScreen() {
  const { data: user, isLoading, error } = useUser('user-123');
  const theme = useUIStore((state) => state.theme);
  const setTheme = useUIStore((state) => state.setTheme);

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to Maidrobe</Text>
      <Text style={styles.subtitle}>Your personal closet assistant</Text>

      <View style={styles.demoSection}>
        <Text style={styles.sectionTitle}>React Query Demo:</Text>
        {isLoading && <Text>Loading user...</Text>}
        {error && <Text>Error loading user</Text>}
        {user && (
          <View>
            <Text>User ID: {user.id}</Text>
            <Text>Name: {user.name}</Text>
            <Text>Email: {user.email}</Text>
          </View>
        )}
      </View>

      <View style={styles.demoSection}>
        <Text style={styles.sectionTitle}>Zustand Demo:</Text>
        <Text>Current theme: {theme}</Text>
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
    color: '#666',
    marginBottom: 30,
  },
  demoSection: {
    marginTop: 20,
    padding: 15,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    width: '100%',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
  },
});
