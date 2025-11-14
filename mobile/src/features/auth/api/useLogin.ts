import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../../services/supabase';
import { logError, getUserFriendlyMessage, logAuthEvent } from '../../../core/telemetry';
import type { ErrorClassification } from '../../../core/telemetry';
import { useStore } from '../../../core/state/store';
import { checkFeatureFlag } from '../../../core/featureFlags';
import { t } from '../../../core/i18n';

/**
 * Zod schema for login request validation
 */
const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * Zod schema for Supabase login response validation
 */
const LoginResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    email_confirmed_at: z.string().nullable().optional(),
  }),
  session: z.object({
    access_token: z.string(),
    refresh_token: z.string(),
    token_type: z.string().optional(),
    expires_in: z.number().optional(),
    expires_at: z.number().optional(),
  }),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

/**
 * Context type for login mutation (used for latency tracking)
 */
interface LoginMutationContext {
  startTime: number;
}

/**
 * Rate limiter configuration and storage key.
 *
 * The rate limiter persists login attempts to AsyncStorage to prevent
 * users from bypassing rate limiting by restarting the app. This provides
 * stronger security against brute-force attacks.
 *
 * Storage Strategy:
 * - Key: 'auth:login:attempts'
 * - Value: JSON array of timestamps (milliseconds since epoch)
 * - Automatic cleanup of expired timestamps on read/write
 * - Graceful fallback: allows login if storage operations fail
 *
 * Rate Limit Policy:
 * - Maximum 5 login attempts per 60-second sliding window
 * - Persists across app restarts and background/foreground transitions
 * - Cooldown message displays remaining seconds
 */
const RATE_LIMIT_STORAGE_KEY = 'auth:login:attempts';
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60000; // 60 seconds

/**
 * Reads login attempts from AsyncStorage and filters expired timestamps.
 *
 * @returns Array of valid attempt timestamps, or empty array on error
 */
async function getAttempts(): Promise<number[]> {
  try {
    const stored = await AsyncStorage.getItem(RATE_LIMIT_STORAGE_KEY);
    if (!stored) {
      return [];
    }

    const attempts = JSON.parse(stored) as number[];
    const now = Date.now();
    const windowStart = now - WINDOW_MS;

    // Filter out expired attempts
    return attempts.filter((timestamp) => timestamp > windowStart);
  } catch (error) {
    // Log error but don't block login on storage failure
    // eslint-disable-next-line no-console
    console.error('[RateLimit] Failed to read attempts:', error);
    return [];
  }
}

/**
 * Writes login attempts to AsyncStorage.
 *
 * @param attempts - Array of attempt timestamps to persist
 */
async function setAttempts(attempts: number[]): Promise<void> {
  try {
    await AsyncStorage.setItem(RATE_LIMIT_STORAGE_KEY, JSON.stringify(attempts));
  } catch (error) {
    // Log error but don't throw - storage failure shouldn't block login
    // eslint-disable-next-line no-console
    console.error('[RateLimit] Failed to write attempts:', error);
  }
}

/**
 * Checks if the rate limit has been exceeded and returns cooldown time.
 *
 * This function reads from AsyncStorage to ensure rate limiting persists
 * across app restarts. If storage operations fail, it allows the login
 * attempt to proceed (fail-open for availability).
 *
 * @returns Promise resolving to object with allowed status and remaining cooldown
 */
async function checkRateLimit(): Promise<{ allowed: boolean; remainingSeconds: number }> {
  const attempts = await getAttempts();
  const now = Date.now();

  // Check if limit exceeded
  if (attempts.length >= MAX_ATTEMPTS) {
    const oldestAttempt = attempts[0];
    const remainingMs = WINDOW_MS - (now - oldestAttempt);
    const remainingSeconds = Math.ceil(remainingMs / 1000);

    return {
      allowed: false,
      remainingSeconds: Math.max(0, remainingSeconds),
    };
  }

  return {
    allowed: true,
    remainingSeconds: 0,
  };
}

/**
 * Records a login attempt for rate limiting.
 *
 * Persists the attempt timestamp to AsyncStorage along with cleanup of
 * expired attempts. If storage fails, the attempt is not recorded but
 * the function does not throw to avoid blocking the login flow.
 */
