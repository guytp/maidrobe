import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useProtectedRoute } from '../../src/features/auth/hooks/useProtectedRoute';
import { useTheme } from '../../src/core/theme';
import { Button } from '../../src/core/components/Button';

/**
 * Item detail route for viewing a single wardrobe item.
 *
 * This route displays the details of a wardrobe item identified by its ID.
 * Currently a placeholder implementation - full item detail UI will be
 * delivered in a future story.
 *
 * Route: /wardrobe/[id]
 * Example: /wardrobe/abc123
 *
 * Protected route: requires authenticated user with verified email.
 *
 * @returns Item detail route component
 */
export default function ItemDetailRoute(): React.JSX.Element {
  const isAuthorized = useProtectedRoute();
  const { colors, colorScheme, spacing, fontSize } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    content: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.lg,
    },
    icon: {
      fontSize: fontSize['5xl'],
      marginBottom: spacing.md,
    },
    title: {
      fontSize: fontSize['2xl'],
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: spacing.sm,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: fontSize.base,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
      textAlign: 'center',
    },
    idText: {
      fontSize: fontSize.sm,
      color: colors.textSecondary,
      marginBottom: spacing.xl,
      fontFamily: 'monospace',
    },
    buttonContainer: {
      minWidth: 200,
    },
  });

  // Show loading state while checking auth
  if (!isAuthorized) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator
            size="large"
            color={colors.textPrimary}
            accessibilityLabel="Loading item details"
          />
        </View>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </View>
    );
  }

  // Handle missing ID
  if (!id) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.icon} role="img" aria-label="Error">
            ⚠️
          </Text>
          <Text style={styles.title}>Item Not Found</Text>
          <Text style={styles.subtitle}>
            The item you're looking for doesn't exist or has been removed.
          </Text>
          <View style={styles.buttonContainer}>
            <Button onPress={() => router.back()} variant="primary">
              Go Back
            </Button>
          </View>
        </View>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </View>
    );
  }

  // Placeholder content - full implementation in future story
  return (
    <View
      style={styles.container}
      accessibilityLabel="Item detail screen"
      accessibilityHint="View details of a wardrobe item"
    >
      <View style={styles.content}>
        <Text style={styles.icon} role="img" aria-label="Clothing item">
          👔
        </Text>
        <Text
          style={styles.title}
          allowFontScaling
          maxFontSizeMultiplier={2}
          accessibilityRole="header"
        >
          Item Details
        </Text>
        <Text style={styles.subtitle} allowFontScaling maxFontSizeMultiplier={2}>
          Full item details coming soon
        </Text>
        <Text style={styles.idText} allowFontScaling maxFontSizeMultiplier={1.5}>
          ID: {id}
        </Text>
        <View style={styles.buttonContainer}>
          <Button
            onPress={() => router.back()}
            variant="primary"
            accessibilityLabel="Go back to wardrobe"
            accessibilityHint="Return to the wardrobe grid"
          >
            Back to Wardrobe
          </Button>
        </View>
      </View>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}
