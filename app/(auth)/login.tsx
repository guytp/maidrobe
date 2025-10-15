import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  textSecondary,
  borderLight,
  buttonPrimary,
  white,
} from '../../src/theme/tokens';
import '../../src/i18n';

export default function LoginScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  const handleLogin = () => {
    // In a real app, this would authenticate the user
    // For now, just navigate to home
    router.replace('/(tabs)/home');
  };

  return (
    <View style={styles.container}>
      <Text
        style={styles.title}
        accessibilityLabel={t('common.welcome')}
        accessibilityRole="header"
      >
        {t('common.welcome')}
      </Text>
      <Text
        style={styles.subtitle}
        accessibilityLabel={t('auth.signInSubtitle')}
      >
        {t('auth.signInSubtitle')}
      </Text>

      <TextInput
        style={styles.input}
        placeholder={t('auth.email')}
        keyboardType="email-address"
        autoCapitalize="none"
        accessibilityLabel="Email input field"
        accessibilityHint="Enter your email address"
      />

      <TextInput
        style={styles.input}
        placeholder={t('auth.password')}
        secureTextEntry
        accessibilityLabel="Password input field"
        accessibilityHint="Enter your password"
      />

      <TouchableOpacity
        style={styles.button}
        onPress={handleLogin}
        accessibilityRole="button"
        accessibilityLabel="Sign in button"
        accessibilityHint="Tap to sign in to your account"
      >
        <Text style={styles.buttonText}>{t('auth.signIn')}</Text>
      </TouchableOpacity>
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
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: textSecondary,
    marginBottom: 40,
  },
  input: {
    width: '100%',
    height: 50,
    borderWidth: 1,
    borderColor: borderLight,
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    fontSize: 16,
  },
  button: {
    width: '100%',
    height: 50,
    backgroundColor: buttonPrimary,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: white,
    fontSize: 18,
    fontWeight: '600',
  },
});
