import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useRequestPasswordReset } from '../../src/features/auth/api/useRequestPasswordReset';
import { supabase } from '../../src/services/supabase';
import * as telemetry from '../../src/core/telemetry';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock dependencies
jest.mock('../../src/services/supabase', () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: jest.fn(),
    },
  },
}));

jest.mock('../../src/core/telemetry', () => ({
  logError: jest.fn(),
  logAuthEvent: jest.fn(),
  getUserFriendlyMessage: jest.fn((classification: string) => `Error: ${classification}`),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
  },
}));

jest.mock('../../src/core/i18n', () => ({
  t: jest.fn((key: string) => {
    const messages: Record<string, string> = {
      'screens.auth.forgotPassword.errors.rateLimitExceeded':
        'Too many requests. Please wait {seconds} seconds.',
      'screens.auth.forgotPassword.errors.networkError': 'Network error. Please try again.',
    };
    return messages[key] || key;
  }),
}));

describe('useRequestPasswordReset', () => {
  let queryClient: QueryClient;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let dateNowSpy: jest.SpyInstance;
  let currentTime: number;

  const createWrapper = () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return wrapper;
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    jest.clearAllMocks();

    // Mock console methods
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Mock Date.now for time control
    currentTime = 1000000000000;
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(currentTime);

    // Default mock implementations
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    (supabase.auth.resetPasswordForEmail as jest.Mock).mockResolvedValue({
      data: {},
      error: null,
    });
  });

  afterEach(() => {
    queryClient.clear();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    dateNowSpy.mockRestore();
  });

  describe('Email Normalization', () => {
    it('should trim email before rate limit check', async () => {
      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: '  user@example.com  ' });

      await waitFor(() => {
        expect(AsyncStorage.getItem).toHaveBeenCalledWith(
          'auth:password-reset:attempts:user@example.com'
        );
      });
    });

    it('should lowercase email before rate limit check', async () => {
      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'User@Example.COM' });

      await waitFor(() => {
        expect(AsyncStorage.getItem).toHaveBeenCalledWith(
          'auth:password-reset:attempts:user@example.com'
        );
      });
    });

    it('should trim and lowercase email before API call', async () => {
      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: '  User@Example.COM  ' });

      await waitFor(() => {
        expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
          'user@example.com',
          expect.any(Object)
        );
      });
    });

    it('should handle email with mixed case and spaces correctly', async () => {
      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: '   Test.User@EXAMPLE.com   ' });

      await waitFor(() => {
        expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
          'test.user@example.com',
          expect.any(Object)
        );
      });
    });

    it('should store attempts with normalized email', async () => {
      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: '  USER@EXAMPLE.COM  ' });

      await waitFor(() => {
        expect(AsyncStorage.setItem).toHaveBeenCalledWith(
          'auth:password-reset:attempts:user@example.com',
          expect.any(String)
        );
      });
    });

    it('should reject invalid email format', async () => {
      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'invalid-email' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(supabase.auth.resetPasswordForEmail).not.toHaveBeenCalled();
    });
  });

  describe('Rate Limiting - Allowed States', () => {
    it('should allow first request (0/5 attempts)', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'user@example.com' });

      await waitFor(() => {
        expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalled();
      });
    });

    it('should allow request with 1/5 attempts', async () => {
      const attempts = [currentTime - 1000];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(attempts));

      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'user@example.com' });

      await waitFor(() => {
        expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalled();
      });
    });

    it('should allow request with 4/5 attempts', async () => {
      const attempts = [
        currentTime - 4000,
        currentTime - 3000,
        currentTime - 2000,
        currentTime - 1000,
      ];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(attempts));

      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'user@example.com' });

      await waitFor(() => {
        expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalled();
      });
    });

    it('should record attempt to AsyncStorage', async () => {
      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'user@example.com' });

      await waitFor(() => {
        expect(AsyncStorage.setItem).toHaveBeenCalledWith(
          'auth:password-reset:attempts:user@example.com',
          expect.stringContaining(currentTime.toString())
        );
      });
    });

    it('should filter out expired attempts before checking limit', async () => {
      const oneHourAgo = currentTime - 3600000 - 10000; // Just over 1 hour ago
      const attempts = [oneHourAgo - 5000, oneHourAgo - 4000, oneHourAgo - 3000, oneHourAgo - 2000];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(attempts));

      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'user@example.com' });

      await waitFor(() => {
        expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalled();
      });
    });

    it('should allow request when AsyncStorage fails (fail-open)', async () => {
      (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('Storage error'));

      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'user@example.com' });

      await waitFor(() => {
        expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalled();
      });
    });
  });

  describe('Rate Limiting - Blocked States', () => {
    it('should block request when 5/5 attempts reached', async () => {
      const attempts = [
        currentTime - 5000,
        currentTime - 4000,
        currentTime - 3000,
        currentTime - 2000,
        currentTime - 1000,
      ];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(attempts));

      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'user@example.com' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(supabase.auth.resetPasswordForEmail).not.toHaveBeenCalled();
    });

    it('should include remaining seconds in rate limit error message', async () => {
      const attempts = [
        currentTime - 5000,
        currentTime - 4000,
        currentTime - 3000,
        currentTime - 2000,
        currentTime - 1000,
      ];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(attempts));

      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'user@example.com' });

      await waitFor(() => {
        expect(result.current.error?.message).toMatch(/Please wait \d+ seconds/);
      });
    });

    it('should log telemetry event when rate limited', async () => {
      const attempts = [
        currentTime - 5000,
        currentTime - 4000,
        currentTime - 3000,
        currentTime - 2000,
        currentTime - 1000,
      ];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(attempts));

      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'user@example.com' });

      await waitFor(() => {
        expect(telemetry.logAuthEvent).toHaveBeenCalledWith(
          'password-reset-failed',
          expect.objectContaining({
            errorCode: 'rate_limit_exceeded',
            outcome: 'failure',
          })
        );
      });
    });

    it('should not call API when rate limited', async () => {
      const attempts = [
        currentTime - 5000,
        currentTime - 4000,
        currentTime - 3000,
        currentTime - 2000,
        currentTime - 1000,
      ];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(attempts));

      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'user@example.com' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(supabase.auth.resetPasswordForEmail).not.toHaveBeenCalled();
    });

    it('should calculate remaining seconds correctly', async () => {
      const oldestAttempt = currentTime - 5000;
      const attempts = [
        oldestAttempt,
        currentTime - 4000,
        currentTime - 3000,
        currentTime - 2000,
        currentTime - 1000,
      ];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(attempts));

      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'user@example.com' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      // Remaining time = WINDOW_MS (3600000) - (currentTime - oldestAttempt)
      // = 3600000 - 5000 = 3595000 ms = 3595 seconds
      expect(result.current.error?.message).toContain('3595 seconds');
    });

    it('should enforce rate limit per normalized email', async () => {
      const attempts = [
        currentTime - 5000,
        currentTime - 4000,
        currentTime - 3000,
        currentTime - 2000,
        currentTime - 1000,
      ];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(attempts));

      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      // Try with different casing - should still be rate limited
      result.current.mutate({ email: 'USER@EXAMPLE.COM' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(AsyncStorage.getItem).toHaveBeenCalledWith(
        'auth:password-reset:attempts:user@example.com'
      );
    });
  });

  describe('Supabase API Invocation', () => {
    it('should call resetPasswordForEmail with normalized email', async () => {
      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'user@example.com' });

      await waitFor(() => {
        expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
          'user@example.com',
          expect.any(Object)
        );
      });
    });

    it('should include correct redirectTo parameter', async () => {
      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'user@example.com' });

      await waitFor(() => {
        expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('user@example.com', {
          redirectTo: 'maidrobe://reset-password',
        });
      });
    });

    it('should only call API when rate limit allows', async () => {
      const attempts = [
        currentTime - 5000,
        currentTime - 4000,
        currentTime - 3000,
        currentTime - 2000,
        currentTime - 1000,
      ];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(attempts));

      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'user@example.com' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(supabase.auth.resetPasswordForEmail).not.toHaveBeenCalled();
    });

    it('should call API with validated payload', async () => {
      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'valid@example.com' });

      await waitFor(() => {
        expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
          'valid@example.com',
          expect.objectContaining({
            redirectTo: 'maidrobe://reset-password',
          })
        );
      });
    });

    it('should not call API for invalid email', async () => {
      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'invalid' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(supabase.auth.resetPasswordForEmail).not.toHaveBeenCalled();
    });
  });

  describe('Error Classification - Network Errors', () => {
    it('should detect network error and throw to user', async () => {
      (supabase.auth.resetPasswordForEmail as jest.Mock).mockResolvedValue({
        data: null,
        error: new Error('Network request failed'),
      });

      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'user@example.com' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe('Network error. Please try again.');
    });

    it('should log telemetry for network error', async () => {
      (supabase.auth.resetPasswordForEmail as jest.Mock).mockResolvedValue({
        data: null,
        error: new Error('Network timeout'),
      });

      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'user@example.com' });

      await waitFor(() => {
        expect(telemetry.logAuthEvent).toHaveBeenCalledWith(
          'password-reset-failed',
          expect.objectContaining({
            outcome: 'failure',
          })
        );
      });
    });

    it('should classify fetch errors as network errors', async () => {
      (supabase.auth.resetPasswordForEmail as jest.Mock).mockResolvedValue({
        data: null,
        error: new Error('fetch failed'),
      });

      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'user@example.com' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe('Network error. Please try again.');
    });

    it('should track latency for network errors', async () => {
      (supabase.auth.resetPasswordForEmail as jest.Mock).mockResolvedValue({
        data: null,
        error: new Error('connection timeout'),
      });

      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'user@example.com' });

      await waitFor(() => {
        expect(telemetry.logAuthEvent).toHaveBeenCalledWith(
          'password-reset-failed',
          expect.objectContaining({
            latency: expect.any(Number),
          })
        );
      });
    });
  });

  describe('Error Classification - Server Errors', () => {
    it('should classify 500 error as server error and return success', async () => {
      (supabase.auth.resetPasswordForEmail as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'Internal Server Error 500', status: 500 },
      });

      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'user@example.com' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
    });

    it('should log internal error for server errors', async () => {
      (supabase.auth.resetPasswordForEmail as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'Server error 503', status: 503 },
      });

      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'user@example.com' });

      await waitFor(() => {
        expect(telemetry.logError).toHaveBeenCalled();
      });
    });

    it('should show console warning for hidden server errors', async () => {
      (supabase.auth.resetPasswordForEmail as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'Server error', status: 500 },
      });

      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'user@example.com' });

      await waitFor(() => {
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('showing success to prevent enumeration')
        );
      });
    });

    it('should log telemetry with actual outcome for hidden errors', async () => {
      (supabase.auth.resetPasswordForEmail as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'Server error', status: 502 },
      });

      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'user@example.com' });

      await waitFor(() => {
        expect(telemetry.logAuthEvent).toHaveBeenCalledWith(
          'password-reset-email-sent',
          expect.objectContaining({
            metadata: expect.objectContaining({
              actualOutcome: 'failed-but-hidden',
            }),
          })
        );
      });
    });
  });

  describe('Enumeration-Safe Responses', () => {
    it('should return success for valid email', async () => {
      (supabase.auth.resetPasswordForEmail as jest.Mock).mockResolvedValue({
        data: {},
        error: null,
      });

      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'valid@example.com' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
    });

    it('should return success for non-existent email (enumeration-safe)', async () => {
      (supabase.auth.resetPasswordForEmail as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'User not found', status: 404 },
      });

      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'nonexistent@example.com' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
    });

    it('should return success for server errors (enumeration-safe)', async () => {
      (supabase.auth.resetPasswordForEmail as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'Internal error', status: 500 },
      });

      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'user@example.com' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
    });

    it('should only throw network errors to user', async () => {
      (supabase.auth.resetPasswordForEmail as jest.Mock).mockResolvedValue({
        data: null,
        error: new Error('Network failed'),
      });

      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'user@example.com' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe('Network error. Please try again.');
    });

    it('should only throw rate limit errors to user', async () => {
      const attempts = [
        currentTime - 5000,
        currentTime - 4000,
        currentTime - 3000,
        currentTime - 2000,
        currentTime - 1000,
      ];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(attempts));

      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'user@example.com' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toMatch(/Too many requests/);
    });

    it('should not indicate email existence in responses', async () => {
      // Test with non-existent email (404 from Supabase)
      (supabase.auth.resetPasswordForEmail as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'User not found', status: 404 },
      });

      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'nonexistent@example.com' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Should not throw error that reveals email doesn't exist
      expect(result.current.error).toBeNull();
    });
  });

  describe('Telemetry Event Logging - Success', () => {
    it('should log password-reset-requested event', async () => {
      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'user@example.com' });

      await waitFor(() => {
        expect(telemetry.logAuthEvent).toHaveBeenCalledWith(
          'password-reset-requested',
          expect.objectContaining({
            outcome: 'requested',
          })
        );
      });
    });

    it('should log password-reset-email-sent event on success', async () => {
      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'user@example.com' });

      await waitFor(() => {
        expect(telemetry.logAuthEvent).toHaveBeenCalledWith(
          'password-reset-email-sent',
          expect.objectContaining({
            outcome: 'success',
          })
        );
      });
    });

    it('should include latency in success telemetry', async () => {
      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'user@example.com' });

      await waitFor(() => {
        expect(telemetry.logAuthEvent).toHaveBeenCalledWith(
          'password-reset-email-sent',
          expect.objectContaining({
            latency: expect.any(Number),
          })
        );
      });
    });

    it('should redact email in telemetry logs', async () => {
      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'sensitive@example.com' });

      await waitFor(() => {
        expect(telemetry.logAuthEvent).toHaveBeenCalled();
      });

      const calls = (telemetry.logAuthEvent as jest.Mock).mock.calls;
      calls.forEach((call) => {
        const eventData = call[1];
        if (eventData.metadata?.email) {
          expect(eventData.metadata.email).toBe('redacted');
        }
      });
    });
  });

  describe('Telemetry Event Logging - Failures', () => {
    it('should log password-reset-failed for rate limit', async () => {
      const attempts = [
        currentTime - 5000,
        currentTime - 4000,
        currentTime - 3000,
        currentTime - 2000,
        currentTime - 1000,
      ];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(attempts));

      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'user@example.com' });

      await waitFor(() => {
        expect(telemetry.logAuthEvent).toHaveBeenCalledWith(
          'password-reset-failed',
          expect.objectContaining({
            errorCode: 'rate_limit_exceeded',
          })
        );
      });
    });

    it('should log password-reset-failed for API errors', async () => {
      (supabase.auth.resetPasswordForEmail as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'Network error', status: null },
      });

      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'user@example.com' });

      await waitFor(() => {
        expect(telemetry.logAuthEvent).toHaveBeenCalledWith(
          'password-reset-failed',
          expect.objectContaining({
            outcome: 'failure',
          })
        );
      });
    });

    it('should include error code in failure telemetry', async () => {
      (supabase.auth.resetPasswordForEmail as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'Error', status: 429 },
      });

      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'user@example.com' });

      await waitFor(() => {
        expect(telemetry.logAuthEvent).toHaveBeenCalledWith(
          'password-reset-failed',
          expect.objectContaining({
            errorCode: '429',
          })
        );
      });
    });

    it('should track latency for failures', async () => {
      (supabase.auth.resetPasswordForEmail as jest.Mock).mockResolvedValue({
        data: null,
        error: new Error('Network error'),
      });

      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'user@example.com' });

      await waitFor(() => {
        expect(telemetry.logAuthEvent).toHaveBeenCalledWith(
          'password-reset-failed',
          expect.objectContaining({
            latency: expect.any(Number),
          })
        );
      });
    });

    it('should redact email in failure telemetry', async () => {
      const attempts = [
        currentTime - 5000,
        currentTime - 4000,
        currentTime - 3000,
        currentTime - 2000,
        currentTime - 1000,
      ];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(attempts));

      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'sensitive@example.com' });

      await waitFor(() => {
        expect(telemetry.logError).toHaveBeenCalled();
      });

      const errorCalls = (telemetry.logError as jest.Mock).mock.calls;
      errorCalls.forEach((call) => {
        const metadata = call[2]?.metadata;
        if (metadata?.email) {
          expect(metadata.email).toBe('redacted');
        }
      });
    });
  });

  describe('Request Validation', () => {
    it('should catch Zod validation errors', async () => {
      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      // Pass invalid payload (empty email will fail Zod validation)
      result.current.mutate({ email: '' } as unknown as { email: string });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });

    it('should log validation errors to telemetry', async () => {
      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: '' } as unknown as { email: string });

      await waitFor(() => {
        expect(telemetry.logError).toHaveBeenCalled();
      });
    });

    it('should show user-friendly message for validation errors', async () => {
      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: '' } as unknown as { email: string });

      await waitFor(() => {
        expect(result.current.error?.message).toBe('Error: user');
      });
    });

    it('should include validation errors in telemetry metadata', async () => {
      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: '' } as unknown as { email: string });

      await waitFor(() => {
        expect(telemetry.logError).toHaveBeenCalledWith(
          expect.any(Error),
          'user',
          expect.objectContaining({
            metadata: expect.objectContaining({
              validationErrors: expect.any(Array),
            }),
          })
        );
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty email', async () => {
      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: '' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(supabase.auth.resetPasswordForEmail).not.toHaveBeenCalled();
    });

    it('should handle very long email addresses', async () => {
      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      const longEmail = 'a'.repeat(200) + '@example.com';
      result.current.mutate({ email: longEmail });

      await waitFor(() => {
        expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalled();
      });
    });

    it('should handle email with special characters', async () => {
      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'user+test@example.com' });

      await waitFor(() => {
        expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
          'user+test@example.com',
          expect.any(Object)
        );
      });
    });

    it('should handle AsyncStorage read failure gracefully', async () => {
      (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('Read error'));

      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'user@example.com' });

      await waitFor(() => {
        expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalled();
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to read password reset attempts'),
        expect.any(Error)
      );
    });

    it('should handle AsyncStorage write failure gracefully', async () => {
      (AsyncStorage.setItem as jest.Mock).mockRejectedValue(new Error('Write error'));

      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'user@example.com' });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to write password reset attempts'),
        expect.any(Error)
      );
    });

    it('should handle unknown error types', async () => {
      (supabase.auth.resetPasswordForEmail as jest.Mock).mockRejectedValue('Unknown error string');

      const { result } = renderHook(() => useRequestPasswordReset(), { wrapper: createWrapper() });

      result.current.mutate({ email: 'user@example.com' });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe('Error: server');
    });
  });
});
