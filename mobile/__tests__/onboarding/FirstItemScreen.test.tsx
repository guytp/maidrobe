/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { FirstItemScreen } from '../../src/features/onboarding/components/FirstItemScreen';
import { ThemeProvider } from '../../src/core/theme';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as onboardingAnalytics from '../../src/features/onboarding/utils/onboardingAnalytics';
import * as telemetry from '../../src/core/telemetry';
import { useOnboardingContext } from '../../src/features/onboarding/context/OnboardingContext';
import { useWardrobeItemCount } from '../../src/features/onboarding/utils/wardrobeUtils';
import { checkCameraPermission } from '../../src/features/onboarding/utils/cameraPermissions';
import { useCreateFirstItem } from '../../src/features/onboarding/api/useCreateFirstItem';
import { ItemType } from '../../src/features/onboarding/types/itemMetadata';

// Mock dependencies
jest.mock('../../src/features/onboarding/context/OnboardingContext');
jest.mock('../../src/features/onboarding/utils/wardrobeUtils');
jest.mock('../../src/features/onboarding/utils/cameraPermissions');
jest.mock('../../src/features/onboarding/api/useCreateFirstItem');

jest.mock('../../src/features/onboarding/utils/onboardingAnalytics', () => ({
  trackFirstItemViewed: jest.fn(),
  trackFirstItemStartedCapture: jest.fn(),
  trackFirstItemSkipped: jest.fn(),
  trackFirstItemSavedSuccess: jest.fn(),
  trackFirstItemSaveFailed: jest.fn(),
}));

jest.mock('../../src/core/telemetry', () => ({
  logError: jest.fn(),
  logSuccess: jest.fn(),
}));

// Mock child components
jest.mock('../../src/features/onboarding/components/OnboardingShell', () => {
  const { View } = require('react-native');
  return {
    OnboardingShell: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock('../../src/features/onboarding/components/CameraPlaceholder', () => {
  const { View, Text, Pressable } = require('react-native');
  return {
    CameraPlaceholder: ({
      onCapture,
      onCancel,
    }: {
      onCapture: (image: { uri: string }) => void;
      onCancel: () => void;
    }) => (
      <View>
        <Pressable testID="camera-capture" onPress={() => onCapture({ uri: 'test-image.jpg' })}>
          <Text>Capture</Text>
        </Pressable>
        <Pressable testID="camera-cancel" onPress={onCancel}>
          <Text>Cancel</Text>
        </Pressable>
      </View>
    ),
  };
});

jest.mock('../../src/features/onboarding/components/ItemMetadataForm', () => {
  const { View, Text, Pressable } = require('react-native');
  return {
    ItemMetadataForm: ({
      onSave,
      onRetry,
      onSkip,
      loading,
      error,
    }: {
      onSave: (metadata: any) => void;
      onRetry: () => void;
      onSkip: () => void;
      loading: boolean;
      error: string | null;
    }) => (
      <View>
        <Pressable
          testID="metadata-save"
          onPress={() =>
            onSave({
              type: require('../../src/features/onboarding/types/itemMetadata').ItemType.Top,
              colourId: 'blue',
              name: 'Test Shirt',
            })
          }
        >
          <Text>Save</Text>
        </Pressable>
        <Pressable testID="metadata-retry" onPress={onRetry}>
          <Text>Retry</Text>
        </Pressable>
        <Pressable testID="metadata-skip" onPress={onSkip}>
          <Text>Skip</Text>
        </Pressable>
        {loading && <Text testID="metadata-loading">Loading...</Text>}
        {error && <Text testID="metadata-error">{error}</Text>}
      </View>
    ),
  };
});

jest.mock('../../src/features/onboarding/components/ItemPreviewCard', () => {
  const { View, Text } = require('react-native');
  return {
    ItemPreviewCard: ({ item }: { item: any }) => (
      <View testID="item-preview-card">
        <Text>{item.name}</Text>
      </View>
    ),
  };
});

jest.mock('../../src/core/components/Toast', () => {
  const { View, Text, Pressable } = require('react-native');
  return {
    Toast: ({
      visible,
      message,
      onDismiss,
    }: {
      visible: boolean;
      message: string;
      onDismiss: () => void;
    }) =>
      visible ? (
        <View testID="success-toast">
          <Text>{message}</Text>
          <Pressable onPress={onDismiss}>
            <Text>Dismiss</Text>
          </Pressable>
        </View>
      ) : null,
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  }),
}));

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

// Mock i18n
jest.mock('../../src/core/i18n', () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      'screens.onboarding.firstItem.title': 'Add Your First Item',
      'screens.onboarding.firstItem.headline': 'Start building your digital wardrobe',
      'screens.onboarding.firstItem.optional': 'This step is optional',
      'screens.onboarding.firstItem.success.itemSaved': 'Item saved successfully!',
      'screens.onboarding.firstItem.metadata.errors.networkError': 'Network error occurred',
      'screens.onboarding.firstItem.metadata.errors.storageError': 'Storage error occurred',
      'screens.onboarding.firstItem.metadata.errors.databaseError': 'Database error occurred',
      'screens.onboarding.firstItem.metadata.errors.unknownError': 'Unknown error occurred',
      'screens.onboarding.firstItem.metadata.errors.validationError':
        'Please check your information and try again.',
      'screens.onboarding.firstItem.cancelConfirmation.title': 'Cancel adding item?',
      'screens.onboarding.firstItem.cancelConfirmation.message':
        'Your progress will be lost. You can always add items later from your wardrobe.',
      'screens.onboarding.firstItem.cancelConfirmation.keepEditing': 'Keep editing',
      'screens.onboarding.firstItem.cancelConfirmation.cancel': 'Cancel',
      'screens.onboarding.firstItem.accessibility.screenLabel': 'First item screen',
      'screens.onboarding.firstItem.accessibility.screenHint': 'Add your first wardrobe item',
      'screens.onboarding.firstItem.accessibility.headlineLabel':
        'Start building your digital wardrobe',
      'screens.onboarding.firstItem.accessibility.optionalLabel': 'This step is optional',
    };
    return translations[key] || key;
  },
}));

