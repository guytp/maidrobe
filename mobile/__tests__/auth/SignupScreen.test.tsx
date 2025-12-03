import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SignupScreen } from '../../src/features/auth/components/SignupScreen';
import { ThemeProvider } from '../../src/core/theme';
import * as useSignUpModule from '../../src/features/auth/api/useSignUp';

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

// Mock auth store
jest.mock('../../src/core/state/store', () => ({
  useStore: (
    selector: (state: { user: null; setUser: () => void; clearUser: () => void }) => unknown
  ) =>
    selector({
      user: null,
      setUser: jest.fn(),
      clearUser: jest.fn(),
    }),
}));

describe('SignupScreen', () => {
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

    // Default mock for useSignUp
    jest.spyOn(useSignUpModule, 'useSignUp').mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
      error: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  });

  it('should render signup form with all fields', () => {
    const { getByText, getByPlaceholderText } = render(<SignupScreen />, {
      wrapper: TestWrapper,
    });

    expect(getByText('Create Account')).toBeTruthy();
    expect(getByText('Join Maidrobe')).toBeTruthy();
    expect(getByPlaceholderText('your@email.com')).toBeTruthy();
    expect(getByPlaceholderText('Enter password')).toBeTruthy();
    expect(getByText('Sign Up')).toBeTruthy();
  });

  it('should have correct accessibility labels', () => {
    const { getByLabelText } = render(<SignupScreen />, {
      wrapper: TestWrapper,
    });

    expect(getByLabelText('Sign up screen')).toBeTruthy();
    expect(getByLabelText('Email address input field')).toBeTruthy();
    expect(getByLabelText('Password input field')).toBeTruthy();
    expect(getByLabelText('Create account button')).toBeTruthy();
  });

  it('should toggle password visibility', () => {
    const { getByTestId, getByPlaceholderText } = render(<SignupScreen />, {
      wrapper: TestWrapper,
    });

    const passwordInput = getByPlaceholderText('Enter password');
    const toggleButton = getByTestId('password-toggle');

    // Initially password should be hidden
    expect(passwordInput.props.secureTextEntry).toBe(true);

    // Click to show password
    fireEvent.press(toggleButton);
    expect(passwordInput.props.secureTextEntry).toBe(false);

    // Click to hide password again (same button, text changes but testID is stable)
    fireEvent.press(toggleButton);
    expect(passwordInput.props.secureTextEntry).toBe(true);
  });

  it('should validate email on blur', async () => {
    const { getByPlaceholderText, getByText } = render(<SignupScreen />, {
      wrapper: TestWrapper,
    });

    const emailInput = getByPlaceholderText('your@email.com');

    // Enter invalid email and blur
    fireEvent.changeText(emailInput, 'invalid-email');
    fireEvent(emailInput, 'blur');

    await waitFor(() => {
      expect(getByText('Please enter a valid email address')).toBeTruthy();
    });
  });

  it('should validate password on blur', async () => {
    const { getByPlaceholderText, getByText } = render(<SignupScreen />, {
      wrapper: TestWrapper,
    });

    const passwordInput = getByPlaceholderText('Enter password');

    // Enter weak password and blur
    fireEvent.changeText(passwordInput, 'weak');
    fireEvent(passwordInput, 'blur');

    await waitFor(() => {
      expect(getByText('Password does not meet requirements')).toBeTruthy();
    });
  });

  it('should disable submit button when form is invalid', () => {
    const { getByLabelText } = render(<SignupScreen />, {
      wrapper: TestWrapper,
    });

    const submitButton = getByLabelText('Create account button');
    expect(submitButton.props.accessibilityState.disabled).toBe(true);
  });

  it('should enable submit button when form is valid', () => {
    const { getByPlaceholderText, getByLabelText } = render(<SignupScreen />, {
      wrapper: TestWrapper,
    });

    const emailInput = getByPlaceholderText('your@email.com');
    const passwordInput = getByPlaceholderText('Enter password');
    const submitButton = getByLabelText('Create account button');

    fireEvent.changeText(emailInput, 'user@example.com');
    fireEvent.changeText(passwordInput, 'SecurePass123');

    expect(submitButton.props.accessibilityState.disabled).toBe(false);
  });

  it('should call useSignUp mutation on submit', async () => {
    const mockMutate = jest.fn();
    jest.spyOn(useSignUpModule, 'useSignUp').mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      error: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { getByPlaceholderText, getByText } = render(<SignupScreen />, {
      wrapper: TestWrapper,
    });

    const emailInput = getByPlaceholderText('your@email.com');
    const passwordInput = getByPlaceholderText('Enter password');
    const submitButton = getByText('Sign Up');

    fireEvent.changeText(emailInput, 'user@example.com');
    fireEvent.changeText(passwordInput, 'SecurePass123');
    fireEvent.press(submitButton);

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        { email: 'user@example.com', password: 'SecurePass123' },
        expect.any(Object)
      );
    });
  });

  it('should show loading state during submission', () => {
    jest.spyOn(useSignUpModule, 'useSignUp').mockReturnValue({
      mutate: jest.fn(),
      isPending: true,
      error: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { getByText } = render(<SignupScreen />, { wrapper: TestWrapper });

    expect(getByText('Creating account...')).toBeTruthy();
  });

  it('should clear errors when user starts typing', async () => {
    const { getByPlaceholderText, getByText, queryByText } = render(<SignupScreen />, {
      wrapper: TestWrapper,
    });

    const emailInput = getByPlaceholderText('your@email.com');

    // Trigger error
    fireEvent.changeText(emailInput, 'invalid');
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

  describe('Email Normalization', () => {
    it('should trim leading and trailing spaces from email before submission', async () => {
      const mockMutate = jest.fn();
      jest.spyOn(useSignUpModule, 'useSignUp').mockReturnValue({
        mutate: mockMutate,
        isPending: false,
        error: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const { getByPlaceholderText, getByText } = render(<SignupScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');
      const passwordInput = getByPlaceholderText('Enter password');
      const submitButton = getByText('Sign Up');

      // Enter email with leading and trailing spaces
      fireEvent.changeText(emailInput, '  user@example.com  ');
      fireEvent.changeText(passwordInput, 'SecurePass123');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalledWith(
          { email: 'user@example.com', password: 'SecurePass123' },
          expect.any(Object)
        );
      });
    });

    it('should convert uppercase email to lowercase before submission', async () => {
      const mockMutate = jest.fn();
      jest.spyOn(useSignUpModule, 'useSignUp').mockReturnValue({
        mutate: mockMutate,
        isPending: false,
        error: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const { getByPlaceholderText, getByText } = render(<SignupScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');
      const passwordInput = getByPlaceholderText('Enter password');
      const submitButton = getByText('Sign Up');

      // Enter email with uppercase characters
      fireEvent.changeText(emailInput, 'User@EXAMPLE.COM');
      fireEvent.changeText(passwordInput, 'SecurePass123');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalledWith(
          { email: 'user@example.com', password: 'SecurePass123' },
          expect.any(Object)
        );
      });
    });

    it('should trim and lowercase email with both spaces and uppercase', async () => {
      const mockMutate = jest.fn();
      jest.spyOn(useSignUpModule, 'useSignUp').mockReturnValue({
        mutate: mockMutate,
        isPending: false,
        error: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const { getByPlaceholderText, getByText } = render(<SignupScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');
      const passwordInput = getByPlaceholderText('Enter password');
      const submitButton = getByText('Sign Up');

      // Enter email with spaces and uppercase characters
      fireEvent.changeText(emailInput, '  User@EXAMPLE.COM  ');
      fireEvent.changeText(passwordInput, 'SecurePass123');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalledWith(
          { email: 'user@example.com', password: 'SecurePass123' },
          expect.any(Object)
        );
      });
    });

    it('should normalize email with mixed case and internal spaces correctly', async () => {
      const mockMutate = jest.fn();
      jest.spyOn(useSignUpModule, 'useSignUp').mockReturnValue({
        mutate: mockMutate,
        isPending: false,
        error: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const { getByPlaceholderText, getByText } = render(<SignupScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');
      const passwordInput = getByPlaceholderText('Enter password');
      const submitButton = getByText('Sign Up');

      // Enter email with leading/trailing spaces and uppercase
      fireEvent.changeText(emailInput, '   TEST.User@Example.Com   ');
      fireEvent.changeText(passwordInput, 'SecurePass123');
      fireEvent.press(submitButton);

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalledWith(
          { email: 'test.user@example.com', password: 'SecurePass123' },
          expect.any(Object)
        );
      });
    });

    it('should validate normalized email on blur with leading/trailing spaces', async () => {
      const { getByPlaceholderText, queryByText } = render(<SignupScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');

      // Enter valid email with spaces
      fireEvent.changeText(emailInput, '  user@example.com  ');
      fireEvent(emailInput, 'blur');

      // Should not show error because normalized email is valid
      await waitFor(() => {
        expect(queryByText('Please enter a valid email address')).toBeNull();
      });
    });

    it('should validate normalized email on blur with uppercase characters', async () => {
      const { getByPlaceholderText, queryByText } = render(<SignupScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');

      // Enter valid email with uppercase
      fireEvent.changeText(emailInput, 'User@Example.COM');
      fireEvent(emailInput, 'blur');

      // Should not show error because normalized email is valid
      await waitFor(() => {
        expect(queryByText('Please enter a valid email address')).toBeNull();
      });
    });

    it('should show error for invalid email even after normalization', async () => {
      const { getByPlaceholderText, getByText } = render(<SignupScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');

      // Enter invalid email with spaces and uppercase
      fireEvent.changeText(emailInput, '  INVALID-EMAIL  ');
      fireEvent(emailInput, 'blur');

      // Should show error because normalized email is still invalid
      await waitFor(() => {
        expect(getByText('Please enter a valid email address')).toBeTruthy();
      });
    });
  });
});
