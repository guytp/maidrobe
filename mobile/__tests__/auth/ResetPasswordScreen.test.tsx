import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ResetPasswordScreen } from '../../src/features/auth/components/ResetPasswordScreen';
import { ThemeProvider } from '../../src/core/theme';
import * as telemetry from '../../src/core/telemetry';
import * as resetAttemptRateLimit from '../../src/features/auth/utils/resetAttemptRateLimit';
import * as passwordReuse from '../../src/features/auth/utils/passwordReuse';

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Mock expo-router
const mockPush = jest.fn();
const mockParams = {
  access_token: 'valid-access-token',
  refresh_token: 'valid-refresh-token',
  type: 'recovery',
  email: '',
};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useLocalSearchParams: () => mockParams,
}));

// Mock telemetry
jest.mock('../../src/core/telemetry', () => ({
  logAuthEvent: jest.fn(),
}));

// Mock rate limiting utilities
jest.mock('../../src/features/auth/utils/resetAttemptRateLimit', () => ({
  checkResetAttemptRateLimit: jest.fn(),
  recordResetAttempt: jest.fn(),
  clearResetAttempts: jest.fn(),
}));

// Mock password reuse utility
jest.mock('../../src/features/auth/utils/passwordReuse', () => ({
  checkPasswordReuse: jest.fn(),
  PASSWORD_HISTORY_LIMIT: 3,
}));

// Mock reCAPTCHA hook
const mockExecuteRecaptcha = jest.fn();
jest.mock('../../src/features/auth/hooks/useRecaptcha', () => ({
  useRecaptcha: () => ({
    executeRecaptcha: mockExecuteRecaptcha,
    isLoading: false,
  }),
}));

// Mock Supabase
const mockUpdateUser = jest.fn();
const mockSetSession = jest.fn();
jest.mock('../../src/services/supabase', () => ({
  supabase: {
    auth: {
      updateUser: mockUpdateUser,
      setSession: mockSetSession,
    },
  },
}));

// Mock auth store
jest.mock('../../src/core/state/store', () => ({
  useStore: (selector: (state: { user: { id: string } | null }) => unknown) =>
    selector({
      user: { id: 'user-123' },
    }),
}));

// Mock Toast component - inline factory to avoid Jest hoisting issues
// Jest hoists jest.mock() calls to top of file before variable declarations,
// so we must define the mock component inside the factory function.
// Using require() is necessary here because imports cannot be used inside jest.mock() factories.
jest.mock('../../src/core/components/Toast', () => {
  /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */
  const React = require('react');
  const { View, Text, TouchableOpacity } = require('react-native');
  /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */

  const MockToast = ({
    visible,
    message,
    onDismiss,
  }: {
    visible: boolean;
    message: string;
    onDismiss: () => void;
  }) =>
    visible
      ? React.createElement(
          TouchableOpacity,
          { testID: 'success-toast', onPress: onDismiss },
          React.createElement(View, null, React.createElement(Text, null, message))
        )
      : null;

  return { Toast: MockToast };
});

