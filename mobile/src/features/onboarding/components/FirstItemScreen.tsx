import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { OnboardingShell } from './OnboardingShell';
import { useOnboardingContext } from '../context/OnboardingContext';
import {
  trackFirstItemViewed,
  trackFirstItemStartedCapture,
  trackFirstItemSkipped,
} from '../utils/onboardingAnalytics';
import { useWardrobeItemCount } from '../utils/wardrobeUtils';
import { CameraPlaceholder } from './CameraPlaceholder';
import { checkCameraPermission } from '../utils/cameraPermissions';
import { logError } from '../../../core/telemetry';

/**
 * First Wardrobe Item Capture screen for onboarding flow.
 *
 * This screen guides users through adding their first wardrobe item during onboarding.
 * It serves as an optional but encouraged step to help users understand the core value
 * of the app by starting to build their digital closet.
 *
 * Features:
 * - Clear value proposition for adding an item now
 * - Explicit messaging that the step is optional
 * - Primary CTA: "Add your first item" (via OnboardingFooter, customized for this step)
 * - Secondary CTA: "Skip this step" (via OnboardingFooter, fires first_item_skipped analytics)
 * - Tertiary CTA: "Skip for now" (via OnboardingFooter, global skip)
 * - Analytics tracking with hasExistingItems flag
 * - Full accessibility support with dynamic font scaling
 * - WCAG AA contrast compliance in light and dark modes
 *
 * Navigation:
 * The OnboardingFooter is customized for the firstItem step to:
 * - Display "Add your first item" as the primary button text
 * - Fire trackFirstItemSkipped('pure_skip') when "Skip this step" is pressed
 * - Provide appropriate accessibility labels for screen readers
 * - Advance to the next onboarding step on skip or next
 *
 * Implementation status:
 * - Step 1: Analytics integration, UI copy, and onboarding flow integration (complete)
 * - Step 2: OnboardingFooter customization for firstItem step (complete)
 * - Steps 3-5: Camera integration, metadata capture, and item persistence (future)
 *
 * Layout:
 * - Portrait-only orientation
 * - Centered content for clear hierarchy
 * - OnboardingShell wrapper provides footer with CTAs
 *
 * @returns First item capture screen component
 */
