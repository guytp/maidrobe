import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useResendVerification } from '../../src/features/auth/api/useResendVerification';
import { supabase } from '../../src/services/supabase';

// Mock supabase
jest.mock('../../src/services/supabase', () => ({
  supabase: {
    auth: {
      resend: jest.fn(),
    },
  },
}));

// Mock telemetry
jest.mock('../../src/core/telemetry', () => ({
  logError: jest.fn(),
  getUserFriendlyMessage: jest.fn((classification: string) => {
    const messages: Record<string, string> = {
      network: 'Unable to connect. Please check your internet connection.',
      server: 'Service temporarily unavailable. Please try again later.',
      user: 'Invalid request. Please check your input and try again.',
      schema: 'Received unexpected response. Please contact support if this persists.',
    };
    return messages[classification] || 'An error occurred';
  }),
}));

describe('useResendVerification', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
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

  it('should successfully resend verification email', async () => {
    const mockResend = supabase.auth.resend as jest.Mock;
    mockResend.mockResolvedValueOnce({
      data: {},
      error: null,
    });

    const { result } = renderHook(() => useResendVerification(), { wrapper });

    result.current.mutate({ email: 'test@example.com' });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockResend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'test@example.com',
    });
  });

  it('should handle network errors', async () => {
    const mockResend = supabase.auth.resend as jest.Mock;
    mockResend.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Network error occurred',
        status: 0,
      },
    });

    const { result } = renderHook(() => useResendVerification(), { wrapper });

    result.current.mutate({ email: 'test@example.com' });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe(
      'Unable to connect. Please check your internet connection.'
    );
  });

  it('should handle rate limit errors', async () => {
    const mockResend = supabase.auth.resend as jest.Mock;
    mockResend.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Rate limit exceeded',
        status: 429,
      },
    });

    const { result } = renderHook(() => useResendVerification(), { wrapper });

    result.current.mutate({ email: 'test@example.com' });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toContain('Too many requests');
  });

  it('should handle server errors', async () => {
    const mockResend = supabase.auth.resend as jest.Mock;
    mockResend.mockResolvedValueOnce({
      data: null,
      error: {
        message: '500 Internal Server Error',
        status: 500,
      },
    });

    const { result } = renderHook(() => useResendVerification(), { wrapper });

    result.current.mutate({ email: 'test@example.com' });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe(
      'Service temporarily unavailable. Please try again later.'
    );
  });

  it('should validate email format', async () => {
    const { result } = renderHook(() => useResendVerification(), { wrapper });

    result.current.mutate({ email: 'invalid-email' });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });

  it('should set isPending to true during request', async () => {
    const mockResend = supabase.auth.resend as jest.Mock;
    mockResend.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                data: {},
                error: null,
              }),
            100
          )
        )
    );

    const { result } = renderHook(() => useResendVerification(), { wrapper });

    result.current.mutate({ email: 'test@example.com' });

    expect(result.current.isPending).toBe(true);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.isPending).toBe(false);
  });
});
