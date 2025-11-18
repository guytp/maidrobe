import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { OnboardingShell } from './OnboardingShell';
import { useOnboardingContext } from '../context/OnboardingContext';
import {
  trackFirstItemViewed,
  trackFirstItemStartedCapture,
  trackFirstItemSkipped,
  trackFirstItemSavedSuccess,
  trackFirstItemSaveFailed,
} from '../utils/onboardingAnalytics';
import { useWardrobeItemCount } from '../utils/wardrobeUtils';
import { CameraPlaceholder } from './CameraPlaceholder';
import { checkCameraPermission } from '../utils/cameraPermissions';
import { logError } from '../../../core/telemetry';
import { ItemMetadataForm } from './ItemMetadataForm';
import { ItemMetadata } from '../types/itemMetadata';
import { useCreateFirstItem, CreateItemError } from '../api/useCreateFirstItem';
import { Toast } from '../../../core/components/Toast';
import { ItemPreviewCard } from './ItemPreviewCard';
import { WardrobeItem } from '../types/wardrobeItem';

/**
 * Delay in milliseconds before navigating to the next onboarding step
 * after successfully creating the first wardrobe item.
 *
 * This delay allows users to see the success toast and item preview
 * before the navigation transition occurs.
 */
const SUCCESS_NAVIGATION_DELAY_MS = 2000;

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

  // Captured image and metadata state
  const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null);
  const [capturedMetadata, setCapturedMetadata] = useState<ItemMetadata | null>(null);
  const [showMetadataForm, setShowMetadataForm] = useState(false);

  // Success state
  const [createdItem, setCreatedItem] = useState<WardrobeItem | null>(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  // Track if save success has been fired (prevent duplicates)
  const hasTrackedSaveSuccess = useRef(false);

  // Track if save error has been fired (prevent duplicates)
  const hasTrackedSaveError = useRef(false);

  // Timer ref for delayed navigation cleanup
  const navigationTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Create item mutation
  const createItemMutation = useCreateFirstItem();

  // Track first item screen view once on mount
  useEffect(() => {
    // Guard: Check all conditions to ensure analytics fire correctly
    // - hasTrackedView.current: Prevents duplicate events on re-renders
    // - currentStep === 'firstItem': Prevents firing if currentStep changes while
    //   component is still mounted (can occur during navigation transitions when
    //   React hasn't unmounted this component yet but routing has advanced)
    // - itemCount !== null: Wait for wardrobe count to load. Note that 0 is a
    //   valid loaded value (user has no existing items), while null indicates
    //   the count is still loading. Currently returns 0 immediately, but will
    //   be async when Feature #3 is implemented.
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
      logError(error as Error, 'user', {
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
  const handleCameraCapture = useCallback((image: { uri: string }) => {
    // Store captured image
    setCapturedImageUri(image.uri);
    setShowCamera(false);
    // Show metadata form
    setShowMetadataForm(true);
  }, []);

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
   * Handle metadata form save.
   */
  const handleMetadataSave = useCallback(
    (metadata: ItemMetadata) => {
      // Store metadata for retry purposes
      setCapturedMetadata(metadata);

      // Trigger mutation if we have both image and valid metadata
      if (capturedImageUri && metadata.type && metadata.colourId) {
        // Reset error tracking flag for new save attempt
        hasTrackedSaveError.current = false;

        createItemMutation.mutate({
          imageUri: capturedImageUri,
          type: metadata.type,
          colourId: metadata.colourId,
          name: metadata.name,
        });
      }
    },
    [capturedImageUri, createItemMutation]
  );

  /**
   * Handle retry after error.
   */
  const handleRetry = useCallback(() => {
    // Retry with same metadata
    if (capturedMetadata && capturedImageUri) {
      createItemMutation.reset(); // Clear error state
      // Reset error tracking flag for retry attempt
      hasTrackedSaveError.current = false;

      createItemMutation.mutate({
        imageUri: capturedImageUri,
        type: capturedMetadata.type!,
        colourId: capturedMetadata.colourId!,
        name: capturedMetadata.name,
      });
    }
  }, [capturedMetadata, capturedImageUri, createItemMutation]);

  /**
   * Handle skip after error.
   */
  const handleSkipAfterError = useCallback(() => {
    // Track skip with failure reason
    trackFirstItemSkipped('failure_then_skip');
    // Close form and advance
    setShowMetadataForm(false);
    onSkipStep();
  }, [onSkipStep]);

  /**
   * Handle metadata form close (Android back button or modal dismiss gesture).
   * Shows confirmation dialog before canceling the form.
   */
  const handleMetadataFormClose = useCallback(() => {
    Alert.alert(
      t('screens.onboarding.firstItem.cancelConfirmation.title'),
      t('screens.onboarding.firstItem.cancelConfirmation.message'),
      [
        {
          text: t('screens.onboarding.firstItem.cancelConfirmation.keepEditing'),
          style: 'cancel',
        },
        {
          text: t('screens.onboarding.firstItem.cancelConfirmation.cancel'),
          onPress: () => {
            // Track skip with specific reason for back button
            trackFirstItemSkipped('form_cancelled_via_back_button');
            // Close form and advance
            setShowMetadataForm(false);
            onSkipStep();
          },
          style: 'destructive',
        },
      ]
    );
  }, [onSkipStep]);

  /**
   * Handle mutation success.
   */
  useEffect(() => {
    if (createItemMutation.isSuccess && createItemMutation.data) {
      const item = createItemMutation.data.item;
      setCreatedItem(item);

      // Track success exactly once
      if (!hasTrackedSaveSuccess.current) {
        trackFirstItemSavedSuccess();
        hasTrackedSaveSuccess.current = true;
      }

      // Show success toast
      setShowSuccessToast(true);

      // Close metadata form
      setShowMetadataForm(false);

      // Clear any existing navigation timer
      if (navigationTimerRef.current) {
        clearTimeout(navigationTimerRef.current);
      }

      // Wait before advancing to next step (allows user to see success state)
      navigationTimerRef.current = setTimeout(() => {
        onNext();
        navigationTimerRef.current = null;
      }, SUCCESS_NAVIGATION_DELAY_MS);
    }

    // Cleanup: clear timer on unmount or effect re-run
    return () => {
      if (navigationTimerRef.current) {
        clearTimeout(navigationTimerRef.current);
        navigationTimerRef.current = null;
      }
    };
  }, [createItemMutation.isSuccess, createItemMutation.data, onNext]);

  /**
   * Handle mutation error.
   */
  useEffect(() => {
    if (createItemMutation.isError && createItemMutation.error) {
      const error = createItemMutation.error as CreateItemError;

      // Track failure with error type (fire once per error occurrence)
      if (!hasTrackedSaveError.current) {
        trackFirstItemSaveFailed(error.errorType);
        hasTrackedSaveError.current = true;
      }

      // Map CreateItemError.errorType to telemetry classification
      let classification: 'user' | 'network' | 'server' = 'server';
      if (error.errorType === 'network') {
        classification = 'network';
      } else if (error.errorType === 'validation') {
        classification = 'user';
      }
      // storage, database, and unknown map to 'server'

      // Log error via telemetry
      logError(error, classification, {
        feature: 'onboarding_first_item',
        operation: 'saveItem',
        metadata: {
          errorType: error.errorType,
        },
      });
    }
  }, [createItemMutation.isError, createItemMutation.error]);

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

  // Get error message for display
  const errorMessage = useMemo(() => {
    if (!createItemMutation.error) return null;

    const error = createItemMutation.error as CreateItemError;
    switch (error.errorType) {
      case 'network':
        return t('screens.onboarding.firstItem.metadata.errors.networkError');
      case 'storage':
        return t('screens.onboarding.firstItem.metadata.errors.storageError');
      case 'database':
        return t('screens.onboarding.firstItem.metadata.errors.databaseError');
      case 'validation':
        return t('screens.onboarding.firstItem.metadata.errors.validationError');
      default:
        return t('screens.onboarding.firstItem.metadata.errors.unknownError');
    }
  }, [createItemMutation.error]);

  return (
    <>
      <OnboardingShell>
        <View
          style={styles.container}
          accessibilityLabel={t('screens.onboarding.firstItem.accessibility.screenLabel')}
          accessibilityHint={t('screens.onboarding.firstItem.accessibility.screenHint')}
        >
          {/* Show item preview if created successfully */}
          {createdItem ? (
            <ItemPreviewCard item={createdItem} />
          ) : (
            <>
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
            </>
          )}

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

      {/* Metadata form modal overlay */}
      <Modal
        visible={showMetadataForm}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={handleMetadataFormClose}
      >
        <ItemMetadataForm
          initialMetadata={capturedMetadata || undefined}
          onSave={handleMetadataSave}
          onRetry={handleRetry}
          onSkip={handleSkipAfterError}
          loading={createItemMutation.isPending}
          error={errorMessage}
        />
      </Modal>

      {/* Success toast */}
      <Toast
        visible={showSuccessToast}
        message={t('screens.onboarding.firstItem.success.itemSaved')}
        type="success"
        onDismiss={() => setShowSuccessToast(false)}
      />
    </>
  );
}
