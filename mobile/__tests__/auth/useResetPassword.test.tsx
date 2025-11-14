import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useResetPassword } from '../../src/features/auth/api/useResetPassword';
import { supabase } from '../../src/services/supabase';
import * as telemetry from '../../src/core/telemetry';
import * as passwordReuse from '../../src/features/auth/utils/passwordReuse';

// Mock dependencies
jest.mock('../../src/services/supabase', () => ({
  supabase: {
    auth: {
      setSession: jest.fn(),
      updateUser: jest.fn(),
    },
  },
}));

jest.mock('../../src/core/telemetry', () => ({
  logError: jest.fn(),
  logAuthEvent: jest.fn(),
  getUserFriendlyMessage: jest.fn((classification: string) => `Error: ${classification}`),
}));

jest.mock('../../src/features/auth/utils/passwordReuse', () => ({
  checkPasswordReuse: jest.fn(),
}));

jest.mock('../../src/core/i18n', () => ({
  t: jest.fn((key: string) => {
    const messages: Record<string, string> = {
      'screens.auth.resetPassword.errors.tokenInvalid': 'Token is invalid or expired',
      'screens.auth.resetPassword.errors.weakPassword': 'Password does not meet requirements',
      'screens.auth.resetPassword.errors.passwordReused':
        'Cannot reuse one of your last 3 passwords',
      'screens.auth.resetPassword.errors.passwordMismatch': 'Passwords do not match',
      'screens.auth.resetPassword.errors.networkError': 'Network error occurred',
    };
    return messages[key] || key;
  }),
}));