describe('FirstItemScreen', () => {
  let queryClient: QueryClient;
  const mockOnNext = jest.fn();
  const mockOnSkipStep = jest.fn();
  const mockOnSkipOnboarding = jest.fn();
  const mockSetCustomPrimaryHandler = jest.fn();
  const mockMutate = jest.fn();
  const mockReset = jest.fn();

  const defaultContextValue = {
    currentStep: 'firstItem' as const,
    onNext: mockOnNext,
    onSkipStep: mockOnSkipStep,
    onSkipOnboarding: mockOnSkipOnboarding,
    onBack: jest.fn(),
    setCustomPrimaryHandler: mockSetCustomPrimaryHandler,
  };

  const defaultMutationState = {
    mutate: mockMutate,
    reset: mockReset,
    isPending: false,
    isSuccess: false,
    isError: false,
    data: undefined,
    error: null,
  };

  const TestWrapper = ({ children }: { children: React.ReactNode }) => (
    <ThemeProvider colorScheme="light">
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ThemeProvider>
  );

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Default mocks
    (useOnboardingContext as jest.Mock).mockReturnValue(defaultContextValue);
    (useWardrobeItemCount as jest.Mock).mockReturnValue(0);
    (checkCameraPermission as jest.Mock).mockResolvedValue('granted');
    (useCreateFirstItem as jest.Mock).mockReturnValue(defaultMutationState);
  });

  afterEach(() => {
    queryClient.clear();
    jest.useRealTimers();
  });

  describe('Initial Render and UI Elements', () => {
    it('should render title text', () => {
      const { getByText } = render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      expect(getByText('Add Your First Item')).toBeTruthy();
    });

    it('should render headline text', () => {
      const { getByText } = render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      expect(getByText('Start building your digital wardrobe')).toBeTruthy();
    });

    it('should render optional notice text', () => {
      const { getByText } = render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      expect(getByText('This step is optional')).toBeTruthy();
    });

    it('should NOT render ItemPreviewCard initially', () => {
      const { queryByTestId } = render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      expect(queryByTestId('item-preview-card')).toBeNull();
    });

    it('should NOT render success toast initially', () => {
      const { queryByTestId } = render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      expect(queryByTestId('success-toast')).toBeNull();
    });
  });

  describe('Analytics - View Tracking', () => {
    it('should call trackFirstItemViewed on mount with correct params', () => {
      render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      expect(onboardingAnalytics.trackFirstItemViewed).toHaveBeenCalledWith(false, false);
      expect(onboardingAnalytics.trackFirstItemViewed).toHaveBeenCalledTimes(1);
    });

    it('should NOT call trackFirstItemViewed multiple times on re-render', () => {
      const { rerender } = render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      rerender(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      expect(onboardingAnalytics.trackFirstItemViewed).toHaveBeenCalledTimes(1);
    });

    it('should NOT call trackFirstItemViewed if currentStep is not firstItem', () => {
      (useOnboardingContext as jest.Mock).mockReturnValue({
        ...defaultContextValue,
        currentStep: 'welcome',
      });

      render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      expect(onboardingAnalytics.trackFirstItemViewed).not.toHaveBeenCalled();
    });

    it('should NOT call trackFirstItemViewed if itemCount is null (loading)', () => {
      (useWardrobeItemCount as jest.Mock).mockReturnValue(null);

      render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      expect(onboardingAnalytics.trackFirstItemViewed).not.toHaveBeenCalled();
    });

    it('should pass hasExistingItems=false when itemCount is 0', () => {
      (useWardrobeItemCount as jest.Mock).mockReturnValue(0);

      render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      expect(onboardingAnalytics.trackFirstItemViewed).toHaveBeenCalledWith(false, false);
    });

    it('should pass hasExistingItems=true when itemCount > 0', () => {
      (useWardrobeItemCount as jest.Mock).mockReturnValue(5);

      render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      expect(onboardingAnalytics.trackFirstItemViewed).toHaveBeenCalledWith(false, true);
    });
  });

  describe('Camera Flow', () => {
    it('should register custom primary handler on mount', () => {
      render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      expect(mockSetCustomPrimaryHandler).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should clear custom primary handler on unmount', () => {
      const { unmount } = render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      unmount();

      expect(mockSetCustomPrimaryHandler).toHaveBeenLastCalledWith(null);
    });

    it('should open camera modal when custom primary handler called with granted permission', async () => {
      const { queryByTestId } = render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      // Get the custom handler that was registered
      const customHandler = mockSetCustomPrimaryHandler.mock.calls[0][0];

      // Call the handler
      await customHandler();

      await waitFor(() => {
        expect(queryByTestId('camera-capture')).toBeTruthy();
      });
    });

    it('should call trackFirstItemStartedCapture when camera opens', async () => {
      render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      const customHandler = mockSetCustomPrimaryHandler.mock.calls[0][0];
      await customHandler();

      await waitFor(() => {
        expect(onboardingAnalytics.trackFirstItemStartedCapture).toHaveBeenCalled();
      });
    });

    it('should call checkCameraPermission before opening camera', async () => {
      render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      const customHandler = mockSetCustomPrimaryHandler.mock.calls[0][0];
      await customHandler();

      expect(checkCameraPermission).toHaveBeenCalled();
    });

    it('should track skip and advance when permission denied', async () => {
      (checkCameraPermission as jest.Mock).mockResolvedValue('denied');

      render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      const customHandler = mockSetCustomPrimaryHandler.mock.calls[0][0];
      await customHandler();

      await waitFor(() => {
        expect(onboardingAnalytics.trackFirstItemSkipped).toHaveBeenCalledWith(
          'permission_denied_then_skip'
        );
        expect(mockOnSkipStep).toHaveBeenCalled();
      });
    });

    it('should track skip and advance when camera error occurs', async () => {
      (checkCameraPermission as jest.Mock).mockRejectedValue(new Error('Camera error'));

      render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      const customHandler = mockSetCustomPrimaryHandler.mock.calls[0][0];
      await customHandler();

      await waitFor(() => {
        expect(onboardingAnalytics.trackFirstItemSkipped).toHaveBeenCalledWith(
          'camera_error_then_skip'
        );
        expect(mockOnSkipStep).toHaveBeenCalled();
      });
    });

    it('should close camera and show metadata form when photo captured', async () => {
      const { getByTestId, queryByTestId } = render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      const customHandler = mockSetCustomPrimaryHandler.mock.calls[0][0];
      await customHandler();

      await waitFor(() => {
        expect(getByTestId('camera-capture')).toBeTruthy();
      });

      fireEvent.press(getByTestId('camera-capture'));

      await waitFor(() => {
        expect(queryByTestId('camera-capture')).toBeNull();
        expect(getByTestId('metadata-save')).toBeTruthy();
      });
    });

    it('should track skip and advance when camera cancelled', async () => {
      const { getByTestId } = render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      const customHandler = mockSetCustomPrimaryHandler.mock.calls[0][0];
      await customHandler();

      await waitFor(() => {
        expect(getByTestId('camera-cancel')).toBeTruthy();
      });

      fireEvent.press(getByTestId('camera-cancel'));

      await waitFor(() => {
        expect(onboardingAnalytics.trackFirstItemSkipped).toHaveBeenCalledWith(
          'cancelled_from_camera'
        );
        expect(mockOnSkipStep).toHaveBeenCalled();
      });
    });
  });

  describe('Metadata Form Flow', () => {
    const setupWithMetadataForm = async () => {
      const result = render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      const customHandler = mockSetCustomPrimaryHandler.mock.calls[0][0];
      await customHandler();

      await waitFor(() => {
        expect(result.getByTestId('camera-capture')).toBeTruthy();
      });

      fireEvent.press(result.getByTestId('camera-capture'));

      await waitFor(() => {
        expect(result.getByTestId('metadata-save')).toBeTruthy();
      });

      return result;
    };

    it('should show metadata form after photo capture', async () => {
      const { getByTestId } = await setupWithMetadataForm();

      expect(getByTestId('metadata-save')).toBeTruthy();
      expect(getByTestId('metadata-retry')).toBeTruthy();
      expect(getByTestId('metadata-skip')).toBeTruthy();
    });

    it('should trigger mutation when form saved with valid metadata', async () => {
      const { getByTestId } = await setupWithMetadataForm();

      fireEvent.press(getByTestId('metadata-save'));

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalledWith({
          imageUri: 'test-image.jpg',
          type: ItemType.Top,
          colourId: 'blue',
          name: 'Test Shirt',
        });
      });
    });

    it('should show loading state while mutation pending', async () => {
      (useCreateFirstItem as jest.Mock).mockReturnValue({
        ...defaultMutationState,
        isPending: true,
      });

      const { getByTestId } = await setupWithMetadataForm();

      expect(getByTestId('metadata-loading')).toBeTruthy();
    });

    it('should allow retry after error', async () => {
      const { getByTestId } = await setupWithMetadataForm();

      fireEvent.press(getByTestId('metadata-save'));

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalled();
      });

      fireEvent.press(getByTestId('metadata-retry'));

      await waitFor(() => {
        expect(mockReset).toHaveBeenCalled();
      });
    });

    it('should track skip when skip button pressed after error', async () => {
      const { getByTestId } = await setupWithMetadataForm();

      fireEvent.press(getByTestId('metadata-skip'));

      await waitFor(() => {
        expect(onboardingAnalytics.trackFirstItemSkipped).toHaveBeenCalledWith('failure_then_skip');
        expect(mockOnSkipStep).toHaveBeenCalled();
      });
    });
  });

  describe('Success Flow', () => {
    it('should show success toast when mutation succeeds', async () => {
      const { queryByTestId, rerender } = render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      expect(queryByTestId('success-toast')).toBeNull();

      (useCreateFirstItem as jest.Mock).mockReturnValue({
        ...defaultMutationState,
        isSuccess: true,
        data: {
          item: {
            id: 'test-id',
            userId: 'user-123',
            type: ItemType.Top,
            colour: ['blue'],
            name: 'Test Shirt',
            imageUrl: 'test-url',
            createdAt: new Date().toISOString(),
          },
        },
      });

      rerender(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(queryByTestId('success-toast')).toBeTruthy();
      });
    });

    it('should render ItemPreviewCard when item created', async () => {
      const { queryByTestId, rerender } = render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      (useCreateFirstItem as jest.Mock).mockReturnValue({
        ...defaultMutationState,
        isSuccess: true,
        data: {
          item: {
            id: 'test-id',
            userId: 'user-123',
            type: ItemType.Top,
            colour: ['blue'],
            name: 'Test Shirt',
            imageUrl: 'test-url',
            createdAt: new Date().toISOString(),
          },
        },
      });

      rerender(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(queryByTestId('item-preview-card')).toBeTruthy();
      });
    });

    it('should call trackFirstItemSavedSuccess exactly once', async () => {
      const { rerender } = render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      (useCreateFirstItem as jest.Mock).mockReturnValue({
        ...defaultMutationState,
        isSuccess: true,
        data: {
          item: {
            id: 'test-id',
            userId: 'user-123',
            type: ItemType.Top,
            colour: ['blue'],
            name: 'Test Shirt',
            imageUrl: 'test-url',
            createdAt: new Date().toISOString(),
          },
        },
      });

      rerender(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(onboardingAnalytics.trackFirstItemSavedSuccess).toHaveBeenCalledTimes(1);
      });

      // Re-render again to ensure it doesn't get called again
      rerender(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      expect(onboardingAnalytics.trackFirstItemSavedSuccess).toHaveBeenCalledTimes(1);
    });

    it('should call onNext after 2 second delay', async () => {
      const { rerender } = render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      (useCreateFirstItem as jest.Mock).mockReturnValue({
        ...defaultMutationState,
        isSuccess: true,
        data: {
          item: {
            id: 'test-id',
            userId: 'user-123',
            type: ItemType.Top,
            colour: ['blue'],
            name: 'Test Shirt',
            imageUrl: 'test-url',
            createdAt: new Date().toISOString(),
          },
        },
      });

      rerender(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      expect(mockOnNext).not.toHaveBeenCalled();

      jest.advanceTimersByTime(2000);

      await waitFor(() => {
        expect(mockOnNext).toHaveBeenCalled();
      });
    });

    it('should cleanup timer on unmount', async () => {
      const { rerender, unmount } = render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      (useCreateFirstItem as jest.Mock).mockReturnValue({
        ...defaultMutationState,
        isSuccess: true,
        data: {
          item: {
            id: 'test-id',
            userId: 'user-123',
            type: ItemType.Top,
            colour: ['blue'],
            name: 'Test Shirt',
            imageUrl: 'test-url',
            createdAt: new Date().toISOString(),
          },
        },
      });

      rerender(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      unmount();

      jest.advanceTimersByTime(2000);

      expect(mockOnNext).not.toHaveBeenCalled();
    });
  });

  describe('Error Flow', () => {
    it('should call trackFirstItemSaveFailed when mutation fails', async () => {
      const { rerender } = render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      const error = new Error('Network error') as any;
      error.errorType = 'network';

      (useCreateFirstItem as jest.Mock).mockReturnValue({
        ...defaultMutationState,
        isError: true,
        error,
      });

      rerender(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(onboardingAnalytics.trackFirstItemSaveFailed).toHaveBeenCalledWith('network');
      });
    });

    it('should call trackFirstItemSaveFailed exactly once per error', async () => {
      const { rerender } = render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      const error = new Error('Network error') as any;
      error.errorType = 'network';

      (useCreateFirstItem as jest.Mock).mockReturnValue({
        ...defaultMutationState,
        isError: true,
        error,
      });

      rerender(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(onboardingAnalytics.trackFirstItemSaveFailed).toHaveBeenCalledTimes(1);
      });

      // Re-render again
      rerender(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      expect(onboardingAnalytics.trackFirstItemSaveFailed).toHaveBeenCalledTimes(1);
    });

    it('should call logError with correct params', async () => {
      const { rerender } = render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      const error = new Error('Storage error') as any;
      error.errorType = 'storage';

      (useCreateFirstItem as jest.Mock).mockReturnValue({
        ...defaultMutationState,
        isError: true,
        error,
      });

      rerender(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(telemetry.logError).toHaveBeenCalledWith(error, 'server', {
          feature: 'onboarding_first_item',
          operation: 'saveItem',
          metadata: {
            errorType: 'storage',
          },
        });
      });
    });

    it('should display network error message for network errors', async () => {
      const { rerender, queryByTestId } = render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      const error = new Error('Network error') as any;
      error.errorType = 'network';

      (useCreateFirstItem as jest.Mock).mockReturnValue({
        ...defaultMutationState,
        isError: true,
        error,
      });

      rerender(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(queryByTestId('metadata-error')).toBeTruthy();
      });
    });

    it('should display storage error message for storage errors', async () => {
      const { rerender, queryByTestId } = render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      const error = new Error('Storage error') as any;
      error.errorType = 'storage';

      (useCreateFirstItem as jest.Mock).mockReturnValue({
        ...defaultMutationState,
        isError: true,
        error,
      });

      rerender(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(queryByTestId('metadata-error')).toBeTruthy();
      });
    });

    it('should display database error message for database errors', async () => {
      const { rerender, queryByTestId } = render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      const error = new Error('Database error') as any;
      error.errorType = 'database';

      (useCreateFirstItem as jest.Mock).mockReturnValue({
        ...defaultMutationState,
        isError: true,
        error,
      });

      rerender(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(queryByTestId('metadata-error')).toBeTruthy();
      });
    });

    it('should display unknown error message for other errors', async () => {
      const { rerender, queryByTestId } = render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      const error = new Error('Unknown error') as any;
      error.errorType = 'unknown';

      (useCreateFirstItem as jest.Mock).mockReturnValue({
        ...defaultMutationState,
        isError: true,
        error,
      });

      rerender(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(queryByTestId('metadata-error')).toBeTruthy();
      });
    });

    it('should display validation error message for validation errors', async () => {
      const { rerender, queryByTestId } = render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      const error = new Error('Validation error') as any;
      error.errorType = 'validation';

      (useCreateFirstItem as jest.Mock).mockReturnValue({
        ...defaultMutationState,
        isError: true,
        error,
      });

      rerender(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(queryByTestId('metadata-error')).toBeTruthy();
      });
    });

    it('should call logError with user classification for validation errors', async () => {
      const { rerender } = render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      const error = new Error('Validation error') as any;
      error.errorType = 'validation';

      (useCreateFirstItem as jest.Mock).mockReturnValue({
        ...defaultMutationState,
        isError: true,
        error,
      });

      rerender(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(telemetry.logError).toHaveBeenCalledWith(error, 'user', {
          feature: 'onboarding_first_item',
          operation: 'saveItem',
          metadata: {
            errorType: 'validation',
          },
        });
      });
    });

    it('should call logError with network classification for network errors', async () => {
      const { rerender } = render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      const error = new Error('Network error') as any;
      error.errorType = 'network';

      (useCreateFirstItem as jest.Mock).mockReturnValue({
        ...defaultMutationState,
        isError: true,
        error,
      });

      rerender(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(telemetry.logError).toHaveBeenCalledWith(error, 'network', {
          feature: 'onboarding_first_item',
          operation: 'saveItem',
          metadata: {
            errorType: 'network',
          },
        });
      });
    });

    it('should call logError with server classification for database errors', async () => {
      const { rerender } = render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      const error = new Error('Database error') as any;
      error.errorType = 'database';

      (useCreateFirstItem as jest.Mock).mockReturnValue({
        ...defaultMutationState,
        isError: true,
        error,
      });

      rerender(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(telemetry.logError).toHaveBeenCalledWith(error, 'server', {
          feature: 'onboarding_first_item',
          operation: 'saveItem',
          metadata: {
            errorType: 'database',
          },
        });
      });
    });

    it('should call logError with server classification for unknown errors', async () => {
      const { rerender } = render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      const error = new Error('Unknown error') as any;
      error.errorType = 'unknown';

      (useCreateFirstItem as jest.Mock).mockReturnValue({
        ...defaultMutationState,
        isError: true,
        error,
      });

      rerender(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(telemetry.logError).toHaveBeenCalledWith(error, 'server', {
          feature: 'onboarding_first_item',
          operation: 'saveItem',
          metadata: {
            errorType: 'unknown',
          },
        });
      });
    });

    it('should call logError with user classification for camera errors', async () => {
      (checkCameraPermission as jest.Mock).mockRejectedValue(new Error('Camera error'));

      const { rerender } = render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      const customHandler = mockSetCustomPrimaryHandler.mock.calls[0][0];
      await customHandler();

      await waitFor(() => {
        expect(telemetry.logError).toHaveBeenCalledWith(
          expect.any(Error),
          'user',
          expect.objectContaining({
            feature: 'onboarding_first_item',
            operation: 'startCamera',
          })
        );
      });
    });
  });

  describe('Android Back Button / Modal Dismiss', () => {
    const setupWithMetadataForm = async () => {
      const result = render(
        <TestWrapper>
          <FirstItemScreen />
        </TestWrapper>
      );

      const customHandler = mockSetCustomPrimaryHandler.mock.calls[0][0];
      await customHandler();

      await waitFor(() => {
        expect(result.getByTestId('camera-capture')).toBeTruthy();
      });

      fireEvent.press(result.getByTestId('camera-capture'));

      await waitFor(() => {
        expect(result.getByTestId('metadata-save')).toBeTruthy();
      });

      return result;
    };

    it('should show confirmation dialog on metadata form dismiss', async () => {
      jest.spyOn(Alert, 'alert');
      await setupWithMetadataForm();

      // Simulate onRequestClose being called
      const modal = require('react-native').Modal;
      const onRequestClose = modal.mock.calls.find((call: any) => call[0]?.onRequestClose)?.[0]
        ?.onRequestClose;

      if (onRequestClose) {
        onRequestClose();
      }

      expect(Alert.alert).toHaveBeenCalledWith(
        'Cancel adding item?',
        'Your progress will be lost. You can always add items later from your wardrobe.',
        expect.arrayContaining([
          expect.objectContaining({ text: 'Keep editing' }),
          expect.objectContaining({ text: 'Cancel' }),
        ])
      );
    });

    it('should have "Keep editing" option with cancel style', async () => {
      jest.spyOn(Alert, 'alert');
      await setupWithMetadataForm();

      const modal = require('react-native').Modal;
      const onRequestClose = modal.mock.calls.find((call: any) => call[0]?.onRequestClose)?.[0]
        ?.onRequestClose;

      if (onRequestClose) {
        onRequestClose();
      }

      const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
      const buttons = alertCall[2];

      const keepEditingButton = buttons.find((btn: any) => btn.text === 'Keep editing');
      expect(keepEditingButton).toBeDefined();
      expect(keepEditingButton.style).toBe('cancel');
    });

    it('should have "Cancel" option with destructive style', async () => {
      jest.spyOn(Alert, 'alert');
      await setupWithMetadataForm();

      const modal = require('react-native').Modal;
      const onRequestClose = modal.mock.calls.find((call: any) => call[0]?.onRequestClose)?.[0]
        ?.onRequestClose;

      if (onRequestClose) {
        onRequestClose();
      }

      const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
      const buttons = alertCall[2];

      const cancelButton = buttons.find((btn: any) => btn.text === 'Cancel');
      expect(cancelButton).toBeDefined();
      expect(cancelButton.style).toBe('destructive');
    });

    it('should track skip with form_cancelled_via_back_button when Cancel pressed', async () => {
      jest.spyOn(Alert, 'alert');
      await setupWithMetadataForm();

      const modal = require('react-native').Modal;
      const onRequestClose = modal.mock.calls.find((call: any) => call[0]?.onRequestClose)?.[0]
        ?.onRequestClose;

      if (onRequestClose) {
        onRequestClose();
      }

      const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
      const buttons = alertCall[2];
      const cancelButton = buttons.find((btn: any) => btn.text === 'Cancel');

      cancelButton.onPress();

      await waitFor(() => {
        expect(onboardingAnalytics.trackFirstItemSkipped).toHaveBeenCalledWith(
          'form_cancelled_via_back_button'
        );
        expect(mockOnSkipStep).toHaveBeenCalled();
      });
    });
  });
});
