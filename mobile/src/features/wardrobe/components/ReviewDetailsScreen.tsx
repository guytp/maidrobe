/**
 * Review & Details screen component for wardrobe item creation.
 *
 * This screen is displayed after the crop step completes, allowing users to:
 * - Preview the cropped image that will represent the item
 * - Optionally add a name (up to 80 characters)
 * - Optionally add tags (up to 20 tags, 30 chars each)
 * - Save the item or cancel and return to cropping
 *
 * Navigation contract:
 * - Receives CaptureImagePayload from Zustand store (captureSlice.payload)
 * - Back/Cancel: router.push('/crop') - preserves back stack for re-editing
 * - Save Success (AC10): router.replace('/wardrobe') - clears capture flow from stack
 *   * Prevents back navigation to capture/crop/review screens
 *   * Compatible with deep links and state restoration
 *   * Works for all origins (wardrobe, onboarding)
 * - Save Failure: Remains on screen for retry
 *
 * State Management:
 * - Uses component-level state for form fields (ephemeral UI state)
 * - Name and tags are not persisted until save
 * - Validation is performed inline with user feedback
 *
 * @module features/wardrobe/components/ReviewDetailsScreen
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { t } from '../../../core/i18n';
import { rgba, useTheme } from '../../../core/theme';
import { Button } from '../../../core/components/Button';
import { useStore } from '../../../core/state/store';
import { isCaptureImagePayload } from '../../../core/types/capture';
import { trackCaptureEvent } from '../../../core/telemetry';
import { useCreateItemWithImage, type CreateItemErrorType } from '../hooks/useCreateItemWithImage';
import { useInvalidateWardrobeItems } from '../api';

/**
 * Maximum character length for item name.
 */
const MAX_NAME_LENGTH = 80;

/**
 * Buffer to allow typing beyond MAX_NAME_LENGTH for validation feedback.
 * Allows users to continue typing past the limit to see the error message,
 * providing immediate inline validation feedback rather than a hard stop.
 * Without this buffer, the input would silently prevent typing at the limit,
 * making it unclear why additional characters cannot be entered.
 */
const NAME_OVERFLOW_BUFFER = 10;

/**
 * Maximum character length for a single tag.
 */
const MAX_TAG_LENGTH = 30;

/**
 * Maximum number of tags per item.
 */
const MAX_TAGS_COUNT = 20;

/**
 * Review & Details screen component.
 *
 * Displays the cropped image preview with optional name and tags inputs.
 * Protected route: requires authenticated user (enforced by route wrapper).
 *
 * @returns Review & Details screen component
 */
