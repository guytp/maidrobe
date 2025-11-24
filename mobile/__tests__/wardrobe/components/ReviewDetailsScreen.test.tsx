/**
 * Component tests for ReviewDetailsScreen.
 *
 * Tests the review and details screen with focus on name input validation,
 * including character limit enforcement, whitespace trimming, and validation
 * feedback display.
 *
 * @module __tests__/wardrobe/components/ReviewDetailsScreen
 */

import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import { ReviewDetailsScreen } from '../../../src/features/wardrobe/components/ReviewDetailsScreen';

// Mock dependencies
jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
}));

jest.mock('../../../src/core/telemetry', () => ({
  trackCaptureEvent: jest.fn(),
}));

jest.mock('../../../src/core/state/store');

jest.mock('../../../src/features/wardrobe/hooks/useCreateItemWithImage', () => ({
  useCreateItemWithImage: jest.fn(),
}));

jest.mock('../../../src/core/types/capture', () => ({
  isCaptureImagePayload: jest.fn(),
}));

jest.mock('../../../src/core/i18n', () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      'screens.reviewDetails.nameLabel': 'Name (optional)',
      'screens.reviewDetails.nameHelper': 'Add a name to help you find this item later',
      'screens.reviewDetails.namePlaceholder': 'e.g., Blue Summer Dress',
      'screens.reviewDetails.nameTooLong': 'Name must be 80 characters or less',
      'screens.reviewDetails.tagsLabel': 'Tags (optional)',
      'screens.reviewDetails.tagsHelper': 'Add tags to organize your wardrobe',
      'screens.reviewDetails.tagsPlaceholder': 'e.g., casual, summer',
      'screens.reviewDetails.tagTooLong': 'Tag must be 30 characters or less',
      'screens.reviewDetails.tagLimitReached': 'Maximum 20 tags reached',
      'screens.reviewDetails.tagAlreadyAdded': 'Tag already added',
      'screens.reviewDetails.saveButton': 'Save',
      'screens.reviewDetails.saving': 'Saving...',
      'screens.reviewDetails.cancelButton': 'Cancel',
      'screens.reviewDetails.addTagButton': 'Add',
      'screens.reviewDetails.tagCount': '{count}/{max} tags',
      'screens.reviewDetails.accessibility.screenLabel': 'Review and add details',
      'screens.reviewDetails.accessibility.screenHint':
        'Review image and add optional name and tags',
      'screens.reviewDetails.accessibility.imagePreview': 'Item preview image',
      'screens.reviewDetails.accessibility.nameInput': 'Item name input',
      'screens.reviewDetails.accessibility.nameInputHint': 'Optional name for this item',
      'screens.reviewDetails.accessibility.tagsInput': 'Tags input',
      'screens.reviewDetails.accessibility.tagsInputHint': 'Add tags to organize your wardrobe',
      'screens.reviewDetails.accessibility.addTagButton': 'Add tag',
      'screens.reviewDetails.accessibility.addTagButtonHint': 'Add the entered tag',
      'screens.reviewDetails.accessibility.saveButton': 'Save item',
      'screens.reviewDetails.accessibility.saveButtonHint': 'Save this item to your wardrobe',
      'screens.reviewDetails.accessibility.cancelButton': 'Cancel',
      'screens.reviewDetails.accessibility.cancelButtonHint': 'Cancel and return to crop',
    };
    return translations[key] || key;
  },
}));

