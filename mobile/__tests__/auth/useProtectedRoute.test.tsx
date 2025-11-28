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

  it('should return false initially while not initialized', () => {
    (useStore as unknown as jest.Mock).mockImplementation((selector) =>
      selector({
        isHydrating: true,
        deriveRoute: () => 'home',
      })
    );

    const { result } = renderHook(() => useProtectedRoute());

    // Initial state should be false (still hydrating)
    expect(result.current).toBe(false);
  });

  it('should return true for authenticated and verified user after initialization', async () => {
    (useStore as unknown as jest.Mock).mockImplementation((selector) =>
      selector({
        isHydrating: false,
        deriveRoute: () => 'home',
      })
    );

    const { result } = renderHook(() => useProtectedRoute());

    await waitFor(() => {
      expect(result.current).toBe(true);
    });

    // Should not redirect
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('should redirect to login when no user exists', async () => {
    (useStore as unknown as jest.Mock).mockImplementation((selector) =>
      selector({
        isHydrating: false,
        deriveRoute: () => 'login',
      })
    );

    const { result } = renderHook(() => useProtectedRoute());

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/auth/login');
    });

    expect(result.current).toBe(false);
  });

  it('should redirect to verify when user exists but email not verified', async () => {
    (useStore as unknown as jest.Mock).mockImplementation((selector) =>
      selector({
        isHydrating: false,
        deriveRoute: () => 'verify',
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
        isHydrating: false,
        deriveRoute: () => 'login',
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
        isHydrating: false,
        deriveRoute: () => 'verify',
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
        isHydrating: false,
        deriveRoute: () => 'verify',
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

  it('should return false when not yet initialized', () => {
    (useStore as unknown as jest.Mock).mockImplementation((selector) =>
      selector({
        isHydrating: true,
        deriveRoute: () => 'home',
      })
    );

    const { result } = renderHook(() => useProtectedRoute());

    // Should return false immediately while hydrating
    expect(result.current).toBe(false);
  });
});