describe('useResetPassword', () => {
  let queryClient: QueryClient;

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
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('Password Validation Behavior', () => {
    it('should fail when password is too short (< 8 characters)', async () => {
      const { result } = renderHook(() => useResetPassword(), { wrapper: createWrapper() });

      result.current.mutate({
        accessToken: 'valid-access-token',
        refreshToken: 'valid-refresh-token',
        password: 'Short1!',
        confirmPassword: 'Short1!',
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe('Password does not meet requirements');
      expect(telemetry.logError).toHaveBeenCalledWith(
        expect.any(Error),
        'user',
        expect.objectContaining({
          feature: 'auth',
          operation: 'password-reset',
          metadata: expect.objectContaining({
            reason: 'password_policy_violation',
          }),
        })
      );
      expect(telemetry.logAuthEvent).toHaveBeenCalledWith(
        'password-reset-failed',
        expect.objectContaining({
          errorCode: 'password_policy_violation',
          outcome: 'failure',
        })
      );
    });

    it('should fail when password is missing uppercase letter', async () => {
      const { result } = renderHook(() => useResetPassword(), { wrapper: createWrapper() });

      result.current.mutate({
        accessToken: 'valid-access-token',
        refreshToken: 'valid-refresh-token',
        password: 'password123!',
        confirmPassword: 'password123!',
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe('Password does not meet requirements');
    });

    it('should fail when password is missing lowercase letter', async () => {
      const { result } = renderHook(() => useResetPassword(), { wrapper: createWrapper() });

      result.current.mutate({
        accessToken: 'valid-access-token',
        refreshToken: 'valid-refresh-token',
        password: 'PASSWORD123!',
        confirmPassword: 'PASSWORD123!',
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe('Password does not meet requirements');
    });

    it('should fail when password is missing number', async () => {
      const { result } = renderHook(() => useResetPassword(), { wrapper: createWrapper() });

      result.current.mutate({
        accessToken: 'valid-access-token',
        refreshToken: 'valid-refresh-token',
        password: 'PasswordOnly!',
        confirmPassword: 'PasswordOnly!',
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe('Password does not meet requirements');
    });

    it('should fail when password is missing symbol', async () => {
      const { result } = renderHook(() => useResetPassword(), { wrapper: createWrapper() });

      result.current.mutate({
        accessToken: 'valid-access-token',
        refreshToken: 'valid-refresh-token',
        password: 'Password123',
        confirmPassword: 'Password123',
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe('Password does not meet requirements');
    });

    it('should pass validation with valid password meeting all requirements', async () => {
      (passwordReuse.checkPasswordReuse as jest.Mock).mockResolvedValue({
        isReused: false,
      });

      (supabase.auth.setSession as jest.Mock).mockResolvedValue({
        data: { session: { access_token: 'token' } },
        error: null,
      });

      (supabase.auth.updateUser as jest.Mock).mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      const { result } = renderHook(() => useResetPassword(), { wrapper: createWrapper() });

      result.current.mutate({
        accessToken: 'valid-access-token',
        refreshToken: 'valid-refresh-token',
        password: 'ValidPass123!',
        confirmPassword: 'ValidPass123!',
        userId: 'user-123',
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.success).toBe(true);
    });
  });

  describe('Password Mismatch', () => {
    it('should fail when password and confirmPassword do not match', async () => {
      const { result } = renderHook(() => useResetPassword(), { wrapper: createWrapper() });

      result.current.mutate({
        accessToken: 'valid-access-token',
        refreshToken: 'valid-refresh-token',
        password: 'ValidPass123!',
        confirmPassword: 'DifferentPass123!',
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe('Passwords do not match');
      expect(telemetry.logError).toHaveBeenCalledWith(
        expect.any(Error),
        'user',
        expect.objectContaining({
          feature: 'auth',
          operation: 'password-reset',
        })
      );
    });
  });

  describe('Password Reuse Checks', () => {
    it('should fail when password is reused (isReused: true)', async () => {
      (passwordReuse.checkPasswordReuse as jest.Mock).mockResolvedValue({
        isReused: true,
      });

      const { result } = renderHook(() => useResetPassword(), { wrapper: createWrapper() });

      result.current.mutate({
        accessToken: 'valid-access-token',
        refreshToken: 'valid-refresh-token',
        password: 'ValidPass123!',
        confirmPassword: 'ValidPass123!',
        userId: 'user-123',
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe('Cannot reuse one of your last 3 passwords');
      expect(passwordReuse.checkPasswordReuse).toHaveBeenCalledWith('user-123', 'ValidPass123!');
      expect(telemetry.logError).toHaveBeenCalledWith(
        expect.any(Error),
        'user',
        expect.objectContaining({
          metadata: expect.objectContaining({
            reason: 'password_reused',
          }),
        })
      );
      expect(telemetry.logAuthEvent).toHaveBeenCalledWith(
        'password-reset-failed',
        expect.objectContaining({
          errorCode: 'password_reused',
          outcome: 'failure',
        })
      );
    });

    it('should continue when password is not reused (isReused: false)', async () => {
      (passwordReuse.checkPasswordReuse as jest.Mock).mockResolvedValue({
        isReused: false,
      });

      (supabase.auth.setSession as jest.Mock).mockResolvedValue({
        data: { session: { access_token: 'token' } },
        error: null,
      });

      (supabase.auth.updateUser as jest.Mock).mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      const { result } = renderHook(() => useResetPassword(), { wrapper: createWrapper() });

      result.current.mutate({
        accessToken: 'valid-access-token',
        refreshToken: 'valid-refresh-token',
        password: 'ValidPass123!',
        confirmPassword: 'ValidPass123!',
        userId: 'user-123',
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(passwordReuse.checkPasswordReuse).toHaveBeenCalledWith('user-123', 'ValidPass123!');
      expect(result.current.data?.success).toBe(true);
    });

    it('should skip reuse check when userId is not provided', async () => {
      (supabase.auth.setSession as jest.Mock).mockResolvedValue({
        data: { session: { access_token: 'token' } },
        error: null,
      });

      (supabase.auth.updateUser as jest.Mock).mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      const { result } = renderHook(() => useResetPassword(), { wrapper: createWrapper() });

      result.current.mutate({
        accessToken: 'valid-access-token',
        refreshToken: 'valid-refresh-token',
        password: 'ValidPass123!',
        confirmPassword: 'ValidPass123!',
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(passwordReuse.checkPasswordReuse).not.toHaveBeenCalled();
      expect(result.current.data?.success).toBe(true);
    });

    it('should continue when reuse check returns error but isReused: false (fail-open)', async () => {
      (passwordReuse.checkPasswordReuse as jest.Mock).mockResolvedValue({
        isReused: false,
        error: 'Unable to verify password history',
      });

      (supabase.auth.setSession as jest.Mock).mockResolvedValue({
        data: { session: { access_token: 'token' } },
        error: null,
      });

      (supabase.auth.updateUser as jest.Mock).mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      const { result } = renderHook(() => useResetPassword(), { wrapper: createWrapper() });

      result.current.mutate({
        accessToken: 'valid-access-token',
        refreshToken: 'valid-refresh-token',
        password: 'ValidPass123!',
        confirmPassword: 'ValidPass123!',
        userId: 'user-123',
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data?.success).toBe(true);
    });
  });

  describe('Token Verification Logic', () => {
    it('should fail when accessToken is missing', async () => {
      const { result } = renderHook(() => useResetPassword(), { wrapper: createWrapper() });

      result.current.mutate({
        accessToken: '',
        refreshToken: 'valid-refresh-token',
        password: 'ValidPass123!',
        confirmPassword: 'ValidPass123!',
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(telemetry.logError).toHaveBeenCalled();
    });

    it('should fail when refreshToken is missing', async () => {
      const { result } = renderHook(() => useResetPassword(), { wrapper: createWrapper() });

      result.current.mutate({
        accessToken: 'valid-access-token',
        refreshToken: '',
        password: 'ValidPass123!',
        confirmPassword: 'ValidPass123!',
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(telemetry.logError).toHaveBeenCalled();
    });

    it('should fail when session establishment fails (setSession error)', async () => {
      (passwordReuse.checkPasswordReuse as jest.Mock).mockResolvedValue({
        isReused: false,
      });

      (supabase.auth.setSession as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'Invalid token', status: 401 },
      });

      const { result } = renderHook(() => useResetPassword(), { wrapper: createWrapper() });

      result.current.mutate({
        accessToken: 'invalid-token',
        refreshToken: 'invalid-refresh-token',
        password: 'ValidPass123!',
        confirmPassword: 'ValidPass123!',
        userId: 'user-123',
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe('Token is invalid or expired');
      expect(telemetry.logError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Invalid token' }),
        'user',
        expect.objectContaining({
          metadata: expect.objectContaining({
            step: 'session_establishment',
          }),
        })
      );
      expect(telemetry.logAuthEvent).toHaveBeenCalledWith(
        'password-reset-failed',
        expect.objectContaining({
          errorCode: '401',
          outcome: 'failure',
        })
      );
    });

    it('should succeed with valid tokens and session establishment', async () => {
      (passwordReuse.checkPasswordReuse as jest.Mock).mockResolvedValue({
        isReused: false,
      });

      (supabase.auth.setSession as jest.Mock).mockResolvedValue({
        data: { session: { access_token: 'valid-token' } },
        error: null,
      });

      (supabase.auth.updateUser as jest.Mock).mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      const { result } = renderHook(() => useResetPassword(), { wrapper: createWrapper() });

      result.current.mutate({
        accessToken: 'valid-access-token',
        refreshToken: 'valid-refresh-token',
        password: 'ValidPass123!',
        confirmPassword: 'ValidPass123!',
        userId: 'user-123',
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(supabase.auth.setSession).toHaveBeenCalledWith({
        access_token: 'valid-access-token',
        refresh_token: 'valid-refresh-token',
      });
      expect(result.current.data?.success).toBe(true);
    });
  });

  describe('Password Update Flow', () => {
    it('should fail when updateUser returns error', async () => {
      (passwordReuse.checkPasswordReuse as jest.Mock).mockResolvedValue({
        isReused: false,
      });

      (supabase.auth.setSession as jest.Mock).mockResolvedValue({
        data: { session: { access_token: 'token' } },
        error: null,
      });

      (supabase.auth.updateUser as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'Update failed', status: 500 },
      });

      const { result } = renderHook(() => useResetPassword(), { wrapper: createWrapper() });

      result.current.mutate({
        accessToken: 'valid-access-token',
        refreshToken: 'valid-refresh-token',
        password: 'ValidPass123!',
        confirmPassword: 'ValidPass123!',
        userId: 'user-123',
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(telemetry.logError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Update failed' }),
        'server',
        expect.objectContaining({
          metadata: expect.objectContaining({
            step: 'password_update',
          }),
        })
      );
      expect(telemetry.logAuthEvent).toHaveBeenCalledWith(
        'password-reset-failed',
        expect.objectContaining({
          errorCode: '500',
          outcome: 'failure',
        })
      );
    });

    it('should call updateUser with correct password', async () => {
      (passwordReuse.checkPasswordReuse as jest.Mock).mockResolvedValue({
        isReused: false,
      });

      (supabase.auth.setSession as jest.Mock).mockResolvedValue({
        data: { session: { access_token: 'token' } },
        error: null,
      });

      (supabase.auth.updateUser as jest.Mock).mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      const { result } = renderHook(() => useResetPassword(), { wrapper: createWrapper() });

      result.current.mutate({
        accessToken: 'valid-access-token',
        refreshToken: 'valid-refresh-token',
        password: 'NewValidPass123!',
        confirmPassword: 'NewValidPass123!',
        userId: 'user-123',
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(supabase.auth.updateUser).toHaveBeenCalledWith({
        password: 'NewValidPass123!',
      });
    });
  });

  describe('Error Classification', () => {
    it('should classify network errors correctly', async () => {
      (passwordReuse.checkPasswordReuse as jest.Mock).mockResolvedValue({
        isReused: false,
      });

      (supabase.auth.setSession as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'Network request failed' },
      });

      const { result } = renderHook(() => useResetPassword(), { wrapper: createWrapper() });

      result.current.mutate({
        accessToken: 'valid-access-token',
        refreshToken: 'valid-refresh-token',
        password: 'ValidPass123!',
        confirmPassword: 'ValidPass123!',
        userId: 'user-123',
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(telemetry.logError).toHaveBeenCalledWith(
        expect.any(Object),
        'network',
        expect.any(Object)
      );
    });

    it('should classify server errors (500) correctly', async () => {
      (passwordReuse.checkPasswordReuse as jest.Mock).mockResolvedValue({
        isReused: false,
      });

      (supabase.auth.setSession as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'Internal server error 500' },
      });

      const { result } = renderHook(() => useResetPassword(), { wrapper: createWrapper() });

      result.current.mutate({
        accessToken: 'valid-access-token',
        refreshToken: 'valid-refresh-token',
        password: 'ValidPass123!',
        confirmPassword: 'ValidPass123!',
        userId: 'user-123',
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(telemetry.logError).toHaveBeenCalledWith(
        expect.any(Object),
        'server',
        expect.any(Object)
      );
    });

    it('should classify token errors as user errors', async () => {
      (passwordReuse.checkPasswordReuse as jest.Mock).mockResolvedValue({
        isReused: false,
      });

      (supabase.auth.setSession as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'Token expired' },
      });

      const { result } = renderHook(() => useResetPassword(), { wrapper: createWrapper() });

      result.current.mutate({
        accessToken: 'expired-token',
        refreshToken: 'valid-refresh-token',
        password: 'ValidPass123!',
        confirmPassword: 'ValidPass123!',
        userId: 'user-123',
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(telemetry.logError).toHaveBeenCalledWith(
        expect.any(Object),
        'user',
        expect.any(Object)
      );
    });

    it('should classify validation errors as user errors', async () => {
      const { result } = renderHook(() => useResetPassword(), { wrapper: createWrapper() });

      result.current.mutate({
        accessToken: 'valid-access-token',
        refreshToken: 'valid-refresh-token',
        password: 'weak',
        confirmPassword: 'weak',
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(telemetry.logError).toHaveBeenCalledWith(
        expect.any(Error),
        'user',
        expect.objectContaining({
          metadata: expect.objectContaining({
            reason: 'password_policy_violation',
          }),
        })
      );
    });
  });

  describe('Telemetry Events', () => {
    it('should emit password-reset-succeeded event on success', async () => {
      (passwordReuse.checkPasswordReuse as jest.Mock).mockResolvedValue({
        isReused: false,
      });

      (supabase.auth.setSession as jest.Mock).mockResolvedValue({
        data: { session: { access_token: 'token' } },
        error: null,
      });

      (supabase.auth.updateUser as jest.Mock).mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      const { result } = renderHook(() => useResetPassword(), { wrapper: createWrapper() });

      result.current.mutate({
        accessToken: 'valid-access-token',
        refreshToken: 'valid-refresh-token',
        password: 'ValidPass123!',
        confirmPassword: 'ValidPass123!',
        userId: 'user-123',
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(telemetry.logAuthEvent).toHaveBeenCalledWith(
        'password-reset-succeeded',
        expect.objectContaining({
          outcome: 'success',
          latency: expect.any(Number),
          metadata: expect.objectContaining({
            userId: 'user-123',
          }),
        })
      );
    });

    it('should emit password-reset-failed event on validation failure', async () => {
      const { result } = renderHook(() => useResetPassword(), { wrapper: createWrapper() });

      result.current.mutate({
        accessToken: 'valid-access-token',
        refreshToken: 'valid-refresh-token',
        password: 'short',
        confirmPassword: 'short',
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(telemetry.logAuthEvent).toHaveBeenCalledWith(
        'password-reset-failed',
        expect.objectContaining({
          errorCode: 'password_policy_violation',
          outcome: 'failure',
          latency: expect.any(Number),
        })
      );
    });

    it('should emit password-reset-failed event on password reuse', async () => {
      (passwordReuse.checkPasswordReuse as jest.Mock).mockResolvedValue({
        isReused: true,
      });

      const { result } = renderHook(() => useResetPassword(), { wrapper: createWrapper() });

      result.current.mutate({
        accessToken: 'valid-access-token',
        refreshToken: 'valid-refresh-token',
        password: 'ValidPass123!',
        confirmPassword: 'ValidPass123!',
        userId: 'user-123',
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(telemetry.logAuthEvent).toHaveBeenCalledWith(
        'password-reset-failed',
        expect.objectContaining({
          errorCode: 'password_reused',
          outcome: 'failure',
          latency: expect.any(Number),
        })
      );
    });

    it('should track latency in telemetry events', async () => {
      (passwordReuse.checkPasswordReuse as jest.Mock).mockResolvedValue({
        isReused: false,
      });

      (supabase.auth.setSession as jest.Mock).mockResolvedValue({
        data: { session: { access_token: 'token' } },
        error: null,
      });

      (supabase.auth.updateUser as jest.Mock).mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      const { result } = renderHook(() => useResetPassword(), { wrapper: createWrapper() });

      result.current.mutate({
        accessToken: 'valid-access-token',
        refreshToken: 'valid-refresh-token',
        password: 'ValidPass123!',
        confirmPassword: 'ValidPass123!',
        userId: 'user-123',
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(telemetry.logAuthEvent).toHaveBeenCalledWith(
        'password-reset-succeeded',
        expect.objectContaining({
          latency: expect.any(Number),
        })
      );

      const call = (telemetry.logAuthEvent as jest.Mock).mock.calls[0];
      expect(call[1].latency).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Success Flow', () => {
    it('should complete full success flow with all checks passing', async () => {
      (passwordReuse.checkPasswordReuse as jest.Mock).mockResolvedValue({
        isReused: false,
      });

      (supabase.auth.setSession as jest.Mock).mockResolvedValue({
        data: { session: { access_token: 'valid-token' } },
        error: null,
      });

      (supabase.auth.updateUser as jest.Mock).mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null,
      });

      const { result } = renderHook(() => useResetPassword(), { wrapper: createWrapper() });

      result.current.mutate({
        accessToken: 'valid-access-token',
        refreshToken: 'valid-refresh-token',
        password: 'ValidPass123!',
        confirmPassword: 'ValidPass123!',
        userId: 'user-123',
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Verify password validation passed (no error logged)
      const errorCalls = (telemetry.logError as jest.Mock).mock.calls;
      expect(errorCalls.length).toBe(0);

      // Verify password reuse check was called
      expect(passwordReuse.checkPasswordReuse).toHaveBeenCalledWith('user-123', 'ValidPass123!');

      // Verify session establishment
      expect(supabase.auth.setSession).toHaveBeenCalledWith({
        access_token: 'valid-access-token',
        refresh_token: 'valid-refresh-token',
      });

      // Verify password update
      expect(supabase.auth.updateUser).toHaveBeenCalledWith({
        password: 'ValidPass123!',
      });

      // Verify success telemetry
      expect(telemetry.logAuthEvent).toHaveBeenCalledWith(
        'password-reset-succeeded',
        expect.objectContaining({
          outcome: 'success',
        })
      );

      // Verify return value
      expect(result.current.data).toEqual({ success: true });
    });

    it('should succeed without userId (skip reuse check)', async () => {
      (supabase.auth.setSession as jest.Mock).mockResolvedValue({
        data: { session: { access_token: 'valid-token' } },
        error: null,
      });

      (supabase.auth.updateUser as jest.Mock).mockResolvedValue({
        data: { user: { id: 'user-456' } },
        error: null,
      });

      const { result } = renderHook(() => useResetPassword(), { wrapper: createWrapper() });

      result.current.mutate({
        accessToken: 'valid-access-token',
        refreshToken: 'valid-refresh-token',
        password: 'ValidPass123!',
        confirmPassword: 'ValidPass123!',
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(passwordReuse.checkPasswordReuse).not.toHaveBeenCalled();
      expect(result.current.data).toEqual({ success: true });
    });
  });
});
