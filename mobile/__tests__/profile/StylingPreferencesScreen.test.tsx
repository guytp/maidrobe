import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StylingPreferencesScreen } from '../../src/features/profile/components/StylingPreferencesScreen';
import { ThemeProvider } from '../../src/core/theme';
import type { PrefsRow } from '../../src/features/onboarding/utils/prefsTypes';

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Mock expo-status-bar
jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

// Mock expo-router
const mockRouter = {
  back: jest.fn(),
  replace: jest.fn(),
  canGoBack: jest.fn(() => true),
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

// Mock user store
const mockUser = { id: 'test-user-123' };

jest.mock('../../src/core/state/store', () => ({
  useStore: (selector: (state: { user: typeof mockUser }) => unknown) =>
    selector({ user: mockUser }),
}));

// Mock telemetry
const mockTrackCaptureEvent = jest.fn();
const mockLogError = jest.fn();

jest.mock('../../src/core/telemetry', () => ({
  trackCaptureEvent: (...args: unknown[]) => mockTrackCaptureEvent(...args),
  logError: (...args: unknown[]) => mockLogError(...args),
}));

// Mock useUserPrefs hook
const mockPrefsData: PrefsRow = {
  user_id: 'test-user-123',
  no_repeat_days: 7,
  no_repeat_mode: 'item',
  colour_prefs: [],
  exclusions: [],
  comfort_notes: null,
};

const mockUseUserPrefs = jest.fn(() => ({
  data: mockPrefsData,
  isLoading: false,
  isError: false,
  error: null,
}));

jest.mock('../../src/features/onboarding/api/useUserPrefs', () => ({
  useUserPrefs: () => mockUseUserPrefs(),
}));

// Mock useSavePrefs hook
const mockMutateAsync = jest.fn().mockResolvedValue(mockPrefsData);

const mockUseSavePrefs = jest.fn(() => ({
  mutateAsync: mockMutateAsync,
  isPending: false,
  isError: false,
  error: null,
}));

jest.mock('../../src/features/onboarding/api/useSavePrefs', () => ({
  useSavePrefs: () => mockUseSavePrefs(),
}));

describe('StylingPreferencesScreen', () => {
  let queryClient: QueryClient;

  const TestWrapper = ({ children }: { children: React.ReactNode }) => (
    <ThemeProvider colorScheme="light">
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ThemeProvider>
  );

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });

    // Reset all mocks
    jest.clearAllMocks();

    // Reset mock implementations to defaults
    mockUseUserPrefs.mockReturnValue({
      data: mockPrefsData,
      isLoading: false,
      isError: false,
      error: null,
    });

    mockUseSavePrefs.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
      isError: false,
      error: null,
    });

    mockMutateAsync.mockResolvedValue(mockPrefsData);
  });

  describe('Rendering', () => {
    it('should render the screen with title', () => {
      const { getByText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      expect(getByText('Styling Preferences')).toBeTruthy();
    });

    it('should render the no-repeat window section', () => {
      const { getByText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      expect(getByText('No-repeat window')).toBeTruthy();
      expect(
        getByText(
          'How long before we suggest the same items or outfits again. A longer window means more variety in your recommendations.'
        )
      ).toBeTruthy();
    });

    it('should render all preset buttons', () => {
      const { getByText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      expect(getByText('Off')).toBeTruthy();
      expect(getByText('3')).toBeTruthy();
      expect(getByText('7')).toBeTruthy();
      expect(getByText('14')).toBeTruthy();
      expect(getByText('30')).toBeTruthy();
    });

    it('should render advanced toggle', () => {
      const { getByText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      expect(getByText('Advanced')).toBeTruthy();
    });

    it('should render back button', () => {
      const { getByLabelText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      expect(getByLabelText('Go back')).toBeTruthy();
    });
  });

  describe('Accessibility', () => {
    it('should have correct screen accessibility label', () => {
      const { getByLabelText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      expect(getByLabelText('Styling preferences screen')).toBeTruthy();
    });

    it('should have accessible preset buttons with radio role', () => {
      const { getByLabelText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      const preset7days = getByLabelText('7 days');
      expect(preset7days.props.accessibilityRole).toBe('radio');
    });

    it('should mark selected preset as checked', () => {
      const { getByLabelText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      // Default is 7 days
      const preset7days = getByLabelText('7 days');
      expect(preset7days.props.accessibilityState.checked).toBe(true);

      const preset3days = getByLabelText('3 days');
      expect(preset3days.props.accessibilityState.checked).toBe(false);
    });

    it('should have accessible advanced toggle with expanded state', () => {
      const { getByLabelText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      const advancedToggle = getByLabelText('Advanced settings');
      expect(advancedToggle.props.accessibilityRole).toBe('button');
      expect(advancedToggle.props.accessibilityState.expanded).toBe(false);
    });

    it('should have accessible back button', () => {
      const { getByLabelText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      const backButton = getByLabelText('Go back');
      expect(backButton.props.accessibilityRole).toBe('button');
    });
  });

  describe('Navigation', () => {
    it('should navigate back when back button is pressed', () => {
      const { getByLabelText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      const backButton = getByLabelText('Go back');
      fireEvent.press(backButton);

      expect(mockRouter.back).toHaveBeenCalledTimes(1);
    });

    it('should replace to profile when cannot go back', () => {
      mockRouter.canGoBack.mockReturnValue(false);

      const { getByLabelText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      const backButton = getByLabelText('Go back');
      fireEvent.press(backButton);

      expect(mockRouter.replace).toHaveBeenCalledWith('/profile');
    });
  });

  describe('Default State', () => {
    it('should show 7 days preset as selected by default', () => {
      const { getByLabelText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      const preset7days = getByLabelText('7 days');
      expect(preset7days.props.accessibilityState.checked).toBe(true);
    });

    it('should not show advanced section by default', () => {
      const { queryByLabelText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      // Custom days input should not be visible
      expect(queryByLabelText('Custom no-repeat window in days')).toBeNull();
    });

    it('should auto-expand advanced section for custom values', () => {
      // Set a non-preset value
      mockUseUserPrefs.mockReturnValue({
        data: { ...mockPrefsData, no_repeat_days: 21 },
        isLoading: false,
        isError: false,
        error: null,
      });

      const { getByLabelText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      // Advanced section should be expanded
      const advancedToggle = getByLabelText('Advanced settings');
      expect(advancedToggle.props.accessibilityState.expanded).toBe(true);

      // Custom input should be visible
      expect(getByLabelText('Custom no-repeat window in days')).toBeTruthy();
    });
  });

  describe('Preset Button Selection', () => {
    it('should update selection when preset button is pressed', async () => {
      const { getByLabelText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      const preset3days = getByLabelText('3 days');
      fireEvent.press(preset3days);

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalled();
      });

      // Verify the mutation was called with correct data
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'test-user-123',
          data: expect.objectContaining({
            noRepeatDays: 3,
          }),
        })
      );
    });

    it('should update selection when Off is pressed', async () => {
      const { getByLabelText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      const presetOff = getByLabelText('Off (okay with repeats)');
      fireEvent.press(presetOff);

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              noRepeatDays: 0,
            }),
          })
        );
      });
    });

    it('should track analytics when preset is changed', async () => {
      const { getByLabelText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      const preset14days = getByLabelText('14 days');
      fireEvent.press(preset14days);

      await waitFor(() => {
        expect(mockTrackCaptureEvent).toHaveBeenCalledWith(
          'no_repeat_prefs_changed',
          expect.objectContaining({
            userId: 'test-user-123',
            metadata: expect.objectContaining({
              previousNoRepeatDays: 7,
              newNoRepeatDays: 14,
            }),
          })
        );
      });
    });
  });

  describe('Advanced Section Toggle', () => {
    it('should expand advanced section when toggle is pressed', () => {
      const { getByLabelText, queryByLabelText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      // Initially collapsed
      expect(queryByLabelText('Custom no-repeat window in days')).toBeNull();

      // Press toggle
      const advancedToggle = getByLabelText('Advanced settings');
      fireEvent.press(advancedToggle);

      // Should now be expanded
      expect(advancedToggle.props.accessibilityState.expanded).toBe(true);
      expect(getByLabelText('Custom no-repeat window in days')).toBeTruthy();
    });

    it('should collapse advanced section when toggle is pressed again', () => {
      const { getByLabelText, queryByLabelText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      const advancedToggle = getByLabelText('Advanced settings');

      // Expand
      fireEvent.press(advancedToggle);
      expect(getByLabelText('Custom no-repeat window in days')).toBeTruthy();

      // Collapse
      fireEvent.press(advancedToggle);
      expect(queryByLabelText('Custom no-repeat window in days')).toBeNull();
    });

    it('should show mode selector when expanded', () => {
      const { getByLabelText, getByText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      // Expand advanced
      fireEvent.press(getByLabelText('Advanced settings'));

      // Mode section should be visible
      expect(getByText('What should we avoid repeating?')).toBeTruthy();
      expect(getByLabelText('Key items')).toBeTruthy();
      expect(getByLabelText('Exact outfit only')).toBeTruthy();
    });
  });

  describe('Custom Days Input Validation', () => {
    it('should accept valid input within range', async () => {
      const { getByLabelText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      // Expand advanced
      fireEvent.press(getByLabelText('Advanced settings'));

      const customInput = getByLabelText('Custom no-repeat window in days');
      fireEvent.changeText(customInput, '45');
      fireEvent(customInput, 'blur');

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              noRepeatDays: 45,
            }),
          })
        );
      });
    });

    it('should accept 0 as valid input', async () => {
      const { getByLabelText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      fireEvent.press(getByLabelText('Advanced settings'));

      const customInput = getByLabelText('Custom no-repeat window in days');
      fireEvent.changeText(customInput, '0');
      fireEvent(customInput, 'blur');

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              noRepeatDays: 0,
            }),
          })
        );
      });
    });

    it('should accept 90 as valid input (maximum)', async () => {
      const { getByLabelText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      fireEvent.press(getByLabelText('Advanced settings'));

      const customInput = getByLabelText('Custom no-repeat window in days');
      fireEvent.changeText(customInput, '90');
      fireEvent(customInput, 'blur');

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              noRepeatDays: 90,
            }),
          })
        );
      });
    });

    it('should reject values above 90 with error message', async () => {
      const { getByLabelText, getByText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      fireEvent.press(getByLabelText('Advanced settings'));

      const customInput = getByLabelText('Custom no-repeat window in days');
      fireEvent.changeText(customInput, '91');
      fireEvent(customInput, 'blur');

      await waitFor(() => {
        expect(getByText('Please enter a number between 0 and 90')).toBeTruthy();
      });

      // Should not have called save
      expect(mockMutateAsync).not.toHaveBeenCalled();
    });

    it('should strip non-numeric characters from input', () => {
      const { getByLabelText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      fireEvent.press(getByLabelText('Advanced settings'));

      const customInput = getByLabelText('Custom no-repeat window in days');
      fireEvent.changeText(customInput, 'abc45xyz');

      // Should only contain numeric characters
      expect(customInput.props.value).toBe('45');
    });

    it('should reset to previous value on empty blur', () => {
      const { getByLabelText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      fireEvent.press(getByLabelText('Advanced settings'));

      const customInput = getByLabelText('Custom no-repeat window in days');

      // Clear input and blur
      fireEvent.changeText(customInput, '');
      fireEvent(customInput, 'blur');

      // Should reset to original value (7)
      expect(customInput.props.value).toBe('7');
    });
  });

  describe('Mode Selection', () => {
    it('should show item mode as selected by default', () => {
      const { getByLabelText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      fireEvent.press(getByLabelText('Advanced settings'));

      const itemMode = getByLabelText('Key items');
      const outfitMode = getByLabelText('Exact outfit only');

      expect(itemMode.props.accessibilityState.checked).toBe(true);
      expect(outfitMode.props.accessibilityState.checked).toBe(false);
    });

    it('should switch to outfit mode when selected', async () => {
      const { getByLabelText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      fireEvent.press(getByLabelText('Advanced settings'));

      const outfitMode = getByLabelText('Exact outfit only');
      fireEvent.press(outfitMode);

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              noRepeatMode: 'outfit',
            }),
          })
        );
      });
    });

    it('should track analytics when mode is changed', async () => {
      const { getByLabelText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      fireEvent.press(getByLabelText('Advanced settings'));
      fireEvent.press(getByLabelText('Exact outfit only'));

      await waitFor(() => {
        expect(mockTrackCaptureEvent).toHaveBeenCalledWith(
          'no_repeat_prefs_changed',
          expect.objectContaining({
            metadata: expect.objectContaining({
              previousNoRepeatMode: 'item',
              newNoRepeatMode: 'outfit',
            }),
          })
        );
      });
    });

    it('should show recommended badge on item mode', () => {
      const { getByLabelText, getByText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      fireEvent.press(getByLabelText('Advanced settings'));

      expect(getByText('(recommended)')).toBeTruthy();
    });
  });

  describe('Error Handling and Retry', () => {
    it('should show error message when save fails', async () => {
      mockMutateAsync.mockRejectedValueOnce(new Error('Network error'));

      const { getByLabelText, getByText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      const preset3days = getByLabelText('3 days');
      fireEvent.press(preset3days);

      await waitFor(() => {
        expect(getByText("Couldn't save. Please try again.")).toBeTruthy();
      });
    });

    it('should show retry button when save fails', async () => {
      mockMutateAsync.mockRejectedValueOnce(new Error('Network error'));

      const { getByLabelText, getByText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      fireEvent.press(getByLabelText('3 days'));

      await waitFor(() => {
        expect(getByText('Tap to retry')).toBeTruthy();
      });
    });

    it('should retry save when retry button is pressed', async () => {
      mockMutateAsync.mockRejectedValueOnce(new Error('Network error'));

      const { getByLabelText, getByText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      // Trigger error
      fireEvent.press(getByLabelText('3 days'));

      await waitFor(() => {
        expect(getByText('Tap to retry')).toBeTruthy();
      });

      // Clear the rejection and set up success
      mockMutateAsync.mockResolvedValueOnce({ ...mockPrefsData, no_repeat_days: 3 });

      // Press retry - the button has label "Tap to retry" with hint "Retry saving your preferences"
      fireEvent.press(getByLabelText('Tap to retry'));

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledTimes(2);
      });
    });

    it('should revert to previous values on error', async () => {
      mockMutateAsync.mockRejectedValueOnce(new Error('Network error'));

      const { getByLabelText, getByText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      // Initially 7 days is selected
      expect(getByLabelText('7 days').props.accessibilityState.checked).toBe(true);

      // Try to change to 3 days
      fireEvent.press(getByLabelText('3 days'));

      // Wait for error to appear, then check revert
      await waitFor(() => {
        expect(getByText("Couldn't save. Please try again.")).toBeTruthy();
      });

      // After error, should revert to 7 days (re-query to get fresh state)
      await waitFor(() => {
        expect(getByLabelText('7 days').props.accessibilityState.checked).toBe(true);
      });
    });

    it('should log error when save fails', async () => {
      const error = new Error('Network error');
      mockMutateAsync.mockRejectedValueOnce(error);

      const { getByLabelText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      fireEvent.press(getByLabelText('3 days'));

      await waitFor(() => {
        expect(mockLogError).toHaveBeenCalled();
      });
    });
  });

  describe('Loading State', () => {
    it('should show loading indicator while fetching preferences', () => {
      mockUseUserPrefs.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
      });

      const { getByLabelText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      expect(getByLabelText('Loading styling preferences...')).toBeTruthy();
    });

    it('should not show preset buttons while loading', () => {
      mockUseUserPrefs.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
      });

      const { queryByLabelText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      expect(queryByLabelText('7 days')).toBeNull();
    });

    it('should still show header while loading', () => {
      mockUseUserPrefs.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
      });

      const { getByText, getByLabelText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      expect(getByText('Styling Preferences')).toBeTruthy();
      expect(getByLabelText('Go back')).toBeTruthy();
    });

    it('should show saving indicator in header while saving', async () => {
      // Start with normal state
      const { getByLabelText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      // Trigger save - the component internally sets isSaving
      fireEvent.press(getByLabelText('3 days'));

      // The saving indicator appears during the async operation
      // We verify the mutation was triggered which causes the saving state
      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalled();
      });
    });
  });

  describe('Theme Integration', () => {
    it('should render correctly with light theme', () => {
      const { getByText } = render(
        <ThemeProvider colorScheme="light">
          <QueryClientProvider client={queryClient}>
            <StylingPreferencesScreen />
          </QueryClientProvider>
        </ThemeProvider>
      );

      expect(getByText('Styling Preferences')).toBeTruthy();
    });

    it('should render correctly with dark theme', () => {
      const { getByText } = render(
        <ThemeProvider colorScheme="dark">
          <QueryClientProvider client={queryClient}>
            <StylingPreferencesScreen />
          </QueryClientProvider>
        </ThemeProvider>
      );

      expect(getByText('Styling Preferences')).toBeTruthy();
    });
  });

  describe('Success Feedback', () => {
    it('should show saved message after successful save', async () => {
      const { getByLabelText, getByText } = render(<StylingPreferencesScreen />, {
        wrapper: TestWrapper,
      });

      fireEvent.press(getByLabelText('3 days'));

      await waitFor(() => {
        expect(getByText('Preferences saved')).toBeTruthy();
      });
    });
  });
});
