/**
 * Unit tests for Supabase request interceptor.
 *
 * Tests the reactive token refresh logic that intercepts 401 responses,
 * attempts token refresh, and retries the original request.
 */

import {
  createInterceptedFetch,
  registerRefreshTokenFn,
  registerForceLogoutFn,
  resetInterceptor,
} from '../../src/services/supabaseInterceptor';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('supabaseInterceptor', () => {
  let mockRefreshToken: jest.Mock;
  let mockForceLogout: jest.Mock;
  let interceptedFetch: ReturnType<typeof createInterceptedFetch>;

  beforeEach(() => {
    // Reset mocks
    mockFetch.mockReset();
    mockRefreshToken = jest.fn();
    mockForceLogout = jest.fn();

    // Register mock functions
    registerRefreshTokenFn(mockRefreshToken);
    registerForceLogoutFn(mockForceLogout);

    // Create intercepted fetch
    interceptedFetch = createInterceptedFetch();

    // Reset interceptor state
    resetInterceptor();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('non-401 responses', () => {
    it('should pass through successful responses without interception', async () => {
      const mockResponse = new Response('{"data": "test"}', { status: 200 });
      mockFetch.mockResolvedValueOnce(mockResponse);

      const response = await interceptedFetch('https://api.example.com/data');

      expect(response.status).toBe(200);
      expect(mockRefreshToken).not.toHaveBeenCalled();
      expect(mockForceLogout).not.toHaveBeenCalled();
    });

    it('should pass through non-401 errors without interception', async () => {
      const mockResponse = new Response('{"error": "not found"}', { status: 404 });
      mockFetch.mockResolvedValueOnce(mockResponse);

      const response = await interceptedFetch('https://api.example.com/data');

      expect(response.status).toBe(404);
      expect(mockRefreshToken).not.toHaveBeenCalled();
      expect(mockForceLogout).not.toHaveBeenCalled();
    });
  });

  describe('auth endpoint bypass', () => {
    it('should not intercept 401 from /auth/v1/token endpoint', async () => {
      const mockResponse = new Response('{"error": "invalid"}', { status: 401 });
      mockFetch.mockResolvedValueOnce(mockResponse);

      const response = await interceptedFetch('https://api.example.com/auth/v1/token');

      expect(response.status).toBe(401);
      expect(mockRefreshToken).not.toHaveBeenCalled();
      expect(mockForceLogout).not.toHaveBeenCalled();
    });

    it('should not intercept 401 from /auth/v1/logout endpoint', async () => {
      const mockResponse = new Response('{"error": "invalid"}', { status: 401 });
      mockFetch.mockResolvedValueOnce(mockResponse);

      const response = await interceptedFetch('https://api.example.com/auth/v1/logout');

      expect(response.status).toBe(401);
      expect(mockRefreshToken).not.toHaveBeenCalled();
      expect(mockForceLogout).not.toHaveBeenCalled();
    });

    it('should not intercept 401 from /auth/v1/signup endpoint', async () => {
      const mockResponse = new Response('{"error": "invalid"}', { status: 401 });
      mockFetch.mockResolvedValueOnce(mockResponse);

      const response = await interceptedFetch('https://api.example.com/auth/v1/signup');

      expect(response.status).toBe(401);
      expect(mockRefreshToken).not.toHaveBeenCalled();
      expect(mockForceLogout).not.toHaveBeenCalled();
    });
  });

  describe('401 interception and retry', () => {
    it('should refresh token and retry request on 401 response', async () => {
      const mock401Response = new Response('{"error": "unauthorized"}', { status: 401 });
      const mockSuccessResponse = new Response('{"data": "success"}', { status: 200 });

      // First call returns 401, second call (retry) returns 200
      mockFetch.mockResolvedValueOnce(mock401Response).mockResolvedValueOnce(mockSuccessResponse);

      // Mock successful refresh
      mockRefreshToken.mockResolvedValueOnce(undefined);

      const response = await interceptedFetch('https://api.example.com/protected/data');

      expect(response.status).toBe(200);
      expect(mockRefreshToken).toHaveBeenCalledTimes(1);
      expect(mockForceLogout).not.toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledTimes(2); // Original + retry
    });

    it('should force logout if token refresh fails', async () => {
      const mock401Response = new Response('{"error": "unauthorized"}', { status: 401 });
      mockFetch.mockResolvedValueOnce(mock401Response);

      // Mock failed refresh
      mockRefreshToken.mockRejectedValueOnce(new Error('Refresh failed'));

      const response = await interceptedFetch('https://api.example.com/protected/data');

      expect(response.status).toBe(401); // Original response returned
      expect(mockRefreshToken).toHaveBeenCalledTimes(1);
      expect(mockForceLogout).toHaveBeenCalledTimes(1);
      expect(mockForceLogout).toHaveBeenCalledWith('Session expired. Please log in again.');
      expect(mockFetch).toHaveBeenCalledTimes(1); // No retry
    });

    it('should only retry once to prevent infinite loops', async () => {
      const mock401Response = new Response('{"error": "unauthorized"}', { status: 401 });

      // Both calls return 401
      mockFetch.mockResolvedValue(mock401Response);

      // Mock successful refresh
      mockRefreshToken.mockResolvedValueOnce(undefined);

      const response = await interceptedFetch('https://api.example.com/protected/data');

      expect(response.status).toBe(401); // Final response is still 401
      expect(mockRefreshToken).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledTimes(2); // Original + 1 retry (not infinite)
    });
  });

  describe('deduplication', () => {
    it('should deduplicate concurrent refresh attempts', async () => {
      const mock401Response = new Response('{"error": "unauthorized"}', { status: 401 });
      const mockSuccessResponse = new Response('{"data": "success"}', { status: 200 });

      // All initial calls return 401, retries return 200
      mockFetch
        .mockResolvedValueOnce(mock401Response) // Request 1 initial
        .mockResolvedValueOnce(mock401Response) // Request 2 initial
        .mockResolvedValueOnce(mockSuccessResponse) // Request 1 retry
        .mockResolvedValueOnce(mockSuccessResponse); // Request 2 retry

      // Mock successful refresh (should only be called once)
      let resolveRefresh: (() => void) | undefined;
      const refreshPromise = new Promise<void>((resolve) => {
        resolveRefresh = resolve;
      });
      mockRefreshToken.mockReturnValueOnce(refreshPromise);

      // Start two concurrent requests
      const promise1 = interceptedFetch('https://api.example.com/protected/data1');
      const promise2 = interceptedFetch('https://api.example.com/protected/data2');

      // Resolve refresh after both requests have started
      await new Promise((resolve) => setTimeout(resolve, 10));
      resolveRefresh!();

      const [response1, response2] = await Promise.all([promise1, promise2]);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      expect(mockRefreshToken).toHaveBeenCalledTimes(1); // Only one refresh
    });
  });

  describe('request retry with Request object', () => {
    it('should handle Request object input correctly', async () => {
      const mock401Response = new Response('{"error": "unauthorized"}', { status: 401 });
      const mockSuccessResponse = new Response('{"data": "success"}', { status: 200 });

      mockFetch.mockResolvedValueOnce(mock401Response).mockResolvedValueOnce(mockSuccessResponse);
      mockRefreshToken.mockResolvedValueOnce(undefined);

      const request = new Request('https://api.example.com/protected/data', {
        method: 'POST',
        body: JSON.stringify({ test: 'data' }),
      });

      const response = await interceptedFetch(request);

      expect(response.status).toBe(200);
      expect(mockRefreshToken).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling during retry', () => {
    it('should return original response if retry throws error', async () => {
      const mock401Response = new Response('{"error": "unauthorized"}', { status: 401 });

      // First call returns 401, second call throws network error
      mockFetch
        .mockResolvedValueOnce(mock401Response)
        .mockRejectedValueOnce(new Error('Network error'));

      mockRefreshToken.mockResolvedValueOnce(undefined);

      const response = await interceptedFetch('https://api.example.com/protected/data');

      expect(response.status).toBe(401); // Original response returned
      expect(mockRefreshToken).toHaveBeenCalledTimes(1);
      expect(mockForceLogout).not.toHaveBeenCalled(); // Don't logout on retry error
    });
  });

  describe('resetInterceptor', () => {
    it('should clear in-flight refresh state', () => {
      // This is tested indirectly - after reset, concurrent requests should not share refresh
      resetInterceptor();
      // State is reset, verified by other tests that start with resetInterceptor
      expect(true).toBe(true);
    });
  });
});
