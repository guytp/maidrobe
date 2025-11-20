/**
 * Wardrobe screen component for viewing and managing wardrobe items.
 *
 * This is a placeholder implementation for Story #199 Step 2. The full
 * wardrobe grid implementation will be delivered in Story #217.
 *
 * Current functionality:
 * - Empty state UI
 * - "Add item" CTA that navigates to capture flow
 * - Debounced navigation to prevent duplicate pushes
 * - Proper accessibility labels
 *
 * Future functionality (Story #217):
 * - Grid view of wardrobe items
 * - Item filtering and sorting
 * - Item detail view
 * - Item deletion
 *
 * @module features/wardrobe/components/WardrobeScreen
 */

import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Button } from '../../../core/components/Button';
import { trackCaptureEvent } from '../../../core/telemetry';
import { useStore } from '../../../core/state/store';

/**
 * Wardrobe screen - main view for managing wardrobe items.
 *
 * Protected route: requires authenticated user (enforced by route wrapper).
 *
 * @returns Wardrobe screen component with empty state and add CTA
 */
export function WardrobeScreen(): React.JSX.Element {
  const { colors, colorScheme, spacing } = useTheme();
  const router = useRouter();
  const user = useStore((state) => state.user);

  // Navigation state to prevent duplicate pushes
  const [isNavigating, setIsNavigating] = useState(false);

  /**
   * Handles navigation to capture flow with origin=wardrobe.
   *
   * Debounced to prevent duplicate navigation from multiple rapid taps.
   * Tracks telemetry event for analytics.
   */
  const handleAddItem = () => {
    if (isNavigating) {
      return;
    }

    setIsNavigating(true);

    // Track capture flow opened from wardrobe
    trackCaptureEvent('capture_flow_opened', {
      userId: user?.id,
      origin: 'wardrobe',
    });

    // Navigate to capture with origin param
    router.push('/capture?origin=wardrobe');

    // Reset navigation state after a delay to allow navigation to complete
    setTimeout(() => {
      setIsNavigating(false);
    }, 500);
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        content: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing.lg,
        },
        emptyIcon: {
          fontSize: 64,
          marginBottom: spacing.md,
        },
        emptyTitle: {
          fontSize: 24,
          fontWeight: '600',
          color: colors.textPrimary,
          marginBottom: spacing.sm,
          textAlign: 'center',
        },
        emptyHint: {
          fontSize: 16,
          color: colors.textSecondary,
          marginBottom: spacing.xl,
          textAlign: 'center',
          maxWidth: 300,
        },
        addButton: {
          minWidth: 200,
        },
      }),
    [colors, spacing]
  );

  return (
    <View
      style={styles.container}
      accessibilityLabel={t('screens.wardrobe.accessibility.screenLabel')}
      accessibilityHint={t('screens.wardrobe.accessibility.screenHint')}
    >
      <View
        style={styles.content}
        accessibilityLabel={t('screens.wardrobe.accessibility.emptyState')}
      >
        <Text
          style={styles.emptyIcon}
          role="img"
          aria-label="Wardrobe"
          accessibilityLabel="Wardrobe icon"
        >
          👔
        </Text>
        <Text
          style={styles.emptyTitle}
          allowFontScaling={true}
          maxFontSizeMultiplier={2}
          accessibilityRole="header"
        >
          {t('screens.wardrobe.empty')}
        </Text>
        <Text style={styles.emptyHint} allowFontScaling={true} maxFontSizeMultiplier={2}>
          {t('screens.wardrobe.emptyHint')}
        </Text>
        <View style={styles.addButton}>
          <Button
            onPress={handleAddItem}
            variant="primary"
            disabled={isNavigating}
            accessibilityLabel={t('screens.wardrobe.accessibility.addItemButton')}
            accessibilityHint={t('screens.wardrobe.accessibility.addItemHint')}
          >
            {t('screens.wardrobe.addItem')}
          </Button>
        </View>
      </View>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}