async function recordAttempt(): Promise<void> {
  const attempts = await getAttempts();
  attempts.push(Date.now());
  await setAttempts(attempts);
}

/**
 * Classifies Supabase Auth login errors into standard error categories.
 *
 * Uses HTTP status codes for reliable classification when available,
 * falling back to message-based classification for errors without status codes.
 *
 * Status Code Classification:
 * - 401, 403: Authentication failures (invalid credentials, unauthorized)
 * - 400, 422, other 4xx: Client validation or request errors
 * - 500, 502, 503, 504, other 5xx: Server errors
 *
 * @param error - The error object from Supabase or network failure
 * @returns The error classification type
 */
function classifyLoginError(error: unknown): ErrorClassification {
  // Check for HTTP status code first (most reliable)
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status?: number }).status;

    if (typeof status === 'number') {
      // Authentication errors (401 Unauthorized, 403 Forbidden)
      // These indicate invalid credentials or auth failures
      if (status === 401 || status === 403) {
        return 'user';
      }

      // Other client errors (400 Bad Request, 422 Unprocessable Entity, etc.)
      // These indicate validation errors or malformed requests
      if (status >= 400 && status < 500) {
        return 'user';
      }

      // Server errors (500 Internal Server Error, 502 Bad Gateway, 503 Service Unavailable, etc.)
      if (status >= 500 && status < 600) {
        return 'server';
      }
    }
  }

  // Fallback to message-based classification when status code unavailable
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Network-related errors (connection issues, timeouts)
    if (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('timeout') ||
      message.includes('connection')
    ) {
      return 'network';
    }

    // Invalid credentials (user error)
    if (
      message.includes('invalid') ||
      message.includes('credentials') ||
      message.includes('incorrect') ||
      message.includes('wrong password') ||
      message.includes('email not found')
    ) {
      return 'user';
    }

    // Server errors detected by message content
    if (message.includes('500') || message.includes('503') || message.includes('502')) {
      return 'server';
    }
  }

  // Default to server error for unknown issues
  return 'server';
}

/**
 * Gets user-friendly error message for login failures.
 *
 * Maps error classifications to specific user-facing messages that match
 * the acceptance criteria. Uses i18n for all user-facing text.
 *
 * @param classification - The error classification
 * @param error - The original error object for specific message detection
 * @returns User-friendly error message
 */
function getLoginErrorMessage(classification: ErrorClassification, error: unknown): string {
  // Check for specific invalid credentials error
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes('invalid') ||
      message.includes('credentials') ||
      message.includes('incorrect') ||
      message.includes('wrong')
    ) {
      return t('screens.auth.login.errors.invalidCredentials');
    }
  }

  // Map classification to acceptance criteria messages
  if (classification === 'network') {
    return t('screens.auth.login.errors.networkError');
  }

  if (classification === 'user') {
    return t('screens.auth.login.errors.invalidCredentials');
  }

  // Default to server error message
  return getUserFriendlyMessage(classification);
}

/**
 * React Query mutation hook for user login with email and password.
 *
 * This hook handles:
 * - Feature flag and version compatibility checks
 * - Client-side rate limiting (5 attempts per minute)
 * - Request validation with Zod
 * - Supabase Auth signInWithPassword API call
 * - Response validation and parsing
 * - Error classification and telemetry logging
 * - Success event logging with latency metrics for SLO tracking
 * - User-friendly error message generation
 * - Automatic user session state management
 * - Retry logic with exponential backoff for transient failures
 *
 * Rate Limiting:
 * - Maximum 5 login attempts per 60-second sliding window
 * - Persists to AsyncStorage (survives app restarts)
 * - Returns cooldown message with remaining seconds when exceeded
 * - Does not count attempts during cooldown period
 * - Gracefully handles storage failures (fail-open for availability)
 *
 * Feature Flags:
 * - Checks 'auth.login' feature flag before attempting login
 * - Enforces client-API version compatibility
 * - Returns "Please update your app." if version incompatible
 *
 * Retry Strategy:
 * - Retries up to 3 times for network/server errors
 * - Does NOT retry invalid credentials (permanent failures)
 * - Uses exponential backoff: 1s, 2s, 4s (plus jitter)
 * - Max delay capped at 30 seconds
 *
 * @returns React Query mutation object with login function
 *
 * @example
 * ```typescript
 * const { mutate: login, isPending, error } = useLogin();
 *
 * const handleLogin = () => {
 *   login(
 *     { email: 'user@example.com', password: 'password' },
 *     {
 *       onSuccess: () => {
 *         router.push('/home');
 *       },
 *       onError: (error) => {
 *         Alert.alert('Login Failed', error.message);
 *       },
 *     }
 *   );
 * };
 * ```
 */
