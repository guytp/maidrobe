/**
 * Supabase request interceptor for reactive token refresh on 401 responses.
 *
 * This module provides a custom fetch implementation that wraps the Supabase
 * client's network requests to handle 401 Unauthorized responses by attempting
 * token refresh and retrying the original request.
 *
 * DESIGN RATIONALE:
 * While the proactive token refresh strategy (5 minutes before expiry) prevents
 * most token expiration scenarios, reactive refresh provides defense-in-depth:
 * 1. Handles edge cases where proactive refresh fails silently
 * 2. Recovers from clock skew between client and server
 * 3. Handles tokens revoked server-side outside normal expiry
 * 4. Provides fallback if device was offline during scheduled refresh
 *
 * ARCHITECTURE:
 * - Custom fetch wrapper installed in Supabase client global options
 * - Intercepts all HTTP requests made by Supabase SDK
 * - On 401 response: attempts refresh, retries request once
 * - On refresh failure: triggers forced logout with session expired message
 * - Deduplicates concurrent refresh attempts (shares promise)
 * - Prevents infinite retry loops (max 1 retry per request)
 *
 * INTEGRATION WITH TOKEN REFRESH MANAGER:
 * This interceptor calls the refreshToken() function from useTokenRefreshManager
 * which is exposed as a singleton. The refresh manager handles:
 * - Exponential backoff retry logic
 * - Deduplication of concurrent refresh requests
 * - Network connectivity awareness
 * - Telemetry and error logging
 * - Forced logout on unrecoverable errors
 *
 * SECURITY:
 * - Never logs request bodies or auth headers
 * - Uses existing SecureStore-backed token storage
 * - Forced logout clears all auth state on refresh failure
 * - No token exposure to debug consoles or logs
 *
 * PERFORMANCE:
 * - Single retry attempt to minimize latency impact
 * - Shared refresh promise prevents redundant refresh calls
 * - Fast-fail on permanent errors (expired refresh token)
 *
 * @example
 * ```typescript
 * // In supabase.ts
 * import { createInterceptedFetch } from './supabaseInterceptor';
 *
 * export const supabase = createClient(url, key, {
 *   global: {
 *     fetch: createInterceptedFetch(),
 *   },
 * });
 * ```
 */

import { logAuthEvent, logError } from '../core/telemetry';

/**
 * Singleton state for managing in-flight refresh operations.
 *
 * This ensures that concurrent 401 responses from multiple requests
 * share a single refresh attempt rather than triggering redundant
 * refresh calls that could cause race conditions or rate limiting.
 */
class RefreshCoordinator {
  private refreshPromise: Promise<boolean> | null = null;

