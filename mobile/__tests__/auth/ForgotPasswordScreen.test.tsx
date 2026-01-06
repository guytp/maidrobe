import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ForgotPasswordScreen } from '../../src/features/auth/components/ForgotPasswordScreen';
import { ThemeProvider } from '../../src/core/theme';
import * as telemetry from '../../src/core/telemetry';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Mock expo-router
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock telemetry
jest.mock('../../src/core/telemetry', () => ({
  logError: jest.fn(),
  logAuthEvent: jest.fn(),
  getUserFriendlyMessage: jest.fn((classification: string) => `Error: ${classification}`),
}));

// Mock AsyncStorage for rate limiting
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

// Mock Supabase
const mockResetPasswordForEmail = jest.fn();
jest.mock('../../src/services/supabase', () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: mockResetPasswordForEmail,
    },
  },
}));

describe('ForgotPasswordScreen', () => {
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

    jest.clearAllMocks();

    // Default mock implementations
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    mockResetPasswordForEmail.mockResolvedValue({
      data: {},
      error: null,
    });
  });

  describe('Form Rendering', () => {
    it('should render forgot password form with all elements', () => {
      const { getByText, getByPlaceholderText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      expect(getByText('Forgot Password')).toBeTruthy();
      expect(getByText('Reset your password')).toBeTruthy();
      expect(
        getByText("Enter your email address and we'll send you a link to reset your password.")
      ).toBeTruthy();
      expect(getByText('Email')).toBeTruthy();
      expect(getByPlaceholderText('your@email.com')).toBeTruthy();
      expect(getByText('Send Reset Link')).toBeTruthy();
      expect(getByText('Back to Login')).toBeTruthy();
    });

    it('should have correct accessibility labels on form elements', () => {
      const { getByLabelText } = render(<ForgotPasswordScreen />, { wrapper: TestWrapper });

      expect(getByLabelText('Forgot password screen')).toBeTruthy();
      expect(getByLabelText('Email address input field')).toBeTruthy();
      expect(getByLabelText('Send reset link button')).toBeTruthy();
      expect(getByLabelText('Back to Login')).toBeTruthy();
    });

    it('should initially disable submit button when email is empty', () => {
      const { getByLabelText } = render(<ForgotPasswordScreen />, { wrapper: TestWrapper });

      const submitButton = getByLabelText('Send reset link button');
      expect(submitButton.props.accessibilityState.disabled).toBe(true);
    });

    it('should have proper email input properties', () => {
      const { getByPlaceholderText } = render(<ForgotPasswordScreen />, { wrapper: TestWrapper });

      const emailInput = getByPlaceholderText('your@email.com');
      expect(emailInput.props.keyboardType).toBe('email-address');
      expect(emailInput.props.autoCapitalize).toBe('none');
      expect(emailInput.props.autoComplete).toBe('email');
      expect(emailInput.props.autoCorrect).toBe(false);
    });
  });

  describe('Email Input Behavior', () => {
    it('should allow typing in email field', () => {
      const { getByPlaceholderText } = render(<ForgotPasswordScreen />, { wrapper: TestWrapper });

      const emailInput = getByPlaceholderText('your@email.com');
      fireEvent.changeText(emailInput, 'user@example.com');

      expect(emailInput.props.value).toBe('user@example.com');
    });

    it('should clear email error when user starts typing', async () => {
      const { getByPlaceholderText, getByText, queryByText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');

      // Trigger error
      fireEvent.changeText(emailInput, 'invalid-email');
      fireEvent(emailInput, 'blur');

      await waitFor(() => {
        expect(getByText('Please enter a valid email address')).toBeTruthy();
      });

      // Start typing again
      fireEvent.changeText(emailInput, 'valid@example.com');

      await waitFor(() => {
        expect(queryByText('Please enter a valid email address')).toBeNull();
      });
    });

    it('should preserve email input value while typing', () => {
      const { getByPlaceholderText } = render(<ForgotPasswordScreen />, { wrapper: TestWrapper });

      const emailInput = getByPlaceholderText('your@email.com');

      fireEvent.changeText(emailInput, 'u');
      expect(emailInput.props.value).toBe('u');

      fireEvent.changeText(emailInput, 'us');
      expect(emailInput.props.value).toBe('us');

      fireEvent.changeText(emailInput, 'user@example.com');
      expect(emailInput.props.value).toBe('user@example.com');
    });

    it('should allow clearing email field', () => {
      const { getByPlaceholderText } = render(<ForgotPasswordScreen />, { wrapper: TestWrapper });

      const emailInput = getByPlaceholderText('your@email.com');

      fireEvent.changeText(emailInput, 'user@example.com');
      expect(emailInput.props.value).toBe('user@example.com');

      fireEvent.changeText(emailInput, '');
      expect(emailInput.props.value).toBe('');
    });

    it('should handle email with whitespace', () => {
      const { getByPlaceholderText } = render(<ForgotPasswordScreen />, { wrapper: TestWrapper });

      const emailInput = getByPlaceholderText('your@email.com');

      fireEvent.changeText(emailInput, '  user@example.com  ');
      expect(emailInput.props.value).toBe('  user@example.com  ');
    });
  });

  describe('Email Validation', () => {
    it('should validate email on blur and show error for invalid format', async () => {
      const { getByPlaceholderText, getByText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');

      fireEvent.changeText(emailInput, 'invalid-email');
      fireEvent(emailInput, 'blur');

      await waitFor(() => {
        expect(getByText('Please enter a valid email address')).toBeTruthy();
      });
    });

    it('should not show error on blur for valid email', async () => {
      const { getByPlaceholderText, queryByText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');

      fireEvent.changeText(emailInput, 'user@example.com');
      fireEvent(emailInput, 'blur');

      await waitFor(() => {
        expect(queryByText('Please enter a valid email address')).toBeNull();
      });
    });

    it('should validate normalized email on blur with leading/trailing spaces', async () => {
      const { getByPlaceholderText, queryByText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');

      fireEvent.changeText(emailInput, '  user@example.com  ');
      fireEvent(emailInput, 'blur');

      await waitFor(() => {
        expect(queryByText('Please enter a valid email address')).toBeNull();
      });
    });

    it('should validate normalized email on blur with uppercase characters', async () => {
      const { getByPlaceholderText, queryByText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');

      fireEvent.changeText(emailInput, 'User@Example.COM');
      fireEvent(emailInput, 'blur');

      await waitFor(() => {
        expect(queryByText('Please enter a valid email address')).toBeNull();
      });
    });

    it('should show error for invalid email even after normalization', async () => {
      const { getByPlaceholderText, getByText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');

      fireEvent.changeText(emailInput, '  INVALID-EMAIL  ');
      fireEvent(emailInput, 'blur');

      await waitFor(() => {
        expect(getByText('Please enter a valid email address')).toBeTruthy();
      });
    });

    it('should validate email with mixed case and spaces correctly', async () => {
      const { getByPlaceholderText, queryByText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');

      fireEvent.changeText(emailInput, '   Test.User@Example.Com   ');
      fireEvent(emailInput, 'blur');

      await waitFor(() => {
        expect(queryByText('Please enter a valid email address')).toBeNull();
      });
    });

    it('should show error for email without @ symbol', async () => {
      const { getByPlaceholderText, getByText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');

      fireEvent.changeText(emailInput, 'userexample.com');
      fireEvent(emailInput, 'blur');

      await waitFor(() => {
        expect(getByText('Please enter a valid email address')).toBeTruthy();
      });
    });

    it('should show error for email without domain', async () => {
      const { getByPlaceholderText, getByText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');

      fireEvent.changeText(emailInput, 'user@');
      fireEvent(emailInput, 'blur');

      await waitFor(() => {
        expect(getByText('Please enter a valid email address')).toBeTruthy();
      });
    });
  });

  describe('Form Validation and Submit Button State', () => {
    it('should disable submit button when email is empty', () => {
      const { getByLabelText } = render(<ForgotPasswordScreen />, { wrapper: TestWrapper });

      const submitButton = getByLabelText('Send reset link button');
      expect(submitButton.props.accessibilityState.disabled).toBe(true);
    });

    it('should enable submit button when email has text', () => {
      const { getByPlaceholderText, getByLabelText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');
      fireEvent.changeText(emailInput, 'user@example.com');

      const submitButton = getByLabelText('Send reset link button');
      expect(submitButton.props.accessibilityState.disabled).toBe(false);
    });

    it('should enable submit button even with invalid email format', () => {
      const { getByPlaceholderText, getByLabelText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');
      fireEvent.changeText(emailInput, 'invalid');

      const submitButton = getByLabelText('Send reset link button');
      expect(submitButton.props.accessibilityState.disabled).toBe(false);
    });

    it('should disable submit button when email is only whitespace', () => {
      const { getByPlaceholderText, getByLabelText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');
      fireEvent.changeText(emailInput, '   ');

      const submitButton = getByLabelText('Send reset link button');
      expect(submitButton.props.accessibilityState.disabled).toBe(true);
    });
  });

  describe('Form Submission Flow', () => {
    it('should show validation error when submitting invalid email', async () => {
      const { getByPlaceholderText, getByLabelText, getByText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');
      const submitButton = getByLabelText('Send reset link button');

      fireEvent.changeText(emailInput, 'invalid-email');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(getByText('Please enter a valid email address')).toBeTruthy();
      });

      expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
    });

    it('should submit with normalized email (trimmed and lowercased)', async () => {
      const { getByPlaceholderText, getByLabelText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');
      const submitButton = getByLabelText('Send reset link button');

      fireEvent.changeText(emailInput, '  User@Example.COM  ');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
          'user@example.com',
          expect.any(Object)
        );
      });
    });

    it('should show success view after successful submission', async () => {
      const { getByPlaceholderText, getByLabelText, getByText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');
      const submitButton = getByLabelText('Send reset link button');

      fireEvent.changeText(emailInput, 'user@example.com');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(getByText('Check Your Email')).toBeTruthy();
      });
    });

    it('should clear previous errors before submission', async () => {
      const { getByPlaceholderText, getByLabelText, queryByText } = render(
        <ForgotPasswordScreen />,
        { wrapper: TestWrapper }
      );

      const emailInput = getByPlaceholderText('your@email.com');
      const submitButton = getByLabelText('Send reset link button');

      // Trigger error first
      fireEvent.changeText(emailInput, 'invalid');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(queryByText('Please enter a valid email address')).toBeTruthy();
      });

      // Fix email and submit again
      fireEvent.changeText(emailInput, 'user@example.com');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(mockResetPasswordForEmail).toHaveBeenCalled();
      });
    });

    it('should check rate limit from AsyncStorage before submission', async () => {
      const { getByPlaceholderText, getByLabelText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');
      const submitButton = getByLabelText('Send reset link button');

      fireEvent.changeText(emailInput, 'user@example.com');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(AsyncStorage.getItem).toHaveBeenCalledWith(
          'auth:password-reset:attempts:user@example.com'
        );
      });
    });

    it('should record attempt to AsyncStorage after submission', async () => {
      const { getByPlaceholderText, getByLabelText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');
      const submitButton = getByLabelText('Send reset link button');

      fireEvent.changeText(emailInput, 'user@example.com');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(AsyncStorage.setItem).toHaveBeenCalledWith(
          'auth:password-reset:attempts:user@example.com',
          expect.any(String)
        );
      });
    });

    it('should log telemetry event on successful submission', async () => {
      const { getByPlaceholderText, getByLabelText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');
      const submitButton = getByLabelText('Send reset link button');

      fireEvent.changeText(emailInput, 'user@example.com');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(telemetry.logAuthEvent).toHaveBeenCalledWith(
          'password-reset-requested',
          expect.objectContaining({
            outcome: 'success',
          })
        );
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should block submission when rate limit exceeded', async () => {
      const now = Date.now();
      const attempts = [now - 1000, now - 2000, now - 3000, now - 4000, now - 5000];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(attempts));

      const { getByPlaceholderText, getByLabelText, getByText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');
      const submitButton = getByLabelText('Send reset link button');

      fireEvent.changeText(emailInput, 'user@example.com');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(getByText(/Too many requests. Please wait \d+ seconds./)).toBeTruthy();
      });

      expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
    });

    it('should show error with remaining seconds when rate limited', async () => {
      const now = Date.now();
      const attempts = [now - 1000, now - 2000, now - 3000, now - 4000, now - 5000];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(attempts));

      const { getByPlaceholderText, getByLabelText, getByText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');
      const submitButton = getByLabelText('Send reset link button');

      fireEvent.changeText(emailInput, 'user@example.com');
      fireEvent.press(submitButton);

      await waitFor(() => {
        const errorText = getByText(/Too many requests. Please wait \d+ seconds./);
        expect(errorText).toBeTruthy();
      });
    });

    it('should log telemetry event when rate limited', async () => {
      const now = Date.now();
      const attempts = [now - 1000, now - 2000, now - 3000, now - 4000, now - 5000];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(attempts));

      const { getByPlaceholderText, getByLabelText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');
      const submitButton = getByLabelText('Send reset link button');

      fireEvent.changeText(emailInput, 'user@example.com');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(telemetry.logAuthEvent).toHaveBeenCalledWith(
          'password-reset-requested',
          expect.objectContaining({
            outcome: 'rate_limited',
          })
        );
      });
    });

    it('should allow submission when old attempts have expired', async () => {
      const now = Date.now();
      const oneHourAgo = now - 3600000 - 10000; // Just over 1 hour
      const attempts = [oneHourAgo - 1000, oneHourAgo - 2000, oneHourAgo - 3000];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(attempts));

      const { getByPlaceholderText, getByLabelText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');
      const submitButton = getByLabelText('Send reset link button');

      fireEvent.changeText(emailInput, 'user@example.com');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(mockResetPasswordForEmail).toHaveBeenCalled();
      });
    });

    it('should handle AsyncStorage errors gracefully (fail-open)', async () => {
      (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('Storage error'));

      const { getByPlaceholderText, getByLabelText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');
      const submitButton = getByLabelText('Send reset link button');

      fireEvent.changeText(emailInput, 'user@example.com');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(mockResetPasswordForEmail).toHaveBeenCalled();
      });
    });
  });

  describe('Success View - Enumeration-Safe Responses', () => {
    it('should display generic success message after submission', async () => {
      const { getByPlaceholderText, getByLabelText, getByText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');
      const submitButton = getByLabelText('Send reset link button');

      fireEvent.changeText(emailInput, 'user@example.com');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(getByText("If an account exists, we've sent a link.")).toBeTruthy();
      });
    });

    it('should show check email instructions in success view', async () => {
      const { getByPlaceholderText, getByLabelText, getByText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');
      const submitButton = getByLabelText('Send reset link button');

      fireEvent.changeText(emailInput, 'user@example.com');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(
          getByText(/Please check your email inbox for password reset instructions/)
        ).toBeTruthy();
      });
    });

    it('should show spam folder reminder in success view', async () => {
      const { getByPlaceholderText, getByLabelText, getByText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');
      const submitButton = getByLabelText('Send reset link button');

      fireEvent.changeText(emailInput, 'user@example.com');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(getByText(/check your spam folder/)).toBeTruthy();
      });
    });

    it('should show success view even for non-existent email (enumeration-safe)', async () => {
      mockResetPasswordForEmail.mockResolvedValue({
        data: {},
        error: null,
      });

      const { getByPlaceholderText, getByLabelText, getByText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');
      const submitButton = getByLabelText('Send reset link button');

      fireEvent.changeText(emailInput, 'nonexistent@example.com');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(getByText("If an account exists, we've sent a link.")).toBeTruthy();
      });
    });

    it('should hide form view when success view is shown', async () => {
      const { getByPlaceholderText, getByLabelText, queryByPlaceholderText, getByText } = render(
        <ForgotPasswordScreen />,
        { wrapper: TestWrapper }
      );

      const emailInput = getByPlaceholderText('your@email.com');
      const submitButton = getByLabelText('Send reset link button');

      fireEvent.changeText(emailInput, 'user@example.com');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(getByText('Check Your Email')).toBeTruthy();
      });

      expect(queryByPlaceholderText('your@email.com')).toBeNull();
    });

    it('should have back to login button in success view', async () => {
      const { getByPlaceholderText, getByLabelText, getAllByText } = render(
        <ForgotPasswordScreen />,
        { wrapper: TestWrapper }
      );

      const emailInput = getByPlaceholderText('your@email.com');
      const submitButton = getByLabelText('Send reset link button');

      fireEvent.changeText(emailInput, 'user@example.com');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(getAllByText('Back to Login').length).toBeGreaterThan(0);
      });
    });
  });

  describe('Error Handling', () => {
    it('should display network error message', async () => {
      mockResetPasswordForEmail.mockRejectedValue(new Error('Network error'));

      const { getByPlaceholderText, getByLabelText, getByText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');
      const submitButton = getByLabelText('Send reset link button');

      fireEvent.changeText(emailInput, 'user@example.com');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(getByText(/Network error/)).toBeTruthy();
      });
    });

    it('should not show success view on network error', async () => {
      mockResetPasswordForEmail.mockRejectedValue(new Error('Network error'));

      const { getByPlaceholderText, getByLabelText, queryByText } = render(
        <ForgotPasswordScreen />,
        { wrapper: TestWrapper }
      );

      const emailInput = getByPlaceholderText('your@email.com');
      const submitButton = getByLabelText('Send reset link button');

      fireEvent.changeText(emailInput, 'user@example.com');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(queryByText('Check Your Email')).toBeNull();
      });
    });

    it('should log error on submission failure', async () => {
      mockResetPasswordForEmail.mockRejectedValue(new Error('Network error'));

      const { getByPlaceholderText, getByLabelText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');
      const submitButton = getByLabelText('Send reset link button');

      fireEvent.changeText(emailInput, 'user@example.com');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(telemetry.logError).toHaveBeenCalled();
      });
    });

    it('should allow retry after error by keeping form view visible', async () => {
      mockResetPasswordForEmail.mockRejectedValueOnce(new Error('Network error'));

      const { getByPlaceholderText, getByLabelText, getByText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');
      const submitButton = getByLabelText('Send reset link button');

      fireEvent.changeText(emailInput, 'user@example.com');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(getByText(/Network error/)).toBeTruthy();
      });

      // Form should still be visible for retry
      expect(getByPlaceholderText('your@email.com')).toBeTruthy();
    });
  });

  describe('Navigation', () => {
    it('should navigate to login when back to login pressed from form view', () => {
      const { getByText } = render(<ForgotPasswordScreen />, { wrapper: TestWrapper });

      fireEvent.press(getByText('Back to Login'));

      expect(mockPush).toHaveBeenCalledWith('/auth/login');
    });

    it('should navigate to login when back to login pressed from success view', async () => {
      const { getByPlaceholderText, getByLabelText, getAllByText } = render(
        <ForgotPasswordScreen />,
        { wrapper: TestWrapper }
      );

      const emailInput = getByPlaceholderText('your@email.com');
      const submitButton = getByLabelText('Send reset link button');

      fireEvent.changeText(emailInput, 'user@example.com');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(getAllByText('Back to Login').length).toBeGreaterThan(0);
      });

      const backButtons = getAllByText('Back to Login');
      fireEvent.press(backButtons[0]);

      expect(mockPush).toHaveBeenCalledWith('/auth/login');
    });

    it('should have accessibility hint on back to login button', () => {
      const { getByLabelText } = render(<ForgotPasswordScreen />, { wrapper: TestWrapper });

      const backButton = getByLabelText('Back to login');
      expect(backButton.props.accessibilityHint).toBe('Return to the login screen');
    });
  });

  describe('Loading States', () => {
    it('should disable email input while submitting', async () => {
      mockResetPasswordForEmail.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ data: {}, error: null }), 100))
      );

      const { getByPlaceholderText, getByLabelText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');
      const submitButton = getByLabelText('Send reset link button');

      fireEvent.changeText(emailInput, 'user@example.com');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(emailInput.props.editable).toBe(false);
      });
    });

    it('should show loading text on submit button while submitting', async () => {
      mockResetPasswordForEmail.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ data: {}, error: null }), 100))
      );

      const { getByPlaceholderText, getByLabelText, getByText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');
      const submitButton = getByLabelText('Send reset link button');

      fireEvent.changeText(emailInput, 'user@example.com');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(getByText('Sending...')).toBeTruthy();
      });
    });

    it('should disable submit button while submitting', async () => {
      mockResetPasswordForEmail.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ data: {}, error: null }), 100))
      );

      const { getByPlaceholderText, getByLabelText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');
      const submitButton = getByLabelText('Send reset link button');

      fireEvent.changeText(emailInput, 'user@example.com');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(submitButton.props.accessibilityState.disabled).toBe(true);
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper accessibility roles on all elements', () => {
      const { getByLabelText } = render(<ForgotPasswordScreen />, { wrapper: TestWrapper });

      expect(getByLabelText('Forgot password screen')).toBeTruthy();
      expect(getByLabelText('Email address input field')).toBeTruthy();
      expect(getByLabelText('Send reset link button')).toBeTruthy();
      expect(getByLabelText('Back to login')).toBeTruthy();
    });

    it('should have accessibility hints on interactive elements', () => {
      const { getByLabelText } = render(<ForgotPasswordScreen />, { wrapper: TestWrapper });

      const screen = getByLabelText('Forgot password screen');
      expect(screen.props.accessibilityHint).toBe('Request a password reset link');

      const emailInput = getByLabelText('Email address input field');
      expect(emailInput.props.accessibilityHint).toBe(
        'Enter your email address to receive a password reset link'
      );

      const submitButton = getByLabelText('Send reset link button');
      expect(submitButton.props.accessibilityHint).toBe('Tap to send password reset link');

      const backButton = getByLabelText('Back to login');
      expect(backButton.props.accessibilityHint).toBe('Return to the login screen');
    });

    it('should mark errors as alerts with live region', async () => {
      const { getByPlaceholderText, getByText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');

      fireEvent.changeText(emailInput, 'invalid');
      fireEvent(emailInput, 'blur');

      await waitFor(() => {
        const errorText = getByText('Please enter a valid email address');
        expect(errorText.props.accessibilityRole).toBe('alert');
        expect(errorText.props.accessibilityLiveRegion).toBe('polite');
      });
    });

    it('should support font scaling on all text elements', () => {
      const { getByText } = render(<ForgotPasswordScreen />, { wrapper: TestWrapper });

      const title = getByText('Forgot Password');
      expect(title.props.allowFontScaling).toBe(true);
      expect(title.props.maxFontSizeMultiplier).toBe(3);

      const subtitle = getByText('Reset your password');
      expect(subtitle.props.allowFontScaling).toBe(true);
      expect(subtitle.props.maxFontSizeMultiplier).toBe(2.5);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty email submission gracefully', async () => {
      const { getByLabelText } = render(<ForgotPasswordScreen />, { wrapper: TestWrapper });

      const submitButton = getByLabelText('Send reset link button');

      // Button should be disabled for empty email
      expect(submitButton.props.accessibilityState.disabled).toBe(true);
    });

    it('should handle whitespace-only email correctly', () => {
      const { getByPlaceholderText, getByLabelText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');
      const submitButton = getByLabelText('Send reset link button');

      fireEvent.changeText(emailInput, '     ');

      expect(submitButton.props.accessibilityState.disabled).toBe(true);
    });

    it('should handle very long email addresses', async () => {
      const { getByPlaceholderText, getByLabelText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');
      const submitButton = getByLabelText('Send reset link button');

      const longEmail = 'a'.repeat(100) + '@example.com';
      fireEvent.changeText(emailInput, longEmail);
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(mockResetPasswordForEmail).toHaveBeenCalled();
      });
    });

    it('should handle special characters in email correctly', async () => {
      const { getByPlaceholderText, getByLabelText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');
      const submitButton = getByLabelText('Send reset link button');

      fireEvent.changeText(emailInput, 'user+test@example.com');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
          'user+test@example.com',
          expect.any(Object)
        );
      });
    });

    it('should handle rapid submission attempts gracefully', async () => {
      const { getByPlaceholderText, getByLabelText } = render(<ForgotPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');
      const submitButton = getByLabelText('Send reset link button');

      fireEvent.changeText(emailInput, 'user@example.com');

      // Press submit multiple times rapidly
      fireEvent.press(submitButton);
      fireEvent.press(submitButton);
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(mockResetPasswordForEmail).toHaveBeenCalled();
      });

      // Should only call once due to mutation state
      expect(mockResetPasswordForEmail).toHaveBeenCalledTimes(1);
    });
  });
});
