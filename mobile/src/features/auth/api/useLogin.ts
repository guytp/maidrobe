import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../../services/supabase';
import { logAuthEvent, logError } from '../../../core/telemetry';
import { useStore } from '../../../core/state/store';
import { checkFeatureFlag } from '../../../core/featureFlags';
import { t } from '../../../core/i18n';
import { deriveTokenExpiry } from '../utils/tokenExpiry';
import { saveSessionFromSupabase } from '../storage/sessionPersistence';
import { handleAuthError } from '../utils/authErrorHandler';
import { getAuthErrorMessage } from '../utils/authErrorMessages';
import { logAuthErrorToSentry } from '../utils/logAuthErrorToSentry';
import { fetchProfile } from './useProfile';

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
 * React Query mutation hook for user login with email and password.
 *
 * This hook handles:
 * - Request validation with Zod (validates before rate limit/feature flag checks)
 * - Feature flag and version compatibility checks
 * - Client-side rate limiting (5 attempts per minute for valid requests)
 * - Supabase Auth signInWithPassword API call
 * - Response validation and parsing
 * - Error classification and telemetry logging
 * - Success event logging with latency metrics for SLO tracking
 * - User-friendly error message generation
 * - Automatic user session state management
 * - Retry logic with exponential backoff for transient failures
 *
 * Request Validation:
 * - Validates email format and password presence before any other checks
 * - Invalid requests do NOT consume rate limit quota
 * - Invalid requests do NOT trigger feature flag evaluations
 * - Fails fast for malformed input with minimal resource usage
 *
 * Email Normalization:
 * - Normalizes email addresses (trim whitespace, lowercase) in mutation logic
 * - Ensures consistent authentication across all callers (UI and non-UI)
 * - Handles case variations (User@Example.COM -> user@example.com)
 * - Handles whitespace (  user@example.com   -> user@example.com)
 * - UI-level normalization still provides immediate feedback to users
 * - Double normalization is idempotent and safe (no side effects)
 *
 * Rate Limiting:
 * - Maximum 5 login attempts per 60-second sliding window
 * - Only applies to valid, well-formed requests
 * - Persists to AsyncStorage (survives app restarts)
 * - Returns cooldown message with remaining seconds when exceeded
 * - Does not count attempts during cooldown period
 * - Gracefully handles storage failures (fail-open for availability)
 *
 * Feature Flags:
 * - Checks 'auth.login' feature flag before attempting login
 * - Only evaluated for valid requests that pass rate limiting
 * - Enforces client-API version compatibility
 * - Returns "Please update your app." if version incompatible
 *
 * Retry Strategy:
 * - Retries up to 3 times for network/server errors
 * - Does NOT retry invalid credentials (permanent failures)
 * - Does NOT retry validation errors (permanent failures)
 * - Base delays: 1s initial, 2x multiplier (exponential backoff)
 * - Jitter enhancement: Adds random 0-1000ms to each delay
 * - Actual delays: 1-2s, 2-3s, 4-5s (base + jitter)
 * - Jitter purpose: Prevents thundering herd problem during outages
 * - Max delay capped at 30 seconds
 * - NOTE: Jitter is a deliberate enhancement beyond acceptance criteria
 *   to improve reliability under high concurrent load. The base implementation
 *   (1s initial, 2x multiplier, max 3 attempts) meets the specified requirements,
 *   and the added randomness distributes retry timing across clients.
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
    // Base implementation: 1s initial delay, 2x multiplier (acceptance criteria)
    // Enhancement: Adds random 0-1000ms jitter to distribute retry timing
    // This prevents synchronized retries from multiple clients overwhelming the server
    // during recovery from an outage. Jitter is a deliberate enhancement for
    // production reliability, adding randomness on top of the specified backoff.
    //
    // Implementation breakdown:
    // - Attempt 0 (1st retry): 1000 * 2^0 + [0-1000]ms = 1000-2000ms
    // - Attempt 1 (2nd retry): 1000 * 2^1 + [0-1000]ms = 2000-3000ms
    // - Attempt 2 (3rd retry): 1000 * 2^2 + [0-1000]ms = 4000-5000ms
    // Base delays (1s, 2s, 4s) meet acceptance criteria.
    // Jitter ([0-1000]ms) is an added enhancement for distributed load.
    retryDelay: (attemptIndex) => {
      const baseDelay = 1000; // 1 second base (acceptance criteria)
      const exponentialDelay = baseDelay * Math.pow(2, attemptIndex); // 2x multiplier
      const jitter = Math.random() * 1000; // 0-1000ms jitter (enhancement)
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

      // 1. Validate request first (before rate limit or feature flag checks)
      // This ensures invalid requests do not consume rate limit quota or trigger
      // unnecessary feature flag evaluations
      let validatedRequest: LoginRequest;
      try {
        validatedRequest = LoginRequestSchema.parse(request);
      } catch (error) {
        if (error instanceof z.ZodError) {
          const latency = Date.now() - startTime;
          const validationError = new Error('Validation failed');
          const normalizedError = handleAuthError(validationError, {
            flow: 'login',
            supabaseOperation: 'validation',
          });

          logAuthErrorToSentry(normalizedError, error, {
            flow: 'login',
            userId: undefined,
            platform: Platform.OS as 'ios' | 'android' | 'unknown',
            metadata: {
              validationErrors: error.issues,
              latency,
            },
          });

          const userMessage = getAuthErrorMessage(normalizedError, 'login');
          throw new Error(userMessage);
        }
        throw error;
      }

      // Normalize email for consistent authentication
      // Trim whitespace and convert to lowercase to ensure case-insensitive matching
      // This normalization applies to all callers (UI and non-UI) for consistency
      // Examples:
      //   "User@Example.COM  " -> "user@example.com"
      //   "  user@example.com" -> "user@example.com"
      // UI-level normalization provides immediate feedback; mutation-level ensures correctness
      const normalizedEmail = validatedRequest.email.trim().toLowerCase();

      try {
        // 2. Check rate limit (only for valid requests)
        const rateLimit = await checkRateLimit();
        if (!rateLimit.allowed) {
          const error = new Error(
            t('screens.auth.login.errors.rateLimitExceeded').replace(
              '{seconds}',
              rateLimit.remainingSeconds.toString()
            )
          );
          throw error;
        }

        // 3. Check feature flag and version compatibility (only for valid requests)
        const featureFlag = await checkFeatureFlag('auth.login');

        if (featureFlag.requiresUpdate) {
          const error = new Error(t('screens.auth.login.errors.updateRequired'));
          throw error;
        }

        if (!featureFlag.enabled) {
          const error = new Error(t('screens.auth.login.errors.serviceUnavailable'));
          throw error;
        }

        // 4. Record attempt for rate limiting (before actual API call)
        await recordAttempt();

        // 5. Call Supabase Auth login
        const { data, error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: validatedRequest.password,
        });

        // Calculate latency
        const latency = Date.now() - startTime;

        // Handle Supabase errors
        if (error) {
          // Use centralized error handler
          const normalizedError = handleAuthError(error, {
            flow: 'login',
            supabaseOperation: 'signInWithPassword',
          });

          // Log to Sentry with centralized logging helper
          logAuthErrorToSentry(normalizedError, error, {
            flow: 'login',
            userId: undefined,
            platform: Platform.OS as 'ios' | 'android' | 'unknown',
            metadata: {
              latency,
            },
          });

          // Log structured auth event
          logAuthEvent('login-failure', {
            errorCode: normalizedError.code,
            outcome: 'failure',
            latency,
          });

          // Get user-friendly message
          const userMessage = getAuthErrorMessage(normalizedError, 'login');
          throw new Error(userMessage);
        }

        // Validate response structure
        if (!data || !data.user || !data.session) {
          const schemaError = new Error('Invalid response from login API');
          const normalizedError = handleAuthError(schemaError, {
            flow: 'login',
            supabaseOperation: 'signInWithPassword',
          });

          logAuthErrorToSentry(normalizedError, schemaError, {
            flow: 'login',
            userId: undefined,
            platform: Platform.OS as 'ios' | 'android' | 'unknown',
            metadata: {
              hasData: !!data,
              hasUser: !!data?.user,
              hasSession: !!data?.session,
              latency,
            },
          });

          const userMessage = getAuthErrorMessage(normalizedError, 'login');
          throw new Error(userMessage);
        }

        // Parse and validate response with Zod
        const validatedResponse = LoginResponseSchema.parse(data);

        return validatedResponse;
      } catch (error) {
        // Handle Zod validation errors (for response validation)
        // Note: Request validation errors are handled earlier in the flow
        if (error instanceof z.ZodError) {
          const latency = Date.now() - startTime;
          const validationError = new Error('Response validation failed');
          const normalizedError = handleAuthError(validationError, {
            flow: 'login',
            supabaseOperation: 'signInWithPassword',
          });

          logAuthErrorToSentry(normalizedError, error, {
            flow: 'login',
            userId: undefined,
            platform: Platform.OS as 'ios' | 'android' | 'unknown',
            metadata: {
              validationErrors: error.issues,
              latency,
            },
          });

          const userMessage = getAuthErrorMessage(normalizedError, 'login');
          throw new Error(userMessage);
        }

        // Re-throw if already an Error
        if (error instanceof Error) {
          throw error;
        }

        // Handle unknown errors
        const latency = Date.now() - startTime;
        const unknownError = new Error('Unknown error during login');
        const normalizedError = handleAuthError(unknownError, {
          flow: 'login',
          supabaseOperation: 'signInWithPassword',
        });

        logAuthErrorToSentry(normalizedError, unknownError, {
          flow: 'login',
          userId: undefined,
          platform: Platform.OS as 'ios' | 'android' | 'unknown',
          metadata: { latency },
        });

        const userMessage = getAuthErrorMessage(normalizedError, 'login');
        throw new Error(userMessage);
      }
    },
    onSuccess: async (data, _variables, context) => {
      // Calculate request latency for performance monitoring
      const latency = context?.startTime ? Date.now() - context.startTime : undefined;

      // SAFE PROFILE FETCH WITH ERROR HANDLING:
      // Wrap async fetchProfile in try/catch to prevent unhandled promise rejections.
      // While fetchProfile has internal error handling, exceptions can still propagate
      // in unexpected scenarios (network failures, timeout errors, etc.).
      //
      // FALLBACK STRATEGY:
      // If profile fetch throws an exception, default hasOnboarded to false (safe default).
      // This ensures new users see onboarding, while existing users will have their
      // hasOnboarded state restored from the session bundle on next cold start.
      let profile = null;
      let hasOnboarded = false;

      try {
        // Fetch user profile to get has_onboarded flag
        // This is critical for onboarding gate routing decisions
        profile = await fetchProfile(data.user.id);

        // Determine hasOnboarded value:
        // - Use profile.hasOnboarded if profile exists
        // - Default to false if profile doesn't exist (new user or fetch failed)
        hasOnboarded = profile?.hasOnboarded ?? false;
      } catch (error) {
        // Profile fetch threw an exception (unexpected error not caught internally)
        // Log error for monitoring and alerting
        logError(
          error instanceof Error ? error : new Error('Unknown profile fetch error'),
          'server',
          {
            feature: 'auth',
            operation: 'login-profile-fetch',
            metadata: {
              userId: data.user.id,
              note: 'Profile fetch threw exception during login, defaulting hasOnboarded to false',
            },
          }
        );

        // Default to false (safe for new users, will be corrected from bundle for existing users)
        hasOnboarded = false;
        profile = null;
      }

      // Business logic: Update Zustand session store with authenticated user
      useStore.getState().setUser({
        id: data.user.id,
        email: data.user.email,
        emailVerified: !!data.user.email_confirmed_at,
        hasOnboarded,
      });

      // Store token metadata (expiry time and type) - NOT the actual tokens
      // SECURITY: Tokens are stored encrypted in SecureStore by Supabase client
      // We only store metadata for UI/logic purposes (e.g., showing "session expires in X")
      const { expiresAt } = deriveTokenExpiry(data.session);
      useStore.getState().setTokenMetadata(expiresAt, data.session.token_type || 'bearer');

      // Clear any logout reason from forced logout
      useStore.getState().setLogoutReason(null);

      // Persist session bundle to SecureStore for cold-start restoration
      // This enables auth state restoration and offline trust window logic
      // Include hasOnboarded in bundle for offline resilience (Story #95)
      // Cast to Session type - we know this comes from Supabase signInWithPassword
      saveSessionFromSupabase(data.session as Session, new Date().toISOString(), hasOnboarded).catch(
        (error) => {
          // Log error but don't throw - session save failures are non-critical
          // User is still authenticated in current session
          // eslint-disable-next-line no-console
          console.error('[Login] Failed to save session bundle:', error);
        }
      );

      // Log structured auth event for observability
      // SECURITY: Do NOT log the session object - it contains access_token and refresh_token
      logAuthEvent('login-success', {
        userId: data.user.id,
        outcome: 'success',
        latency,
        metadata: {
          emailVerified: !!data.user.email_confirmed_at,
          hasOnboarded,
          profileFetched: !!profile,
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
