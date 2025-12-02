import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginScreen } from '../../src/features/auth/components/LoginScreen';
import { ThemeProvider } from '../../src/core/theme';

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
  useLocalSearchParams: () => ({}),
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

describe('LoginScreen', () => {
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
  });

  it('should render login form with all fields', () => {
    const { getByText, getByPlaceholderText, getAllByText } = render(<LoginScreen />, {
      wrapper: TestWrapper,
    });

    // Title appears once, button text appears once, but both say "Log In"
    expect(getAllByText('Log In').length).toBe(2);
    expect(getByText('Welcome Back')).toBeTruthy();
    expect(getByPlaceholderText('your@email.com')).toBeTruthy();
    expect(getByPlaceholderText('Enter password')).toBeTruthy();
  });

  it('should have correct accessibility labels', () => {
    const { getByLabelText } = render(<LoginScreen />, {
      wrapper: TestWrapper,
    });

    expect(getByLabelText('Log in screen')).toBeTruthy();
    expect(getByLabelText('Email address input field')).toBeTruthy();
    expect(getByLabelText('Password input field')).toBeTruthy();
    expect(getByLabelText('Log in button')).toBeTruthy();
  });

  it('should toggle password visibility', () => {
    const { getByText, getByPlaceholderText } = render(<LoginScreen />, {
      wrapper: TestWrapper,
    });

    const passwordInput = getByPlaceholderText('Enter password');
    const toggleButton = getByText('Show password');

    // Initially password should be hidden
    expect(passwordInput.props.secureTextEntry).toBe(true);

    // Click to show password
    fireEvent.press(toggleButton);
    expect(passwordInput.props.secureTextEntry).toBe(false);

    // Click to hide password again
    const hideButton = getByText('Hide password');
    fireEvent.press(hideButton);
    expect(passwordInput.props.secureTextEntry).toBe(true);
  });

  it('should validate email on blur', async () => {
    const { getByPlaceholderText, getByText } = render(<LoginScreen />, {
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
    const { getByPlaceholderText, getByText } = render(<LoginScreen />, {
      wrapper: TestWrapper,
    });

    const passwordInput = getByPlaceholderText('Enter password');

    // Enter empty password and blur
    fireEvent.changeText(passwordInput, '');
    fireEvent(passwordInput, 'blur');

    await waitFor(() => {
      expect(getByText('Password is required')).toBeTruthy();
    });
  });

  it('should disable submit button when form is invalid', () => {
    const { getByLabelText } = render(<LoginScreen />, {
      wrapper: TestWrapper,
    });

    const submitButton = getByLabelText('Log in button');
    expect(submitButton.props.accessibilityState.disabled).toBe(true);
  });

  it('should enable submit button when form is valid', () => {
    const { getByPlaceholderText, getByLabelText } = render(<LoginScreen />, {
      wrapper: TestWrapper,
    });

    const emailInput = getByPlaceholderText('your@email.com');
    const passwordInput = getByPlaceholderText('Enter password');
    const submitButton = getByLabelText('Log in button');

    fireEvent.changeText(emailInput, 'user@example.com');
    fireEvent.changeText(passwordInput, 'anypassword');

    expect(submitButton.props.accessibilityState.disabled).toBe(false);
  });

  it('should accept any non-empty password', () => {
    const { getByPlaceholderText, getByLabelText } = render(<LoginScreen />, {
      wrapper: TestWrapper,
    });

    const emailInput = getByPlaceholderText('your@email.com');
    const passwordInput = getByPlaceholderText('Enter password');
    const submitButton = getByLabelText('Log in button');

    // Login should accept weak passwords (validation happens at signup)
    fireEvent.changeText(emailInput, 'user@example.com');
    fireEvent.changeText(passwordInput, 'weak');

    expect(submitButton.props.accessibilityState.disabled).toBe(false);
  });

  it('should clear errors when user starts typing', async () => {
    const { getByPlaceholderText, getByText, queryByText } = render(<LoginScreen />, {
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
    it('should validate normalized email on blur with leading/trailing spaces', async () => {
      const { getByPlaceholderText, queryByText } = render(<LoginScreen />, {
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
      const { getByPlaceholderText, queryByText } = render(<LoginScreen />, {
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
      const { getByPlaceholderText, getByText } = render(<LoginScreen />, {
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

    it('should normalize email with mixed case and spaces correctly', async () => {
      const { getByPlaceholderText, queryByText } = render(<LoginScreen />, {
        wrapper: TestWrapper,
      });

      const emailInput = getByPlaceholderText('your@email.com');

      // Enter email with leading/trailing spaces and uppercase
      fireEvent.changeText(emailInput, '   TEST.User@Example.Com   ');
      fireEvent(emailInput, 'blur');

      // Should not show error because normalized email is valid
      await waitFor(() => {
        expect(queryByText('Please enter a valid email address')).toBeNull();
      });
    });
  });

  describe('Password Validation', () => {
    it('should not require password complexity for login', async () => {
      const { getByPlaceholderText, queryByText } = render(<LoginScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter password');

      // Enter simple password and blur
      fireEvent.changeText(passwordInput, 'simple');
      fireEvent(passwordInput, 'blur');

      // Should not show error because login only checks non-empty
      await waitFor(() => {
        expect(queryByText('Password is required')).toBeNull();
      });
    });

    it('should show error only when password is empty', async () => {
      const { getByPlaceholderText, getByText } = render(<LoginScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter password');

      // Leave password empty and blur
      fireEvent.changeText(passwordInput, '');
      fireEvent(passwordInput, 'blur');

      // Should show error
      await waitFor(() => {
        expect(getByText('Password is required')).toBeTruthy();
      });
    });

    it('should clear password error when user starts typing', async () => {
      const { getByPlaceholderText, getByText, queryByText } = render(<LoginScreen />, {
        wrapper: TestWrapper,
      });

      const passwordInput = getByPlaceholderText('Enter password');

      // Trigger error
      fireEvent.changeText(passwordInput, '');
      fireEvent(passwordInput, 'blur');

      await waitFor(() => {
        expect(getByText('Password is required')).toBeTruthy();
      });

      // Start typing
      fireEvent.changeText(passwordInput, 'a');

      await waitFor(() => {
        expect(queryByText('Password is required')).toBeNull();
      });
    });
  });
});
