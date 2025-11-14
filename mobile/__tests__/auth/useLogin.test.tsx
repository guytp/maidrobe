import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useLogin, resetRateLimiter } from '../../src/features/auth/api/useLogin';
import { supabase } from '../../src/services/supabase';
import * as featureFlags from '../../src/core/featureFlags';
import { useStore } from '../../src/core/state/store';

// Mock dependencies
jest.mock('../../src/services/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: jest.fn(),
    },
  },
}));

jest.mock('../../src/core/featureFlags', () => ({
  checkFeatureFlag: jest.fn(),
}));

jest.mock('../../src/core/state/store', () => ({
  useStore: {
    getState: jest.fn(() => ({
      setUser: jest.fn(),
      clearUser: jest.fn(),
    })),
  },
}));

describe('useLogin', () => {
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
    resetRateLimiter();

    // Default mock: feature flag enabled
    (featureFlags.checkFeatureFlag as jest.Mock).mockResolvedValue({
      enabled: true,
      requiresUpdate: false,
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('should successfully login with valid credentials', async () => {
    const mockResponse = {
      user: {
        id: 'user-123',
        email: 'test@example.com',
        email_confirmed_at: '2024-01-01T00:00:00Z',
      },
      session: {
        access_token: 'access-token-123',
        refresh_token: 'refresh-token-123',
      },
    };

    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
      data: mockResponse,
      error: null,
    });

    const { result } = renderHook(() => useLogin(), { wrapper: createWrapper() });

    result.current.mutate({ email: 'test@example.com', password: 'password123' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
    });

    expect(useStore.getState().setUser).toHaveBeenCalledWith({
      id: 'user-123',
      email: 'test@example.com',
      emailVerified: true,
    });
  });

  it('should handle invalid credentials error', async () => {
    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'Invalid login credentials', status: 400 },
    });

    const { result } = renderHook(() => useLogin(), { wrapper: createWrapper() });

    result.current.mutate({ email: 'test@example.com', password: 'wrongpassword' });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe('Invalid email or password.');
  });

  it('should handle network errors', async () => {
    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'Network request failed', status: 0 },
    });

    const { result } = renderHook(() => useLogin(), { wrapper: createWrapper() });

    result.current.mutate({ email: 'test@example.com', password: 'password123' });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe('Network error. Please try again.');
  });

  it('should check feature flag before login', async () => {
    const mockResponse = {
      user: {
        id: 'user-123',
        email: 'test@example.com',
        email_confirmed_at: null,
      },
      session: {
        access_token: 'access-token-123',
        refresh_token: 'refresh-token-123',
      },
    };

    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
      data: mockResponse,
      error: null,
    });

    const { result } = renderHook(() => useLogin(), { wrapper: createWrapper() });

    result.current.mutate({ email: 'test@example.com', password: 'password123' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(featureFlags.checkFeatureFlag).toHaveBeenCalledWith('auth.login');
  });

  it('should block login when version update required', async () => {
    (featureFlags.checkFeatureFlag as jest.Mock).mockResolvedValue({
      enabled: true,
      requiresUpdate: true,
      message: 'Client version too old',
    });

    const { result } = renderHook(() => useLogin(), { wrapper: createWrapper() });

    result.current.mutate({ email: 'test@example.com', password: 'password123' });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe('Please update your app.');
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('should block login when feature disabled', async () => {
    (featureFlags.checkFeatureFlag as jest.Mock).mockResolvedValue({
      enabled: false,
      requiresUpdate: false,
    });

    const { result } = renderHook(() => useLogin(), { wrapper: createWrapper() });

    result.current.mutate({ email: 'test@example.com', password: 'password123' });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toContain('temporarily unavailable');
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('should enforce rate limiting after 5 attempts', async () => {
    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'Invalid login credentials', status: 400 },
    });

    const { result } = renderHook(() => useLogin(), { wrapper: createWrapper() });

    // Make 5 attempts
    for (let i = 0; i < 5; i++) {
      result.current.mutate({ email: 'test@example.com', password: 'wrongpassword' });
      await waitFor(() => expect(result.current.isError).toBe(true));
      result.current.reset();
    }

    // 6th attempt should be rate limited
    result.current.mutate({ email: 'test@example.com', password: 'wrongpassword' });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toContain('Too many login attempts');
    expect(result.current.error?.message).toContain('seconds');
  });

  it('should validate request with Zod', async () => {
    const { result } = renderHook(() => useLogin(), { wrapper: createWrapper() });

    // Invalid email format
    result.current.mutate({ email: 'invalid-email', password: 'password123' });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('should handle empty password', async () => {
    const { result } = renderHook(() => useLogin(), { wrapper: createWrapper() });

    result.current.mutate({ email: 'test@example.com', password: '' });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('should handle missing session in response', async () => {
    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
      data: {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          email_confirmed_at: null,
        },
        session: null,
      },
      error: null,
    });

    const { result } = renderHook(() => useLogin(), { wrapper: createWrapper() });

    result.current.mutate({ email: 'test@example.com', password: 'password123' });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
