import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VerificationPromptScreen } from '../../src/features/auth/components/VerificationPromptScreen';
import { ThemeProvider } from '../../src/core/theme';
import * as useResendVerificationModule from '../../src/features/auth/api/useResendVerification';

// Mock auth store
jest.mock('../../src/core/state/store', () => ({
  useStore: (
    selector: (state: { user: { email: string; id: string; emailVerified: boolean } | null }) => unknown
  ) =>
    selector({
      user: { email: 'test@example.com', id: '123', emailVerified: false },
    }),
}));

describe('VerificationPromptScreen', () => {
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
    jest.useFakeTimers();

    // Default mock for useResendVerification
    jest.spyOn(useResendVerificationModule, 'useResendVerification').mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
      error: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should render verification instructions', () => {
    const { getByText } = render(<VerificationPromptScreen />, {
      wrapper: TestWrapper,
    });

    expect(getByText('Verify Your Email')).toBeTruthy();
    expect(getByText('Check your inbox')).toBeTruthy();
    expect(
      getByText(
        'We have sent a verification link to your email address. Please check your inbox and click the link to verify your account.'
      )
    ).toBeTruthy();
  });

  it('should render resend button', () => {
    const { getByText } = render(<VerificationPromptScreen />, {
      wrapper: TestWrapper,
    });

    expect(getByText('Resend Verification Email')).toBeTruthy();
  });

  it('should have correct accessibility labels', () => {
    const { getByLabelText } = render(<VerificationPromptScreen />, {
      wrapper: TestWrapper,
    });

    expect(getByLabelText('Email verification screen')).toBeTruthy();
    expect(getByLabelText('Resend verification email button')).toBeTruthy();
  });

  it('should call resend mutation when button is pressed', async () => {
    const mockMutate = jest.fn();
    jest.spyOn(useResendVerificationModule, 'useResendVerification').mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      error: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { getByText } = render(<VerificationPromptScreen />, {
      wrapper: TestWrapper,
    });

    const resendButton = getByText('Resend Verification Email');
    fireEvent.press(resendButton);

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        { email: 'test@example.com' },
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
        })
      );
    });
  });

  it('should show loading state during resend', () => {
    jest.spyOn(useResendVerificationModule, 'useResendVerification').mockReturnValue({
      mutate: jest.fn(),
      isPending: true,
      error: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { getByText } = render(<VerificationPromptScreen />, {
      wrapper: TestWrapper,
    });

    expect(getByText('Sending...')).toBeTruthy();
  });

  it('should show success message and start cooldown after successful resend', async () => {
    const mockMutate = jest.fn((req, callbacks) => {
      callbacks.onSuccess();
    });

    jest.spyOn(useResendVerificationModule, 'useResendVerification').mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      error: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { getByText } = render(<VerificationPromptScreen />, {
      wrapper: TestWrapper,
    });

    const resendButton = getByText('Resend Verification Email');

    act(() => {
      fireEvent.press(resendButton);
    });

    await waitFor(() => {
      expect(getByText('Verification email sent successfully')).toBeTruthy();
    });

    // Check cooldown started
    await waitFor(() => {
      expect(getByText('Please wait 60 seconds before resending')).toBeTruthy();
    });
  });

  it('should countdown from 60 seconds', async () => {
    const mockMutate = jest.fn((req, callbacks) => {
      callbacks.onSuccess();
    });

    jest.spyOn(useResendVerificationModule, 'useResendVerification').mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      error: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { getByText } = render(<VerificationPromptScreen />, {
      wrapper: TestWrapper,
    });

    const resendButton = getByText('Resend Verification Email');

    act(() => {
      fireEvent.press(resendButton);
    });

    await waitFor(() => {
      expect(getByText('Please wait 60 seconds before resending')).toBeTruthy();
    });

    // Fast-forward 1 second
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(getByText('Please wait 59 seconds before resending')).toBeTruthy();
    });

    // Fast-forward 59 more seconds
    act(() => {
      jest.advanceTimersByTime(59000);
    });

    await waitFor(() => {
      expect(getByText('Resend Verification Email')).toBeTruthy();
    });
  });

  it('should disable button during cooldown', async () => {
    const mockMutate = jest.fn((req, callbacks) => {
      callbacks.onSuccess();
    });

    jest.spyOn(useResendVerificationModule, 'useResendVerification').mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      error: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { getByLabelText } = render(<VerificationPromptScreen />, {
      wrapper: TestWrapper,
    });

    const resendButton = getByLabelText('Resend verification email button');

    act(() => {
      fireEvent.press(resendButton);
    });

    await waitFor(() => {
      expect(resendButton.props.accessibilityState.disabled).toBe(true);
    });
  });

  it('should auto-dismiss success message after 3 seconds', async () => {
    const mockMutate = jest.fn((req, callbacks) => {
      callbacks.onSuccess();
    });

    jest.spyOn(useResendVerificationModule, 'useResendVerification').mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      error: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { getByText, queryByText } = render(<VerificationPromptScreen />, {
      wrapper: TestWrapper,
    });

    const resendButton = getByText('Resend Verification Email');

    act(() => {
      fireEvent.press(resendButton);
    });

    await waitFor(() => {
      expect(getByText('Verification email sent successfully')).toBeTruthy();
    });

    // Fast-forward 3 seconds
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    await waitFor(() => {
      expect(queryByText('Verification email sent successfully')).toBeNull();
    });
  });
});
