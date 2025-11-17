/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ItemMetadataForm } from '../../src/features/onboarding/components/ItemMetadataForm';
import { ThemeProvider } from '../../src/core/theme';
import { ItemType } from '../../src/features/onboarding/types/itemMetadata';

// Mock dependencies
jest.mock('../../src/features/onboarding/components/TypeSelector', () => {
  const { View, Text, Pressable } = require('react-native');
  return {
    TypeSelector: ({
      value,
      onChange,
      error,
    }: {
      value: any;
      onChange: (type: any) => void;
      error: string | null;
    }) => (
      <View testID="type-selector">
        <Pressable testID="select-type-top" onPress={() => onChange('Top')}>
          <Text>Top</Text>
        </Pressable>
        <Pressable testID="select-type-bottom" onPress={() => onChange('Bottom')}>
          <Text>Bottom</Text>
        </Pressable>
        <Pressable testID="select-type-dress" onPress={() => onChange('Dress')}>
          <Text>Dress</Text>
        </Pressable>
        {value && <Text testID="type-value">{value}</Text>}
        {error && <Text testID="type-error">{error}</Text>}
      </View>
    ),
  };
});

jest.mock('../../src/features/onboarding/components/ColourSelector', () => {
  const { View, Text, Pressable } = require('react-native');
  return {
    ColourSelector: ({
      value,
      onChange,
      error,
    }: {
      value: string | null;
      onChange: (colour: string) => void;
      error: string | null;
    }) => (
      <View testID="colour-selector">
        <Pressable testID="select-colour-blue" onPress={() => onChange('blue')}>
          <Text>Blue</Text>
        </Pressable>
        <Pressable testID="select-colour-red" onPress={() => onChange('red')}>
          <Text>Red</Text>
        </Pressable>
        <Pressable testID="select-colour-black" onPress={() => onChange('black')}>
          <Text>Black</Text>
        </Pressable>
        {value && <Text testID="colour-value">{value}</Text>}
        {error && <Text testID="colour-error">{error}</Text>}
      </View>
    ),
  };
});

jest.mock('../../src/core/components/Button', () => {
  const { Pressable, Text } = require('react-native');
  return {
    Button: ({
      onPress,
      disabled,
      loading,
      children,
      testID,
    }: {
      onPress: () => void;
      disabled?: boolean;
      loading?: boolean;
      children: React.ReactNode;
      testID?: string;
    }) => (
      <Pressable
        testID={testID || 'button'}
        onPress={onPress}
        disabled={disabled}
        accessibilityState={{ disabled }}
      >
        <Text>{loading ? 'Loading...' : children}</Text>
      </Pressable>
    ),
  };
});

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

// Mock i18n
jest.mock('../../src/core/i18n', () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      'screens.onboarding.firstItem.metadata.title': 'Add Item Details',
      'screens.onboarding.firstItem.metadata.subtitle': 'Tell us about your item',
      'screens.onboarding.firstItem.metadata.nameLabel': 'Name (Optional)',
      'screens.onboarding.firstItem.metadata.nameHelper': 'Give your item a memorable name',
      'screens.onboarding.firstItem.metadata.namePlaceholder': 'e.g., Blue Summer Dress',
      'screens.onboarding.firstItem.metadata.saveButton': 'Save Item',
      'screens.onboarding.firstItem.metadata.retryButton': 'Retry',
      'screens.onboarding.firstItem.metadata.skipButton': 'Skip',
      'screens.onboarding.firstItem.metadata.errors.typeRequired': 'Please select a type',
      'screens.onboarding.firstItem.metadata.errors.colourRequired': 'Please select a colour',
      'screens.onboarding.firstItem.metadata.errors.nameTooLong':
        'Name must be 100 characters or less',
      'screens.onboarding.firstItem.accessibility.metadataForm': 'Item metadata form',
      'screens.onboarding.firstItem.accessibility.metadataFormHint': 'Fill in item details',
      'screens.onboarding.firstItem.accessibility.nameInput': 'Item name input',
      'screens.onboarding.firstItem.accessibility.nameInputHint': 'Enter a name for your item',
      'screens.onboarding.firstItem.accessibility.saveButton': 'Save item button',
      'screens.onboarding.firstItem.accessibility.saveButtonHint': 'Save your item details',
    };
    return translations[key] || key;
  },
}));