describe('ResetPasswordScreen', () => {
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

    // Reset mockParams to valid state
    mockParams.access_token = 'valid-access-token';
    mockParams.refresh_token = 'valid-refresh-token';
    mockParams.type = 'recovery';
    mockParams.email = '';

    // Default mock implementations
    (resetAttemptRateLimit.checkResetAttemptRateLimit as jest.Mock).mockResolvedValue({
      allowed: true,
      remainingSeconds: 0,
    });
    (resetAttemptRateLimit.recordResetAttempt as jest.Mock).mockResolvedValue(undefined);
    (resetAttemptRateLimit.clearResetAttempts as jest.Mock).mockResolvedValue(undefined);
    (passwordReuse.checkPasswordReuse as jest.Mock).mockResolvedValue({
      isReused: false,
    });
    mockExecuteRecaptcha.mockResolvedValue({
      success: true,
      token: 'recaptcha-token',
    });
    mockUpdateUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    mockSetSession.mockResolvedValue({
      data: { session: {} },
      error: null,
    });
  });

  describe('Token Validation and Error View', () => {
    it('should render error view when access_token is missing', () => {
      mockParams.access_token = '';

      const { getByText } = render(<ResetPasswordScreen />, { wrapper: TestWrapper });

      expect(getByText('Link Expired')).toBeTruthy();
      expect(getByText('This password reset link has expired or is invalid.')).toBeTruthy();
      expect(getByText('Resend Reset Email')).toBeTruthy();
    });

    it('should render error view when refresh_token is missing', () => {
      mockParams.refresh_token = '';

      const { getByText } = render(<ResetPasswordScreen />, { wrapper: TestWrapper });

      expect(getByText('Link Expired')).toBeTruthy();
      expect(getByText('This password reset link has expired or is invalid.')).toBeTruthy();
    });

    it('should render error view when both tokens are empty strings', () => {
      mockParams.access_token = '';
      mockParams.refresh_token = '';

      const { getByText } = render(<ResetPasswordScreen />, { wrapper: TestWrapper });

      expect(getByText('Link Expired')).toBeTruthy();
    });

    it('should render error view when tokens are whitespace only', () => {
      mockParams.access_token = '   ';
      mockParams.refresh_token = '   ';

      const { getByText } = render(<ResetPasswordScreen />, { wrapper: TestWrapper });

      expect(getByText('Link Expired')).toBeTruthy();
    });

    it('should log telemetry event for invalid token on mount', () => {
      mockParams.access_token = '';

      render(<ResetPasswordScreen />, { wrapper: TestWrapper });

      expect(telemetry.logAuthEvent).toHaveBeenCalledWith('password-reset-link-opened', {
        outcome: 'invalid_token',
        metadata: {
          hasToken: false,
          isRecoveryType: true,
        },
      });
    });

    it('should navigate to forgot password when resend button pressed', () => {
      mockParams.access_token = '';

      const { getByText } = render(<ResetPasswordScreen />, { wrapper: TestWrapper });

      fireEvent.press(getByText('Resend Reset Email'));

      expect(mockPush).toHaveBeenCalledWith('/auth/forgot-password');
    });

    it('should navigate to forgot password with email pre-fill when available', () => {
      mockParams.access_token = '';
      mockParams.email = 'user@example.com';

      const { getByText } = render(<ResetPasswordScreen />, { wrapper: TestWrapper });

      fireEvent.press(getByText('Resend Reset Email'));

      expect(mockPush).toHaveBeenCalledWith('/auth/forgot-password?email=user%40example.com');
    });

    it('should navigate to login when back to login pressed from error view', () => {
      mockParams.access_token = '';

      const { getByText } = render(<ResetPasswordScreen />, { wrapper: TestWrapper });

      fireEvent.press(getByText('Back to Login'));

      expect(mockPush).toHaveBeenCalledWith('/auth/login');
    });

    it('should have accessibility labels on error view', () => {
      mockParams.access_token = '';

      const { getByLabelText } = render(<ResetPasswordScreen />, { wrapper: TestWrapper });

      expect(getByLabelText('Reset password screen')).toBeTruthy();
      expect(getByLabelText('Resend reset email')).toBeTruthy();
      expect(getByLabelText('Back to login')).toBeTruthy();
    });
  });

  describe('Form Rendering with Valid Token', () => {
    it('should render reset password form with all fields when token is valid', () => {
      const { getByText, getByPlaceholderText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      expect(getByText('Reset Password')).toBeTruthy();
      expect(getByText('Create a new password')).toBeTruthy();
      expect(getByText('New Password')).toBeTruthy();
      expect(getByText('Confirm Password')).toBeTruthy();
      expect(getByPlaceholderText('Enter new password')).toBeTruthy();
      expect(getByPlaceholderText('Confirm new password')).toBeTruthy();
      expect(getByText('Reset Password')).toBeTruthy(); // Button text same as title
    });

    it('should log telemetry event for valid token on mount', () => {
      render(<ResetPasswordScreen />, { wrapper: TestWrapper });

      expect(telemetry.logAuthEvent).toHaveBeenCalledWith('password-reset-link-opened', {
        outcome: 'valid_token',
        metadata: {
          hasToken: true,
          isRecoveryType: true,
        },
      });
    });

    it('should have correct accessibility labels on form inputs', () => {
      const { getByLabelText } = render(<ResetPasswordScreen />, { wrapper: TestWrapper });

      expect(getByLabelText('Reset password screen')).toBeTruthy();
      expect(getByLabelText('New password input field')).toBeTruthy();
      expect(getByLabelText('Confirm password input field')).toBeTruthy();
      expect(getByLabelText('Reset password button')).toBeTruthy();
    });

    it('should initially disable the submit button when form is empty', () => {
      const { getByLabelText } = render(<ResetPasswordScreen />, { wrapper: TestWrapper });

      const submitButton = getByLabelText('Reset password button');
      expect(submitButton.props.accessibilityState.disabled).toBe(true);
    });
  });

  describe('Password Input Behavior', () => {
    it('should toggle password visibility', () => {
      const { getByPlaceholderText, getByTestId } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      const toggleButton = getByTestId('password-toggle');

      // Initially password should be hidden
      expect(passwordInput.props.secureTextEntry).toBe(true);

      // Click to show password
      fireEvent.press(toggleButton);
      expect(passwordInput.props.secureTextEntry).toBe(false);

      // Click to hide password again (same button, now shows "Hide password")
      fireEvent.press(toggleButton);
      expect(passwordInput.props.secureTextEntry).toBe(true);
    });

    it('should toggle confirm password visibility independently', () => {
      const { getByPlaceholderText, getByTestId } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const confirmPasswordInput = getByPlaceholderText('Confirm new password');
      const confirmToggleButton = getByTestId('confirm-password-toggle');

      // Initially password should be hidden
      expect(confirmPasswordInput.props.secureTextEntry).toBe(true);

      // Click to show password
      fireEvent.press(confirmToggleButton);
      expect(confirmPasswordInput.props.secureTextEntry).toBe(false);
    });

    it('should allow typing in password fields', () => {
      const { getByPlaceholderText } = render(<ResetPasswordScreen />, { wrapper: TestWrapper });

      const passwordInput = getByPlaceholderText('Enter new password');
      const confirmPasswordInput = getByPlaceholderText('Confirm new password');

      fireEvent.changeText(passwordInput, 'NewPassword123!');
      fireEvent.changeText(confirmPasswordInput, 'NewPassword123!');

      expect(passwordInput.props.value).toBe('NewPassword123!');
      expect(confirmPasswordInput.props.value).toBe('NewPassword123!');
    });

    it('should clear password error when user starts typing', async () => {
      const { getByPlaceholderText, getByText, queryByText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');

      // Enter weak password and blur
      fireEvent.changeText(passwordInput, 'weak');
      fireEvent(passwordInput, 'blur');

      await waitFor(() => {
        expect(getByText('Password does not meet requirements')).toBeTruthy();
      });

      // Start typing again
      fireEvent.changeText(passwordInput, 'NewPassword123!');

      await waitFor(() => {
        expect(queryByText('Password does not meet requirements')).toBeNull();
      });
    });

    it('should clear confirm password error when user starts typing', async () => {
      const { getByPlaceholderText, getByText, queryByText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      const confirmPasswordInput = getByPlaceholderText('Confirm new password');

      // Enter mismatching passwords
      fireEvent.changeText(passwordInput, 'NewPassword123!');
      fireEvent.changeText(confirmPasswordInput, 'Different123!');
      fireEvent(confirmPasswordInput, 'blur');

      await waitFor(() => {
        expect(getByText('Passwords do not match')).toBeTruthy();
      });

      // Start typing again
      fireEvent.changeText(confirmPasswordInput, 'NewPassword123!');

      await waitFor(() => {
        expect(queryByText('Passwords do not match')).toBeNull();
      });
    });
  });

  describe('Password Validation', () => {
    it('should validate password on blur and show error for weak password', async () => {
      const { getByPlaceholderText, getByText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');

      fireEvent.changeText(passwordInput, 'weak');
      fireEvent(passwordInput, 'blur');

      await waitFor(() => {
        expect(getByText('Password does not meet requirements')).toBeTruthy();
      });
    });

    it('should not show error on blur for strong password', async () => {
      const { getByPlaceholderText, queryByText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');

      fireEvent.changeText(passwordInput, 'StrongPassword123!');
      fireEvent(passwordInput, 'blur');

      await waitFor(() => {
        expect(queryByText('Password does not meet requirements')).toBeNull();
      });
    });

    it('should validate confirm password on blur and show mismatch error', async () => {
      const { getByPlaceholderText, getByText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      const confirmPasswordInput = getByPlaceholderText('Confirm new password');

      fireEvent.changeText(passwordInput, 'StrongPassword123!');
      fireEvent.changeText(confirmPasswordInput, 'DifferentPassword123!');
      fireEvent(confirmPasswordInput, 'blur');

      await waitFor(() => {
        expect(getByText('Passwords do not match')).toBeTruthy();
      });
    });

    it('should not show mismatch error when passwords match', async () => {
      const { getByPlaceholderText, queryByText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      const confirmPasswordInput = getByPlaceholderText('Confirm new password');

      fireEvent.changeText(passwordInput, 'StrongPassword123!');
      fireEvent.changeText(confirmPasswordInput, 'StrongPassword123!');
      fireEvent(confirmPasswordInput, 'blur');

      await waitFor(() => {
        expect(queryByText('Passwords do not match')).toBeNull();
      });
    });
  });

  describe('Password Strength Indicator', () => {
    it('should not show strength indicator when password is empty', () => {
      const { queryByText } = render(<ResetPasswordScreen />, { wrapper: TestWrapper });

      expect(queryByText('Password strength:')).toBeNull();
    });

    it('should show weak strength for simple password', () => {
      const { getByPlaceholderText, getByText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      fireEvent.changeText(passwordInput, 'simple');

      expect(getByText('Password strength:')).toBeTruthy();
      expect(getByText('Weak')).toBeTruthy();
    });

    it('should show medium strength for moderately complex password', () => {
      const { getByPlaceholderText, getByText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      fireEvent.changeText(passwordInput, 'Password1');

      expect(getByText('Password strength:')).toBeTruthy();
      expect(getByText('Medium')).toBeTruthy();
    });

    it('should show strong strength for complex password', () => {
      const { getByPlaceholderText, getByText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      fireEvent.changeText(passwordInput, 'VeryStrong123!Password');

      expect(getByText('Password strength:')).toBeTruthy();
      expect(getByText('Strong')).toBeTruthy();
    });

    it('should have accessibility value for strength indicator', () => {
      const { getByPlaceholderText, getByLabelText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      fireEvent.changeText(passwordInput, 'VeryStrong123!Password');

      const strengthIndicator = getByLabelText('Password strength indicator');
      expect(strengthIndicator.props.accessibilityValue.text).toContain('Strong');
    });
  });

  describe('Password Policy Rules Checklist', () => {
    it('should not show policy rules when password is empty', () => {
      const { queryByText } = render(<ResetPasswordScreen />, { wrapper: TestWrapper });

      expect(queryByText('Password must contain:')).toBeNull();
    });

    it('should show policy rules checklist when password is entered', () => {
      const { getByPlaceholderText, getByText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      fireEvent.changeText(passwordInput, 'a');

      expect(getByText('Password must contain:')).toBeTruthy();
      expect(getByText('At least 8 characters')).toBeTruthy();
      expect(getByText('One uppercase letter')).toBeTruthy();
      expect(getByText('One lowercase letter')).toBeTruthy();
      expect(getByText('One number')).toBeTruthy();
      expect(getByText('One special character')).toBeTruthy();
    });

    it('should mark all rules as unchecked for empty-like password', () => {
      const { getByPlaceholderText, getByLabelText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      fireEvent.changeText(passwordInput, 'a');

      expect(getByLabelText('At least 8 characters').props.accessibilityState.checked).toBe(false);
      expect(getByLabelText('One uppercase letter').props.accessibilityState.checked).toBe(false);
      expect(getByLabelText('One lowercase letter').props.accessibilityState.checked).toBe(true);
      expect(getByLabelText('One number').props.accessibilityState.checked).toBe(false);
      expect(getByLabelText('One special character').props.accessibilityState.checked).toBe(false);
    });

    it('should mark all rules as checked for strong password', () => {
      const { getByPlaceholderText, getByLabelText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      fireEvent.changeText(passwordInput, 'StrongPassword123!');

      expect(getByLabelText('At least 8 characters').props.accessibilityState.checked).toBe(true);
      expect(getByLabelText('One uppercase letter').props.accessibilityState.checked).toBe(true);
      expect(getByLabelText('One lowercase letter').props.accessibilityState.checked).toBe(true);
      expect(getByLabelText('One number').props.accessibilityState.checked).toBe(true);
      expect(getByLabelText('One special character').props.accessibilityState.checked).toBe(true);
    });

    it('should update checklist dynamically as password changes', () => {
      const { getByPlaceholderText, getByLabelText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');

      // Start with weak password
      fireEvent.changeText(passwordInput, 'weak');
      expect(getByLabelText('At least 8 characters').props.accessibilityState.checked).toBe(false);

      // Add more characters to meet length requirement
      fireEvent.changeText(passwordInput, 'weakpassword');
      expect(getByLabelText('At least 8 characters').props.accessibilityState.checked).toBe(true);
      expect(getByLabelText('One uppercase letter').props.accessibilityState.checked).toBe(false);

      // Add uppercase
      fireEvent.changeText(passwordInput, 'Weakpassword');
      expect(getByLabelText('One uppercase letter').props.accessibilityState.checked).toBe(true);
    });
  });

  describe('Form Validation and Submit Button State', () => {
    it('should disable submit button when password is empty', () => {
      const { getByLabelText } = render(<ResetPasswordScreen />, { wrapper: TestWrapper });

      const submitButton = getByLabelText('Reset password button');
      expect(submitButton.props.accessibilityState.disabled).toBe(true);
    });

    it('should disable submit button when confirm password is empty', () => {
      const { getByPlaceholderText, getByLabelText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      fireEvent.changeText(passwordInput, 'StrongPassword123!');

      const submitButton = getByLabelText('Reset password button');
      expect(submitButton.props.accessibilityState.disabled).toBe(true);
    });

    it('should disable submit button when passwords do not match', () => {
      const { getByPlaceholderText, getByLabelText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      const confirmPasswordInput = getByPlaceholderText('Confirm new password');

      fireEvent.changeText(passwordInput, 'StrongPassword123!');
      fireEvent.changeText(confirmPasswordInput, 'DifferentPassword123!');

      const submitButton = getByLabelText('Reset password button');
      expect(submitButton.props.accessibilityState.disabled).toBe(true);
    });

    it('should enable submit button when passwords match and are non-empty', () => {
      const { getByPlaceholderText, getByLabelText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      const confirmPasswordInput = getByPlaceholderText('Confirm new password');

      fireEvent.changeText(passwordInput, 'StrongPassword123!');
      fireEvent.changeText(confirmPasswordInput, 'StrongPassword123!');

      const submitButton = getByLabelText('Reset password button');
      expect(submitButton.props.accessibilityState.disabled).toBe(false);
    });

    it('should enable submit button even with weak password if it matches confirmation', () => {
      const { getByPlaceholderText, getByLabelText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      const confirmPasswordInput = getByPlaceholderText('Confirm new password');

      // Form validation only checks matching, not strength
      fireEvent.changeText(passwordInput, 'weak');
      fireEvent.changeText(confirmPasswordInput, 'weak');

      const submitButton = getByLabelText('Reset password button');
      expect(submitButton.props.accessibilityState.disabled).toBe(false);
    });

    it('should disable submit button when passwords are only whitespace', () => {
      const { getByPlaceholderText, getByLabelText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      const confirmPasswordInput = getByPlaceholderText('Confirm new password');

      fireEvent.changeText(passwordInput, '   ');
      fireEvent.changeText(confirmPasswordInput, '   ');

      const submitButton = getByLabelText('Reset password button');
      expect(submitButton.props.accessibilityState.disabled).toBe(true);
    });
  });

  describe('Form Submission Flow', () => {
    it('should show validation error when submitting weak password', async () => {
      const { getByPlaceholderText, getByLabelText, getByText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      const confirmPasswordInput = getByPlaceholderText('Confirm new password');
      const submitButton = getByLabelText('Reset password button');

      fireEvent.changeText(passwordInput, 'weak');
      fireEvent.changeText(confirmPasswordInput, 'weak');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(getByText('Password does not meet requirements')).toBeTruthy();
      });

      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it('should show error when passwords do not match on submit', async () => {
      const { getByPlaceholderText, getByLabelText, getByText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      const confirmPasswordInput = getByPlaceholderText('Confirm new password');
      const submitButton = getByLabelText('Reset password button');

      fireEvent.changeText(passwordInput, 'StrongPassword123!');
      fireEvent.changeText(confirmPasswordInput, 'DifferentPassword123!');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(getByText('Passwords do not match')).toBeTruthy();
      });

      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it('should check rate limiting before submitting', async () => {
      const { getByPlaceholderText, getByLabelText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      const confirmPasswordInput = getByPlaceholderText('Confirm new password');
      const submitButton = getByLabelText('Reset password button');

      fireEvent.changeText(passwordInput, 'StrongPassword123!');
      fireEvent.changeText(confirmPasswordInput, 'StrongPassword123!');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(resetAttemptRateLimit.checkResetAttemptRateLimit).toHaveBeenCalledWith(
          'valid-access-token'
        );
      });
    });

    it('should block submission and show error when rate limited', async () => {
      (resetAttemptRateLimit.checkResetAttemptRateLimit as jest.Mock).mockResolvedValue({
        allowed: false,
        remainingSeconds: 300,
      });

      const { getByPlaceholderText, getByLabelText, getByText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      const confirmPasswordInput = getByPlaceholderText('Confirm new password');
      const submitButton = getByLabelText('Reset password button');

      fireEvent.changeText(passwordInput, 'StrongPassword123!');
      fireEvent.changeText(confirmPasswordInput, 'StrongPassword123!');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(getByText(/Too many attempts. Please try again in 300 seconds/)).toBeTruthy();
      });

      expect(mockExecuteRecaptcha).not.toHaveBeenCalled();
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it('should log telemetry event when rate limited', async () => {
      (resetAttemptRateLimit.checkResetAttemptRateLimit as jest.Mock).mockResolvedValue({
        allowed: false,
        remainingSeconds: 300,
      });

      const { getByPlaceholderText, getByLabelText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      const confirmPasswordInput = getByPlaceholderText('Confirm new password');
      const submitButton = getByLabelText('Reset password button');

      fireEvent.changeText(passwordInput, 'StrongPassword123!');
      fireEvent.changeText(confirmPasswordInput, 'StrongPassword123!');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(telemetry.logAuthEvent).toHaveBeenCalledWith('password-reset-failed', {
          outcome: 'rate_limited',
          metadata: {
            remainingSeconds: 300,
          },
        });
      });
    });

    it('should execute reCAPTCHA before submitting when rate limit passes', async () => {
      const { getByPlaceholderText, getByLabelText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      const confirmPasswordInput = getByPlaceholderText('Confirm new password');
      const submitButton = getByLabelText('Reset password button');

      fireEvent.changeText(passwordInput, 'StrongPassword123!');
      fireEvent.changeText(confirmPasswordInput, 'StrongPassword123!');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(mockExecuteRecaptcha).toHaveBeenCalledWith('password_reset');
      });
    });

    it('should block submission and show error when reCAPTCHA fails', async () => {
      mockExecuteRecaptcha.mockResolvedValue({
        success: false,
        error: 'reCAPTCHA verification failed',
      });

      const { getByPlaceholderText, getByLabelText, getByText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      const confirmPasswordInput = getByPlaceholderText('Confirm new password');
      const submitButton = getByLabelText('Reset password button');

      fireEvent.changeText(passwordInput, 'StrongPassword123!');
      fireEvent.changeText(confirmPasswordInput, 'StrongPassword123!');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(getByText('Verification failed. Please try again.')).toBeTruthy();
      });

      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it('should log telemetry event when reCAPTCHA fails', async () => {
      mockExecuteRecaptcha.mockResolvedValue({
        success: false,
        error: 'reCAPTCHA verification failed',
      });

      const { getByPlaceholderText, getByLabelText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      const confirmPasswordInput = getByPlaceholderText('Confirm new password');
      const submitButton = getByLabelText('Reset password button');

      fireEvent.changeText(passwordInput, 'StrongPassword123!');
      fireEvent.changeText(confirmPasswordInput, 'StrongPassword123!');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(telemetry.logAuthEvent).toHaveBeenCalledWith('password-reset-failed', {
          outcome: 'recaptcha_failed',
          metadata: {
            error: 'reCAPTCHA verification failed',
          },
        });
      });
    });

    it('should record reset attempt after passing rate limit and reCAPTCHA', async () => {
      const { getByPlaceholderText, getByLabelText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      const confirmPasswordInput = getByPlaceholderText('Confirm new password');
      const submitButton = getByLabelText('Reset password button');

      fireEvent.changeText(passwordInput, 'StrongPassword123!');
      fireEvent.changeText(confirmPasswordInput, 'StrongPassword123!');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(resetAttemptRateLimit.recordResetAttempt).toHaveBeenCalledWith('valid-access-token');
      });
    });

    it('should successfully reset password with valid inputs', async () => {
      const { getByPlaceholderText, getByLabelText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      const confirmPasswordInput = getByPlaceholderText('Confirm new password');
      const submitButton = getByLabelText('Reset password button');

      fireEvent.changeText(passwordInput, 'StrongPassword123!');
      fireEvent.changeText(confirmPasswordInput, 'StrongPassword123!');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(mockSetSession).toHaveBeenCalledWith({
          access_token: 'valid-access-token',
          refresh_token: 'valid-refresh-token',
        });
      });

      await waitFor(() => {
        expect(mockUpdateUser).toHaveBeenCalledWith({
          password: 'StrongPassword123!',
        });
      });
    });
  });

  describe('Success Flow', () => {
    it('should show success toast on successful password reset', async () => {
      const { getByPlaceholderText, getByLabelText, getByTestId } = render(
        <ResetPasswordScreen />,
        {
          wrapper: TestWrapper,
        }
      );

      const passwordInput = getByPlaceholderText('Enter new password');
      const confirmPasswordInput = getByPlaceholderText('Confirm new password');
      const submitButton = getByLabelText('Reset password button');

      fireEvent.changeText(passwordInput, 'StrongPassword123!');
      fireEvent.changeText(confirmPasswordInput, 'StrongPassword123!');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(getByTestId('success-toast')).toBeTruthy();
      });
    });

    it('should clear rate limit attempts on success', async () => {
      const { getByPlaceholderText, getByLabelText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      const confirmPasswordInput = getByPlaceholderText('Confirm new password');
      const submitButton = getByLabelText('Reset password button');

      fireEvent.changeText(passwordInput, 'StrongPassword123!');
      fireEvent.changeText(confirmPasswordInput, 'StrongPassword123!');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(resetAttemptRateLimit.clearResetAttempts).toHaveBeenCalledWith('valid-access-token');
      });
    });

    it('should navigate to login after brief delay on success', async () => {
      jest.useFakeTimers();

      const { getByPlaceholderText, getByLabelText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      const confirmPasswordInput = getByPlaceholderText('Confirm new password');
      const submitButton = getByLabelText('Reset password button');

      fireEvent.changeText(passwordInput, 'StrongPassword123!');
      fireEvent.changeText(confirmPasswordInput, 'StrongPassword123!');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(resetAttemptRateLimit.clearResetAttempts).toHaveBeenCalled();
      });

      // Fast-forward 1.5s delay
      jest.advanceTimersByTime(1500);

      expect(mockPush).toHaveBeenCalledWith('/auth/login');

      jest.useRealTimers();
    });

    it('should navigate to login immediately when tapping success toast', async () => {
      const { getByPlaceholderText, getByLabelText, getByTestId } = render(
        <ResetPasswordScreen />,
        {
          wrapper: TestWrapper,
        }
      );

      const passwordInput = getByPlaceholderText('Enter new password');
      const confirmPasswordInput = getByPlaceholderText('Confirm new password');
      const submitButton = getByLabelText('Reset password button');

      fireEvent.changeText(passwordInput, 'StrongPassword123!');
      fireEvent.changeText(confirmPasswordInput, 'StrongPassword123!');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(getByTestId('success-toast')).toBeTruthy();
      });

      const toast = getByTestId('success-toast');
      fireEvent.press(toast);

      expect(mockPush).toHaveBeenCalledWith('/auth/login');
    });

    it('should cleanup timeout on unmount to prevent memory leak', async () => {
      jest.useFakeTimers();

      const { getByPlaceholderText, getByLabelText, unmount } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      const confirmPasswordInput = getByPlaceholderText('Confirm new password');
      const submitButton = getByLabelText('Reset password button');

      fireEvent.changeText(passwordInput, 'StrongPassword123!');
      fireEvent.changeText(confirmPasswordInput, 'StrongPassword123!');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(resetAttemptRateLimit.clearResetAttempts).toHaveBeenCalled();
      });

      // Unmount before timeout completes
      unmount();

      // Fast-forward time - should not crash or navigate
      jest.advanceTimersByTime(1500);

      jest.useRealTimers();
    });
  });

  describe('Error Handling', () => {
    it('should display error message on password reset failure', async () => {
      mockUpdateUser.mockResolvedValue({
        data: null,
        error: { message: 'Link expired or invalid' },
      });

      const { getByPlaceholderText, getByLabelText, getByText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      const confirmPasswordInput = getByPlaceholderText('Confirm new password');
      const submitButton = getByLabelText('Reset password button');

      fireEvent.changeText(passwordInput, 'StrongPassword123!');
      fireEvent.changeText(confirmPasswordInput, 'StrongPassword123!');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(getByText('Link expired or invalid')).toBeTruthy();
      });
    });

    it('should not navigate on failure', async () => {
      mockUpdateUser.mockResolvedValue({
        data: null,
        error: { message: 'Link expired or invalid' },
      });

      const { getByPlaceholderText, getByLabelText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      const confirmPasswordInput = getByPlaceholderText('Confirm new password');
      const submitButton = getByLabelText('Reset password button');

      fireEvent.changeText(passwordInput, 'StrongPassword123!');
      fireEvent.changeText(confirmPasswordInput, 'StrongPassword123!');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(mockUpdateUser).toHaveBeenCalled();
      });

      // Wait a bit to ensure navigation doesn't happen
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockPush).not.toHaveBeenCalledWith('/auth/login');
    });

    it('should not clear rate limit attempts on failure', async () => {
      mockUpdateUser.mockResolvedValue({
        data: null,
        error: { message: 'Link expired or invalid' },
      });

      const { getByPlaceholderText, getByLabelText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      const confirmPasswordInput = getByPlaceholderText('Confirm new password');
      const submitButton = getByLabelText('Reset password button');

      fireEvent.changeText(passwordInput, 'StrongPassword123!');
      fireEvent.changeText(confirmPasswordInput, 'StrongPassword123!');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(mockUpdateUser).toHaveBeenCalled();
      });

      expect(resetAttemptRateLimit.clearResetAttempts).not.toHaveBeenCalled();
    });
  });

  describe('Navigation', () => {
    it('should navigate to login when back to login pressed', () => {
      const { getByText } = render(<ResetPasswordScreen />, { wrapper: TestWrapper });

      fireEvent.press(getByText('Back to Login'));

      expect(mockPush).toHaveBeenCalledWith('/auth/login');
    });

    it('should have accessibility hint on back to login button', () => {
      const { getByLabelText } = render(<ResetPasswordScreen />, { wrapper: TestWrapper });

      const backButton = getByLabelText('Back to login');
      expect(backButton.props.accessibilityHint).toBe('Return to the login screen');
    });
  });

  describe('Loading States', () => {
    it('should disable inputs while submitting', async () => {
      mockUpdateUser.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ data: {}, error: null }), 100))
      );

      const { getByPlaceholderText, getByLabelText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      const confirmPasswordInput = getByPlaceholderText('Confirm new password');
      const submitButton = getByLabelText('Reset password button');

      fireEvent.changeText(passwordInput, 'StrongPassword123!');
      fireEvent.changeText(confirmPasswordInput, 'StrongPassword123!');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(passwordInput.props.editable).toBe(false);
        expect(confirmPasswordInput.props.editable).toBe(false);
      });
    });

    it('should show loading text and spinner on submit button while submitting', async () => {
      mockUpdateUser.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ data: {}, error: null }), 100))
      );

      const { getByPlaceholderText, getByLabelText, getByText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      const confirmPasswordInput = getByPlaceholderText('Confirm new password');
      const submitButton = getByLabelText('Reset password button');

      fireEvent.changeText(passwordInput, 'StrongPassword123!');
      fireEvent.changeText(confirmPasswordInput, 'StrongPassword123!');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(getByText('Resetting...')).toBeTruthy();
      });
    });

    it('should disable submit button while submitting', async () => {
      mockUpdateUser.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ data: {}, error: null }), 100))
      );

      const { getByPlaceholderText, getByLabelText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      const confirmPasswordInput = getByPlaceholderText('Confirm new password');
      const submitButton = getByLabelText('Reset password button');

      fireEvent.changeText(passwordInput, 'StrongPassword123!');
      fireEvent.changeText(confirmPasswordInput, 'StrongPassword123!');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(submitButton.props.accessibilityState.disabled).toBe(true);
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper accessibility roles', () => {
      const { getByLabelText } = render(<ResetPasswordScreen />, { wrapper: TestWrapper });

      expect(getByLabelText('Reset password screen')).toBeTruthy();
      expect(getByLabelText('New password input field')).toBeTruthy();
      expect(getByLabelText('Confirm password input field')).toBeTruthy();
      expect(getByLabelText('Reset password button')).toBeTruthy();
    });

    it('should have accessibility hints on interactive elements', () => {
      const { getByLabelText } = render(<ResetPasswordScreen />, { wrapper: TestWrapper });

      const screen = getByLabelText('Reset password screen');
      expect(screen.props.accessibilityHint).toBe('Enter your new password twice to reset it');

      const submitButton = getByLabelText('Reset password button');
      expect(submitButton.props.accessibilityHint).toBe('Submit new password');
    });

    it('should mark errors as alerts with live region', async () => {
      const { getByPlaceholderText, getByText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');

      fireEvent.changeText(passwordInput, 'weak');
      fireEvent(passwordInput, 'blur');

      await waitFor(() => {
        const errorText = getByText('Password does not meet requirements');
        expect(errorText.props.accessibilityRole).toBe('alert');
        expect(errorText.props.accessibilityLiveRegion).toBe('polite');
      });
    });

    it('should support font scaling on all text elements', () => {
      const { getByText } = render(<ResetPasswordScreen />, { wrapper: TestWrapper });

      const title = getByText('Reset Password');
      expect(title.props.allowFontScaling).toBe(true);
      expect(title.props.maxFontSizeMultiplier).toBe(3);

      const subtitle = getByText('Create a new password');
      expect(subtitle.props.allowFontScaling).toBe(true);
      expect(subtitle.props.maxFontSizeMultiplier).toBe(2.5);
    });
  });

  describe('Edge Cases', () => {
    it('should handle password with only spaces as invalid for form validation', () => {
      const { getByPlaceholderText, getByLabelText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      const confirmPasswordInput = getByPlaceholderText('Confirm new password');

      fireEvent.changeText(passwordInput, '        ');
      fireEvent.changeText(confirmPasswordInput, '        ');

      const submitButton = getByLabelText('Reset password button');
      expect(submitButton.props.accessibilityState.disabled).toBe(true);
    });

    it('should handle very long passwords', () => {
      const { getByPlaceholderText, getByLabelText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      const confirmPasswordInput = getByPlaceholderText('Confirm new password');

      const longPassword = 'A'.repeat(100) + '1!';
      fireEvent.changeText(passwordInput, longPassword);
      fireEvent.changeText(confirmPasswordInput, longPassword);

      const submitButton = getByLabelText('Reset password button');
      expect(submitButton.props.accessibilityState.disabled).toBe(false);
    });

    it('should handle rapid form submission attempts gracefully', async () => {
      const { getByPlaceholderText, getByLabelText } = render(<ResetPasswordScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter new password');
      const confirmPasswordInput = getByPlaceholderText('Confirm new password');
      const submitButton = getByLabelText('Reset password button');

      fireEvent.changeText(passwordInput, 'StrongPassword123!');
      fireEvent.changeText(confirmPasswordInput, 'StrongPassword123!');

      // Press submit multiple times rapidly
      fireEvent.press(submitButton);
      fireEvent.press(submitButton);
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(mockSetSession).toHaveBeenCalled();
      });

      // Should only call once due to mutation state
      expect(mockSetSession).toHaveBeenCalledTimes(1);
    });

    it('should handle empty email parameter gracefully', () => {
      mockParams.access_token = '';
      mockParams.email = '';

      const { getByText } = render(<ResetPasswordScreen />, { wrapper: TestWrapper });

      fireEvent.press(getByText('Resend Reset Email'));

      expect(mockPush).toHaveBeenCalledWith('/auth/forgot-password');
    });

    it('should handle special characters in email parameter for URL encoding', () => {
      mockParams.access_token = '';
      mockParams.email = 'user+test@example.com';

      const { getByText } = render(<ResetPasswordScreen />, { wrapper: TestWrapper });

      fireEvent.press(getByText('Resend Reset Email'));

      expect(mockPush).toHaveBeenCalledWith(
        '/auth/forgot-password?email=user%2Btest%40example.com'
      );
    });
  });
});