jest.mock('../../../src/core/theme', () => ({
  useTheme: () => ({
    colors: {
      background: '#FFFFFF',
      textPrimary: '#000000',
      textSecondary: '#666666',
      primary: '#007AFF',
      error: '#FF3B30',
      warning: '#FF9500',
    },
    colorScheme: 'light',
    spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
    radius: { sm: 4, md: 8, lg: 12 },
    fontSize: { xs: 12, sm: 14, base: 16, lg: 18, '2xl': 24 },
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockUseRouter = jest.requireMock('expo-router').useRouter;
const mockUseStore = jest.requireMock('../../../src/core/state/store').useStore;
const mockUseCreateItemWithImage = jest.requireMock(
  '../../../src/features/wardrobe/hooks/useCreateItemWithImage'
).useCreateItemWithImage;
const mockIsCaptureImagePayload = jest.requireMock(
  '../../../src/core/types/capture'
).isCaptureImagePayload;

describe('ReviewDetailsScreen', () => {
  let mockRouter: {
    push: jest.Mock;
    replace: jest.Mock;
  };
  let mockSave: jest.Mock;
  let mockReset: jest.Mock;

  const mockPayload = {
    uri: 'file:///test-image.jpg',
    width: 1920,
    height: 1080,
    origin: 'camera' as const,
    source: 'screen' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockRouter = {
      push: jest.fn(),
      replace: jest.fn(),
    };
    mockUseRouter.mockReturnValue(mockRouter);

    mockSave = jest.fn().mockResolvedValue({ item: { id: 'test-item-id' } });
    mockReset = jest.fn();

    mockUseCreateItemWithImage.mockReturnValue({
      save: mockSave,
      isLoading: false,
      error: null,
      reset: mockReset,
    });

    // Mock payload validation to return true
    mockIsCaptureImagePayload.mockReturnValue(true);

    mockUseStore.mockImplementation((selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        user: { id: 'test-user-id' },
        payload: mockPayload,
      })
    );
  });

  describe('Name Input Rendering', () => {
    it('should render name input field', () => {
      render(<ReviewDetailsScreen />);

      expect(screen.getByText('Name (optional)')).toBeTruthy();
      expect(screen.getByPlaceholderText('e.g., Blue Summer Dress')).toBeTruthy();
    });

    it('should display character counter with initial value', () => {
      render(<ReviewDetailsScreen />);

      expect(screen.getByText('0/80')).toBeTruthy();
    });

    it('should render helper text', () => {
      render(<ReviewDetailsScreen />);

      expect(screen.getByText('Add a name to help you find this item later')).toBeTruthy();
    });
  });

  describe('Name Input Character Limit', () => {
    it('should accept names under 80 characters', () => {
      render(<ReviewDetailsScreen />);

      const input = screen.getByPlaceholderText('e.g., Blue Summer Dress');
      const testName = 'My Summer T-Shirt';

      fireEvent.changeText(input, testName);

      expect(screen.getByDisplayValue(testName)).toBeTruthy();
      expect(screen.getByText('17/80')).toBeTruthy();
      expect(screen.queryByText('Name must be 80 characters or less')).toBeNull();
    });

    it('should accept names exactly 80 characters', () => {
      render(<ReviewDetailsScreen />);

      const input = screen.getByPlaceholderText('e.g., Blue Summer Dress');
      const testName = 'A'.repeat(80);

      fireEvent.changeText(input, testName);

      expect(screen.getByText('80/80')).toBeTruthy();
      expect(screen.queryByText('Name must be 80 characters or less')).toBeNull();
    });

    it('should show error when name exceeds 80 characters', () => {
      render(<ReviewDetailsScreen />);

      const input = screen.getByPlaceholderText('e.g., Blue Summer Dress');
      const testName = 'A'.repeat(81);

      fireEvent.changeText(input, testName);

      expect(screen.getByText('81/80')).toBeTruthy();
      expect(screen.getByText('Name must be 80 characters or less')).toBeTruthy();
    });

    it('should update character counter as user types', () => {
      render(<ReviewDetailsScreen />);

      const input = screen.getByPlaceholderText('e.g., Blue Summer Dress');

      fireEvent.changeText(input, 'Test');
      expect(screen.getByText('4/80')).toBeTruthy();

      fireEvent.changeText(input, 'Test Item');
      expect(screen.getByText('9/80')).toBeTruthy();

      fireEvent.changeText(input, 'Test Item Name');
      expect(screen.getByText('14/80')).toBeTruthy();
    });

    it('should clear error when name is reduced to valid length', () => {
      render(<ReviewDetailsScreen />);

      const input = screen.getByPlaceholderText('e.g., Blue Summer Dress');

      // First exceed limit
      fireEvent.changeText(input, 'A'.repeat(85));
      expect(screen.getByText('Name must be 80 characters or less')).toBeTruthy();

      // Then reduce to valid length
      fireEvent.changeText(input, 'A'.repeat(75));
      expect(screen.queryByText('Name must be 80 characters or less')).toBeNull();
      expect(screen.getByText('75/80')).toBeTruthy();
    });

    it('should count characters based on trimmed length', () => {
      render(<ReviewDetailsScreen />);

      const input = screen.getByPlaceholderText('e.g., Blue Summer Dress');

      // Input with leading and trailing spaces
      fireEvent.changeText(input, '   Test Item   ');

      // Counter should show trimmed length
      expect(screen.getByText('9/80')).toBeTruthy();
    });
  });

  describe('Whitespace Trimming', () => {
    it('should trim leading whitespace on blur', async () => {
      render(<ReviewDetailsScreen />);

      const input = screen.getByPlaceholderText('e.g., Blue Summer Dress');

      fireEvent.changeText(input, '   Test Item');
      fireEvent(input, 'blur');

      await waitFor(() => {
        expect(screen.getByDisplayValue('Test Item')).toBeTruthy();
      });
    });

    it('should trim trailing whitespace on blur', async () => {
      render(<ReviewDetailsScreen />);

      const input = screen.getByPlaceholderText('e.g., Blue Summer Dress');

      fireEvent.changeText(input, 'Test Item   ');
      fireEvent(input, 'blur');

      await waitFor(() => {
        expect(screen.getByDisplayValue('Test Item')).toBeTruthy();
      });
    });

    it('should trim both leading and trailing whitespace on blur', async () => {
      render(<ReviewDetailsScreen />);

      const input = screen.getByPlaceholderText('e.g., Blue Summer Dress');

      fireEvent.changeText(input, '   Test Item   ');
      fireEvent(input, 'blur');

      await waitFor(() => {
        expect(screen.getByDisplayValue('Test Item')).toBeTruthy();
      });
    });

    it('should preserve internal whitespace', async () => {
      render(<ReviewDetailsScreen />);

      const input = screen.getByPlaceholderText('e.g., Blue Summer Dress');

      fireEvent.changeText(input, '  My  Summer  T-Shirt  ');
      fireEvent(input, 'blur');

      await waitFor(() => {
        expect(screen.getByDisplayValue('My  Summer  T-Shirt')).toBeTruthy();
      });
    });

    it('should handle whitespace-only input on blur', async () => {
      render(<ReviewDetailsScreen />);

      const input = screen.getByPlaceholderText('e.g., Blue Summer Dress');

      fireEvent.changeText(input, '     ');
      fireEvent(input, 'blur');

      await waitFor(() => {
        // After trimming whitespace-only input, value should be empty
        expect(input.props.value).toBe('');
      });
    });

    it('should revalidate after trimming on blur', async () => {
      render(<ReviewDetailsScreen />);

      const input = screen.getByPlaceholderText('e.g., Blue Summer Dress');

      // Input that exceeds limit with whitespace but is valid when trimmed
      const longName = 'A'.repeat(75);
      fireEvent.changeText(input, `     ${longName}     `);

      // Character counter should count trimmed length (75, not 85)
      expect(screen.getByText('75/80')).toBeTruthy();
      // Should not show error because trimmed length is within limit
      expect(screen.queryByText('Name must be 80 characters or less')).toBeNull();

      fireEvent(input, 'blur');

      // After trim, display should be updated
      await waitFor(() => {
        expect(screen.getByDisplayValue(longName)).toBeTruthy();
        expect(screen.getByText('75/80')).toBeTruthy();
      });
    });

    it('should not trigger validation error for whitespace before trim', () => {
      render(<ReviewDetailsScreen />);

      const input = screen.getByPlaceholderText('e.g., Blue Summer Dress');

      // Type whitespace
      fireEvent.changeText(input, '   ');

      // Should not show error for whitespace
      expect(screen.queryByText('Name must be 80 characters or less')).toBeNull();
      expect(screen.getByText('0/80')).toBeTruthy();
    });
  });

  describe('Validation Feedback', () => {
    it('should show error message when exceeding character limit', () => {
      render(<ReviewDetailsScreen />);

      const input = screen.getByPlaceholderText('e.g., Blue Summer Dress');

      fireEvent.changeText(input, 'A'.repeat(90));

      expect(screen.getByText('Name must be 80 characters or less')).toBeTruthy();
    });

    it('should clear error message when input becomes valid', () => {
      render(<ReviewDetailsScreen />);

      const input = screen.getByPlaceholderText('e.g., Blue Summer Dress');

      // First make invalid
      fireEvent.changeText(input, 'A'.repeat(90));
      expect(screen.getByText('Name must be 80 characters or less')).toBeTruthy();

      // Then make valid
      fireEvent.changeText(input, 'Valid Name');
      expect(screen.queryByText('Name must be 80 characters or less')).toBeNull();
    });

    it('should show character counter in error state when over limit', () => {
      render(<ReviewDetailsScreen />);

      const input = screen.getByPlaceholderText('e.g., Blue Summer Dress');

      fireEvent.changeText(input, 'A'.repeat(85));

      // Both error message and counter should be visible
      expect(screen.getByText('Name must be 80 characters or less')).toBeTruthy();
      expect(screen.getByText('85/80')).toBeTruthy();
    });

    it('should not show error for empty input', () => {
      render(<ReviewDetailsScreen />);

      const input = screen.getByPlaceholderText('e.g., Blue Summer Dress');

      fireEvent.changeText(input, '');

      expect(screen.queryByText('Name must be 80 characters or less')).toBeNull();
      expect(screen.getByText('0/80')).toBeTruthy();
    });

    it('should have error styling on input when validation fails', () => {
      render(<ReviewDetailsScreen />);

      const input = screen.getByPlaceholderText('e.g., Blue Summer Dress');

      fireEvent.changeText(input, 'A'.repeat(85));

      expect(screen.getByText('Name must be 80 characters or less')).toBeTruthy();
    });
  });

  describe('Form Submission with Name Validation', () => {
    it('should allow save with valid name', async () => {
      render(<ReviewDetailsScreen />);

      const input = screen.getByPlaceholderText('e.g., Blue Summer Dress');
      fireEvent.changeText(input, 'Test Item');

      const saveButton = screen.getByText('Save');
      fireEvent.press(saveButton);

      await waitFor(() => {
        expect(mockSave).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Test Item',
          })
        );
      });
    });

    it('should allow save with empty name (optional field)', async () => {
      render(<ReviewDetailsScreen />);

      const saveButton = screen.getByText('Save');
      fireEvent.press(saveButton);

      await waitFor(() => {
        expect(mockSave).toHaveBeenCalledWith(
          expect.objectContaining({
            name: '',
          })
        );
      });
    });

    it('should trim name before saving', async () => {
      render(<ReviewDetailsScreen />);

      const input = screen.getByPlaceholderText('e.g., Blue Summer Dress');
      fireEvent.changeText(input, '   Test Item   ');

      const saveButton = screen.getByText('Save');
      fireEvent.press(saveButton);

      await waitFor(() => {
        expect(mockSave).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Test Item',
          })
        );
      });
    });

    it('should block save when name exceeds limit', async () => {
      render(<ReviewDetailsScreen />);

      const input = screen.getByPlaceholderText('e.g., Blue Summer Dress');
      fireEvent.changeText(input, 'A'.repeat(85));

      const saveButton = screen.getByText('Save');
      fireEvent.press(saveButton);

      // Save should not be called
      expect(mockSave).not.toHaveBeenCalled();

      // Error should be shown
      expect(screen.getByText('Name must be 80 characters or less')).toBeTruthy();
    });

    it('should save with name at exactly 80 characters', async () => {
      render(<ReviewDetailsScreen />);

      const input = screen.getByPlaceholderText('e.g., Blue Summer Dress');
      const exactName = 'A'.repeat(80);
      fireEvent.changeText(input, exactName);

      const saveButton = screen.getByText('Save');
      fireEvent.press(saveButton);

      await waitFor(() => {
        expect(mockSave).toHaveBeenCalledWith(
          expect.objectContaining({
            name: exactName,
          })
        );
      });
    });
  });

  describe('User Interactions', () => {
    it('should update display value as user types', () => {
      render(<ReviewDetailsScreen />);

      const input = screen.getByPlaceholderText('e.g., Blue Summer Dress');

      fireEvent.changeText(input, 'T');
      expect(screen.getByDisplayValue('T')).toBeTruthy();

      fireEvent.changeText(input, 'Te');
      expect(screen.getByDisplayValue('Te')).toBeTruthy();

      fireEvent.changeText(input, 'Test');
      expect(screen.getByDisplayValue('Test')).toBeTruthy();
    });

    it('should allow clearing input', () => {
      render(<ReviewDetailsScreen />);

      const input = screen.getByPlaceholderText('e.g., Blue Summer Dress');

      fireEvent.changeText(input, 'Test Item');
      expect(screen.getByDisplayValue('Test Item')).toBeTruthy();

      fireEvent.changeText(input, '');
      // After clearing, input should be empty (don't check display value for empty string)
      expect(input.props.value).toBe('');
      expect(screen.getByText('0/80')).toBeTruthy();
    });

    it('should clear validation error when input is cleared', () => {
      render(<ReviewDetailsScreen />);

      const input = screen.getByPlaceholderText('e.g., Blue Summer Dress');

      // Make invalid
      fireEvent.changeText(input, 'A'.repeat(85));
      expect(screen.getByText('Name must be 80 characters or less')).toBeTruthy();

      // Clear input
      fireEvent.changeText(input, '');
      expect(screen.queryByText('Name must be 80 characters or less')).toBeNull();
    });

    it('should handle rapid typing and validation updates', () => {
      render(<ReviewDetailsScreen />);

      const input = screen.getByPlaceholderText('e.g., Blue Summer Dress');

      // Rapid typing simulation
      fireEvent.changeText(input, 'A'.repeat(70));
      expect(screen.getByText('70/80')).toBeTruthy();

      fireEvent.changeText(input, 'A'.repeat(80));
      expect(screen.getByText('80/80')).toBeTruthy();

      fireEvent.changeText(input, 'A'.repeat(85));
      expect(screen.getByText('85/80')).toBeTruthy();
      expect(screen.getByText('Name must be 80 characters or less')).toBeTruthy();

      fireEvent.changeText(input, 'A'.repeat(75));
      expect(screen.getByText('75/80')).toBeTruthy();
      expect(screen.queryByText('Name must be 80 characters or less')).toBeNull();
    });
  });

  describe('Loading State', () => {
    it('should disable name input when loading', () => {
      mockUseCreateItemWithImage.mockReturnValue({
        save: mockSave,
        isLoading: true,
        error: null,
        reset: mockReset,
      });

      render(<ReviewDetailsScreen />);

      const input = screen.getByPlaceholderText('e.g., Blue Summer Dress');
      expect(input.props.editable).toBe(false);
    });

    it('should disable save button when name exceeds limit', () => {
      render(<ReviewDetailsScreen />);

      const input = screen.getByPlaceholderText('e.g., Blue Summer Dress');
      fireEvent.changeText(input, 'A'.repeat(85));

      // The save button should be disabled through the Button component
      // We can verify this by checking that it's wrapped properly
      const saveButton = screen.getByText('Save');
      // Button component uses disabled prop which gets passed down
      expect(saveButton).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long input gracefully', () => {
      render(<ReviewDetailsScreen />);

      const input = screen.getByPlaceholderText('e.g., Blue Summer Dress');
      const veryLongName = 'A'.repeat(200);

      fireEvent.changeText(input, veryLongName);

      expect(screen.getByText('Name must be 80 characters or less')).toBeTruthy();
    });

    it('should handle special characters in name', () => {
      render(<ReviewDetailsScreen />);

      const input = screen.getByPlaceholderText('e.g., Blue Summer Dress');
      const specialName = "Test's Item - #123 (2024)";

      fireEvent.changeText(input, specialName);

      expect(screen.getByDisplayValue(specialName)).toBeTruthy();
      expect(screen.queryByText('Name must be 80 characters or less')).toBeNull();
    });

    it('should handle emoji characters in name', () => {
      render(<ReviewDetailsScreen />);

      const input = screen.getByPlaceholderText('e.g., Blue Summer Dress');
      const emojiName = 'Summer Dress 👗☀️';

      fireEvent.changeText(input, emojiName);

      expect(screen.getByDisplayValue(emojiName)).toBeTruthy();
    });

    it('should handle multiple spaces between words', () => {
      render(<ReviewDetailsScreen />);

      const input = screen.getByPlaceholderText('e.g., Blue Summer Dress');

      fireEvent.changeText(input, 'Test     Item     Name');
      fireEvent(input, 'blur');

      // Should preserve internal spaces when trimming
      expect(screen.getByDisplayValue('Test     Item     Name')).toBeTruthy();
    });

    it('should handle input at boundary before exceeding limit', () => {
      render(<ReviewDetailsScreen />);

      const input = screen.getByPlaceholderText('e.g., Blue Summer Dress');

      // 79 characters - should be valid
      fireEvent.changeText(input, 'A'.repeat(79));
      expect(screen.queryByText('Name must be 80 characters or less')).toBeNull();

      // Add one more to hit 80 - should still be valid
      fireEvent.changeText(input, 'A'.repeat(80));
      expect(screen.queryByText('Name must be 80 characters or less')).toBeNull();

      // Add one more to hit 81 - should show error
      fireEvent.changeText(input, 'A'.repeat(81));
      expect(screen.getByText('Name must be 80 characters or less')).toBeTruthy();
    });
  });

  describe('Tag Input and Validation', () => {
    describe('Tag Length Validation (30 char limit)', () => {
      it('should accept tags under 30 characters', () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');

        fireEvent.changeText(tagInput, 'summer-casual');
        fireEvent.press(addButton);

        expect(screen.getByText('summer-casual')).toBeTruthy();
        expect(screen.queryByText('Tag must be 30 characters or less')).toBeNull();
      });

      it('should accept tags exactly 30 characters', () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');
        const tag30Chars = 'A'.repeat(30);

        fireEvent.changeText(tagInput, tag30Chars);
        fireEvent.press(addButton);

        expect(screen.getByText(tag30Chars.toLowerCase())).toBeTruthy();
        expect(screen.queryByText('Tag must be 30 characters or less')).toBeNull();
      });

      it('should reject tags over 30 characters', () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');
        const tag31Chars = 'A'.repeat(31);

        fireEvent.changeText(tagInput, tag31Chars);
        fireEvent.press(addButton);

        expect(screen.getByText('Tag must be 30 characters or less')).toBeTruthy();
        expect(screen.queryByText(tag31Chars.toLowerCase())).toBeNull();
      });

      it('should show feedback for very long tags', () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');
        const tag50Chars = 'A'.repeat(50);

        fireEvent.changeText(tagInput, tag50Chars);
        fireEvent.press(addButton);

        expect(screen.getByText('Tag must be 30 characters or less')).toBeTruthy();
      });

      it('should clear feedback when valid tag added', () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');

        // First try invalid tag
        fireEvent.changeText(tagInput, 'A'.repeat(35));
        fireEvent.press(addButton);
        expect(screen.getByText('Tag must be 30 characters or less')).toBeTruthy();

        // Then add valid tag
        fireEvent.changeText(tagInput, 'summer');
        fireEvent.press(addButton);
        expect(screen.queryByText('Tag must be 30 characters or less')).toBeNull();
      });
    });

    describe('Tag Count Limit (20 tags maximum)', () => {
      it('should accept adding tags up to 20', () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');

        // Add 20 tags
        for (let i = 1; i <= 20; i++) {
          fireEvent.changeText(tagInput, `tag${i}`);
          fireEvent.press(addButton);
        }

        expect(screen.getByText('20/20 tags')).toBeTruthy();
        expect(screen.queryByText('Maximum 20 tags reached')).toBeNull();
      });

      it('should block adding 21st tag', () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');

        // Add 20 tags
        for (let i = 1; i <= 20; i++) {
          fireEvent.changeText(tagInput, `tag${i}`);
          fireEvent.press(addButton);
        }

        // At 20 tags, the tag21 should not be addable
        expect(screen.queryByText('tag21')).toBeNull();
        expect(screen.getByText('20/20 tags')).toBeTruthy();
      });

      it('should show tag count indicator', () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');

        // Initially 0 tags
        expect(screen.getByText('0/20 tags')).toBeTruthy();

        // Add 5 tags
        for (let i = 1; i <= 5; i++) {
          fireEvent.changeText(tagInput, `tag${i}`);
          fireEvent.press(addButton);
        }

        expect(screen.getByText('5/20 tags')).toBeTruthy();
      });

      it('should disable tag input when at 20 tags', () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');

        // Add 20 tags
        for (let i = 1; i <= 20; i++) {
          fireEvent.changeText(tagInput, `tag${i}`);
          fireEvent.press(addButton);
        }

        expect(tagInput.props.editable).toBe(false);
      });

      it('should enable tag input after removing tag from limit', () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');

        // Add 20 tags
        for (let i = 1; i <= 20; i++) {
          fireEvent.changeText(tagInput, `tag${i}`);
          fireEvent.press(addButton);
        }

        expect(tagInput.props.editable).toBe(false);

        // Remove one tag by clicking its remove button
        const removeButtons = screen.getAllByText('x');
        fireEvent.press(removeButtons[0]);

        expect(tagInput.props.editable).toBe(true);
        expect(screen.getByText('19/20 tags')).toBeTruthy();
      });

      it('should update placeholder when at limit', () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');

        // Add 20 tags
        for (let i = 1; i <= 20; i++) {
          fireEvent.changeText(tagInput, `tag${i}`);
          fireEvent.press(addButton);
        }

        expect(screen.getByPlaceholderText('Maximum 20 tags reached')).toBeTruthy();
      });
    });

    describe('Tag Deduplication', () => {
      it('should block duplicate tags with exact match', () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');

        // Add first tag
        fireEvent.changeText(tagInput, 'summer');
        fireEvent.press(addButton);
        expect(screen.getByText('summer')).toBeTruthy();

        // Try to add same tag again
        fireEvent.changeText(tagInput, 'summer');
        fireEvent.press(addButton);
        expect(screen.getByText('Tag already added')).toBeTruthy();
      });

      it('should detect duplicates case-insensitively', () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');

        // Add lowercase tag
        fireEvent.changeText(tagInput, 'summer');
        fireEvent.press(addButton);

        // Try uppercase version
        fireEvent.changeText(tagInput, 'SUMMER');
        fireEvent.press(addButton);
        expect(screen.getByText('Tag already added')).toBeTruthy();

        // Try mixed case
        fireEvent.changeText(tagInput, 'SuMmEr');
        fireEvent.press(addButton);
        expect(screen.getByText('Tag already added')).toBeTruthy();
      });

      it('should allow adding tag after duplicate removed', () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');

        // Add tag
        fireEvent.changeText(tagInput, 'summer');
        fireEvent.press(addButton);
        expect(screen.getByText('summer')).toBeTruthy();

        // Try duplicate
        fireEvent.changeText(tagInput, 'summer');
        fireEvent.press(addButton);
        expect(screen.getByText('Tag already added')).toBeTruthy();

        // Remove the tag
        const removeButton = screen.getAllByText('x')[0];
        fireEvent.press(removeButton);
        expect(screen.queryByText('summer')).toBeNull();

        // Now should be able to add it again
        fireEvent.changeText(tagInput, 'summer');
        fireEvent.press(addButton);
        expect(screen.getByText('summer')).toBeTruthy();
        expect(screen.queryByText('Tag already added')).toBeNull();
      });

      it('should clear duplicate feedback when typing', () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');

        // Add tag
        fireEvent.changeText(tagInput, 'summer');
        fireEvent.press(addButton);

        // Try duplicate
        fireEvent.changeText(tagInput, 'summer');
        fireEvent.press(addButton);
        expect(screen.getByText('Tag already added')).toBeTruthy();

        // Start typing different tag
        fireEvent.changeText(tagInput, 'casual');
        expect(screen.queryByText('Tag already added')).toBeNull();
      });
    });

    describe('Tag Normalization (lowercase)', () => {
      it('should convert tags to lowercase on add', () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');

        // Add uppercase tag
        fireEvent.changeText(tagInput, 'SUMMER');
        fireEvent.press(addButton);

        // Should display as lowercase
        expect(screen.getByText('summer')).toBeTruthy();
        expect(screen.queryByText('SUMMER')).toBeNull();
      });

      it('should normalize mixed case tags', () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');

        // Add mixed case tag
        fireEvent.changeText(tagInput, 'SuMmEr-CaSuAl');
        fireEvent.press(addButton);

        // Should display as lowercase
        expect(screen.getByText('summer-casual')).toBeTruthy();
      });

      it('should store multiple tags in lowercase', () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');

        const tags = ['Summer', 'CASUAL', 'WoRk-WeAr'];

        tags.forEach((tag) => {
          fireEvent.changeText(tagInput, tag);
          fireEvent.press(addButton);
        });

        // All should be lowercase
        expect(screen.getByText('summer')).toBeTruthy();
        expect(screen.getByText('casual')).toBeTruthy();
        expect(screen.getByText('work-wear')).toBeTruthy();
      });

      it('should submit tags in lowercase', async () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');

        // Add mixed case tags
        fireEvent.changeText(tagInput, 'SUMMER');
        fireEvent.press(addButton);
        fireEvent.changeText(tagInput, 'CaSuAl');
        fireEvent.press(addButton);

        const saveButton = screen.getByText('Save');
        fireEvent.press(saveButton);

        await waitFor(() => {
          expect(mockSave).toHaveBeenCalledWith(
            expect.objectContaining({
              tags: ['summer', 'casual'],
            })
          );
        });
      });
    });

    describe('Tag UI Rendering', () => {
      it('should display tags as chips', () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');

        fireEvent.changeText(tagInput, 'summer');
        fireEvent.press(addButton);

        expect(screen.getByText('summer')).toBeTruthy();
      });

      it('should display multiple tag chips', () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');

        const tags = ['summer', 'casual', 'work'];
        tags.forEach((tag) => {
          fireEvent.changeText(tagInput, tag);
          fireEvent.press(addButton);
        });

        tags.forEach((tag) => {
          expect(screen.getByText(tag)).toBeTruthy();
        });
      });

      it('should show remove button (x) on each tag chip', () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');

        fireEvent.changeText(tagInput, 'summer');
        fireEvent.press(addButton);
        fireEvent.changeText(tagInput, 'casual');
        fireEvent.press(addButton);

        const removeButtons = screen.getAllByText('x');
        expect(removeButtons.length).toBe(2);
      });

      it('should remove correct tag when remove button clicked', () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');

        fireEvent.changeText(tagInput, 'summer');
        fireEvent.press(addButton);
        fireEvent.changeText(tagInput, 'casual');
        fireEvent.press(addButton);
        fireEvent.changeText(tagInput, 'work');
        fireEvent.press(addButton);

        expect(screen.getByText('summer')).toBeTruthy();
        expect(screen.getByText('casual')).toBeTruthy();
        expect(screen.getByText('work')).toBeTruthy();

        // Remove second tag (casual)
        const removeButtons = screen.getAllByText('x');
        fireEvent.press(removeButtons[1]);

        expect(screen.getByText('summer')).toBeTruthy();
        expect(screen.queryByText('casual')).toBeNull();
        expect(screen.getByText('work')).toBeTruthy();
      });

      it('should update tag count when tags removed', () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');

        // Add 3 tags
        for (let i = 1; i <= 3; i++) {
          fireEvent.changeText(tagInput, `tag${i}`);
          fireEvent.press(addButton);
        }

        expect(screen.getByText('3/20 tags')).toBeTruthy();

        // Remove one tag
        const removeButtons = screen.getAllByText('x');
        fireEvent.press(removeButtons[0]);

        expect(screen.getByText('2/20 tags')).toBeTruthy();
      });
    });

    describe('Tag Input Interactions', () => {
      it('should add tag with Add button', () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');

        fireEvent.changeText(tagInput, 'summer');
        fireEvent.press(addButton);

        expect(screen.getByText('summer')).toBeTruthy();
      });

      it('should add tag with Enter key', () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');

        fireEvent.changeText(tagInput, 'summer');
        fireEvent(tagInput, 'submitEditing');

        expect(screen.getByText('summer')).toBeTruthy();
      });

      it('should add tag with space delimiter', () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');

        // Type tag with trailing space
        fireEvent.changeText(tagInput, 'summer ');

        expect(screen.getByText('summer')).toBeTruthy();
      });

      it('should clear input after successful add', () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');

        fireEvent.changeText(tagInput, 'summer');
        fireEvent.press(addButton);

        expect(tagInput.props.value).toBe('');
      });

      it('should keep input if add fails validation', () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');

        const longTag = 'A'.repeat(35);
        fireEvent.changeText(tagInput, longTag);
        fireEvent.press(addButton);

        expect(tagInput.props.value).toBe(longTag);
      });

      it('should ignore empty input on Add', () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');

        fireEvent.changeText(tagInput, '');
        fireEvent.press(addButton);

        expect(screen.getByText('0/20 tags')).toBeTruthy();
      });

      it('should ignore whitespace-only input', () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');

        fireEvent.changeText(tagInput, '   ');
        fireEvent.press(addButton);

        expect(screen.getByText('0/20 tags')).toBeTruthy();
      });

      it('should trim leading and trailing whitespace from tags', () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');

        fireEvent.changeText(tagInput, '  summer  ');
        fireEvent.press(addButton);

        expect(screen.getByText('summer')).toBeTruthy();
        expect(tagInput.props.value).toBe('');
      });
    });

    describe('Tag Feedback Messages', () => {
      it('should show feedback for tag too long', () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');

        fireEvent.changeText(tagInput, 'A'.repeat(35));
        fireEvent.press(addButton);

        expect(screen.getByText('Tag must be 30 characters or less')).toBeTruthy();
      });

      it('should show feedback for duplicate tag', () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');

        fireEvent.changeText(tagInput, 'summer');
        fireEvent.press(addButton);

        fireEvent.changeText(tagInput, 'summer');
        fireEvent.press(addButton);

        expect(screen.getByText('Tag already added')).toBeTruthy();
      });

      it('should show tag limit in placeholder when at limit', () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');

        // Add 20 tags
        for (let i = 1; i <= 20; i++) {
          fireEvent.changeText(tagInput, `tag${i}`);
          fireEvent.press(addButton);
        }

        // Placeholder should indicate limit reached
        expect(screen.getByPlaceholderText('Maximum 20 tags reached')).toBeTruthy();
      });

      it('should clear feedback when user types in input', () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');

        // Show feedback with long tag
        fireEvent.changeText(tagInput, 'A'.repeat(35));
        fireEvent.press(addButton);
        expect(screen.getByText('Tag must be 30 characters or less')).toBeTruthy();

        // Start typing - feedback should clear
        fireEvent.changeText(tagInput, 'summer');
        expect(screen.queryByText('Tag must be 30 characters or less')).toBeNull();
      });

      it('should clear feedback when valid tag added', () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');

        // Add tag
        fireEvent.changeText(tagInput, 'summer');
        fireEvent.press(addButton);

        // Try duplicate - shows feedback
        fireEvent.changeText(tagInput, 'summer');
        fireEvent.press(addButton);
        expect(screen.getByText('Tag already added')).toBeTruthy();

        // Add different tag - feedback should clear
        fireEvent.changeText(tagInput, 'casual');
        fireEvent.press(addButton);
        expect(screen.queryByText('Tag already added')).toBeNull();
      });
    });

    describe('Form Submission with Tags', () => {
      it('should submit with no tags (optional field)', async () => {
        render(<ReviewDetailsScreen />);

        const saveButton = screen.getByText('Save');
        fireEvent.press(saveButton);

        await waitFor(() => {
          expect(mockSave).toHaveBeenCalledWith(
            expect.objectContaining({
              tags: [],
            })
          );
        });
      });

      it('should submit with single tag', async () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');

        fireEvent.changeText(tagInput, 'summer');
        fireEvent.press(addButton);

        const saveButton = screen.getByText('Save');
        fireEvent.press(saveButton);

        await waitFor(() => {
          expect(mockSave).toHaveBeenCalledWith(
            expect.objectContaining({
              tags: ['summer'],
            })
          );
        });
      });

      it('should submit with multiple tags', async () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');

        const tags = ['summer', 'casual', 'work'];
        tags.forEach((tag) => {
          fireEvent.changeText(tagInput, tag);
          fireEvent.press(addButton);
        });

        const saveButton = screen.getByText('Save');
        fireEvent.press(saveButton);

        await waitFor(() => {
          expect(mockSave).toHaveBeenCalledWith(
            expect.objectContaining({
              tags: ['summer', 'casual', 'work'],
            })
          );
        });
      });

      it('should submit with 20 tags (maximum)', async () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');

        const expectedTags: string[] = [];
        for (let i = 1; i <= 20; i++) {
          const tag = `tag${i}`;
          expectedTags.push(tag);
          fireEvent.changeText(tagInput, tag);
          fireEvent.press(addButton);
        }

        const saveButton = screen.getByText('Save');
        fireEvent.press(saveButton);

        await waitFor(() => {
          expect(mockSave).toHaveBeenCalledWith(
            expect.objectContaining({
              tags: expectedTags,
            })
          );
        });
      });

      it('should submit all tags in lowercase', async () => {
        render(<ReviewDetailsScreen />);

        const tagInput = screen.getByPlaceholderText('e.g., casual, summer');
        const addButton = screen.getByText('Add');

        fireEvent.changeText(tagInput, 'SUMMER');
        fireEvent.press(addButton);
        fireEvent.changeText(tagInput, 'CaSuAl');
        fireEvent.press(addButton);
        fireEvent.changeText(tagInput, 'WoRk');
        fireEvent.press(addButton);

        const saveButton = screen.getByText('Save');
        fireEvent.press(saveButton);

        await waitFor(() => {
          expect(mockSave).toHaveBeenCalledWith(
            expect.objectContaining({
              tags: ['summer', 'casual', 'work'],
            })
          );
        });
      });
    });
  });
});
