/**
 * Item Detail screen component for viewing and editing wardrobe items.
 *
 * This screen displays a single wardrobe item with:
 * - Large image preview (with fallback chain)
 * - Editable name field
 * - Editable tags chip list
 * - Read-only AI attributes summary
 * - Save and Delete actions
 *
 * Handles three main states:
 * 1. Loading - Shows skeleton placeholders
 * 2. Loaded - Shows item details with edit capabilities
 * 3. Error - Shows error message and navigates back to grid
 *
 * Navigation contract:
 * - Entry: /wardrobe/[id] with itemId route param
 * - Error: Auto-navigates back to /wardrobe after displaying error
 * - Success (after save/delete): Handled in future steps
 *
 * @module features/wardrobe/components/ItemDetailScreen
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
import { useTheme } from '../../../core/theme';
import { Button } from '../../../core/components/Button';
import { useWardrobeItem } from '../api';
import { getDetailImageUrl } from '../utils/getItemImageUrl';
import type { ItemDetail } from '../types';

/**
 * Maximum character length for item name (per user story spec).
 */
const MAX_NAME_LENGTH = 100;

/**
 * Buffer to allow typing beyond MAX_NAME_LENGTH for validation feedback.
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
 * Delay before auto-navigating back on error (ms).
 */
const ERROR_NAVIGATION_DELAY = 3000;

/**
 * Props for ItemDetailScreen component.
 */
export interface ItemDetailScreenProps {
  /**
   * The ID of the item to display.
   */
  itemId: string;
}

/**
 * Formats AI attributes into a human-readable summary string.
 *
 * Creates a concise summary from available AI attributes following patterns:
 * - With colour, type, and season(s): "blue shirt · all-season"
 * - With type only: "shirt"
 * - With colour only: "blue item"
 * - With season(s) only: "all-season item"
 *
 * @param item - Item detail with AI attributes
 * @returns Formatted summary string or null if no usable attributes
 */
function formatAISummary(item: ItemDetail): string | null {
  const parts: string[] = [];

  // Build the main description (colour + type)
  const hasColour = item.colour && item.colour.length > 0;
  const hasType = item.type;

  if (hasColour && hasType) {
    // "blue shirt"
    parts.push(`${item.colour![0]} ${item.type}`);
  } else if (hasType) {
    // "shirt"
    parts.push(item.type!);
  } else if (hasColour) {
    // "blue item"
    parts.push(`${item.colour![0]} item`);
  }

  // Add season if available
  const hasSeason = item.season && item.season.length > 0;
  if (hasSeason) {
    const seasonText =
      item.season!.length === 4 ? 'all-season' : item.season!.join(' / ').toLowerCase();

    if (parts.length > 0) {
      // "blue shirt · all-season"
      parts.push(seasonText);
    } else {
      // "all-season item"
      parts.push(`${seasonText} item`);
    }
  }

  // Return null if no usable attributes
  if (parts.length === 0) {
    return null;
  }

  return parts.join(' · ');
}

/**
 * Loading skeleton component for the item detail screen.
 *
 * Displays placeholder elements that match the layout of the loaded state,
 * providing visual feedback during data fetching.
 */
function LoadingSkeleton(): React.JSX.Element {
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();

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
        imageSkeleton: {
          width: '100%',
          aspectRatio: 4 / 5,
          borderRadius: radius.lg,
          backgroundColor: colors.textSecondary + '20',
          marginBottom: spacing.xl,
        },
        labelSkeleton: {
          width: 60,
          height: 16,
          borderRadius: radius.sm,
          backgroundColor: colors.textSecondary + '20',
          marginBottom: spacing.sm,
        },
        inputSkeleton: {
          width: '100%',
          height: 48,
          borderRadius: radius.md,
          backgroundColor: colors.textSecondary + '15',
          marginBottom: spacing.lg,
        },
        tagsSkeleton: {
          flexDirection: 'row',
          gap: spacing.sm,
          marginBottom: spacing.lg,
        },
        tagSkeleton: {
          width: 70,
          height: 32,
          borderRadius: radius.lg,
          backgroundColor: colors.textSecondary + '15',
        },
        aiSummarySkeleton: {
          width: '80%',
          height: 20,
          borderRadius: radius.sm,
          backgroundColor: colors.textSecondary + '15',
          marginBottom: spacing.xl,
        },
        buttonSkeleton: {
          width: '100%',
          height: 48,
          borderRadius: radius.md,
          backgroundColor: colors.textSecondary + '15',
          marginBottom: spacing.md,
        },
      }),
    [colors, spacing, radius, insets.bottom]
  );

  return (
    <View
      style={styles.container}
      accessibilityLabel={t('screens.itemDetail.accessibility.loadingScreen')}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Image skeleton */}
        <View style={styles.imageSkeleton} />

        {/* Name section skeleton */}
        <View style={styles.labelSkeleton} />
        <View style={styles.inputSkeleton} />

        {/* Tags section skeleton */}
        <View style={styles.labelSkeleton} />
        <View style={styles.tagsSkeleton}>
          <View style={styles.tagSkeleton} />
          <View style={styles.tagSkeleton} />
          <View style={[styles.tagSkeleton, { width: 90 }]} />
        </View>

        {/* AI summary skeleton */}
        <View style={styles.labelSkeleton} />
        <View style={styles.aiSummarySkeleton} />

        {/* Buttons skeleton */}
        <View style={{ flex: 1 }} />
        <View style={styles.buttonSkeleton} />
        <View style={[styles.buttonSkeleton, { backgroundColor: 'transparent' }]} />
      </ScrollView>
    </View>
  );
}