export function useLogin() {
  return useMutation<LoginResponse, Error, LoginRequest, LoginMutationContext>({
    // Retry configuration with exponential backoff and jitter
    // Only retry on network/server errors, not invalid credentials
    retry: (failureCount, error) => {
      // Don't retry user validation errors or invalid credentials
      const message = error.message;
      if (
        message.includes(t('screens.auth.login.errors.invalidCredentials')) ||
        message.includes('Invalid request') ||
        message.includes('check your input') ||
        (message.includes('wait') && message.includes('seconds')) || // Rate limit check
        message.includes(t('screens.auth.login.errors.updateRequired'))
      ) {
        return false;
      }

      // Retry up to 3 times for transient network/server errors
      return failureCount < 3;
    },
    // Exponential backoff with jitter to avoid thundering herd
    retryDelay: (attemptIndex) => {
      const baseDelay = 1000; // 1 second base
      const exponentialDelay = baseDelay * Math.pow(2, attemptIndex);
      const jitter = Math.random() * 1000; // 0-1000ms jitter
      const totalDelay = exponentialDelay + jitter;
      const maxDelay = 30000; // Cap at 30 seconds
      return Math.min(totalDelay, maxDelay);
    },
    onMutate: () => {
      // Capture start timestamp for latency tracking
      return { startTime: Date.now() };
    },
    mutationFn: async (request: LoginRequest) => {
      const startTime = Date.now();

      try {
        // 1. Check rate limit first (before any network calls)
        const rateLimit = await checkRateLimit();
        if (!rateLimit.allowed) {
          const error = new Error(
            t('screens.auth.login.errors.rateLimitExceeded').replace(
              '{seconds}',
              rateLimit.remainingSeconds.toString()
            )
          );
          logError(error, 'user', {
            feature: 'auth',
            operation: 'login',
            metadata: {
              reason: 'rate_limit_exceeded',
              remainingSeconds: rateLimit.remainingSeconds,
            },
          });
          throw error;
        }

        // 2. Check feature flag and version compatibility
        const featureFlag = await checkFeatureFlag('auth.login');

        if (featureFlag.requiresUpdate) {
          const error = new Error(t('screens.auth.login.errors.updateRequired'));
          logError(error, 'user', {
            feature: 'auth',
            operation: 'login',
            metadata: {
              reason: 'version_incompatible',
              message: featureFlag.message,
            },
          });
          throw error;
        }

        if (!featureFlag.enabled) {
          const error = new Error(t('screens.auth.login.errors.serviceUnavailable'));
          logError(error, 'server', {
            feature: 'auth',
            operation: 'login',
            metadata: {
              reason: 'feature_disabled',
            },
          });
          throw error;
        }

        // 3. Validate request
        const validatedRequest = LoginRequestSchema.parse(request);

        // 4. Record attempt for rate limiting (before actual API call)
        await recordAttempt();

        // 5. Call Supabase Auth login
        const { data, error } = await supabase.auth.signInWithPassword({
          email: validatedRequest.email,
          password: validatedRequest.password,
        });

        // Calculate latency
        const latency = Date.now() - startTime;

        // Handle Supabase errors
        if (error) {
          const classification = classifyLoginError(error);
          logError(error, classification, {
            feature: 'auth',
            operation: 'login',
            metadata: {
              email: 'redacted', // Never log PII
              errorCode: error.status,
              latency,
            },
          });

          // Log structured auth event
          logAuthEvent('login-failure', {
            errorCode: error.status?.toString(),
            outcome: 'failure',
            latency,
          });

          throw new Error(getLoginErrorMessage(classification, error));
        }

        // Validate response structure
        if (!data || !data.user || !data.session) {
          const schemaError = new Error('Invalid response from login API');
          logError(schemaError, 'schema', {
            feature: 'auth',
            operation: 'login',
            metadata: {
              hasData: !!data,
              hasUser: !!data?.user,
              hasSession: !!data?.session,
              latency,
            },
          });
          throw new Error(getUserFriendlyMessage('schema'));
        }

        // Parse and validate response with Zod
        const validatedResponse = LoginResponseSchema.parse(data);

        return validatedResponse;
      } catch (error) {
        // Handle Zod validation errors
        if (error instanceof z.ZodError) {
          const latency = Date.now() - startTime;
          logError(error, 'user', {
            feature: 'auth',
            operation: 'login',
            metadata: {
              validationErrors: error.issues,
              latency,
            },
          });
          throw new Error(getUserFriendlyMessage('user'));
        }

        // Re-throw if already an Error
        if (error instanceof Error) {
          throw error;
        }

        // Handle unknown errors
        const latency = Date.now() - startTime;
        const unknownError = new Error('Unknown error during login');
        logError(unknownError, 'server', {
          feature: 'auth',
          operation: 'login',
          metadata: { latency },
        });
        throw new Error(getUserFriendlyMessage('server'));
      }
    },
    onSuccess: (data, _variables, context) => {
      // Calculate request latency for performance monitoring
      const latency = context?.startTime ? Date.now() - context.startTime : undefined;

      // Business logic: Update Zustand session store with authenticated user
      useStore.getState().setUser({
        id: data.user.id,
        email: data.user.email,
        emailVerified: !!data.user.email_confirmed_at,
      });

      // Store token metadata (expiry time and type) - NOT the actual tokens
      // SECURITY: Tokens are stored encrypted in SecureStore by Supabase client
      // We only store metadata for UI/logic purposes (e.g., showing "session expires in X")
      //
      // Token expiry derivation strategy:
      // 1. Use session.expires_at if provided (absolute timestamp in seconds)
      // 2. Calculate from session.expires_in if provided (relative seconds)
      // 3. Fall back to 3600 seconds (1 hour) if neither provided
      //
      // This ensures token metadata accurately reflects the actual token lifetime
      // from Supabase, enabling precise proactive refresh scheduling.
      let expiresAt: number;
      if (data.session.expires_at) {
        // Supabase provides expires_at as unix timestamp in seconds
        // Convert to milliseconds for JavaScript Date
        expiresAt = data.session.expires_at * 1000;
      } else if (data.session.expires_in) {
        // Calculate absolute expiry from relative expires_in (seconds)
        expiresAt = Date.now() + data.session.expires_in * 1000;
      } else {
        // Fallback: Default to 1 hour (3600 seconds) - Supabase standard
        expiresAt = Date.now() + 3600 * 1000;
      }
      useStore.getState().setTokenMetadata(expiresAt, data.session.token_type || 'bearer');

      // Clear any logout reason from forced logout
      useStore.getState().setLogoutReason(null);

      // Log structured auth event for observability
      // SECURITY: Do NOT log the session object - it contains access_token and refresh_token
      logAuthEvent('login-success', {
        userId: data.user.id,
        outcome: 'success',
        latency,
        metadata: {
          emailVerified: !!data.user.email_confirmed_at,
        },
      });
    },
    onError: (_error, _variables, context) => {
      // Calculate request latency for performance monitoring in error path
      const latency = context?.startTime ? Date.now() - context.startTime : undefined;

      // Log error latency for observability
      // eslint-disable-next-line no-console
      console.log('[Telemetry]', {
        feature: 'auth',
        operation: 'login',
        status: 'error',
        latency,
        timestamp: new Date().toISOString(),
      });
    },
  });
}

/**
 * Resets the rate limiter state by clearing AsyncStorage.
 *
 * This function is useful for testing or allowing manual reset of the
 * rate limiter. It removes all stored login attempts, effectively
 * resetting the rate limit cooldown.
 *
 * @returns Promise that resolves when storage is cleared
 * @internal
 */
export async function resetRateLimiter(): Promise<void> {
  try {
    await AsyncStorage.removeItem(RATE_LIMIT_STORAGE_KEY);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[RateLimit] Failed to reset rate limiter:', error);
  }
}
