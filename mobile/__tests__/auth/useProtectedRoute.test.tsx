import { renderHook, waitFor } from '@testing-library/react-native';
import { useProtectedRoute } from '../../src/features/auth/hooks/useProtectedRoute';
import { useStore } from '../../src/core/state/store';

// Mock expo-router
const mockReplace = jest.fn();
const mockSegments = ['home'];

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
  useSegments: () => mockSegments,
}));

// Mock store
jest.mock('../../src/core/state/store', () => ({
  useStore: jest.fn(),
}));

describe('useProtectedRoute', () => {
  beforeEach(() => {
    // Reset mocks
    mockReplace.mockClear();
    jest.clearAllMocks();

    // Mock current segments to 'home' by default
    mockSegments.length = 0;
    mockSegments.push('home');
  });

  it('should return false initially while checking', () => {
    (useStore as unknown as jest.Mock).mockImplementation((selector) =>
      selector({
        user: { id: 'user-123', email: 'test@example.com', emailVerified: true },
      })
    );

    const { result } = renderHook(() => useProtectedRoute());

    // Initial state should be false (checking)
    expect(result.current).toBe(false);
  });

  it('should return true for authenticated and verified user after check', async () => {
    (useStore as unknown as jest.Mock).mockImplementation((selector) =>
      selector({
        user: { id: 'user-123', email: 'test@example.com', emailVerified: true },
      })
    );

    const { result } = renderHook(() => useProtectedRoute());

    await waitFor(() => {
      expect(result.current).toBe(true);
    });

    // Should not redirect
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('should redirect to signup when no user exists', async () => {
    (useStore as unknown as jest.Mock).mockImplementation((selector) =>
      selector({
        user: null,
      })
    );

    const { result } = renderHook(() => useProtectedRoute());

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/auth/signup');
    });

    expect(result.current).toBe(false);
  });

  it('should redirect to verify when user exists but email not verified', async () => {
    (useStore as unknown as jest.Mock).mockImplementation((selector) =>
      selector({
        user: { id: 'user-123', email: 'test@example.com', emailVerified: false },
      })
    );

    const { result } = renderHook(() => useProtectedRoute());

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/auth/verify');
    });

    expect(result.current).toBe(false);
  });

  it('should not redirect when already on auth screen and no user', async () => {
    (useStore as unknown as jest.Mock).mockImplementation((selector) =>
      selector({
        user: null,
      })
    );

    // Mock being on auth/signup screen
    mockSegments.length = 0;
    mockSegments.push('auth', 'signup');

    const { result } = renderHook(() => useProtectedRoute());

    await waitFor(() => {
      expect(result.current).toBe(false);
    });

    // Should not redirect when already on auth screen
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('should not redirect when already on verify screen and email not verified', async () => {
    (useStore as unknown as jest.Mock).mockImplementation((selector) =>
      selector({
        user: { id: 'user-123', email: 'test@example.com', emailVerified: false },
      })
    );

    // Mock being on auth/verify screen
    mockSegments.length = 0;
    mockSegments.push('auth', 'verify');

    const { result } = renderHook(() => useProtectedRoute());

    await waitFor(() => {
      expect(result.current).toBe(false);
    });

    // Should not redirect when already on verify screen
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('should return false for unverified user even on verify screen', async () => {
    (useStore as unknown as jest.Mock).mockImplementation((selector) =>
      selector({
        user: { id: 'user-123', email: 'test@example.com', emailVerified: false },
      })
    );

    // Mock being on auth/verify screen
    mockSegments.length = 0;
    mockSegments.push('auth', 'verify');

    const { result } = renderHook(() => useProtectedRoute());

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });

  it('should return false when checking initial state', () => {
    (useStore as unknown as jest.Mock).mockImplementation((selector) =>
      selector({
        user: { id: 'user-123', email: 'test@example.com', emailVerified: true },
      })
    );

    const { result } = renderHook(() => useProtectedRoute());

    // Should return false immediately while checking
    expect(result.current).toBe(false);
  });
});