export function FirstItemScreen(): React.JSX.Element {
  const { colors, colorScheme, spacing } = useTheme();
  const { currentStep, onNext, onSkipStep, setCustomPrimaryHandler } = useOnboardingContext();

  // Track if first_item_viewed has been fired to prevent duplicates on re-renders
  const hasTrackedView = useRef(false);

  // Track if camera has been opened (for analytics)
  const hasOpenedCamera = useRef(false);

  // Get wardrobe item count for analytics (returns 0 as placeholder until Feature #3)
  const itemCount = useWardrobeItemCount();

  // Camera flow state
  const [showCamera, setShowCamera] = useState(false);

  // Track first item screen view once on mount
  useEffect(() => {
    // Guard: Check all conditions to ensure analytics fire correctly
    // - hasTrackedView.current: Prevents duplicate events on re-renders
    // - currentStep === 'firstItem': Prevents firing if currentStep changes while
    //   component is still mounted (can occur during navigation transitions when
    //   React hasn't unmounted this component yet but routing has advanced)
    // - itemCount !== null: Wait for wardrobe count to load (currently immediate,
    //   but will be async when Feature #3 is implemented)
    if (!hasTrackedView.current && currentStep === 'firstItem' && itemCount !== null) {
      // For first-item screen during fresh onboarding, isResume is typically false
      // The shell-level trackStepViewed handles resume detection; this event tracks
      // first-item-specific metrics including whether user already has items
      const hasExistingItems = itemCount > 0;
      trackFirstItemViewed(false, hasExistingItems);
      hasTrackedView.current = true;
    }
  }, [currentStep, itemCount]);

  /**
   * Handle opening camera when "Add your first item" button is pressed.
   * This is triggered by the primary button in OnboardingFooter.
   */
  const handleStartCamera = useCallback(async () => {
    try {
      // Check camera permission (placeholder always returns 'granted')
      const permissionStatus = await checkCameraPermission();

      if (permissionStatus === 'granted') {
        // Open camera view
        setShowCamera(true);

        // Track camera started (fire once)
        if (!hasOpenedCamera.current) {
          trackFirstItemStartedCapture();
          hasOpenedCamera.current = true;
        }
      } else {
        // Permission denied - track skip with reason
        trackFirstItemSkipped('permission_denied_then_skip');
        logError(new Error('Camera permission denied'), 'user', {
          feature: 'onboarding_first_item',
          operation: 'checkCameraPermission',
          metadata: {
            permissionStatus,
          },
        });
        // Advance to next step
        onSkipStep();
      }
    } catch (error) {
      // Camera initialization error
      logError(error as Error, 'schema', {
        feature: 'onboarding_first_item',
        operation: 'startCamera',
        metadata: {
          errorType: 'camera_init_failed',
        },
      });
      // Track skip with error reason
      trackFirstItemSkipped('camera_error_then_skip');
      // Advance to next step
      onSkipStep();
    }
  }, [onSkipStep]);

  /**
   * Handle successful photo capture from camera.
   */
  const handleCameraCapture = useCallback(
    (_image: { uri: string }) => {
      setShowCamera(false);
      // Proceed to next step (will be metadata form in Step 4)
      // TODO: Pass captured image to metadata form in Step 4
      onNext();
    },
    [onNext]
  );

  /**
   * Handle camera cancel / "Do this later" from camera view.
   */
  const handleCameraCancel = useCallback(() => {
    setShowCamera(false);
    // Track skip from camera view
    trackFirstItemSkipped('cancelled_from_camera');
    // Advance to next step
    onSkipStep();
  }, [onSkipStep]);

  /**
   * Register custom primary handler for this step.
   * When on firstItem step, the primary button should open camera instead of advancing.
   */
  useEffect(() => {
    if (currentStep === 'firstItem' && setCustomPrimaryHandler) {
      // Set our camera handler as the primary action
      setCustomPrimaryHandler(() => handleStartCamera);
    }

    return () => {
      // Clear custom handler when leaving this step
      if (setCustomPrimaryHandler) {
        setCustomPrimaryHandler(null);
      }
    };
  }, [currentStep, setCustomPrimaryHandler, handleStartCamera]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.xl,
        },
        title: {
          fontSize: 32,
          fontWeight: 'bold',
          marginBottom: spacing.lg,
          color: colors.textPrimary,
          textAlign: 'center',
        },
        headline: {
          fontSize: 18,
          fontWeight: '600',
          marginBottom: spacing.md,
          color: colors.textPrimary,
          textAlign: 'center',
          lineHeight: 26,
        },
        optional: {
          fontSize: 14,
          color: colors.textSecondary,
          textAlign: 'center',
          lineHeight: 20,
        },
      }),
    [colors, spacing]
  );

  return (
    <>
      <OnboardingShell>
        <View
          style={styles.container}
          accessibilityLabel={t('screens.onboarding.firstItem.accessibility.screenLabel')}
          accessibilityHint={t('screens.onboarding.firstItem.accessibility.screenHint')}
        >
          {/* Title */}
          <Text
            style={styles.title}
            accessibilityRole="header"
            allowFontScaling={true}
            maxFontSizeMultiplier={3}
          >
            {t('screens.onboarding.firstItem.title')}
          </Text>

          {/* Headline - Value proposition */}
          <Text
            style={styles.headline}
            accessibilityLabel={t('screens.onboarding.firstItem.accessibility.headlineLabel')}
            allowFontScaling={true}
            maxFontSizeMultiplier={3}
          >
            {t('screens.onboarding.firstItem.headline')}
          </Text>

          {/* Optional notice */}
          <Text
            style={styles.optional}
            accessibilityLabel={t('screens.onboarding.firstItem.accessibility.optionalLabel')}
            allowFontScaling={true}
            maxFontSizeMultiplier={3}
          >
            {t('screens.onboarding.firstItem.optional')}
          </Text>

          <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
        </View>
      </OnboardingShell>

      {/* Camera modal overlay */}
      <Modal
        visible={showCamera}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={handleCameraCancel}
      >
        <CameraPlaceholder onCapture={handleCameraCapture} onCancel={handleCameraCancel} />
      </Modal>
    </>
  );
}
