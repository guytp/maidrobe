import React, { useState, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { t } from '../../../core/i18n';
import { useTheme } from '../../../core/theme';
import { Button } from '../../../core/components';
import { ItemType, ItemMetadata } from '../types/itemMetadata';
import { TypeSelector } from './TypeSelector';
import { ColourSelector } from './ColourSelector';

/**
 * Item metadata form component props.
 */
export interface ItemMetadataFormProps {
  /** Initial metadata values (for editing) */
  initialMetadata?: ItemMetadata;
  /** Handler for form submission */
  onSave: (metadata: ItemMetadata) => void;
  /** Handler for retry after error */
  onRetry?: () => void;
  /** Handler for skip after error */
  onSkip?: () => void;
  /** Loading state during save */
  loading?: boolean;
  /** Error message to display */
  error?: string | null;
}

/**
 * Item metadata form component.
 *
 * Captures required and optional metadata for a wardrobe item:
 * - Type (required): Top, Bottom, Dress, Outerwear, Shoes, Accessories, Other
 * - Colour (required): Selected from canonical colour palette
 * - Name (optional): Free-text label, max 100 characters
 *
 * Features:
 * - Form validation (Type and Colour required)
 * - Save button disabled until valid
 * - Character counter for name field
 * - Error messages for validation failures
 * - Accessibility support with proper focus order
 * - Keyboard-aware layout (avoids keyboard overlap)
 * - i18n for all labels and messages
 *
 * Focus order: Type -> Colour -> Name -> Save
 *
 * @param props - Component props
 * @returns Item metadata form component
 */
export function ItemMetadataForm({
  initialMetadata,
  onSave,
  onRetry,
  onSkip,
  loading = false,
  error = null,
}: ItemMetadataFormProps): React.JSX.Element {
  const { colors, colorScheme, spacing, radius } = useTheme();

  // Form state
  const [type, setType] = useState<ItemType | null>(initialMetadata?.type || null);
  const [colourId, setColourId] = useState<string | null>(initialMetadata?.colourId || null);
  const [name, setName] = useState<string>(initialMetadata?.name || '');

  // Error state
  const [typeError, setTypeError] = useState<string | null>(null);
  const [colourError, setColourError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  // Name character limit
  const MAX_NAME_LENGTH = 100;

  /**
   * Validate form and return whether it's valid.
   */
  const validateForm = useCallback((): boolean => {
    let isValid = true;

    // Type is required
    if (!type) {
      setTypeError(t('screens.onboarding.firstItem.metadata.errors.typeRequired'));
      isValid = false;
    } else {
      setTypeError(null);
    }

    // Colour is required
    if (!colourId) {
      setColourError(t('screens.onboarding.firstItem.metadata.errors.colourRequired'));
      isValid = false;
    } else {
      setColourError(null);
    }

    // Name is optional but must be under limit
    if (name.length > MAX_NAME_LENGTH) {
      setNameError(t('screens.onboarding.firstItem.metadata.errors.nameTooLong'));
      isValid = false;
    } else {
      setNameError(null);
    }

    return isValid;
  }, [type, colourId, name]);

  /**
   * Handle form submission.
   */
  const handleSave = useCallback(() => {
    if (validateForm()) {
      const metadata: ItemMetadata = {
        type,
        colourId,
        name: name.trim(),
      };
      onSave(metadata);
    }
  }, [type, colourId, name, validateForm, onSave]);

  /**
   * Handle type selection.
   */
  const handleTypeChange = useCallback((selectedType: ItemType) => {
    setType(selectedType);
    setTypeError(null); // Clear error when user selects a type
  }, []);

  /**
   * Handle colour selection.
   */
  const handleColourChange = useCallback((selectedColourId: string) => {
    setColourId(selectedColourId);
    setColourError(null); // Clear error when user selects a colour
  }, []);

  /**
   * Handle name input change.
   */
  const handleNameChange = useCallback((text: string) => {
    setName(text);
    if (text.length <= MAX_NAME_LENGTH) {
      setNameError(null);
    }
  }, []);

  // Check if form is valid (for button state)
  const isFormValid = type !== null && colourId !== null && name.length <= MAX_NAME_LENGTH;

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
          paddingTop: spacing.xl,
          paddingBottom: spacing.xl,
        },
        header: {
          marginBottom: spacing.lg,
        },
        title: {
          fontSize: 24,
          fontWeight: 'bold',
          color: colors.textPrimary,
          marginBottom: spacing.sm,
        },
        subtitle: {
          fontSize: 16,
          color: colors.textSecondary,
          lineHeight: 24,
        },
        formSection: {
          marginBottom: spacing.xl,
        },
        inputGroup: {
          marginBottom: spacing.lg,
        },
        label: {
          fontSize: 16,
          fontWeight: '600',
          color: colors.textPrimary,
          marginBottom: spacing.sm,
        },
        helper: {
          fontSize: 14,
          color: colors.textSecondary,
          marginBottom: spacing.md,
        },
        input: {
          backgroundColor: colors.background,
          borderWidth: 1,
          borderColor: colors.textSecondary,
          borderRadius: radius.md,
          padding: spacing.md,
          fontSize: 16,
          color: colors.textPrimary,
          minHeight: 44,
        },
        inputError: {
          borderColor: colors.error,
        },
        errorText: {
          color: colors.error,
          fontSize: 14,
          marginTop: spacing.xs,
        },
        characterCounter: {
          fontSize: 12,
          color: colors.textSecondary,
          textAlign: 'right',
          marginTop: spacing.xs,
        },
        characterCounterError: {
          color: colors.error,
        },
        buttonContainer: {
          marginTop: spacing.md,
          gap: spacing.md,
        },
        errorContainer: {
          marginTop: spacing.lg,
          padding: spacing.md,
          backgroundColor: colors.error + '10',
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.error,
        },
        errorMessage: {
          color: colors.error,
          fontSize: 16,
          marginBottom: spacing.md,
          textAlign: 'center',
        },
        errorButtonContainer: {
          flexDirection: 'row',
          gap: spacing.md,
          justifyContent: 'center',
        },
        errorButton: {
          flex: 1,
        },
      }),
    [colors, spacing, radius]
  );

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
        accessibilityLabel={t('screens.onboarding.firstItem.accessibility.metadataForm')}
        accessibilityHint={t('screens.onboarding.firstItem.accessibility.metadataFormHint')}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text
            style={styles.title}
            accessibilityRole="header"
            allowFontScaling={true}
            maxFontSizeMultiplier={3}
          >
            {t('screens.onboarding.firstItem.metadata.title')}
          </Text>
          <Text style={styles.subtitle} allowFontScaling={true} maxFontSizeMultiplier={3}>
            {t('screens.onboarding.firstItem.metadata.subtitle')}
          </Text>
        </View>

        {/* Form */}
        <View style={styles.formSection}>
          {/* Type Selector */}
          <TypeSelector value={type} onChange={handleTypeChange} error={typeError} />

          {/* Colour Selector */}
          <ColourSelector value={colourId} onChange={handleColourChange} error={colourError} />

          {/* Name Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label} allowFontScaling={true} maxFontSizeMultiplier={2}>
              {t('screens.onboarding.firstItem.metadata.nameLabel')}
            </Text>
            <Text style={styles.helper} allowFontScaling={true} maxFontSizeMultiplier={2}>
              {t('screens.onboarding.firstItem.metadata.nameHelper')}
            </Text>
            <TextInput
              style={[styles.input, nameError && styles.inputError]}
              value={name}
              onChangeText={handleNameChange}
              placeholder={t('screens.onboarding.firstItem.metadata.namePlaceholder')}
              placeholderTextColor={colors.textSecondary}
              maxLength={MAX_NAME_LENGTH}
              returnKeyType="done"
              accessibilityLabel={t('screens.onboarding.firstItem.accessibility.nameInput')}
              accessibilityHint={t('screens.onboarding.firstItem.accessibility.nameInputHint')}
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
        </View>

        {/* Error View */}
        {error && !loading && (
          <View style={styles.errorContainer}>
            <Text
              style={styles.errorMessage}
              accessibilityRole="alert"
              allowFontScaling={true}
              maxFontSizeMultiplier={2}
            >
              {error}
            </Text>
            <View style={styles.errorButtonContainer}>
              {onRetry && (
                <Button
                  onPress={onRetry}
                  variant="secondary"
                  accessibilityLabel={t('screens.onboarding.firstItem.metadata.retryButton')}
                  accessibilityHint="Retry saving the item"
                >
                  {t('screens.onboarding.firstItem.metadata.retryButton')}
                </Button>
              )}
              {onSkip && (
                <Button
                  onPress={onSkip}
                  variant="text"
                  accessibilityLabel={t('screens.onboarding.firstItem.metadata.skipButton')}
                  accessibilityHint="Skip saving and continue onboarding"
                >
                  {t('screens.onboarding.firstItem.metadata.skipButton')}
                </Button>
              )}
            </View>
          </View>
        )}

        {/* Save Button */}
        {!error && (
          <View style={styles.buttonContainer}>
            <Button
              onPress={handleSave}
              disabled={!isFormValid || loading}
              loading={loading}
              accessibilityLabel={t('screens.onboarding.firstItem.accessibility.saveButton')}
              accessibilityHint={t('screens.onboarding.firstItem.accessibility.saveButtonHint')}
            >
              {t('screens.onboarding.firstItem.metadata.saveButton')}
            </Button>
          </View>
        )}
      </ScrollView>

      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </KeyboardAvoidingView>
  );
}