describe('ItemMetadataForm', () => {
  const mockOnSave = jest.fn();
  const mockOnRetry = jest.fn();
  const mockOnSkip = jest.fn();

  const TestWrapper = ({ children }: { children: React.ReactNode }) => (
    <ThemeProvider colorScheme="light">{children}</ThemeProvider>
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initial Render', () => {
    it('should render title and subtitle', () => {
      const { getByText } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} />
        </TestWrapper>
      );

      expect(getByText('Add Item Details')).toBeTruthy();
      expect(getByText('Tell us about your item')).toBeTruthy();
    });

    it('should render TypeSelector component', () => {
      const { getByTestId } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} />
        </TestWrapper>
      );

      expect(getByTestId('type-selector')).toBeTruthy();
    });

    it('should render ColourSelector component', () => {
      const { getByTestId } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} />
        </TestWrapper>
      );

      expect(getByTestId('colour-selector')).toBeTruthy();
    });

    it('should render name input field', () => {
      const { getByPlaceholderText } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} />
        </TestWrapper>
      );

      expect(getByPlaceholderText('e.g., Blue Summer Dress')).toBeTruthy();
    });

    it('should render character counter showing 0/100', () => {
      const { getByText } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} />
        </TestWrapper>
      );

      expect(getByText('0/100')).toBeTruthy();
    });

    it('should render save button', () => {
      const { getByText } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} />
        </TestWrapper>
      );

      expect(getByText('Save Item')).toBeTruthy();
    });
  });

  describe('Form Validation - Required Fields', () => {
    it('should disable save button initially when no type or colour selected', () => {
      const { getByText } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} />
        </TestWrapper>
      );

      const saveButton = getByText('Save Item').parent;
      expect(saveButton?.props.accessibilityState?.disabled).toBe(true);
    });

    it('should keep save button disabled when only type selected', () => {
      const { getByTestId, getByText } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} />
        </TestWrapper>
      );

      fireEvent.press(getByTestId('select-type-top'));

      const saveButton = getByText('Save Item').parent;
      expect(saveButton?.props.accessibilityState?.disabled).toBe(true);
    });

    it('should keep save button disabled when only colour selected', () => {
      const { getByTestId, getByText } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} />
        </TestWrapper>
      );

      fireEvent.press(getByTestId('select-colour-blue'));

      const saveButton = getByText('Save Item').parent;
      expect(saveButton?.props.accessibilityState?.disabled).toBe(true);
    });

    it('should enable save button when both type and colour selected', () => {
      const { getByTestId, getByText } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} />
        </TestWrapper>
      );

      fireEvent.press(getByTestId('select-type-top'));
      fireEvent.press(getByTestId('select-colour-blue'));

      const saveButton = getByText('Save Item').parent;
      expect(saveButton?.props.accessibilityState?.disabled).toBe(false);
    });

    it('should show type error when save attempted without type', () => {
      const { getByTestId, getByText, queryByTestId } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} />
        </TestWrapper>
      );

      // Select colour only
      fireEvent.press(getByTestId('select-colour-blue'));

      // Try to save
      fireEvent.press(getByText('Save Item'));

      // Should show type error
      expect(queryByTestId('type-error')).toBeTruthy();
      expect(getByText('Please select a type')).toBeTruthy();
    });

    it('should show colour error when save attempted without colour', () => {
      const { getByTestId, getByText, queryByTestId } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} />
        </TestWrapper>
      );

      // Select type only
      fireEvent.press(getByTestId('select-type-top'));

      // Try to save
      fireEvent.press(getByText('Save Item'));

      // Should show colour error
      expect(queryByTestId('colour-error')).toBeTruthy();
      expect(getByText('Please select a colour')).toBeTruthy();
    });
  });

  describe('Form Validation - Name Field', () => {
    it('should allow saving with empty name (optional field)', () => {
      const { getByTestId, getByText } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} />
        </TestWrapper>
      );

      fireEvent.press(getByTestId('select-type-top'));
      fireEvent.press(getByTestId('select-colour-blue'));
      fireEvent.press(getByText('Save Item'));

      expect(mockOnSave).toHaveBeenCalled();
    });

    it('should update character counter as user types', () => {
      const { getByPlaceholderText, getByText } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} />
        </TestWrapper>
      );

      const nameInput = getByPlaceholderText('e.g., Blue Summer Dress');
      fireEvent.changeText(nameInput, 'Test Item');

      expect(getByText('9/100')).toBeTruthy();
    });

    it('should allow name up to 100 characters', () => {
      const { getByTestId, getByPlaceholderText, getByText } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} />
        </TestWrapper>
      );

      const nameInput = getByPlaceholderText('e.g., Blue Summer Dress');
      const maxLengthName = 'A'.repeat(100);

      fireEvent.changeText(nameInput, maxLengthName);
      fireEvent.press(getByTestId('select-type-top'));
      fireEvent.press(getByTestId('select-colour-blue'));

      const saveButton = getByText('Save Item').parent;
      expect(saveButton?.props.accessibilityState?.disabled).toBe(false);
    });

    it('should disable save button when name exceeds 100 characters', () => {
      const { getByTestId, getByPlaceholderText, getByText } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} />
        </TestWrapper>
      );

      fireEvent.press(getByTestId('select-type-top'));
      fireEvent.press(getByTestId('select-colour-blue'));

      const nameInput = getByPlaceholderText('e.g., Blue Summer Dress');
      const tooLongName = 'A'.repeat(101);

      fireEvent.changeText(nameInput, tooLongName);

      const saveButton = getByText('Save Item').parent;
      expect(saveButton?.props.accessibilityState?.disabled).toBe(true);
    });

    it('should show error when name exceeds limit', () => {
      const { getByPlaceholderText, getByText } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} />
        </TestWrapper>
      );

      const nameInput = getByPlaceholderText('e.g., Blue Summer Dress');
      const tooLongName = 'A'.repeat(101);

      fireEvent.changeText(nameInput, tooLongName);
      fireEvent.press(getByText('Save Item'));

      expect(getByText('Name must be 100 characters or less')).toBeTruthy();
    });

    it('should clear error when name is reduced below limit', () => {
      const { getByPlaceholderText, getByText, queryByText } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} />
        </TestWrapper>
      );

      const nameInput = getByPlaceholderText('e.g., Blue Summer Dress');

      // Enter too long name
      fireEvent.changeText(nameInput, 'A'.repeat(101));
      fireEvent.press(getByText('Save Item'));
      expect(getByText('Name must be 100 characters or less')).toBeTruthy();

      // Reduce to valid length
      fireEvent.changeText(nameInput, 'A'.repeat(50));

      // Error should be cleared
      expect(queryByText('Name must be 100 characters or less')).toBeNull();
    });
  });

  describe('Save Callback', () => {
    it('should call onSave with valid form data', () => {
      const { getByTestId, getByPlaceholderText, getByText } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} />
        </TestWrapper>
      );

      fireEvent.press(getByTestId('select-type-top'));
      fireEvent.press(getByTestId('select-colour-blue'));

      const nameInput = getByPlaceholderText('e.g., Blue Summer Dress');
      fireEvent.changeText(nameInput, 'My Favorite Shirt');

      fireEvent.press(getByText('Save Item'));

      expect(mockOnSave).toHaveBeenCalledWith({
        type: 'Top',
        colourId: 'blue',
        name: 'My Favorite Shirt',
      });
    });

    it('should trim name before saving', () => {
      const { getByTestId, getByPlaceholderText, getByText } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} />
        </TestWrapper>
      );

      fireEvent.press(getByTestId('select-type-bottom'));
      fireEvent.press(getByTestId('select-colour-red'));

      const nameInput = getByPlaceholderText('e.g., Blue Summer Dress');
      fireEvent.changeText(nameInput, '  Trimmed Name  ');

      fireEvent.press(getByText('Save Item'));

      expect(mockOnSave).toHaveBeenCalledWith({
        type: 'Bottom',
        colourId: 'red',
        name: 'Trimmed Name',
      });
    });

    it('should not call onSave when form invalid', () => {
      const { getByText } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} />
        </TestWrapper>
      );

      // Try to save without selecting type or colour
      fireEvent.press(getByText('Save Item'));

      expect(mockOnSave).not.toHaveBeenCalled();
    });

    it('should include all selected values in metadata', () => {
      const { getByTestId, getByPlaceholderText, getByText } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} />
        </TestWrapper>
      );

      fireEvent.press(getByTestId('select-type-dress'));
      fireEvent.press(getByTestId('select-colour-black'));

      const nameInput = getByPlaceholderText('e.g., Blue Summer Dress');
      fireEvent.changeText(nameInput, 'Evening Gown');

      fireEvent.press(getByText('Save Item'));

      expect(mockOnSave).toHaveBeenCalledWith({
        type: 'Dress',
        colourId: 'black',
        name: 'Evening Gown',
      });
    });

    it('should validate form before calling onSave', () => {
      const { getByTestId, getByPlaceholderText, getByText } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} />
        </TestWrapper>
      );

      fireEvent.press(getByTestId('select-type-top'));
      fireEvent.press(getByTestId('select-colour-blue'));

      const nameInput = getByPlaceholderText('e.g., Blue Summer Dress');
      fireEvent.changeText(nameInput, 'A'.repeat(101));

      fireEvent.press(getByText('Save Item'));

      // Should not save with invalid name length
      expect(mockOnSave).not.toHaveBeenCalled();
    });
  });

  describe('Error Display', () => {
    it('should display error message when error prop provided', () => {
      const { getByText } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} error="Network error occurred" />
        </TestWrapper>
      );

      expect(getByText('Network error occurred')).toBeTruthy();
    });

    it('should show retry button when onRetry provided and error exists', () => {
      const { getByText } = render(
        <TestWrapper>
          <ItemMetadataForm
            onSave={mockOnSave}
            onRetry={mockOnRetry}
            error="Network error occurred"
          />
        </TestWrapper>
      );

      expect(getByText('Retry')).toBeTruthy();
    });

    it('should show skip button when onSkip provided and error exists', () => {
      const { getByText } = render(
        <TestWrapper>
          <ItemMetadataForm
            onSave={mockOnSave}
            onSkip={mockOnSkip}
            error="Network error occurred"
          />
        </TestWrapper>
      );

      expect(getByText('Skip')).toBeTruthy();
    });

    it('should hide save button when error displayed', () => {
      const { queryByText } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} error="Network error occurred" />
        </TestWrapper>
      );

      expect(queryByText('Save Item')).toBeNull();
    });

    it('should not show error view when loading', () => {
      const { queryByText } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} error="Network error occurred" loading={true} />
        </TestWrapper>
      );

      expect(queryByText('Network error occurred')).toBeNull();
    });
  });

  describe('Retry and Skip Callbacks', () => {
    it('should call onRetry when retry button pressed', () => {
      const { getByText } = render(
        <TestWrapper>
          <ItemMetadataForm
            onSave={mockOnSave}
            onRetry={mockOnRetry}
            error="Network error occurred"
          />
        </TestWrapper>
      );

      fireEvent.press(getByText('Retry'));

      expect(mockOnRetry).toHaveBeenCalled();
    });

    it('should call onSkip when skip button pressed', () => {
      const { getByText } = render(
        <TestWrapper>
          <ItemMetadataForm
            onSave={mockOnSave}
            onSkip={mockOnSkip}
            error="Network error occurred"
          />
        </TestWrapper>
      );

      fireEvent.press(getByText('Skip'));

      expect(mockOnSkip).toHaveBeenCalled();
    });

    it('should not show retry button if onRetry not provided', () => {
      const { queryByText } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} error="Network error occurred" />
        </TestWrapper>
      );

      expect(queryByText('Retry')).toBeNull();
    });

    it('should not show skip button if onSkip not provided', () => {
      const { queryByText } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} error="Network error occurred" />
        </TestWrapper>
      );

      expect(queryByText('Skip')).toBeNull();
    });
  });

  describe('Loading State', () => {
    it('should disable save button when loading', () => {
      const { getByTestId, getByText } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} loading={true} />
        </TestWrapper>
      );

      fireEvent.press(getByTestId('select-type-top'));
      fireEvent.press(getByTestId('select-colour-blue'));

      const saveButton = getByText('Loading...').parent;
      expect(saveButton?.props.disabled).toBe(true);
    });

    it('should show loading indicator on save button', () => {
      const { getByText } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} loading={true} />
        </TestWrapper>
      );

      expect(getByText('Loading...')).toBeTruthy();
    });

    it('should not show error view when loading', () => {
      const { queryByText } = render(
        <TestWrapper>
          <ItemMetadataForm
            onSave={mockOnSave}
            onRetry={mockOnRetry}
            loading={true}
            error="Some error"
          />
        </TestWrapper>
      );

      expect(queryByText('Some error')).toBeNull();
      expect(queryByText('Retry')).toBeNull();
    });
  });

  describe('Field Interactions', () => {
    it('should clear type error when type selected', () => {
      const { getByTestId, getByText, queryByTestId } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} />
        </TestWrapper>
      );

      // Trigger type error
      fireEvent.press(getByText('Save Item'));
      expect(queryByTestId('type-error')).toBeTruthy();

      // Select type
      fireEvent.press(getByTestId('select-type-top'));

      // Error should be cleared
      expect(queryByTestId('type-error')).toBeNull();
    });

    it('should clear colour error when colour selected', () => {
      const { getByTestId, getByText, queryByTestId } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} />
        </TestWrapper>
      );

      // Trigger colour error
      fireEvent.press(getByText('Save Item'));
      expect(queryByTestId('colour-error')).toBeTruthy();

      // Select colour
      fireEvent.press(getByTestId('select-colour-blue'));

      // Error should be cleared
      expect(queryByTestId('colour-error')).toBeNull();
    });

    it('should clear name error when name within limit', () => {
      const { getByPlaceholderText, getByText, queryByText } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} />
        </TestWrapper>
      );

      const nameInput = getByPlaceholderText('e.g., Blue Summer Dress');

      // Enter too long name and trigger error
      fireEvent.changeText(nameInput, 'A'.repeat(101));
      fireEvent.press(getByText('Save Item'));
      expect(getByText('Name must be 100 characters or less')).toBeTruthy();

      // Reduce to valid length
      fireEvent.changeText(nameInput, 'Valid Name');

      // Error should be cleared
      expect(queryByText('Name must be 100 characters or less')).toBeNull();
    });

    it('should update form validity when fields change', () => {
      const { getByTestId, getByText } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} />
        </TestWrapper>
      );

      // Initially disabled
      let saveButton = getByText('Save Item').parent;
      expect(saveButton?.props.accessibilityState?.disabled).toBe(true);

      // Select type - still disabled
      fireEvent.press(getByTestId('select-type-top'));
      saveButton = getByText('Save Item').parent;
      expect(saveButton?.props.accessibilityState?.disabled).toBe(true);

      // Select colour - now enabled
      fireEvent.press(getByTestId('select-colour-blue'));
      saveButton = getByText('Save Item').parent;
      expect(saveButton?.props.accessibilityState?.disabled).toBe(false);
    });

    it('should maintain form state during re-renders', () => {
      const { getByTestId, getByPlaceholderText, getByText, rerender } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} />
        </TestWrapper>
      );

      // Fill form
      fireEvent.press(getByTestId('select-type-top'));
      fireEvent.press(getByTestId('select-colour-blue'));
      const nameInput = getByPlaceholderText('e.g., Blue Summer Dress');
      fireEvent.changeText(nameInput, 'Test Name');

      // Re-render
      rerender(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} />
        </TestWrapper>
      );

      // Form should still be valid
      const saveButton = getByText('Save Item').parent;
      expect(saveButton?.props.accessibilityState?.disabled).toBe(false);
    });
  });

  describe('Initial Metadata', () => {
    it('should populate form with initial metadata', () => {
      const initialMetadata = {
        type: ItemType.Top,
        colourId: 'blue',
        name: 'Existing Item',
      };

      const { getByDisplayValue, getByTestId } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} initialMetadata={initialMetadata} />
        </TestWrapper>
      );

      expect(getByDisplayValue('Existing Item')).toBeTruthy();
      expect(getByTestId('type-value')).toBeTruthy();
      expect(getByTestId('colour-value')).toBeTruthy();
    });

    it('should enable save button with valid initial metadata', () => {
      const initialMetadata = {
        type: ItemType.Bottom,
        colourId: 'red',
        name: 'Test',
      };

      const { getByText } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} initialMetadata={initialMetadata} />
        </TestWrapper>
      );

      const saveButton = getByText('Save Item').parent;
      expect(saveButton?.props.accessibilityState?.disabled).toBe(false);
    });

    it('should allow editing of initial metadata', () => {
      const initialMetadata = {
        type: ItemType.Dress,
        colourId: 'black',
        name: 'Old Name',
      };

      const { getByDisplayValue, getByText } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} initialMetadata={initialMetadata} />
        </TestWrapper>
      );

      const nameInput = getByDisplayValue('Old Name');
      fireEvent.changeText(nameInput, 'New Name');

      fireEvent.press(getByText('Save Item'));

      expect(mockOnSave).toHaveBeenCalledWith({
        type: ItemType.Dress,
        colourId: 'black',
        name: 'New Name',
      });
    });

    it('should show error for invalid initial name length on mount', () => {
      const initialMetadata = {
        type: ItemType.Top,
        colourId: 'blue',
        name: 'A'.repeat(101),
      };

      const { getByText } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} initialMetadata={initialMetadata} />
        </TestWrapper>
      );

      expect(getByText('Name must be 100 characters or less')).toBeTruthy();
    });

    it('should disable save button with invalid initial name length', () => {
      const initialMetadata = {
        type: ItemType.Bottom,
        colourId: 'red',
        name: 'B'.repeat(150),
      };

      const { getByText } = render(
        <TestWrapper>
          <ItemMetadataForm onSave={mockOnSave} initialMetadata={initialMetadata} />
        </TestWrapper>
      );

      // Verify error is shown
      expect(getByText('Name must be 100 characters or less')).toBeTruthy();

      // Verify save is not called when button pressed
      fireEvent.press(getByText('Save Item'));
      expect(mockOnSave).not.toHaveBeenCalled();
    });
  });
});