  /**
   * Executes or returns an in-flight token refresh.
   *
   * If a refresh is already in progress, returns the existing promise.
   * Otherwise, starts a new refresh operation.
   *
   * @param refreshFn - Function that performs the actual refresh
   * @returns Promise resolving to true if refresh succeeded, false otherwise
   */
  async executeRefresh(refreshFn: () => Promise<void>): Promise<boolean> {
    // If refresh already in progress, wait for it
    if (this.refreshPromise) {
      // eslint-disable-next-line no-console
      console.log('[Interceptor] Deduplicating refresh - waiting for in-flight refresh');
      return this.refreshPromise;
    }

    // Start new refresh
    // eslint-disable-next-line no-console
    console.log('[Interceptor] Starting token refresh');

    this.refreshPromise = (async () => {
      try {
        await refreshFn();
        // eslint-disable-next-line no-console
        console.log('[Interceptor] Token refresh successful');
        return true;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[Interceptor] Token refresh failed:', error);
        return false;
      } finally {
        // Clear promise after completion
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  /**
   * Resets the coordinator state.
   * Called during logout to prevent stale refresh promises.
   */
  reset(): void {
    this.refreshPromise = null;
  }
}

// Singleton instance
const refreshCoordinator = new RefreshCoordinator();

/**
 * Function type for performing token refresh.
 * Injected as dependency to avoid circular imports with React hooks.
 */
type RefreshTokenFn = () => Promise<void>;

/**
 * Function type for performing forced logout.
 * Injected as dependency to avoid circular imports with store.
 */
type ForceLogoutFn = (reason: string) => Promise<void>;

/**
 * Dependency injection container for refresh and logout functions.
 * These are set externally to avoid circular dependencies with React hooks and store.
 */
let refreshTokenFn: RefreshTokenFn | null = null;
let forceLogoutFn: ForceLogoutFn | null = null;

/**
 * Registers the token refresh function for use by the interceptor.
 *
 * This should be called once during app initialization with the refreshToken
 * function from useTokenRefreshManager.
 *
 * @param fn - The refresh token function
 */
export function registerRefreshTokenFn(fn: RefreshTokenFn): void {
  refreshTokenFn = fn;
}

/**
 * Registers the force logout function for use by the interceptor.
 *
 * This should be called once during app initialization with the forceLogout
 * function from useTokenRefreshManager or equivalent.
 *
 * @param fn - The force logout function
 */
export function registerForceLogoutFn(fn: ForceLogoutFn): void {
  forceLogoutFn = fn;
}

/**
 * Resets the interceptor state.
 * Called during logout to clear any in-flight refresh operations.
 */
export function resetInterceptor(): void {
  refreshCoordinator.reset();
}

/**
 * Symbol to mark requests that have already been retried.
 * Used to prevent infinite retry loops.
 */
const RETRY_SYMBOL = Symbol('supabase-interceptor-retried');

/**
 * Checks if a request URL is an authentication endpoint that should not be intercepted.
 *
 * We skip interception for auth endpoints to avoid:
 * - Infinite retry loops on login/logout/refresh endpoints
 * - Attempting refresh during initial login (when no refresh token exists)
 * - Attempting refresh during logout (when session is being destroyed)
 *
 * @param url - The request URL
 * @returns true if URL is an auth endpoint, false otherwise
 */
function isAuthEndpoint(url: string): boolean {
  const authEndpoints = ['/auth/v1/token', '/auth/v1/logout', '/auth/v1/signup'];

  return authEndpoints.some((endpoint) => url.includes(endpoint));
}

/**
 * Checks if a request has already been retried.
 *
 * Uses a symbol property on the Request object to track retry state.
 * This prevents infinite retry loops when refresh fails or returns 401.
 *
 * @param request - The fetch Request object
 * @returns true if request has been retried, false otherwise
 */
function hasBeenRetried(request: Request | RequestInfo): boolean {
  if (typeof request === 'object' && request !== null) {
    return (request as unknown as Record<symbol, boolean>)[RETRY_SYMBOL] === true;
  }
  return false;
}

/**
 * Marks a request as having been retried.
 *
 * @param request - The fetch Request object
 */
function markAsRetried(request: Request): void {
  (request as unknown as Record<symbol, boolean>)[RETRY_SYMBOL] = true;
}

/**
 * Creates an intercepted fetch function for Supabase client.
 *
 * This fetch wrapper intercepts 401 Unauthorized responses and attempts
 * to refresh the access token before retrying the original request once.
 *
 * Flow:
 * 1. Execute original request
 * 2. If response is 401 and not already retried and not auth endpoint:
 *    a. Attempt token refresh via refreshTokenFn
 *    b. If refresh succeeds: retry original request with new token
 *    c. If refresh fails: trigger forced logout
 * 3. Return response (original or retried)
 *
 * Error Handling:
 * - Refresh failures trigger forced logout with "Session expired" message
 * - Only retries once per request to prevent infinite loops
 * - Auth endpoints bypass interception to prevent recursion
 * - Network errors during refresh are logged and trigger logout
 *
 * Deduplication:
 * - Multiple concurrent 401s share a single refresh operation
 * - Subsequent requests wait for in-flight refresh to complete
 * - Prevents redundant refresh calls and race conditions
 *
 * @returns Intercepted fetch function compatible with Supabase global.fetch option
 */
export function createInterceptedFetch(): typeof fetch {
  const originalFetch = fetch;

  return async function interceptedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    // Execute original request
    const response = await originalFetch(input, init);

    // Check if we should intercept this response
    const shouldIntercept =
      response.status === 401 && // Unauthorized response
      !hasBeenRetried(input) && // Not already retried
      !isAuthEndpoint(input.toString()); // Not an auth endpoint

    if (!shouldIntercept) {
      return response;
    }

    // Log 401 detection
    // eslint-disable-next-line no-console
    console.log('[Interceptor] 401 detected, attempting token refresh', {
      url: input.toString(),
    });

    logAuthEvent('token-refresh-reactive', {
      outcome: 'initiated',
      metadata: {
        url: input.toString(),
        trigger: '401_response',
      },
    });

    // Validate that refresh function is registered
    if (!refreshTokenFn) {
      // eslint-disable-next-line no-console
      console.error('[Interceptor] refreshTokenFn not registered - cannot refresh token');
      logError(
        new Error('refreshTokenFn not registered in interceptor'),
        'schema',
        {
          feature: 'auth',
          operation: 'reactive-refresh',
        }
      );
      return response; // Return original 401 response
    }

    // Attempt token refresh with deduplication
    const startTime = Date.now();
    const refreshSuccess = await refreshCoordinator.executeRefresh(refreshTokenFn);
    const latency = Date.now() - startTime;

    if (!refreshSuccess) {
      // Refresh failed - force logout
      // eslint-disable-next-line no-console
      console.error('[Interceptor] Refresh failed, forcing logout');

      logAuthEvent('token-refresh-reactive', {
        outcome: 'failure',
        latency,
        metadata: {
          url: input.toString(),
          trigger: '401_response',
        },
      });

      // Trigger forced logout if function is registered
      if (forceLogoutFn) {
        await forceLogoutFn('Session expired. Please log in again.');
      } else {
        // eslint-disable-next-line no-console
        console.error('[Interceptor] forceLogoutFn not registered - cannot force logout');
      }

      return response; // Return original 401 response
    }

    // Refresh succeeded - retry original request
    // eslint-disable-next-line no-console
    console.log('[Interceptor] Refresh successful, retrying original request');

    logAuthEvent('token-refresh-reactive', {
      outcome: 'success',
      latency,
      metadata: {
        url: input.toString(),
        trigger: '401_response',
      },
    });

    try {
      // Clone the original request and mark as retried
      let retryRequest: Request;

      if (input instanceof Request) {
        // Clone existing Request object
        retryRequest = input.clone();
        markAsRetried(retryRequest);
      } else {
        // Create new Request from URL/string
        retryRequest = new Request(input, init);
        markAsRetried(retryRequest);
      }

      // Execute retry
      const retryResponse = await originalFetch(retryRequest);

      // eslint-disable-next-line no-console
      console.log('[Interceptor] Retry completed', {
        url: input.toString(),
        status: retryResponse.status,
      });

      return retryResponse;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[Interceptor] Retry failed:', error);

      logError(error instanceof Error ? error : new Error(String(error)), 'network', {
        feature: 'auth',
        operation: 'reactive-refresh-retry',
        metadata: {
          url: input.toString(),
        },
      });

      // Return original response on retry failure
      return response;
    }
  };
}
