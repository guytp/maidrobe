import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
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
 * Rate limiter state for tracking login attempts.
 * Stored in memory for the lifetime of the app.
 */
const rateLimitState = {
  attempts: [] as number[],
  maxAttempts: 5,
  windowMs: 60000, // 60 seconds
};

/**
 * Checks if the rate limit has been exceeded and returns cooldown time.
 *
 * @returns Object with allowed status and remaining cooldown time in seconds
 */
function checkRateLimit(): { allowed: boolean; remainingSeconds: number } {
  const now = Date.now();
  const windowStart = now - rateLimitState.windowMs;

  // Remove attempts outside the current window
  rateLimitState.attempts = rateLimitState.attempts.filter((timestamp) => timestamp > windowStart);

  // Check if limit exceeded
  if (rateLimitState.attempts.length >= rateLimitState.maxAttempts) {
    const oldestAttempt = rateLimitState.attempts[0];
    const remainingMs = rateLimitState.windowMs - (now - oldestAttempt);
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
 */
function recordAttempt(): void {
  rateLimitState.attempts.push(Date.now());
}

/**
 * Classifies Supabase Auth login errors into standard error categories.
 *
 * @param error - The error object from Supabase or network failure
 * @returns The error classification type
 */
function classifyLoginError(error: unknown): ErrorClassification {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Network-related errors
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

    // Server errors
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
 * - Maximum 5 login attempts per 60-second window
 * - Tracked in memory (persists for app lifetime)
 * - Returns cooldown message with remaining seconds when exceeded
 * - Does not count attempts during cooldown period
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
        const rateLimit = checkRateLimit();
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
        recordAttempt();

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
 * Resets the rate limiter state.
 * Useful for testing or allowing manual reset.
 *
 * @internal
 */
export function resetRateLimiter(): void {
  rateLimitState.attempts = [];
}
