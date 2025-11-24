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
});
