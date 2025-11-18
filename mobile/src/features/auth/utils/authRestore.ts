import { supabase } from '../../../services/supabase';
import { useStore } from '../../../core/state/store';
import { logAuthEvent, logError } from '../../../core/telemetry';
import {
  loadStoredSession,
  saveSessionFromSupabase,
  clearStoredSession,
  markNeedsRefresh as markNeedsRefreshInStorage,
} from '../storage/sessionPersistence';
import { deriveTokenExpiry } from './tokenExpiry';

/**
 * Offline trust window duration in milliseconds (7 days).
 *
 * When the device is offline at cold start, sessions that were successfully
 * authenticated within this window are trusted and used without refresh.
 * Sessions older than this are considered stale and discarded.
 */
const OFFLINE_TRUST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Timeout for session refresh operation in milliseconds (8 seconds).
 *
 * If the refresh call takes longer than this, it's treated as a network
 * error and the offline trust window logic applies.
 */
const REFRESH_TIMEOUT_MS = 8000; // 8 seconds

/**
 * Guard flag to prevent concurrent restore operations.
 *
 * Ensures that restoreAuthStateOnLaunch executes at most once per app
 * cold start, even if multiple components attempt to trigger it.
 */
let isRestoreInProgress = false;

/**
 * Shared promise for deduplicating concurrent restore calls.
 *
 * When multiple components call restoreAuthStateOnLaunch simultaneously,
 * they all receive the same promise and wait for a single execution.
 */
let restorePromise: Promise<void> | null = null;

/**
 * Maps internal logout reason codes to user-friendly i18n keys.
 *
 * This function provides a centralized mapping from internal logout reason
 * codes used throughout the auth restore pipeline to i18n translation keys
 * that can be displayed to users on the login screen.
 *
 * The mapping ensures consistent, user-friendly messaging for all logout
 * scenarios while maintaining a clean separation between internal codes
 * and UI presentation.
 *
 * @param reason - Internal logout reason code
 * @returns i18n key path for the corresponding user-friendly message
 *
 * @example
 * ```typescript
 * const i18nKey = mapLogoutReasonToI18nKey('session-expired');
 * // Returns: 'screens.auth.login.sessionMessages.sessionExpired'
 *
 * const message = t(i18nKey);
 * // Returns: "Your session has expired. Please log in again."
 * ```
 *
 * SUPPORTED REASON CODES:
 * - 'session-expired': Token refresh failed due to invalid/expired tokens
 * - 'restore-failed-stale': Session too old and network unavailable
 * - 'restore-failed-invalid': Corrupted or invalid stored session data
 * - 'restore-failed-error': Unexpected error during restore pipeline
 * - 'no-session': No stored session found (clean state, not an error)
 *
 * FALLBACK BEHAVIOR:
 * Unknown reason codes map to a generic error message to ensure the user
 * always sees a friendly message rather than internal codes.
 */
export function mapLogoutReasonToI18nKey(reason: string): string {
  switch (reason) {
    case 'session-expired':
      return 'screens.auth.login.sessionMessages.sessionExpired';
    case 'restore-failed-stale':
      return 'screens.auth.login.sessionMessages.sessionRestoreFailed';
    case 'restore-failed-invalid':
      return 'screens.auth.login.sessionMessages.sessionInvalid';
    case 'restore-failed-error':
      return 'screens.auth.login.sessionMessages.sessionError';
    case 'no-session':
      // No session is a clean state, not an error - no message needed
      return '';
    default:
      // Unknown reason codes get a generic error message
      return 'screens.auth.login.sessionMessages.sessionError';
  }
}

/**
 * Classifies refresh errors into categories for proper handling.
 *
 * Auth errors (invalid/expired tokens) are permanent and require clearing
 * the session. Network errors are transient and trigger offline trust window
 * logic. This classification determines the restore path.
 *
 * @param error - Error from refresh attempt
 * @returns 'auth' for permanent auth errors, 'network' for transient errors
 */
function classifyRefreshError(error: unknown): 'auth' | 'network' {
  // Check for HTTP status codes indicating auth errors
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status?: number }).status;
    if (status === 401 || status === 403) {
      return 'auth'; // Unauthorized or Forbidden = invalid/expired tokens
    }
  }

  // Check error message for auth-related keywords
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes('invalid') ||
      message.includes('expired') ||
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('refresh_token')
    ) {
      return 'auth'; // Permanent auth failure
    }

    // Network-related errors are transient
    if (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('fetch') ||
      message.includes('connection') ||
      message.includes('offline')
    ) {
      return 'network'; // Transient network failure
    }
  }

  // Conservative default: treat unknown errors as network issues
  // This allows offline trust window logic to apply
  return 'network';
}

/**
 * Creates a timeout promise for refresh operation.
 *
 * This timeout ensures the refresh call doesn't hang indefinitely.
 * If exceeded, the promise rejects with a timeout error that triggers
 * network error handling (offline trust window logic).
 *
 * @param ms - Timeout duration in milliseconds
 * @returns Promise that rejects after the specified duration
 */
function createTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Refresh timeout')), ms);
  });
}

/**
 * Executes the auth restore pipeline logic.
 *
 * This is the internal implementation that performs all restore steps:
 * loading stored session, refreshing tokens, handling errors, and
 * populating the auth store with the correct initial state.
 *
 * Called by restoreAuthStateOnLaunch with deduplication guard.
 *
 * @returns Promise that resolves when restore completes
 */
async function executeRestore(): Promise<void> {
  try {
    // Step 1: Mark hydration start
    useStore.getState().beginHydration();
    logAuthEvent('auth-restore-start', {
      outcome: 'started',
    });

    // Step 2: Load stored session from SecureStore
    const bundle = await loadStoredSession();

    // Step 3: No session path - user never logged in or logged out
    if (!bundle) {
      // Clean up any stale storage (defensive)
      await clearStoredSession();

      // Mark as unauthenticated with reason
      const i18nKey = mapLogoutReasonToI18nKey('no-session');
      useStore.getState().markUnauthenticated(i18nKey);

      // Emit telemetry
      logAuthEvent('auth-restore-no-session', {
        outcome: 'no-session',
      });

      return; // Exit early - endHydration in finally block
    }

    // Step 4: Session exists - attempt refresh with timeout
    try {
      // Race refresh call against timeout
      const { data, error } = await Promise.race([
        supabase.auth.refreshSession(),
        createTimeout(REFRESH_TIMEOUT_MS),
      ]);

      // Step 5: Success path - refresh succeeded
      if (!error && data?.session && data?.user) {
        // Persist refreshed session to SecureStore
        await saveSessionFromSupabase(data.session, new Date().toISOString());

        // Derive token metadata
        const { expiresAt } = deriveTokenExpiry(data.session);
        const tokenMetadata = {
          expiresAt,
          tokenType: data.session.token_type || 'bearer',
        };

        // Create user object
        const user = {
          id: data.user.id,
          email: data.user.email || '',
          emailVerified: !!data.user.email_confirmed_at,
          hasOnboarded: false,
        };

        // Apply authenticated state atomically
        useStore.getState().applyAuthenticatedUser(user, tokenMetadata);

        // Emit success telemetry
        logAuthEvent('auth-restore-success', {
          userId: user.id,
          outcome: 'success',
          metadata: {
            emailVerified: user.emailVerified,
          },
        });

        return; // Exit early - endHydration in finally block
      }

      // Step 6: Auth error path - invalid/expired tokens
      if (error) {
        const errorType = classifyRefreshError(error);

        if (errorType === 'auth') {
          // Permanent auth failure - clear session
          await clearStoredSession();

          // Mark as unauthenticated with session expired reason
          const i18nKey = mapLogoutReasonToI18nKey('session-expired');
          useStore.getState().markUnauthenticated(i18nKey);

          // Log error
          logError(error, 'user', {
            feature: 'auth',
            operation: 'restore-refresh',
            metadata: {
              reason: 'invalid_or_expired_token',
            },
          });

          // Emit telemetry
          logAuthEvent('auth-restore-failed-invalid-session', {
            outcome: 'failure',
            errorCode: 'invalid_token',
          });

          return; // Exit early - endHydration in finally block
        }

        // Network error - fall through to Step 7
      }

      // If we get here with no error but invalid data, treat as network error
      // (conservative approach - apply offline trust window)
    } catch (refreshError) {
      // Catch block handles both refresh errors and timeout
      // Classify to determine if auth error or network error
      const errorType = classifyRefreshError(refreshError);

      if (errorType === 'auth') {
        // Step 6 (from catch): Auth error path
        await clearStoredSession();
        const i18nKey = mapLogoutReasonToI18nKey('session-expired');
        useStore.getState().markUnauthenticated(i18nKey);

        logError(
          refreshError instanceof Error ? refreshError : new Error('Refresh auth error'),
          'user',
          {
            feature: 'auth',
            operation: 'restore-refresh',
            metadata: {
              reason: 'auth_error_in_catch',
            },
          }
        );

        logAuthEvent('auth-restore-failed-invalid-session', {
          outcome: 'failure',
          errorCode: 'auth_error',
        });

        return; // Exit early - endHydration in finally block
      }

      // Network error - continue to Step 7
    }

    // Step 7: Network error path - apply offline trust window logic
    // Calculate time since last successful auth
    const lastAuthTime = new Date(bundle.lastAuthSuccessAt).getTime();
    const now = Date.now();
    const timeSinceLastAuth = now - lastAuthTime;

    // Check if within 7-day trust window
    if (timeSinceLastAuth <= OFFLINE_TRUST_WINDOW_MS) {
      // Within trust window - trust cached session
      // Extract user from stored session
      const storedUser = bundle.session.user;
      if (!storedUser) {
        // Invalid stored session - treat as stale
        await clearStoredSession();
        const i18nKey = mapLogoutReasonToI18nKey('restore-failed-invalid');
        useStore.getState().markUnauthenticated(i18nKey);

        logAuthEvent('auth-restore-failed-stale', {
          outcome: 'failure',
          metadata: {
            reason: 'no_user_in_session',
          },
        });

        return; // Exit early - endHydration in finally block
      }

      // Derive token metadata from stored session
      const { expiresAt } = deriveTokenExpiry(bundle.session);
      const tokenMetadata = {
        expiresAt,
        tokenType: bundle.session.token_type || 'bearer',
      };

      // Create user object
      const user = {
        id: storedUser.id,
        email: storedUser.email || '',
        emailVerified: !!storedUser.email_confirmed_at,
        hasOnboarded: false,
      };

      // Apply authenticated state
      useStore.getState().applyAuthenticatedUser(user, tokenMetadata);

      // Set needsRefresh flag for deferred refresh
      useStore.getState().setNeedsRefresh(true);
      await markNeedsRefreshInStorage();

      // Emit telemetry
      logAuthEvent('auth-restore-offline-trusted', {
        outcome: 'offline-trusted',
        metadata: {
          timeSinceLastAuthDays: Math.floor(timeSinceLastAuth / (24 * 60 * 60 * 1000)),
        },
      });

      return; // Exit early - endHydration in finally block
    } else {
      // Outside trust window - session too stale
      await clearStoredSession();

      // Mark as unauthenticated with stale session reason
      const i18nKey = mapLogoutReasonToI18nKey('restore-failed-stale');
      useStore.getState().markUnauthenticated(i18nKey);

      // Emit telemetry
      logAuthEvent('auth-restore-failed-stale', {
        outcome: 'failure',
        metadata: {
          timeSinceLastAuthDays: Math.floor(timeSinceLastAuth / (24 * 60 * 60 * 1000)),
        },
      });

      return; // Exit early - endHydration in finally block
    }
  } catch (error) {
    // Catch-all for unexpected errors during restore
    // Treat conservatively as stale session
    await clearStoredSession();
    const i18nKey = mapLogoutReasonToI18nKey('restore-failed-error');
    useStore.getState().markUnauthenticated(i18nKey);

    logError(error instanceof Error ? error : new Error('Unknown restore error'), 'server', {
      feature: 'auth',
      operation: 'restore',
      metadata: {
        reason: 'unexpected_error',
      },
    });

    logAuthEvent('auth-restore-failed-stale', {
      outcome: 'failure',
      errorCode: 'unexpected_error',
    });
  } finally {
    // Step 9: Always mark hydration complete
    useStore.getState().endHydration();
  }
}