export function ReviewDetailsScreen(): React.JSX.Element {
  const { colors, colorScheme, spacing, radius, fontSize } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Store access
  const payload = useStore((state) => state.payload);
  const user = useStore((state) => state.user);

  // Item creation hook
  const { save, isLoading, error: saveError, reset: resetSaveError } = useCreateItemWithImage();

  // Cache invalidation hook for refreshing wardrobe list after save
  const invalidateWardrobeItems = useInvalidateWardrobeItems();

  // Form state - using component-level state for ephemeral form data
  const [name, setName] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // Ref to access current tags in callbacks without stale closure issues
  const tagsRef = useRef<string[]>([]);
  tagsRef.current = tags;

  // Validation feedback state
  const [nameError, setNameError] = useState<string | null>(null);
  const [tagFeedback, setTagFeedback] = useState<string | null>(null);

  // Validate payload
  const isValid = isCaptureImagePayload(payload);

  /**
   * Get user-friendly error message based on error type.
   */
  const getErrorMessage = useCallback((errorType: CreateItemErrorType): string => {
    const errorMessages: Record<CreateItemErrorType, string> = {
      offline: t('screens.reviewDetails.errors.offline'),
      network: t('screens.reviewDetails.errors.network'),
      storage: t('screens.reviewDetails.errors.storage'),
      database: t('screens.reviewDetails.errors.database'),
      validation: t('screens.reviewDetails.errors.validation'),
      auth: t('screens.reviewDetails.errors.auth'),
      unknown: t('screens.reviewDetails.errors.unknown'),
    };
    return errorMessages[errorType] || errorMessages.unknown;
  }, []);

  /**
   * Track screen opened event on mount.
   */
  useEffect(() => {
    if (isValid && payload) {
      trackCaptureEvent('review_details_screen_opened', {
        userId: user?.id,
        origin: payload.origin,
        source: payload.source,
      });
    }
  }, [isValid, payload, user?.id]);

  /**
   * Trim name and validate on change.
   * Trims leading/trailing whitespace and enforces 80-character limit.
   */
  const handleNameChange = useCallback((text: string) => {
    setName(text);
    // Validate against trimmed length for accurate character count
    const trimmedLength = text.trim().length;
    if (trimmedLength > MAX_NAME_LENGTH) {
      setNameError(t('screens.reviewDetails.nameTooLong'));
    } else {
      setNameError(null);
    }
  }, []);

  /**
   * Handle name field blur - trim whitespace and update display.
   * This ensures the displayed value matches what will be stored.
   */
  const handleNameBlur = useCallback(() => {
    const trimmed = name.trim();
    if (trimmed !== name) {
      setName(trimmed);
    }
    // Revalidate after trim
    if (trimmed.length > MAX_NAME_LENGTH) {
      setNameError(t('screens.reviewDetails.nameTooLong'));
    } else {
      setNameError(null);
    }
  }, [name]);

  /**
   * Handle tag input change.
   * Clears feedback when user starts typing.
   */
  const handleTagInputChange = useCallback((text: string) => {
    // Clear feedback when user starts typing
    setTagFeedback(null);
    setTagInput(text);
  }, []);

  /**
   * Attempt to add a tag with the given text.
   * Handles trimming, lowercasing, deduplication, and length/count limits.
   *
   * @param text - The tag text to add
   * @returns true if tag was added, false otherwise
   */
  const tryAddTag = useCallback(
    (text: string): boolean => {
      const trimmed = text.trim();

      // Ignore empty input
      if (!trimmed) {
        return false;
      }

      // Check tag length limit
      if (trimmed.length > MAX_TAG_LENGTH) {
        setTagFeedback(t('screens.reviewDetails.tagTooLong'));
        return false;
      }

      // Use ref to get current tags (avoids stale closure)
      const currentTags = tagsRef.current;

      // Check tag count limit
      if (currentTags.length >= MAX_TAGS_COUNT) {
        setTagFeedback(t('screens.reviewDetails.tagLimitReached'));
        return false;
      }

      // Normalize to lowercase for storage and deduplication
      const normalized = trimmed.toLowerCase();

      // Check for duplicates (case-insensitive)
      if (currentTags.includes(normalized)) {
        setTagFeedback(t('screens.reviewDetails.tagAlreadyAdded'));
        return false;
      }

      // Add the tag
      setTags((prev) => [...prev, normalized]);
      setTagFeedback(null);
      return true;
    },
    [tagsRef]
  );

  /**
   * Handle explicit add tag action (Enter/Return or Add button).
   */
  const handleAddTag = useCallback(() => {
    const success = tryAddTag(tagInput);
    if (success) {
      setTagInput('');
    }
  }, [tagInput, tryAddTag]);

  /**
   * Handle tag input submission (Enter/Return key).
   */
  const handleTagInputSubmit = useCallback(() => {
    handleAddTag();
  }, [handleAddTag]);

  /**
   * Handle tag input text change with space detection.
   * Detects trailing space as tag delimiter and adds tag automatically.
   */
  const handleTagInputChangeWithSpace = useCallback(
    (text: string) => {
      // Check if the last character is a space (tag delimiter)
      if (text.endsWith(' ') && text.trim().length > 0) {
        const tagText = text.slice(0, -1).trim();
        if (tagText) {
          const success = tryAddTag(tagText);
          if (success) {
            setTagInput('');
            return;
          }
        }
        // If tag wasn't added (duplicate, too long, etc.), keep input without trailing space
        setTagInput(text.slice(0, -1));
      } else {
        handleTagInputChange(text);
      }
    },
    [handleTagInputChange, tryAddTag]
  );

  /**
   * Remove a tag by index.
   */
  const removeTag = useCallback((index: number) => {
    setTags((prev) => prev.filter((_, i) => i !== index));
    // Clear limit feedback if we're now under the limit
    setTagFeedback(null);
  }, []);

  /**
   * Handle back/cancel action.
   * Returns to crop screen without creating item or making network calls.
   */
  const handleCancel = useCallback(() => {
    trackCaptureEvent('review_details_cancelled', {
      userId: user?.id,
      origin: payload?.origin,
      source: payload?.source,
    });

    // Navigate back to crop screen - payload is preserved for re-editing
    router.push('/crop');
  }, [router, user?.id, payload]);

  /**
   * Handle save action.
   *
   * Orchestrates the complete save flow with image upload and database insert.
   *
   * Success behavior (AC10):
   * - Navigates to /wardrobe using router.replace (not push)
   * - Clears entire capture flow from navigation stack
   * - Prevents back navigation to capture/crop/review screens
   * - Compatible with deep links and state restoration
   *
   * Failure behavior:
   * - Keeps user on screen with form data intact for retry
   * - Error displayed via saveError state
   * - User can retry or cancel
   */
  const handleSave = useCallback(async () => {
    // Validate payload is available
    if (!payload) {
      return;
    }

    // Get trimmed name for validation and storage
    const trimmedName = name.trim();

    // Validate name length before proceeding
    if (trimmedName.length > MAX_NAME_LENGTH) {
      setNameError(t('screens.reviewDetails.nameTooLong'));
      return;
    }

    // Clear any previous save errors before attempting
    resetSaveError();

    // Track save attempt
    trackCaptureEvent('review_details_save_pressed', {
      userId: user?.id,
      origin: payload.origin,
      source: payload.source,
      hasName: trimmedName.length > 0,
      tagCount: tags.length,
    });

    try {
      // Execute the save flow
      await save({
        imageUri: payload.uri,
        imageWidth: payload.width,
        imageHeight: payload.height,
        name: trimmedName,
        tags,
      });

      // Success - invalidate wardrobe cache so new item appears immediately
      // This ensures the wardrobe list refetches and shows the newly created item
      invalidateWardrobeItems();

      // Navigate to wardrobe with back-stack clearing (AC10)
      //
      // Navigation strategy: router.replace (not push)
      // - Clears entire capture flow from back stack (capture -> crop -> review-details)
      // - Prevents user from navigating back to review/crop screens after save
      // - Ensures back button returns to pre-capture screen (home, wardrobe, etc.)
      // - Compatible with deep links and state restoration (handled by Expo Router)
      // - Works correctly for both wardrobe and onboarding origins
      //
      // Rationale:
      // After successful save, the capture flow is complete and should not be
      // accessible via back navigation. This prevents confusing UX where users
      // might accidentally re-enter the flow or see stale capture state.
      router.replace('/wardrobe');
    } catch {
      // Error is already captured in hook state (saveError)
      // User stays on screen with form data intact for retry
      // Error will be displayed in the UI via saveError state
    }
  }, [name, tags, user?.id, payload, save, resetSaveError, invalidateWardrobeItems, router]);

  /**
   * Navigate to error state if payload is invalid.
   */
  const handleGoBack = useCallback(() => {
    router.push('/capture');
  }, [router]);

  // Check if save should be enabled (trimmed name within limit and not loading)
  const canSave = name.trim().length <= MAX_NAME_LENGTH && !isLoading;

  // Check if tags input should be disabled (at limit or loading)
  const isTagsAtLimit = tags.length >= MAX_TAGS_COUNT;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        scrollContent: {
          flexGrow: 1,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.lg,
          paddingBottom: spacing.xl + insets.bottom,
        },
        imageContainer: {
          alignItems: 'center',
          marginBottom: spacing.xl,
        },
        imagePreview: {
          width: '100%',
          aspectRatio: 4 / 5,
          borderRadius: radius.lg,
          backgroundColor: colors.textSecondary,
        },
        formSection: {
          flex: 1,
        },
        inputGroup: {
          marginBottom: spacing.lg,
        },
        label: {
          fontSize: fontSize.base,
          fontWeight: '600',
          color: colors.textPrimary,
          marginBottom: spacing.xs,
        },
        helper: {
          fontSize: fontSize.sm,
          color: colors.textSecondary,
          marginBottom: spacing.sm,
        },
        input: {
          backgroundColor: colors.background,
          borderWidth: 1,
          borderColor: colors.textSecondary,
          borderRadius: radius.md,
          padding: spacing.md,
          fontSize: fontSize.base,
          color: colors.textPrimary,
          minHeight: 44,
        },
        inputError: {
          borderColor: colors.error,
        },
        inputDisabled: {
          backgroundColor: colorScheme === 'dark' ? '#1a1a1a' : '#f5f5f5',
          color: colors.textSecondary,
        },
        characterCounter: {
          fontSize: fontSize.xs,
          color: colors.textSecondary,
          textAlign: 'right',
          marginTop: spacing.xs,
        },
        characterCounterError: {
          color: colors.error,
        },
        errorText: {
          color: colors.error,
          fontSize: fontSize.sm,
          marginTop: spacing.xs,
        },
        feedbackText: {
          color: colors.textSecondary,
          fontSize: fontSize.sm,
          marginTop: spacing.xs,
          fontStyle: 'italic',
        },
        tagInputRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
        },
        tagInputWrapper: {
          flex: 1,
        },
        addTagButton: {
          minHeight: 44,
          minWidth: 44,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          backgroundColor: colors.textPrimary,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
        },
        addTagButtonDisabled: {
          opacity: 0.5,
        },
        addTagButtonText: {
          color: colors.background,
          fontSize: fontSize.sm,
          fontWeight: '600',
        },
        tagCountIndicator: {
          fontSize: fontSize.xs,
          color: colors.textSecondary,
          marginTop: spacing.xs,
        },
        tagCountAtLimit: {
          color: colors.warning,
        },
        tagsContainer: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: spacing.sm,
          marginTop: spacing.sm,
        },
        tagChip: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colorScheme === 'dark' ? '#333333' : '#f0f0f0',
          borderRadius: radius.lg,
          paddingVertical: spacing.xs,
          paddingLeft: spacing.md,
          paddingRight: spacing.xs,
        },
        tagText: {
          fontSize: fontSize.sm,
          color: colors.textPrimary,
          marginRight: spacing.xs,
        },
        tagRemoveButton: {
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: colorScheme === 'dark' ? '#555555' : '#dddddd',
          alignItems: 'center',
          justifyContent: 'center',
        },
        tagRemoveText: {
          fontSize: fontSize.base,
          color: colors.textSecondary,
          fontWeight: '600',
          lineHeight: 20,
        },
        buttonContainer: {
          marginTop: spacing.xl,
          gap: spacing.md,
        },
        errorBanner: {
          backgroundColor: rgba(colors.error, 0.08),
          borderWidth: 1,
          borderColor: colors.error,
          borderRadius: radius.md,
          padding: spacing.md,
          marginBottom: spacing.sm,
        },
        errorBannerText: {
          color: colors.error,
          fontSize: fontSize.sm,
          textAlign: 'center',
        },
        errorContent: {
          flex: 1,
          padding: spacing.lg,
          justifyContent: 'center',
          alignItems: 'center',
        },
        errorIcon: {
          fontSize: 64,
          marginBottom: spacing.md,
        },
        errorTitle: {
          fontSize: fontSize['2xl'],
          fontWeight: '600',
          color: colors.textPrimary,
          marginBottom: spacing.sm,
          textAlign: 'center',
        },
        errorMessage: {
          fontSize: fontSize.base,
          color: colors.textSecondary,
          marginBottom: spacing.xl,
          textAlign: 'center',
          maxWidth: 300,
        },
      }),
    [colors, colorScheme, spacing, radius, fontSize, insets.bottom]
  );

  // Show error state if payload is invalid
  if (!isValid || !payload) {
    return (
      <View
        style={styles.container}
        accessibilityLabel={t('screens.reviewDetails.accessibility.screenLabel')}
      >
        <View style={styles.errorContent}>
          <Text
            style={styles.errorIcon}
            accessibilityLabel={t('screens.reviewDetails.accessibility.errorIcon')}
            accessibilityRole="image"
          >
            {'!'}
          </Text>
          <Text
            style={styles.errorTitle}
            allowFontScaling={true}
            maxFontSizeMultiplier={2}
            accessibilityRole="header"
          >
            {t('screens.reviewDetails.errors.noImage')}
          </Text>
          <Text style={styles.errorMessage} allowFontScaling={true} maxFontSizeMultiplier={2}>
            {t('screens.reviewDetails.errors.invalidPayload')}
          </Text>
          <Button
            onPress={handleGoBack}
            variant="primary"
            accessibilityLabel={t('screens.reviewDetails.accessibility.goBackButton')}
            accessibilityHint={t('screens.reviewDetails.accessibility.goBackHint')}
          >
            {t('screens.reviewDetails.goBack')}
          </Button>
        </View>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
        accessibilityLabel={t('screens.reviewDetails.accessibility.screenLabel')}
        accessibilityHint={t('screens.reviewDetails.accessibility.screenHint')}
      >
        {/* Image Preview */}
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: payload.uri }}
            style={styles.imagePreview}
            resizeMode="cover"
            accessibilityLabel={t('screens.reviewDetails.accessibility.imagePreview')}
            accessibilityRole="image"
          />
        </View>

        {/* Form Section */}
        <View style={styles.formSection}>
          {/* Name Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label} allowFontScaling={true} maxFontSizeMultiplier={2}>
              {t('screens.reviewDetails.nameLabel')}
            </Text>
            <Text style={styles.helper} allowFontScaling={true} maxFontSizeMultiplier={2}>
              {t('screens.reviewDetails.nameHelper')}
            </Text>
            <TextInput
              style={[
                styles.input,
                nameError && styles.inputError,
                isLoading && styles.inputDisabled,
              ]}
              value={name}
              onChangeText={handleNameChange}
              onBlur={handleNameBlur}
              placeholder={t('screens.reviewDetails.namePlaceholder')}
              placeholderTextColor={colors.textSecondary}
              maxLength={MAX_NAME_LENGTH + NAME_OVERFLOW_BUFFER}
              returnKeyType="done"
              editable={!isLoading}
              accessibilityLabel={t('screens.reviewDetails.accessibility.nameInput')}
              accessibilityHint={t('screens.reviewDetails.accessibility.nameInputHint')}
              allowFontScaling={true}
            />
            <Text
              style={[
                styles.characterCounter,
                name.trim().length > MAX_NAME_LENGTH && styles.characterCounterError,
              ]}
              allowFontScaling={true}
              maxFontSizeMultiplier={2}
            >
              {name.trim().length}/{MAX_NAME_LENGTH}
            </Text>
            {nameError && (
              <Text
                style={styles.errorText}
                accessibilityRole="alert"
                allowFontScaling={true}
                maxFontSizeMultiplier={2}
              >
                {nameError}
              </Text>
            )}
          </View>

          {/* Tags Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label} allowFontScaling={true} maxFontSizeMultiplier={2}>
              {t('screens.reviewDetails.tagsLabel')}
            </Text>
            <Text style={styles.helper} allowFontScaling={true} maxFontSizeMultiplier={2}>
              {t('screens.reviewDetails.tagsHelper')}
            </Text>

            {/* Tag input row with Add button */}
            <View style={styles.tagInputRow}>
              <View style={styles.tagInputWrapper}>
                <TextInput
                  style={[styles.input, (isTagsAtLimit || isLoading) && styles.inputDisabled]}
                  value={tagInput}
                  onChangeText={handleTagInputChangeWithSpace}
                  onSubmitEditing={handleTagInputSubmit}
                  placeholder={
                    isTagsAtLimit
                      ? t('screens.reviewDetails.tagLimitReached')
                      : t('screens.reviewDetails.tagsPlaceholder')
                  }
                  placeholderTextColor={colors.textSecondary}
                  returnKeyType="done"
                  blurOnSubmit={false}
                  editable={!isTagsAtLimit && !isLoading}
                  accessibilityLabel={t('screens.reviewDetails.accessibility.tagsInput')}
                  accessibilityHint={t('screens.reviewDetails.accessibility.tagsInputHint')}
                  allowFontScaling={true}
                />
              </View>
              <Pressable
                style={[
                  styles.addTagButton,
                  (isTagsAtLimit || !tagInput.trim() || isLoading) && styles.addTagButtonDisabled,
                ]}
                onPress={handleAddTag}
                disabled={isTagsAtLimit || !tagInput.trim() || isLoading}
                accessibilityLabel={t('screens.reviewDetails.accessibility.addTagButton')}
                accessibilityHint={t('screens.reviewDetails.accessibility.addTagButtonHint')}
                accessibilityRole="button"
                accessibilityState={{ disabled: isTagsAtLimit || !tagInput.trim() || isLoading }}
              >
                <Text style={styles.addTagButtonText}>
                  {t('screens.reviewDetails.addTagButton')}
                </Text>
              </Pressable>
            </View>

            {/* Tag count indicator */}
            <Text
              style={[styles.tagCountIndicator, isTagsAtLimit && styles.tagCountAtLimit]}
              allowFontScaling={true}
              maxFontSizeMultiplier={2}
            >
              {t('screens.reviewDetails.tagCount')
                .replace('{count}', tags.length.toString())
                .replace('{max}', MAX_TAGS_COUNT.toString())}
            </Text>

            {/* Tag feedback message */}
            {tagFeedback && (
              <Text
                style={styles.feedbackText}
                accessibilityRole="alert"
                allowFontScaling={true}
                maxFontSizeMultiplier={2}
              >
                {tagFeedback}
              </Text>
            )}

            {/* Tag Chips */}
            {tags.length > 0 && (
              <View style={styles.tagsContainer}>
                {tags.map((tag, index) => (
                  <View
                    key={`${tag}-${index}`}
                    style={styles.tagChip}
                    accessibilityLabel={`${t('screens.reviewDetails.accessibility.tagChip')}: ${tag}`}
                  >
                    <Text style={styles.tagText} allowFontScaling={true} maxFontSizeMultiplier={2}>
                      {tag}
                    </Text>
                    <Pressable
                      style={styles.tagRemoveButton}
                      onPress={() => removeTag(index)}
                      accessibilityLabel={`${t('screens.reviewDetails.accessibility.removeTag')}: ${tag}`}
                      accessibilityRole="button"
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Text style={styles.tagRemoveText}>x</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          {/* Error Banner */}
          {saveError && (
            <View style={styles.errorBanner} accessibilityRole="alert">
              <Text
                style={styles.errorBannerText}
                allowFontScaling={true}
                maxFontSizeMultiplier={2}
              >
                {getErrorMessage(saveError.errorType)}
              </Text>
            </View>
          )}

          <Button
            onPress={handleSave}
            variant="primary"
            disabled={!canSave}
            accessibilityLabel={
              saveError
                ? t('screens.reviewDetails.retry')
                : t('screens.reviewDetails.accessibility.saveButton')
            }
            accessibilityHint={t('screens.reviewDetails.accessibility.saveButtonHint')}
          >
            {isLoading
              ? t('screens.reviewDetails.saving')
              : saveError
                ? t('screens.reviewDetails.retry')
                : t('screens.reviewDetails.saveButton')}
          </Button>
          <Button
            onPress={handleCancel}
            variant="text"
            disabled={isLoading}
            accessibilityLabel={t('screens.reviewDetails.accessibility.cancelButton')}
            accessibilityHint={t('screens.reviewDetails.accessibility.cancelButtonHint')}
          >
            {t('screens.reviewDetails.cancelButton')}
          </Button>
        </View>
      </ScrollView>

      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </KeyboardAvoidingView>
  );
}
