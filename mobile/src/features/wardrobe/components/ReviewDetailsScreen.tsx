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
 * - Back/Cancel: Returns to /crop without creating item
 * - Save: Will trigger item creation flow (implemented in later step)
 *
 * @module features/wardrobe/components/ReviewDetailsScreen
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useTheme } from '../../../core/theme';
import { Button } from '../../../core/components/Button';
import { useStore } from '../../../core/state/store';
import { isCaptureImagePayload } from '../../../core/types/capture';
import { trackCaptureEvent } from '../../../core/telemetry';

/**
 * Maximum character length for item name.
 */
const MAX_NAME_LENGTH = 80;

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

  // Form state
  const [name, setName] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // Validation feedback state
  const [nameError, setNameError] = useState<string | null>(null);
  const [tagFeedback, setTagFeedback] = useState<string | null>(null);

  // Validate payload
  const isValid = isCaptureImagePayload(payload);

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
   * Handle name input change with validation.
   */
  const handleNameChange = useCallback((text: string) => {
    setName(text);
    if (text.length > MAX_NAME_LENGTH) {
      setNameError(t('screens.reviewDetails.nameTooLong'));
    } else {
      setNameError(null);
    }
  }, []);

  /**
   * Handle tag input change.
   */
  const handleTagInputChange = useCallback(
    (text: string) => {
      // Clear feedback when user starts typing
      if (tagFeedback) {
        setTagFeedback(null);
      }
      setTagInput(text);
    },
    [tagFeedback]
  );

  /**
   * Normalize and add a tag from the current input.
   * Handles trimming, lowercasing, deduplication, and length/count limits.
   */
  const addTag = useCallback(() => {
    const trimmed = tagInput.trim();

    // Ignore empty input
    if (!trimmed) {
      setTagInput('');
      return;
    }

    // Check tag length
    if (trimmed.length > MAX_TAG_LENGTH) {
      setTagFeedback(t('screens.reviewDetails.tagTooLong'));
      return;
    }

    // Check tag count limit
    if (tags.length >= MAX_TAGS_COUNT) {
      setTagFeedback(t('screens.reviewDetails.tagLimitReached'));
      setTagInput('');
      return;
    }

    // Normalize to lowercase for storage and deduplication
    const normalized = trimmed.toLowerCase();

    // Check for duplicates (case-insensitive)
    if (tags.includes(normalized)) {
      setTagFeedback(t('screens.reviewDetails.tagAlreadyAdded'));
      setTagInput('');
      return;
    }

    // Add the tag
    setTags((prev) => [...prev, normalized]);
    setTagInput('');
    setTagFeedback(null);
  }, [tagInput, tags]);

  /**
   * Handle tag input key press for Enter/Return.
   */
  const handleTagInputSubmit = useCallback(() => {
    addTag();
  }, [addTag]);

  /**
   * Handle tag input text change to detect space for tag confirmation.
   */
  const handleTagInputChangeWithSpace = useCallback(
    (text: string) => {
      // Check if the last character is a space (tag delimiter)
      if (text.endsWith(' ') && text.trim().length > 0) {
        // Set the input without the trailing space, then add the tag
        setTagInput(text.slice(0, -1));
        // Use setTimeout to ensure state is updated before addTag runs
        setTimeout(() => {
          const trimmed = text.slice(0, -1).trim();
          if (trimmed) {
            // Inline the add logic to use the correct value
            if (trimmed.length > MAX_TAG_LENGTH) {
              setTagFeedback(t('screens.reviewDetails.tagTooLong'));
              return;
            }
            if (tags.length >= MAX_TAGS_COUNT) {
              setTagFeedback(t('screens.reviewDetails.tagLimitReached'));
              setTagInput('');
              return;
            }
            const normalized = trimmed.toLowerCase();
            if (tags.includes(normalized)) {
              setTagFeedback(t('screens.reviewDetails.tagAlreadyAdded'));
              setTagInput('');
              return;
            }
            setTags((prev) => [...prev, normalized]);
            setTagInput('');
            setTagFeedback(null);
          }
        }, 0);
      } else {
        handleTagInputChange(text);
      }
    },
    [handleTagInputChange, tags]
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
   * For now, this is a placeholder - full implementation in Step 3.
   */
  const handleSave = useCallback(() => {
    // Validate name length before proceeding
    if (name.length > MAX_NAME_LENGTH) {
      setNameError(t('screens.reviewDetails.nameTooLong'));
      return;
    }

    // TODO: Step 3 will implement the full save flow with:
    // - Image preparation and upload
    // - Item creation in database
    // - Navigation to wardrobe
    // For now, just log that save was pressed
    trackCaptureEvent('review_details_save_pressed', {
      userId: user?.id,
      origin: payload?.origin,
      source: payload?.source,
      hasName: name.trim().length > 0,
      tagCount: tags.length,
    });
  }, [name, tags, user?.id, payload]);

  /**
   * Navigate to error state if payload is invalid.
   */
  const handleGoBack = useCallback(() => {
    router.push('/capture');
  }, [router]);

  // Check if save should be enabled (name within limit)
  const canSave = name.length <= MAX_NAME_LENGTH;

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
              style={[styles.input, nameError && styles.inputError]}
              value={name}
              onChangeText={handleNameChange}
              placeholder={t('screens.reviewDetails.namePlaceholder')}
              placeholderTextColor={colors.textSecondary}
              maxLength={MAX_NAME_LENGTH + 10} // Allow slightly over to show error
              returnKeyType="done"
              accessibilityLabel={t('screens.reviewDetails.accessibility.nameInput')}
              accessibilityHint={t('screens.reviewDetails.accessibility.nameInputHint')}
              allowFontScaling={true}
            />
            <Text
              style={[
                styles.characterCounter,
                name.length > MAX_NAME_LENGTH && styles.characterCounterError,
              ]}
              allowFontScaling={true}
              maxFontSizeMultiplier={2}
            >
              {name.length}/{MAX_NAME_LENGTH}
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
            <TextInput
              style={styles.input}
              value={tagInput}
              onChangeText={handleTagInputChangeWithSpace}
              onSubmitEditing={handleTagInputSubmit}
              placeholder={t('screens.reviewDetails.tagsPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              returnKeyType="done"
              blurOnSubmit={false}
              accessibilityLabel={t('screens.reviewDetails.accessibility.tagsInput')}
              accessibilityHint={t('screens.reviewDetails.accessibility.tagsInputHint')}
              allowFontScaling={true}
            />
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
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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
          <Button
            onPress={handleSave}
            variant="primary"
            disabled={!canSave}
            accessibilityLabel={t('screens.reviewDetails.accessibility.saveButton')}
            accessibilityHint={t('screens.reviewDetails.accessibility.saveButtonHint')}
          >
            {t('screens.reviewDetails.saveButton')}
          </Button>
          <Button
            onPress={handleCancel}
            variant="text"
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
