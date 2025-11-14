import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useLogout } from '../../src/features/auth/api/useLogout';
import { supabase } from '../../src/services/supabase';
import * as featureFlags from '../../src/core/featureFlags';
import { useStore } from '../../src/core/state/store';

// Mock dependencies
jest.mock('../../src/services/supabase', () => ({
  supabase: {
    auth: {
      signOut: jest.fn(),
    },
  },
}));

jest.mock('../../src/core/featureFlags', () => ({
  checkFeatureFlag: jest.fn(),
}));

jest.mock('../../src/core/state/store', () => ({
  useStore: {
    getState: jest.fn(() => ({
      clearUser: jest.fn(),
    })),
  },
}));

describe('useLogout', () => {
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

    // Default mock: feature flag enabled
    (featureFlags.checkFeatureFlag as jest.Mock).mockResolvedValue({
      enabled: true,
      requiresUpdate: false,
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('should successfully logout', async () => {
    (supabase.auth.signOut as jest.Mock).mockResolvedValue({
      error: null,
    });

    const { result } = renderHook(() => useLogout(), { wrapper: createWrapper() });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(supabase.auth.signOut).toHaveBeenCalled();
    expect(useStore.getState().clearUser).toHaveBeenCalled();
  });

  it('should clear local state even on API error', async () => {
    (supabase.auth.signOut as jest.Mock).mockResolvedValue({
      error: { message: 'Network error', status: 0 },
    });

    const { result } = renderHook(() => useLogout(), { wrapper: createWrapper() });

    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));

    // Should still clear user locally
    expect(useStore.getState().clearUser).toHaveBeenCalled();
  });

  it('should check feature flag before logout', async () => {
    (supabase.auth.signOut as jest.Mock).mockResolvedValue({
      error: null,
    });

    const { result } = renderHook(() => useLogout(), { wrapper: createWrapper() });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(featureFlags.checkFeatureFlag).toHaveBeenCalledWith('auth.logout');
  });

  it('should proceed with logout even if feature flag disabled', async () => {
    (featureFlags.checkFeatureFlag as jest.Mock).mockResolvedValue({
      enabled: false,
      requiresUpdate: false,
    });

    (supabase.auth.signOut as jest.Mock).mockResolvedValue({
      error: null,
    });

    const { result } = renderHook(() => useLogout(), { wrapper: createWrapper() });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Logout should proceed despite flag being disabled (security reasons)
    expect(supabase.auth.signOut).toHaveBeenCalled();
    expect(useStore.getState().clearUser).toHaveBeenCalled();
  });

  it('should handle network errors gracefully', async () => {
    (supabase.auth.signOut as jest.Mock).mockResolvedValue({
      error: { message: 'Network request failed', status: 0 },
    });

    const { result } = renderHook(() => useLogout(), { wrapper: createWrapper() });

    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toContain('connect');
    // User should still be cleared locally
    expect(useStore.getState().clearUser).toHaveBeenCalled();
  });

  it('should handle server errors', async () => {
    (supabase.auth.signOut as jest.Mock).mockResolvedValue({
      error: { message: 'Internal server error', status: 500 },
    });

    const { result } = renderHook(() => useLogout(), { wrapper: createWrapper() });

    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toContain('temporarily unavailable');
    // User should still be cleared locally
    expect(useStore.getState().clearUser).toHaveBeenCalled();
  });

  it('should clear user state in error handler as fail-safe', async () => {
    (supabase.auth.signOut as jest.Mock).mockRejectedValue(new Error('Unexpected error'));

    const { result } = renderHook(() => useLogout(), { wrapper: createWrapper() });

    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));

    // Should clear user even on unexpected errors (fail-safe)
    expect(useStore.getState().clearUser).toHaveBeenCalled();
  });
});