/**
 * Error state component for the item detail screen.
 *
 * Displays an error message and provides a button to navigate back.
 * Also triggers auto-navigation after a delay.
 *
 * @param onGoBack - Callback to navigate back to wardrobe grid
 * @param errorMessage - Error message to display
 */
function ErrorState({
  onGoBack,
  errorMessage,
}: {
  onGoBack: () => void;
  errorMessage: string;
}): React.JSX.Element {
  const { colors, spacing, fontSize, colorScheme } = useTheme();
  const insets = useSafeAreaInsets();

  // Auto-navigate back after delay
  useEffect(() => {
    const timer = setTimeout(() => {
      onGoBack();
    }, ERROR_NAVIGATION_DELAY);

    return () => clearTimeout(timer);
  }, [onGoBack]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
          paddingBottom: insets.bottom,
        },
        content: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: spacing.lg,
        },
        icon: {
          fontSize: 64,
          marginBottom: spacing.lg,
        },
        title: {
          fontSize: fontSize['xl'],
          fontWeight: '600',
          color: colors.textPrimary,
          marginBottom: spacing.sm,
          textAlign: 'center',
        },
        message: {
          fontSize: fontSize.base,
          color: colors.textSecondary,
          marginBottom: spacing.xl,
          textAlign: 'center',
          maxWidth: 300,
        },
        buttonContainer: {
          minWidth: 200,
        },
      }),
    [colors, spacing, fontSize, insets.bottom]
  );

  return (
    <View
      style={styles.container}
      accessibilityLabel={t('screens.itemDetail.accessibility.errorState')}
    >
      <View style={styles.content}>
        <Text style={styles.icon} accessibilityRole="image">
          !
        </Text>
        <Text
          style={styles.title}
          allowFontScaling
          maxFontSizeMultiplier={2}
          accessibilityRole="header"
        >
          {t('screens.itemDetail.errors.loadFailed')}
        </Text>
        <Text style={styles.message} allowFontScaling maxFontSizeMultiplier={2}>
          {errorMessage}
        </Text>
        <View style={styles.buttonContainer}>
          <Button
            onPress={onGoBack}
            variant="primary"
            accessibilityLabel={t('screens.itemDetail.accessibility.goBackButton')}
            accessibilityHint={t('screens.itemDetail.accessibility.goBackHint')}
          >
            {t('screens.itemDetail.goBack')}
          </Button>
        </View>
      </View>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}

/**
 * Item Detail screen component.
 *
 * Displays a single wardrobe item with editing capabilities for name and tags,
 * read-only AI attributes summary, and save/delete actions.
 *
 * @param props - Component props containing itemId
 * @returns Item Detail screen component
 */