/**
 * Restores authentication state on app cold start.
 *
 * This is the main entry point for the auth restore pipeline. It orchestrates
 * loading the stored session, validating/refreshing tokens, and populating
 * the auth store with the correct initial state.
 *
 * IDEMPOTENCY: This function is guarded to execute at most once per app cold
 * start. Multiple simultaneous calls will share the same execution promise.
 *
 * LIFECYCLE:
 * 1. Sets isHydrating=true to prevent UI rendering before restore completes
 * 2. Loads stored session from SecureStore
 * 3. If no session: marks unauthenticated and routes to Login
 * 4. If session exists: attempts refresh with 8-second timeout
 * 5. On success: updates session, sets authenticated state
 * 6. On auth error: clears session, marks unauthenticated (session expired)
 * 7. On network error:
 *    - Within 7-day window: trusts cached session, sets needsRefresh
 *    - Outside window: clears session, marks unauthenticated (stale)
 * 8. Emits telemetry events for observability
 * 9. Sets isHydrating=false to allow UI routing
 *
 * OFFLINE HANDLING:
 * When offline at cold start, cached sessions are trusted for up to 7 days
 * from the last successful authentication. This balances security (limiting
 * offline access duration) with usability (allowing temporary offline use).
 *
 * SECURITY:
 * - Never logs tokens, refresh tokens, or session objects
 * - Only logs metadata: userId, emailVerified, timeSinceLastAuth
 * - Clears stored session on any permanent auth failure
 * - Uses SecureStore for all token storage
 *
 * INTEGRATION:
 * Called once from the root layout component before rendering any screens.
 * The auth store's isHydrating flag prevents premature screen rendering.
 *
 * @returns Promise that resolves when restore completes (success or failure)
 *
 * @example
 * ```typescript
 * // In root layout (_layout.tsx)
 * useEffect(() => {
 *   restoreAuthStateOnLaunch();
 * }, []);
 * ```
 */
export async function restoreAuthStateOnLaunch(): Promise<void> {
  // Guard: if restore already in progress, return the existing promise
  if (isRestoreInProgress && restorePromise) {
    return restorePromise;
  }

  // Mark restore as in progress
  isRestoreInProgress = true;

  // Create and store the restore promise
  restorePromise = executeRestore();

  try {
    // Wait for restore to complete
    await restorePromise;
  } finally {
    // Reset guards after completion
    isRestoreInProgress = false;
    restorePromise = null;
  }
}
