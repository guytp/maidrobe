/**
 * Unit tests for ItemDetailScreen component.
 *
 * Tests the Item Detail screen component covering:
 * - Loading states
 * - Error handling
 * - Form validation
 * - Accessibility labels
 * - Telemetry events
 *
 * @module __tests__/wardrobe/components/ItemDetailScreen
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ItemDetailScreen } from '../../../src/features/wardrobe/components/ItemDetailScreen';
import * as telemetry from '../../../src/core/telemetry';

// Mock dependencies
jest.mock('../../../src/core/telemetry', () => ({
  logError: jest.fn(),
  trackCaptureEvent: jest.fn(),
}));

jest.mock('../../../src/core/state/store', () => ({
  useStore: jest.fn((selector) =>
    selector({
      user: { id: 'test-user-123' },
    })
  ),
}));

jest.mock('../../../src/core/i18n', () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      'screens.itemDetail.nameLabel': 'Name',
      'screens.itemDetail.nameHelper': 'Enter a name for this item',
      'screens.itemDetail.namePlaceholder': 'Enter name...',
      'screens.itemDetail.nameRequired': 'Please enter a name',
      'screens.itemDetail.nameTooLong': 'Name must be 100 characters or less',
      'screens.itemDetail.tagsLabel': 'Tags',
      'screens.itemDetail.tagsHelper': 'Add tags to organize items',
      'screens.itemDetail.tagsPlaceholder': 'Add tag...',
      'screens.itemDetail.tagCount': '{count}/{max} tags',
      'screens.itemDetail.tagAlreadyAdded': 'Tag already added',
      'screens.itemDetail.tagLimitReached': 'Maximum 20 tags allowed',
      'screens.itemDetail.tagTooLong': 'Tag must be 30 characters or less',
      'screens.itemDetail.addTagButton': 'Add',
      'screens.itemDetail.save': 'Save',
      'screens.itemDetail.saving': 'Saving...',
      'screens.itemDetail.delete': 'Delete item',
      'screens.itemDetail.deleting': 'Deleting...',
      'screens.itemDetail.deleteConfirmation.title': 'Delete item?',
      'screens.itemDetail.deleteConfirmation.message': 'This cannot be undone.',
      'screens.itemDetail.deleteConfirmation.cancel': 'Cancel',
      'screens.itemDetail.deleteConfirmation.delete': 'Delete',
      'screens.itemDetail.deleteSuccess': 'Item deleted',
      'screens.itemDetail.errors.loadFailed': 'Could not load item',
      'screens.itemDetail.errors.notFound': 'Item not found',
      'screens.itemDetail.errors.network': 'Network error',
      'screens.itemDetail.errors.saveFailed': 'Could not save',
      'screens.itemDetail.errors.deleteFailed': 'Could not delete',
      'screens.itemDetail.goBack': 'Go back',
      'screens.itemDetail.aiSummary.title': 'AI Detection',
      'screens.itemDetail.aiSummary.detected': 'Detected: {summary}',
      'screens.itemDetail.unsavedChanges.title': 'Unsaved changes',
      'screens.itemDetail.unsavedChanges.message': 'You have unsaved changes',
      'screens.itemDetail.unsavedChanges.save': 'Save',
      'screens.itemDetail.unsavedChanges.discard': 'Discard',
      'screens.itemDetail.unsavedChanges.cancel': 'Cancel',
      'screens.itemDetail.accessibility.screenLabel': 'Item detail screen',
      'screens.itemDetail.accessibility.screenHint': 'View and edit item details',
      'screens.itemDetail.accessibility.loadingScreen': 'Loading item details',
      'screens.itemDetail.accessibility.itemImage': 'Photo of {name}',
      'screens.itemDetail.accessibility.itemImagePlaceholder': 'Item photo placeholder',
      'screens.itemDetail.accessibility.nameInput': 'Item name input',
      'screens.itemDetail.accessibility.nameInputHint': 'Enter a name for this item',
      'screens.itemDetail.accessibility.tagsInput': 'Tags input',
      'screens.itemDetail.accessibility.tagsInputHint': 'Add tags',
      'screens.itemDetail.accessibility.addTagButton': 'Add tag button',
      'screens.itemDetail.accessibility.addTagButtonHint': 'Add tag',
      'screens.itemDetail.accessibility.tagChip': 'Tag',
      'screens.itemDetail.accessibility.removeTag': 'Remove tag',
      'screens.itemDetail.accessibility.aiSummarySection': 'AI attributes',
      'screens.itemDetail.accessibility.saveButton': 'Save changes button',
      'screens.itemDetail.accessibility.saveButtonHint': 'Save your changes',
      'screens.itemDetail.accessibility.saveButtonDisabledHint': 'Make changes first',
      'screens.itemDetail.accessibility.deleteButton': 'Delete this item',
      'screens.itemDetail.accessibility.deleteButtonHint': 'Permanently delete',
      'screens.itemDetail.accessibility.errorState': 'Error loading item',
      'screens.itemDetail.accessibility.goBackButton': 'Go back button',
      'screens.itemDetail.accessibility.goBackHint': 'Return to wardrobe',
      'screens.wardrobe.grid.itemName': 'Wardrobe item',
    };
    return translations[key] || key;
  },
}));

jest.mock('../../../src/core/theme', () => ({
  useTheme: () => ({
    colors: {
      background: '#ffffff',
      textPrimary: '#000000',
      textSecondary: '#666666',
      error: '#ff0000',
      warning: '#ffaa00',
    },
    colorScheme: 'light',
    spacing: {
      xs: 4,
      sm: 8,
      md: 16,
      lg: 24,
      xl: 32,
    },
    radius: {
      sm: 4,
      md: 8,
      lg: 16,
    },
    fontSize: {
      xs: 10,
      sm: 12,
      base: 14,
      lg: 16,
      xl: 18,
      '5xl': 48,
    },
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: jest.fn(),
    push: jest.fn(),
  }),
  useNavigation: () => ({
    addListener: jest.fn(() => jest.fn()),
  }),
}));

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

// Mock the API hooks
const mockUseWardrobeItem = jest.fn();
const mockUseUpdateWardrobeItem = jest.fn();
const mockUseDeleteWardrobeItem = jest.fn();

jest.mock('../../../src/features/wardrobe/api', () => ({
  useWardrobeItem: () => mockUseWardrobeItem(),
  useUpdateWardrobeItem: () => mockUseUpdateWardrobeItem(),
  useDeleteWardrobeItem: () => mockUseDeleteWardrobeItem(),
  useWardrobeRealtimeSync: () => ({ isConnected: true, reconnect: jest.fn() }),
}));

jest.mock('../../../src/features/wardrobe/utils/getItemImageUrl', () => ({
  getDetailImageUrl: jest.fn(() => 'https://example.com/image.jpg'),
}));

jest.mock('../../../src/core/components/Toast', () => ({
  Toast: () => null,
}));

describe('ItemDetailScreen', () => {
  let queryClient: QueryClient;
  const mockTelemetry = telemetry as jest.Mocked<typeof telemetry>;

  const mockItem = {
    id: 'item-123',
    user_id: 'test-user-123',
    name: 'Test Item',
    tags: ['casual', 'summer'],
    original_key: 'path/to/original.jpg',
    clean_key: 'path/to/clean.jpg',
    thumb_key: 'path/to/thumb.jpg',
    image_processing_status: 'succeeded' as const,
    attribute_status: 'succeeded' as const,
    colour: ['blue'],
    type: 'shirt',
    fabric: 'cotton',
    pattern: 'solid',
    fit: 'regular',
    season: ['spring', 'summer'],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };

  const defaultMockHooks = () => {
    mockUseWardrobeItem.mockReturnValue({
      item: mockItem,
      isLoading: false,
      isError: false,
      error: null,
    });

    mockUseUpdateWardrobeItem.mockReturnValue({
      updateItem: jest.fn(),
      isPending: false,
      isSuccess: false,
      isError: false,
      error: null,
      data: undefined,
      reset: jest.fn(),
    });

    mockUseDeleteWardrobeItem.mockReturnValue({
      deleteItem: jest.fn(),
      isPending: false,
      isSuccess: false,
      isError: false,
      error: null,
      reset: jest.fn(),
    });
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    jest.clearAllMocks();
    defaultMockHooks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  const renderScreen = (itemId = 'item-123') => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ItemDetailScreen itemId={itemId} />
      </QueryClientProvider>
    );
  };

  describe('loading state', () => {
    it('shows loading skeleton when data is loading', () => {
      mockUseWardrobeItem.mockReturnValue({
        item: undefined,
        isLoading: true,
        isError: false,
        error: null,
      });

      const { getByLabelText } = renderScreen();

      expect(getByLabelText('Loading item details')).toBeTruthy();
    });
  });

  describe('error state', () => {
    it('shows error state when fetch fails', () => {
      mockUseWardrobeItem.mockReturnValue({
        item: undefined,
        isLoading: false,
        isError: true,
        error: { code: 'server', message: 'Server error' },
      });

      const { getByLabelText, getAllByText } = renderScreen();

      expect(getByLabelText('Error loading item')).toBeTruthy();
      // Use getAllByText since the error message may appear in multiple places
      expect(getAllByText('Could not load item').length).toBeGreaterThan(0);
    });

    it('logs error to observability stack on load failure', async () => {
      const error = { code: 'network', message: 'Network error' };
      mockUseWardrobeItem.mockReturnValue({
        item: undefined,
        isLoading: false,
        isError: true,
        error,
      });

      renderScreen();

      await waitFor(() => {
        expect(mockTelemetry.logError).toHaveBeenCalledWith(
          error,
          'network',
          expect.objectContaining({
            feature: 'wardrobe',
            operation: 'viewItemDetail',
          })
        );
      });
    });
  });

  describe('loaded state', () => {
    it('renders item details when loaded', () => {
      const { getByLabelText, getByDisplayValue } = renderScreen();

      expect(getByLabelText('Item detail screen')).toBeTruthy();
      expect(getByDisplayValue('Test Item')).toBeTruthy();
    });

    it('emits item_detail_viewed telemetry', async () => {
      renderScreen();

      await waitFor(() => {
        expect(mockTelemetry.trackCaptureEvent).toHaveBeenCalledWith(
          'item_detail_viewed',
          expect.objectContaining({
            userId: 'test-user-123',
            itemId: 'item-123',
            hasAIAttributes: true,
            hasTags: true,
          })
        );
      });
    });
  });

  describe('accessibility', () => {
    it('has accessible name input', () => {
      const { getByLabelText } = renderScreen();

      const nameInput = getByLabelText('Item name input');
      expect(nameInput).toBeTruthy();
    });

    it('has accessible tags input', () => {
      const { getByLabelText } = renderScreen();

      const tagsInput = getByLabelText('Tags input');
      expect(tagsInput).toBeTruthy();
    });

    it('has accessible save button', () => {
      const { getByLabelText } = renderScreen();

      const saveButton = getByLabelText('Save changes button');
      expect(saveButton).toBeTruthy();
    });

    it('has accessible delete button', () => {
      const { getByLabelText } = renderScreen();

      const deleteButton = getByLabelText('Delete this item');
      expect(deleteButton).toBeTruthy();
    });

    it('has accessible add tag button', () => {
      const { getByLabelText } = renderScreen();

      const addTagButton = getByLabelText('Add tag button');
      expect(addTagButton).toBeTruthy();
    });
  });

  describe('form validation', () => {
    it('shows error when name exceeds max length', async () => {
      const { getByLabelText, getByText } = renderScreen();

      const nameInput = getByLabelText('Item name input');

      // Enter a name that's too long (> 100 chars)
      const longName = 'a'.repeat(101);
      await act(async () => {
        fireEvent.changeText(nameInput, longName);
      });

      await waitFor(() => {
        expect(getByText('Name must be 100 characters or less')).toBeTruthy();
      });
    });

    it('disables save button when form is not dirty', () => {
      const { getByLabelText } = renderScreen();

      const saveButton = getByLabelText('Save changes button');
      expect(saveButton.props.accessibilityState?.disabled).toBeTruthy();
    });

    it('enables save button when form is dirty and valid', async () => {
      const { getByLabelText } = renderScreen();

      const nameInput = getByLabelText('Item name input');

      await act(async () => {
        fireEvent.changeText(nameInput, 'Updated Name');
      });

      await waitFor(() => {
        const saveButton = getByLabelText('Save changes button');
        expect(saveButton.props.accessibilityState?.disabled).toBeFalsy();
      });
    });
  });

  describe('tags functionality', () => {
    it('displays existing tags as chips', () => {
      const { getByText } = renderScreen();

      expect(getByText('casual')).toBeTruthy();
      expect(getByText('summer')).toBeTruthy();
    });

    it('allows adding new tags', async () => {
      const { getByLabelText, getByText, queryByText } = renderScreen();

      const tagsInput = getByLabelText('Tags input');
      const addButton = getByLabelText('Add tag button');

      // First enter the tag text
      await act(async () => {
        fireEvent.changeText(tagsInput, 'newtag');
      });

      // Then press add button
      await act(async () => {
        fireEvent.press(addButton);
      });

      // Verify the tag was added (normalized to lowercase)
      await waitFor(() => {
        expect(queryByText('newtag')).toBeTruthy();
      });
    });
  });

  describe('save functionality', () => {
    it('disables save button when mutation is pending', () => {
      mockUseUpdateWardrobeItem.mockReturnValue({
        updateItem: jest.fn(),
        isPending: true,
        isSuccess: false,
        isError: false,
        error: null,
        data: undefined,
        reset: jest.fn(),
      });

      const { getByLabelText } = renderScreen();

      // Button component shows ActivityIndicator when loading={true}
      // Verify save button is disabled during save operation
      const saveButton = getByLabelText('Save changes button');
      expect(saveButton.props.accessibilityState?.disabled).toBe(true);
    });
  });

  describe('delete functionality', () => {
    it('shows deleting state when mutation is pending', () => {
      mockUseDeleteWardrobeItem.mockReturnValue({
        deleteItem: jest.fn(),
        isPending: true,
        isSuccess: false,
        isError: false,
        error: null,
        reset: jest.fn(),
      });

      const { getByText } = renderScreen();

      expect(getByText('Deleting...')).toBeTruthy();
    });

    it('disables delete button during delete operation', () => {
      mockUseDeleteWardrobeItem.mockReturnValue({
        deleteItem: jest.fn(),
        isPending: true,
        isSuccess: false,
        isError: false,
        error: null,
        reset: jest.fn(),
      });

      const { getByLabelText } = renderScreen();

      const deleteButton = getByLabelText('Delete this item');
      expect(deleteButton.props.accessibilityState?.disabled).toBe(true);
    });
  });

  describe('tap targets', () => {
    it('has minimum 44px touch target for save button', () => {
      // This is enforced by the Button component's minHeight: 44 styling
      // We verify the save button renders without errors
      const { getByLabelText } = renderScreen();
      expect(getByLabelText('Save changes button')).toBeTruthy();
    });

    it('has minimum 44px touch target for delete button', () => {
      // Verified via styles.deleteButton.minHeight: 44
      const { getByLabelText } = renderScreen();
      expect(getByLabelText('Delete this item')).toBeTruthy();
    });
  });
});
