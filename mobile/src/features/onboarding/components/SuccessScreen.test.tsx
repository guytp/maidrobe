import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SuccessScreen } from './SuccessScreen';
import { ThemeProvider } from '../../../core/theme';
import { OnboardingProvider } from '../context/OnboardingContext';
import * as useHasWardrobeItemsModule from '../api/useHasWardrobeItems';
import * as useCompleteOnboardingModule from '../utils/completeOnboarding';
import type { OnboardingStep } from '../store/onboardingSlice';

// Mock expo-status-bar
jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

// Mock i18n
jest.mock('../../../core/i18n', () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      'screens.onboarding.success.title': 'You are all set!',
      'screens.onboarding.success.headline': 'Your closet is ready',
      'screens.onboarding.success.bodyNoItems': 'Start adding items to your wardrobe',
      'screens.onboarding.success.bodyHasItems': 'Great! You have items in your wardrobe',
      'screens.onboarding.success.accessibility.screenLabel': 'Success screen',
      'screens.onboarding.success.accessibility.headlineLabel': 'Headline',
      'screens.onboarding.success.accessibility.bodyLabel': 'Body text',
    };
    return translations[key] || key;
  },
}));

// Mock OnboardingShell
jest.mock('./OnboardingShell', () => ({
  OnboardingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock Toast component
jest.mock('../../../core/components/Toast', () => ({
  Toast: () => null,
}));

// Mock store
const mockStore = {
  completedSteps: ['welcome', 'prefs', 'firstItem'] as OnboardingStep[],
  skippedSteps: [] as OnboardingStep[],
};

jest.mock('../../../core/state/store', () => ({
  useStore: (selector: (state: typeof mockStore) => unknown) => selector(mockStore),
}));

describe('SuccessScreen', () => {
  let queryClient: QueryClient;
  let mockCompleteOnboarding: jest.Mock;
  let mockSetCustomPrimaryHandler: jest.Mock;

  const TestWrapper = ({ children }: { children: React.ReactNode }) => (
    <ThemeProvider colorScheme="light">
      <QueryClientProvider client={queryClient}>
        <OnboardingProvider
          currentStep="success"
          onNext={jest.fn()}
          onSkipStep={jest.fn()}
          onSkipOnboarding={jest.fn()}
          onBack={jest.fn()}
          setCustomPrimaryHandler={mockSetCustomPrimaryHandler}
          onboardingDuration={120000}
        >
          {children}
        </OnboardingProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });
    jest.clearAllMocks();

    mockCompleteOnboarding = jest.fn();
    mockSetCustomPrimaryHandler = jest.fn();

    // Default mock for useCompleteOnboarding
    jest
      .spyOn(useCompleteOnboardingModule, 'useCompleteOnboarding')
      .mockReturnValue(mockCompleteOnboarding);
  });

  describe('Rendering with no wardrobe items', () => {
    beforeEach(() => {
      jest.spyOn(useHasWardrobeItemsModule, 'useHasWardrobeItems').mockReturnValue({
        data: { hasItems: false },
        isLoading: false,
        isError: false,
        error: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    });

    it('should render title, headline, and no items body text', () => {
      const { getByText } = render(<SuccessScreen />, { wrapper: TestWrapper });

      expect(getByText('You are all set!')).toBeTruthy();
      expect(getByText('Your closet is ready')).toBeTruthy();
      expect(getByText('Start adding items to your wardrobe')).toBeTruthy();
    });

    it('should have correct accessibility labels', () => {
      const { getByLabelText } = render(<SuccessScreen />, { wrapper: TestWrapper });

      expect(getByLabelText('Success screen')).toBeTruthy();
      expect(getByLabelText('Headline')).toBeTruthy();
      expect(getByLabelText('Body text')).toBeTruthy();
    });

    it('should not show has items variant text', () => {
      const { queryByText } = render(<SuccessScreen />, { wrapper: TestWrapper });

      expect(queryByText('Great! You have items in your wardrobe')).toBeNull();
    });
  });

  describe('Rendering with wardrobe items', () => {
    beforeEach(() => {
      jest.spyOn(useHasWardrobeItemsModule, 'useHasWardrobeItems').mockReturnValue({
        data: { hasItems: true },
        isLoading: false,
        isError: false,
        error: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    });

    it('should render title, headline, and has items body text', () => {
      const { getByText } = render(<SuccessScreen />, { wrapper: TestWrapper });

      expect(getByText('You are all set!')).toBeTruthy();
      expect(getByText('Your closet is ready')).toBeTruthy();
      expect(getByText('Great! You have items in your wardrobe')).toBeTruthy();
    });

    it('should not show no items variant text', () => {
      const { queryByText } = render(<SuccessScreen />, { wrapper: TestWrapper });

      expect(queryByText('Start adding items to your wardrobe')).toBeNull();
    });
  });

  describe('Rendering while query is loading', () => {
    beforeEach(() => {
      jest.spyOn(useHasWardrobeItemsModule, 'useHasWardrobeItems').mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    });

    it('should render with no items variant as default', () => {
      const { getByText, queryByText } = render(<SuccessScreen />, { wrapper: TestWrapper });

      expect(getByText('You are all set!')).toBeTruthy();
      expect(getByText('Start adding items to your wardrobe')).toBeTruthy();
      expect(queryByText('Great! You have items in your wardrobe')).toBeNull();
    });
  });

  describe('Rendering when query errors', () => {
    beforeEach(() => {
      jest.spyOn(useHasWardrobeItemsModule, 'useHasWardrobeItems').mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('Failed to fetch'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    });

    it('should render with no items variant as safe default', () => {
      const { getByText, queryByText } = render(<SuccessScreen />, { wrapper: TestWrapper });

      expect(getByText('You are all set!')).toBeTruthy();
      expect(getByText('Start adding items to your wardrobe')).toBeTruthy();
      expect(queryByText('Great! You have items in your wardrobe')).toBeNull();
    });

    it('should still be interactive and functional', () => {
      const { getByText } = render(<SuccessScreen />, { wrapper: TestWrapper });

      // Component should render without crashing
      expect(getByText('You are all set!')).toBeTruthy();
      // Custom handler should still be registered
      expect(mockSetCustomPrimaryHandler).toHaveBeenCalled();
    });
  });

  describe('Custom primary handler registration', () => {
    beforeEach(() => {
      jest.spyOn(useHasWardrobeItemsModule, 'useHasWardrobeItems').mockReturnValue({
        data: { hasItems: false },
        isLoading: false,
        isError: false,
        error: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    });

    it('should register custom handler on mount', () => {
      render(<SuccessScreen />, { wrapper: TestWrapper });

      expect(mockSetCustomPrimaryHandler).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should unregister custom handler on unmount', () => {
      const { unmount } = render(<SuccessScreen />, { wrapper: TestWrapper });

      // Clear previous calls
      mockSetCustomPrimaryHandler.mockClear();

      unmount();

      expect(mockSetCustomPrimaryHandler).toHaveBeenCalledWith(null);
    });

    it('should re-register handler when hasItems changes', () => {
      const { rerender } = render(<SuccessScreen />, { wrapper: TestWrapper });

      const firstCall = mockSetCustomPrimaryHandler.mock.calls[0][0];

      // Change hasItems
      jest.spyOn(useHasWardrobeItemsModule, 'useHasWardrobeItems').mockReturnValue({
        data: { hasItems: true },
        isLoading: false,
        isError: false,
        error: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      rerender(<SuccessScreen />);

      // Handler should be re-registered
      expect(mockSetCustomPrimaryHandler.mock.calls.length).toBeGreaterThan(1);
      const secondCall =
        mockSetCustomPrimaryHandler.mock.calls[
          mockSetCustomPrimaryHandler.mock.calls.length - 1
        ][0];
      expect(secondCall).not.toBe(firstCall);
    });
  });

  describe('Completion flow with no items', () => {
    beforeEach(() => {
      jest.spyOn(useHasWardrobeItemsModule, 'useHasWardrobeItems').mockReturnValue({
        data: { hasItems: false },
        isLoading: false,
        isError: false,
        error: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    });

    it('should call completeOnboarding with correct parameters when handler invoked', async () => {
      render(<SuccessScreen />, { wrapper: TestWrapper });

      // Get the registered handler
      const registeredHandler = mockSetCustomPrimaryHandler.mock.calls[0][0];

      // Invoke the handler
      registeredHandler();

      await waitFor(() => {
        expect(mockCompleteOnboarding).toHaveBeenCalledWith({
          isGlobalSkip: false,
          completedSteps: ['welcome', 'prefs', 'firstItem'],
          skippedSteps: [],
          duration: 120000,
          hasItems: false,
          onSyncFailure: expect.any(Function),
        });
      });
    });

    it('should include hasItems as false in completion params', async () => {
      render(<SuccessScreen />, { wrapper: TestWrapper });

      const registeredHandler = mockSetCustomPrimaryHandler.mock.calls[0][0];
      registeredHandler();

      await waitFor(() => {
        const callArgs = mockCompleteOnboarding.mock.calls[0][0];
        expect(callArgs.hasItems).toBe(false);
      });
    });
  });

  describe('Completion flow with items', () => {
    beforeEach(() => {
      jest.spyOn(useHasWardrobeItemsModule, 'useHasWardrobeItems').mockReturnValue({
        data: { hasItems: true },
        isLoading: false,
        isError: false,
        error: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    });

    it('should call completeOnboarding with hasItems as true', async () => {
      render(<SuccessScreen />, { wrapper: TestWrapper });

      const registeredHandler = mockSetCustomPrimaryHandler.mock.calls[0][0];
      registeredHandler();

      await waitFor(() => {
        expect(mockCompleteOnboarding).toHaveBeenCalledWith({
          isGlobalSkip: false,
          completedSteps: ['welcome', 'prefs', 'firstItem'],
          skippedSteps: [],
          duration: 120000,
          hasItems: true,
          onSyncFailure: expect.any(Function),
        });
      });
    });

    it('should include correct duration from context', async () => {
      render(<SuccessScreen />, { wrapper: TestWrapper });

      const registeredHandler = mockSetCustomPrimaryHandler.mock.calls[0][0];
      registeredHandler();

      await waitFor(() => {
        const callArgs = mockCompleteOnboarding.mock.calls[0][0];
        expect(callArgs.duration).toBe(120000);
      });
    });
  });

  describe('Completion flow with skipped steps', () => {
    beforeEach(() => {
      jest.spyOn(useHasWardrobeItemsModule, 'useHasWardrobeItems').mockReturnValue({
        data: { hasItems: false },
        isLoading: false,
        isError: false,
        error: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      // Mock store with skipped steps
      mockStore.completedSteps = ['welcome', 'success'] as OnboardingStep[];
      mockStore.skippedSteps = ['prefs', 'firstItem'] as OnboardingStep[];
    });

    it('should include skipped steps in completion params', async () => {
      render(<SuccessScreen />, { wrapper: TestWrapper });

      const registeredHandler = mockSetCustomPrimaryHandler.mock.calls[0][0];
      registeredHandler();

      await waitFor(() => {
        expect(mockCompleteOnboarding).toHaveBeenCalledWith({
          isGlobalSkip: false,
          completedSteps: ['welcome', 'success'],
          skippedSteps: ['prefs', 'firstItem'],
          duration: 120000,
          hasItems: false,
          onSyncFailure: expect.any(Function),
        });
      });
    });
  });

  describe('Toast behavior for sync failures', () => {
    beforeEach(() => {
      jest.spyOn(useHasWardrobeItemsModule, 'useHasWardrobeItems').mockReturnValue({
        data: { hasItems: false },
        isLoading: false,
        isError: false,
        error: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    });

    it('should provide onSyncFailure callback in completion params', async () => {
      render(<SuccessScreen />, { wrapper: TestWrapper });

      const registeredHandler = mockSetCustomPrimaryHandler.mock.calls[0][0];
      registeredHandler();

      await waitFor(() => {
        const callArgs = mockCompleteOnboarding.mock.calls[0][0];
        expect(callArgs.onSyncFailure).toBeDefined();
        expect(typeof callArgs.onSyncFailure).toBe('function');
      });
    });

    it('should handle onSyncFailure callback invocation', async () => {
      render(<SuccessScreen />, { wrapper: TestWrapper });

      const registeredHandler = mockSetCustomPrimaryHandler.mock.calls[0][0];
      registeredHandler();

      await waitFor(() => {
        const callArgs = mockCompleteOnboarding.mock.calls[0][0];
        // Invoke the callback to ensure it doesn't crash
        expect(() => callArgs.onSyncFailure('Test sync failure message')).not.toThrow();
      });
    });
  });

  describe('Query data edge cases', () => {
    it('should handle null data from query', () => {
      jest.spyOn(useHasWardrobeItemsModule, 'useHasWardrobeItems').mockReturnValue({
        data: null,
        isLoading: false,
        isError: false,
        error: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const { getByText } = render(<SuccessScreen />, { wrapper: TestWrapper });

      // Should use safe default (no items)
      expect(getByText('Start adding items to your wardrobe')).toBeTruthy();
    });

    it('should handle undefined hasItems in data', () => {
      jest.spyOn(useHasWardrobeItemsModule, 'useHasWardrobeItems').mockReturnValue({
        data: { hasItems: undefined },
        isLoading: false,
        isError: false,
        error: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const { getByText } = render(<SuccessScreen />, { wrapper: TestWrapper });

      // Should use safe default (no items)
      expect(getByText('Start adding items to your wardrobe')).toBeTruthy();
    });
  });
});
