import { renderHook, waitFor } from '@testing-library/react-native';
import { useAuthStateListener } from '../../src/features/auth/hooks/useAuthStateListener';
import { supabase } from '../../src/services/supabase';
import { useStore } from '../../src/core/state/store';

// Mock supabase
jest.mock('../../src/services/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(),
      refreshSession: jest.fn(),
    },
  },
}));

// Mock expo-router
const mockReplace = jest.fn();
const mockSegments = ['auth', 'verify'];

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
  useSegments: () => mockSegments,
}));

// Mock telemetry
jest.mock('../../src/core/telemetry', () => ({
  logError: jest.fn(),
}));

// Mock store
jest.mock('../../src/core/state/store', () => ({
  useStore: jest.fn(),
}));

describe('useAuthStateListener', () => {
  let mockSetUser: jest.Mock;
  let mockUpdateEmailVerified: jest.Mock;
  let mockClearUser: jest.Mock;
  let mockSetInitialized: jest.Mock;
  let mockSetTokenMetadata: jest.Mock;
  let mockSubscription: { unsubscribe: jest.Mock };

  beforeEach(() => {
    mockSetUser = jest.fn();
    mockUpdateEmailVerified = jest.fn();
    mockClearUser = jest.fn();
    mockSetInitialized = jest.fn();
    mockSetTokenMetadata = jest.fn();
    mockSubscription = { unsubscribe: jest.fn() };

    // Setup store mock
    (useStore as unknown as jest.Mock).mockImplementation((selector) =>
      selector({
        user: null,
        isInitialized: false,
        setUser: mockSetUser,
        updateEmailVerified: mockUpdateEmailVerified,
        clearUser: mockClearUser,
        setInitialized: mockSetInitialized,
        setTokenMetadata: mockSetTokenMetadata,
      })
    );

    // Setup auth mock
    (supabase.auth.onAuthStateChange as jest.Mock).mockReturnValue({
      data: { subscription: mockSubscription },
    });

    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: null },
      error: null,
    });

    (supabase.auth.refreshSession as jest.Mock).mockResolvedValue({
      data: { session: {} },
      error: null,
    });

    mockReplace.mockClear();
    jest.clearAllMocks();
  });

  it('should subscribe to auth state changes on mount', () => {
    renderHook(() => useAuthStateListener());

    expect(supabase.auth.onAuthStateChange).toHaveBeenCalledWith(expect.any(Function));
  });

  it('should fetch initial session on mount', async () => {
    renderHook(() => useAuthStateListener());

    await waitFor(() => {
      expect(supabase.auth.getSession).toHaveBeenCalled();
    });
  });

  it('should set user from initial session if exists', async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: {
        session: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            email_confirmed_at: '2024-01-01T00:00:00Z',
          },
        },
      },
      error: null,
    });

    renderHook(() => useAuthStateListener());

    await waitFor(() => {
      expect(mockSetUser).toHaveBeenCalledWith({
        id: 'user-123',
        email: 'test@example.com',
        emailVerified: true,
      });
    });
  });

  it('should handle SIGNED_IN event', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let authCallback: (event: string, session: any) => void;

    (supabase.auth.onAuthStateChange as jest.Mock).mockImplementation((callback) => {
      authCallback = callback;
      return { data: { subscription: mockSubscription } };
    });

    renderHook(() => useAuthStateListener());

    const session = {
      user: {
        id: 'user-123',
        email: 'test@example.com',
        email_confirmed_at: null,
      },
    };

    await waitFor(() => {
      authCallback('SIGNED_IN', session);
    });

    await waitFor(() => {
      expect(mockSetUser).toHaveBeenCalledWith({
        id: 'user-123',
        email: 'test@example.com',
        emailVerified: false,
      });
    });
  });

  it('should handle USER_UPDATED event with email verification', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let authCallback: (event: string, session: any) => void;

    (supabase.auth.onAuthStateChange as jest.Mock).mockImplementation((callback) => {
      authCallback = callback;
      return { data: { subscription: mockSubscription } };
    });

    renderHook(() => useAuthStateListener());

    const session = {
      user: {
        id: 'user-123',
        email: 'test@example.com',
        email_confirmed_at: '2024-01-01T00:00:00Z',
      },
    };

    await waitFor(() => {
      authCallback('USER_UPDATED', session);
    });

    await waitFor(() => {
      expect(mockSetUser).toHaveBeenCalledWith({
        id: 'user-123',
        email: 'test@example.com',
        emailVerified: true,
      });
      expect(supabase.auth.refreshSession).toHaveBeenCalled();
    });
  });

  it('should navigate to home when email verified on verify screen', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let authCallback: (event: string, session: any) => void;

    (supabase.auth.onAuthStateChange as jest.Mock).mockImplementation((callback) => {
      authCallback = callback;
      return { data: { subscription: mockSubscription } };
    });

    renderHook(() => useAuthStateListener());

    const session = {
      user: {
        id: 'user-123',
        email: 'test@example.com',
        email_confirmed_at: '2024-01-01T00:00:00Z',
      },
    };

    await waitFor(() => {
      authCallback('USER_UPDATED', session);
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/home');
    });
  });

  it('should handle SIGNED_OUT event', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let authCallback: (event: string, session: any) => void;

    (supabase.auth.onAuthStateChange as jest.Mock).mockImplementation((callback) => {
      authCallback = callback;
      return { data: { subscription: mockSubscription } };
    });

    renderHook(() => useAuthStateListener());

    await waitFor(() => {
      authCallback('SIGNED_OUT', null);
    });

    await waitFor(() => {
      expect(mockClearUser).toHaveBeenCalled();
    });
  });

  it('should unsubscribe on unmount', () => {
    const { unmount } = renderHook(() => useAuthStateListener());

    unmount();

    expect(mockSubscription.unsubscribe).toHaveBeenCalled();
  });

  it('should handle TOKEN_REFRESHED event', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let authCallback: (event: string, session: any) => void;

    (supabase.auth.onAuthStateChange as jest.Mock).mockImplementation((callback) => {
      authCallback = callback;
      return { data: { subscription: mockSubscription } };
    });

    renderHook(() => useAuthStateListener());

    const session = {
      user: {
        id: 'user-123',
        email: 'test@example.com',
        email_confirmed_at: '2024-01-01T00:00:00Z',
      },
    };

    await waitFor(() => {
      authCallback('TOKEN_REFRESHED', session);
    });

    await waitFor(() => {
      expect(mockSetUser).toHaveBeenCalledWith({
        id: 'user-123',
        email: 'test@example.com',
        emailVerified: true,
      });
    });
  });

  describe('Initialization with existing session', () => {
    it('should initialize with verified session and set user state', async () => {
      (supabase.auth.getSession as jest.Mock).mockResolvedValue({
        data: {
          session: {
            user: {
              id: 'user-123',
              email: 'test@example.com',
              email_confirmed_at: '2024-01-01T00:00:00Z',
            },
          },
        },
        error: null,
      });

      renderHook(() => useAuthStateListener());

      await waitFor(() => {
        expect(mockSetUser).toHaveBeenCalledWith({
          id: 'user-123',
          email: 'test@example.com',
          emailVerified: true,
        });
      });

      await waitFor(() => {
        expect(mockSetInitialized).toHaveBeenCalledWith(true);
      });
    });

    it('should initialize with unverified session and set user state', async () => {
      (supabase.auth.getSession as jest.Mock).mockResolvedValue({
        data: {
          session: {
            user: {
              id: 'user-456',
              email: 'unverified@example.com',
              email_confirmed_at: null,
            },
          },
        },
        error: null,
      });

      renderHook(() => useAuthStateListener());

      await waitFor(() => {
        expect(mockSetUser).toHaveBeenCalledWith({
          id: 'user-456',
          email: 'unverified@example.com',
          emailVerified: false,
        });
      });

      await waitFor(() => {
        expect(mockSetInitialized).toHaveBeenCalledWith(true);
      });
    });

    it('should initialize with no session and set initialized to true', async () => {
      (supabase.auth.getSession as jest.Mock).mockResolvedValue({
        data: { session: null },
        error: null,
      });

      renderHook(() => useAuthStateListener());

      await waitFor(() => {
        expect(mockSetInitialized).toHaveBeenCalledWith(true);
      });

      // Should not call setUser when no session
      expect(mockSetUser).not.toHaveBeenCalled();
    });

    it('should set initialized to true even on error', async () => {
      const error = new Error('Session fetch failed');
      (supabase.auth.getSession as jest.Mock).mockResolvedValue({
        data: { session: null },
        error,
      });

      renderHook(() => useAuthStateListener());

      await waitFor(() => {
        expect(mockSetInitialized).toHaveBeenCalledWith(true);
      });

      // Should not call setUser on error
      expect(mockSetUser).not.toHaveBeenCalled();
    });

    it('should not navigate during initial session load', async () => {
      (supabase.auth.getSession as jest.Mock).mockResolvedValue({
        data: {
          session: {
            user: {
              id: 'user-123',
              email: 'test@example.com',
              email_confirmed_at: '2024-01-01T00:00:00Z',
            },
          },
        },
        error: null,
      });

      renderHook(() => useAuthStateListener());

      await waitFor(() => {
        expect(mockSetUser).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(mockSetInitialized).toHaveBeenCalledWith(true);
      });

      // Should not navigate during initial load even with verified email
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('should initialize before subscription starts handling events', async () => {
      const callOrder: string[] = [];

      mockSetUser.mockImplementation(() => {
        callOrder.push('setUser');
      });

      mockSetInitialized.mockImplementation(() => {
        callOrder.push('setInitialized');
      });

      (supabase.auth.getSession as jest.Mock).mockResolvedValue({
        data: {
          session: {
            user: {
              id: 'user-123',
              email: 'test@example.com',
              email_confirmed_at: '2024-01-01T00:00:00Z',
            },
          },
        },
        error: null,
      });

      renderHook(() => useAuthStateListener());

      await waitFor(() => {
        expect(callOrder).toContain('setUser');
        expect(callOrder).toContain('setInitialized');
      });

      // Verify setUser was called before setInitialized
      const setUserIndex = callOrder.indexOf('setUser');
      const setInitializedIndex = callOrder.indexOf('setInitialized');
      expect(setUserIndex).toBeLessThan(setInitializedIndex);
    });

    it('should handle session with missing email gracefully', async () => {
      (supabase.auth.getSession as jest.Mock).mockResolvedValue({
        data: {
          session: {
            user: {
              id: 'user-789',
              email: null,
              email_confirmed_at: null,
            },
          },
        },
        error: null,
      });

      renderHook(() => useAuthStateListener());

      await waitFor(() => {
        expect(mockSetUser).toHaveBeenCalledWith({
          id: 'user-789',
          email: '',
          emailVerified: false,
        });
      });

      await waitFor(() => {
        expect(mockSetInitialized).toHaveBeenCalledWith(true);
      });
    });

    it('should set initialized on exception during initialization', async () => {
      (supabase.auth.getSession as jest.Mock).mockRejectedValue(new Error('Network error'));

      renderHook(() => useAuthStateListener());

      await waitFor(() => {
        expect(mockSetInitialized).toHaveBeenCalledWith(true);
      });

      // Should not call setUser on exception
      expect(mockSetUser).not.toHaveBeenCalled();
    });
  });
});