export function ItemDetailScreen({ itemId }: ItemDetailScreenProps): React.JSX.Element {
  const { colors, colorScheme, spacing, radius, fontSize } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Fetch item data
  const { item, isLoading, isError, error } = useWardrobeItem({ itemId });

  // Form state - initialized from item data when loaded
  const [name, setName] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isFormInitialized, setIsFormInitialized] = useState(false);

  // Track image load errors
  const [imageError, setImageError] = useState(false);

  // Validation feedback state
  const [nameError, setNameError] = useState<string | null>(null);
  const [tagFeedback, setTagFeedback] = useState<string | null>(null);

  // Ref to access current tags in callbacks without stale closure issues
  const tagsRef = useRef<string[]>([]);
  tagsRef.current = tags;

  // Initialize form state when item data loads
  useEffect(() => {
    if (item && !isFormInitialized) {
      setName(item.name ?? '');
      setTags(item.tags ?? []);
      setIsFormInitialized(true);
    }
  }, [item, isFormInitialized]);

  // Get image URL with fallback chain
  const imageUrl = useMemo(() => {
    if (!item) return null;
    return getDetailImageUrl(item);
  }, [item]);

  // Format AI summary
  const aiSummary = useMemo(() => {
    if (!item) return null;
    return formatAISummary(item);
  }, [item]);

  // Check if AI attributes are available
  const hasAIAttributes = item?.attribute_status === 'succeeded' && aiSummary !== null;

  // Navigation callback
  const handleGoBack = useCallback(() => {
    router.back();
  }, [router]);

  // Name change handler with validation
  const handleNameChange = useCallback((text: string) => {
    setName(text);
    const trimmedLength = text.trim().length;
    if (trimmedLength > MAX_NAME_LENGTH) {
      setNameError(t('screens.itemDetail.nameTooLong'));
    } else {
      setNameError(null);
    }
  }, []);

  // Name blur handler - trim whitespace
  const handleNameBlur = useCallback(() => {
    const trimmed = name.trim();
    if (trimmed !== name) {
      setName(trimmed);
    }
    if (trimmed.length > MAX_NAME_LENGTH) {
      setNameError(t('screens.itemDetail.nameTooLong'));
    } else {
      setNameError(null);
    }
  }, [name]);

  // Tag input change handler
  const handleTagInputChange = useCallback((text: string) => {
    setTagFeedback(null);
    setTagInput(text);
  }, []);

  // Try to add a tag
  const tryAddTag = useCallback((text: string): boolean => {
    const trimmed = text.trim();

    if (!trimmed) {
      return false;
    }

    if (trimmed.length > MAX_TAG_LENGTH) {
      setTagFeedback(t('screens.itemDetail.tagTooLong'));
      return false;
    }

    const currentTags = tagsRef.current;

    if (currentTags.length >= MAX_TAGS_COUNT) {
      setTagFeedback(t('screens.itemDetail.tagLimitReached'));
      return false;
    }

    const normalized = trimmed.toLowerCase();

    if (currentTags.includes(normalized)) {
      setTagFeedback(t('screens.itemDetail.tagAlreadyAdded'));
      return false;
    }

    setTags((prev) => [...prev, normalized]);
    setTagFeedback(null);
    return true;
  }, []);

  // Add tag handler
  const handleAddTag = useCallback(() => {
    const success = tryAddTag(tagInput);
    if (success) {
      setTagInput('');
    }
  }, [tagInput, tryAddTag]);

  // Tag input submit handler
  const handleTagInputSubmit = useCallback(() => {
    handleAddTag();
  }, [handleAddTag]);

  // Tag input with space detection
  const handleTagInputChangeWithSpace = useCallback(
    (text: string) => {
      if (text.endsWith(' ') && text.trim().length > 0) {
        const tagText = text.slice(0, -1).trim();
        if (tagText) {
          const success = tryAddTag(tagText);
          if (success) {
            setTagInput('');
            return;
          }
        }
        setTagInput(text.slice(0, -1));
      } else {
        handleTagInputChange(text);
      }
    },
    [handleTagInputChange, tryAddTag]
  );

  // Remove tag handler
  const removeTag = useCallback((index: number) => {
    setTags((prev) => prev.filter((_, i) => i !== index));
    setTagFeedback(null);
  }, []);

  // Image error handler
  const handleImageError = useCallback(() => {
    setImageError(true);
  }, []);

  // Placeholder save handler (functionality in later steps)
  const handleSave = useCallback(() => {
    // TODO: Will be implemented in Step 4
  }, []);

  // Placeholder delete handler (functionality in later steps)
  const handleDelete = useCallback(() => {
    // TODO: Will be implemented in Step 5
  }, []);

  // Determine if image should show placeholder
  const showImagePlaceholder = !imageUrl || imageError;

  // Check if tags input should be disabled (at limit)
  const isTagsAtLimit = tags.length >= MAX_TAGS_COUNT;

  // Display name for accessibility
  const displayName = item?.name?.trim() || t('screens.wardrobe.grid.itemName');

  // Build styles
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
        image: {
          width: '100%',
          aspectRatio: 4 / 5,
          borderRadius: radius.lg,
          backgroundColor: colors.textSecondary + '10',
        },
        imagePlaceholder: {
          width: '100%',
          aspectRatio: 4 / 5,
          borderRadius: radius.lg,
          backgroundColor: colors.textSecondary + '15',
          justifyContent: 'center',
          alignItems: 'center',
        },
        placeholderIcon: {
          fontSize: fontSize['5xl'],
          color: colors.textSecondary,
          opacity: 0.5,
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
        aiSummarySection: {
          marginBottom: spacing.lg,
          padding: spacing.md,
          backgroundColor: colorScheme === 'dark' ? '#1a1a1a' : '#f8f8f8',
          borderRadius: radius.md,
        },
        aiSummaryLabel: {
          fontSize: fontSize.sm,
          fontWeight: '600',
          color: colors.textSecondary,
          marginBottom: spacing.xs,
        },
        aiSummaryText: {
          fontSize: fontSize.base,
          color: colors.textPrimary,
          fontStyle: 'italic',
        },
        buttonContainer: {
          marginTop: spacing.xl,
          gap: spacing.md,
        },
        deleteButton: {
          minHeight: 44,
          paddingVertical: spacing.md,
          alignItems: 'center',
          justifyContent: 'center',
        },
        deleteButtonText: {
          color: colors.error,
          fontSize: fontSize.base,
          fontWeight: '600',
        },
      }),
    [colors, colorScheme, spacing, radius, fontSize, insets.bottom]
  );

  // Show loading skeleton
  if (isLoading && !item) {
    return (
      <>
        <LoadingSkeleton />
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </>
    );
  }

  // Show error state
  if (isError || (!isLoading && !item)) {
    const errorMessage =
      error?.code === 'notFound'
        ? t('screens.itemDetail.errors.notFound')
        : error?.code === 'network'
          ? t('screens.itemDetail.errors.network')
          : t('screens.itemDetail.errors.loadFailed');

    return <ErrorState onGoBack={handleGoBack} errorMessage={errorMessage} />;
  }

  // Show loaded state
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
        accessibilityLabel={t('screens.itemDetail.accessibility.screenLabel')}
        accessibilityHint={t('screens.itemDetail.accessibility.screenHint')}
      >
        {/* Image */}
        <View style={styles.imageContainer}>
          {showImagePlaceholder ? (
            <View
              style={styles.imagePlaceholder}
              accessibilityLabel={t('screens.itemDetail.accessibility.itemImagePlaceholder')}
            >
              <Text style={styles.placeholderIcon} accessibilityRole="image">
                {''}
              </Text>
            </View>
          ) : (
            <Image
              source={{ uri: imageUrl! }}
              style={styles.image}
              resizeMode="cover"
              onError={handleImageError}
              accessibilityLabel={t('screens.itemDetail.accessibility.itemImage').replace(
                '{name}',
                displayName
              )}
              accessibilityIgnoresInvertColors
            />
          )}
        </View>

        {/* Form Section */}
        <View style={styles.formSection}>
          {/* Name Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label} allowFontScaling maxFontSizeMultiplier={2}>
              {t('screens.itemDetail.nameLabel')}
            </Text>
            <Text style={styles.helper} allowFontScaling maxFontSizeMultiplier={2}>
              {t('screens.itemDetail.nameHelper')}
            </Text>
            <TextInput
              style={[styles.input, nameError && styles.inputError]}
              value={name}
              onChangeText={handleNameChange}
              onBlur={handleNameBlur}
              placeholder={t('screens.itemDetail.namePlaceholder')}
              placeholderTextColor={colors.textSecondary}
              maxLength={MAX_NAME_LENGTH + NAME_OVERFLOW_BUFFER}
              returnKeyType="done"
              accessibilityLabel={t('screens.itemDetail.accessibility.nameInput')}
              accessibilityHint={t('screens.itemDetail.accessibility.nameInputHint')}
              allowFontScaling
            />
            <Text
              style={[
                styles.characterCounter,
                name.trim().length > MAX_NAME_LENGTH && styles.characterCounterError,
              ]}
              allowFontScaling
              maxFontSizeMultiplier={2}
            >
              {name.trim().length}/{MAX_NAME_LENGTH}
            </Text>
            {nameError && (
              <Text
                style={styles.errorText}
                accessibilityRole="alert"
                allowFontScaling
                maxFontSizeMultiplier={2}
              >
                {nameError}
              </Text>
            )}
          </View>

          {/* Tags Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label} allowFontScaling maxFontSizeMultiplier={2}>
              {t('screens.itemDetail.tagsLabel')}
            </Text>
            <Text style={styles.helper} allowFontScaling maxFontSizeMultiplier={2}>
              {t('screens.itemDetail.tagsHelper')}
            </Text>

            {/* Tag input row */}
            <View style={styles.tagInputRow}>
              <View style={styles.tagInputWrapper}>
                <TextInput
                  style={[styles.input, isTagsAtLimit && styles.inputDisabled]}
                  value={tagInput}
                  onChangeText={handleTagInputChangeWithSpace}
                  onSubmitEditing={handleTagInputSubmit}
                  placeholder={
                    isTagsAtLimit
                      ? t('screens.itemDetail.tagLimitReached')
                      : t('screens.itemDetail.tagsPlaceholder')
                  }
                  placeholderTextColor={colors.textSecondary}
                  returnKeyType="done"
                  blurOnSubmit={false}
                  editable={!isTagsAtLimit}
                  accessibilityLabel={t('screens.itemDetail.accessibility.tagsInput')}
                  accessibilityHint={t('screens.itemDetail.accessibility.tagsInputHint')}
                  allowFontScaling
                />
              </View>
              <Pressable
                style={[
                  styles.addTagButton,
                  (isTagsAtLimit || !tagInput.trim()) && styles.addTagButtonDisabled,
                ]}
                onPress={handleAddTag}
                disabled={isTagsAtLimit || !tagInput.trim()}
                accessibilityLabel={t('screens.itemDetail.accessibility.addTagButton')}
                accessibilityHint={t('screens.itemDetail.accessibility.addTagButtonHint')}
                accessibilityRole="button"
                accessibilityState={{ disabled: isTagsAtLimit || !tagInput.trim() }}
              >
                <Text style={styles.addTagButtonText}>{t('screens.itemDetail.addTagButton')}</Text>
              </Pressable>
            </View>

            {/* Tag count indicator */}
            <Text
              style={[styles.tagCountIndicator, isTagsAtLimit && styles.tagCountAtLimit]}
              allowFontScaling
              maxFontSizeMultiplier={2}
            >
              {t('screens.itemDetail.tagCount')
                .replace('{count}', tags.length.toString())
                .replace('{max}', MAX_TAGS_COUNT.toString())}
            </Text>

            {/* Tag feedback */}
            {tagFeedback && (
              <Text
                style={styles.feedbackText}
                accessibilityRole="alert"
                allowFontScaling
                maxFontSizeMultiplier={2}
              >
                {tagFeedback}
              </Text>
            )}

            {/* Tag chips */}
            {tags.length > 0 && (
              <View style={styles.tagsContainer}>
                {tags.map((tag, index) => (
                  <View
                    key={`${tag}-${index}`}
                    style={styles.tagChip}
                    accessibilityLabel={`${t('screens.itemDetail.accessibility.tagChip')}: ${tag}`}
                  >
                    <Text style={styles.tagText} allowFontScaling maxFontSizeMultiplier={2}>
                      {tag}
                    </Text>
                    <Pressable
                      style={styles.tagRemoveButton}
                      onPress={() => removeTag(index)}
                      accessibilityLabel={`${t('screens.itemDetail.accessibility.removeTag')}: ${tag}`}
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

          {/* AI Attributes Summary (read-only) */}
          {hasAIAttributes && (
            <View
              style={styles.aiSummarySection}
              accessibilityLabel={t('screens.itemDetail.accessibility.aiSummarySection')}
            >
              <Text style={styles.aiSummaryLabel} allowFontScaling maxFontSizeMultiplier={2}>
                {t('screens.itemDetail.aiSummary.title')}
              </Text>
              <Text style={styles.aiSummaryText} allowFontScaling maxFontSizeMultiplier={2}>
                {t('screens.itemDetail.aiSummary.detected').replace('{summary}', aiSummary!)}
              </Text>
            </View>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <Button
            onPress={handleSave}
            variant="primary"
            accessibilityLabel={t('screens.itemDetail.accessibility.saveButton')}
            accessibilityHint={t('screens.itemDetail.accessibility.saveButtonHint')}
          >
            {t('screens.itemDetail.save')}
          </Button>

          <Pressable
            style={styles.deleteButton}
            onPress={handleDelete}
            accessibilityLabel={t('screens.itemDetail.accessibility.deleteButton')}
            accessibilityHint={t('screens.itemDetail.accessibility.deleteButtonHint')}
            accessibilityRole="button"
          >
            <Text style={styles.deleteButtonText}>{t('screens.itemDetail.delete')}</Text>
          </Pressable>
        </View>
      </ScrollView>

      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </KeyboardAvoidingView>
  );
}
