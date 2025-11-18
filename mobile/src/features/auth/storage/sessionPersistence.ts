import * as SecureStore from 'expo-secure-store';
import { Session } from '@supabase/supabase-js';
import { logAuthEvent, logError } from '../../../core/telemetry';

/**
 * SecureStore key for the session bundle.
 *
 * This key is separate from Supabase's internal session storage key
 * (typically 'sb-<project-ref>-auth-token') to maintain separation of
 * concerns between Supabase's automatic token management and our explicit
 * app-level session persistence with additional metadata.
 *
 * SECURITY: This key points to encrypted storage containing sensitive tokens.
 * Never log the contents of this key or expose it to non-secure storage.
 */
const SESSION_BUNDLE_KEY = 'maidrobe:auth:session-bundle';

/**
 * Options for SecureStore operations.
 *
 * Configured to match the security settings used in the Supabase storage
 * adapter (mobile/src/services/secureStorage.ts) for consistency.
 */
const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  // iOS: Keychain accessibility - ALWAYS_THIS_DEVICE_ONLY
  // Prevents session backup to iCloud and limits access to this device
  keychainAccessible: SecureStore.ALWAYS_THIS_DEVICE_ONLY,

  // requireAuthentication: false - See mobile/src/services/secureStorage.ts
  // for detailed security trade-off analysis. This allows background token
  // refresh and seamless session restoration without biometric prompts.
  requireAuthentication: false,
};

/**
 * Stored session bundle containing Supabase session data plus app metadata.
 *
 * This bundle extends the standard Supabase session with additional metadata
 * required for the auth restore pipeline, offline trust window logic, and
 * deferred token refresh scenarios.
 *
 * SECURITY WARNING:
 * This bundle contains highly sensitive cryptographic material:
 * - session.access_token: Bearer token for API authentication
 * - session.refresh_token: Long-lived token for obtaining new access tokens
 *
 * This data MUST:
 * - Only be stored in SecureStore (encrypted at rest)
 * - Never be logged to console, telemetry, or debug tools
 * - Never be exposed to UI components or React DevTools
 * - Never be duplicated to AsyncStorage or other insecure storage
 * - Only be accessed by auth restore and token refresh logic
 *
 * @property session - Supabase session object (contains tokens, user, expiry)
 * @property lastAuthSuccessAt - ISO 8601 timestamp of last successful auth/refresh
 * @property needsRefresh - Optional flag indicating deferred refresh is needed
 */
export interface StoredSessionBundle {
  /**
   * Supabase session object containing:
   * - access_token: JWT for API authentication
   * - refresh_token: Token for obtaining new access tokens
   * - expires_at: Unix timestamp (seconds) when access token expires
   * - expires_in: Duration (seconds) until access token expires
   * - token_type: Token type (typically 'bearer')
   * - user: User metadata (id, email, email_confirmed_at, etc.)
   *
   * SECURITY: Contains sensitive cryptographic tokens - never log this object.
   */
  session: Session;

  /**
   * ISO 8601 timestamp of the last successful authentication or token refresh.
   *
   * This timestamp is used to implement the 7-day offline trust window:
   * - If device is offline and now - lastAuthSuccessAt <= 7 days: trust cached session
   * - If device is offline and now - lastAuthSuccessAt > 7 days: treat as stale
   *
   * Format: "2025-11-15T10:30:00.000Z"
   * Timezone: Always UTC
   *
   * Updated on:
   * - Successful login (supabase.auth.signInWithPassword)
   * - Successful token refresh (supabase.auth.refreshSession)
   * - Successful signup with auto-login
   */
  lastAuthSuccessAt: string;

  /**
   * Optional flag indicating that a token refresh is needed but was deferred.
   *
   * Set to true when:
   * - Device was offline at cold start
   * - Cached session is within 7-day trust window
   * - App proceeded with cached session (optimistic trust)
   * - Refresh should be attempted when connectivity restored
   *
   * Set to false/undefined when:
   * - Successful refresh completes
   * - User logs out
   * - Session is cleared
   *
   * This flag enables background "catch-up" refresh after offline startups
   * to ensure tokens are updated as soon as network is available.
   */
  needsRefresh?: boolean;

  /**
   * Optional flag indicating whether the user has completed onboarding.
   *
   * This field is persisted in the session bundle to support offline scenarios
   * where the device cannot fetch the user's profile from the server. Without
   * this field, offline users would incorrectly be routed to onboarding on
   * every cold start even after completing onboarding.
   *
   * OFFLINE TRUST MODE BEHAVIOR:
   * When the device is offline during auth restore and the session is within
   * the 7-day trust window, the auth restore pipeline uses this cached value
   * to determine onboarding state instead of attempting a network fetch that
   * will fail or timeout.
   *
   * SOURCE OF TRUTH:
   * The server's public.profiles.has_onboarded column is the authoritative
   * source of truth. This field is a cached copy for offline resilience only.
   * When online, the profile is always fetched fresh and this cache is updated.
   *
   * SYNCHRONIZATION:
   * - Set when user completes onboarding (completeOnboarding.ts)
   * - Updated on successful login (useLogin.ts)
   * - Updated on successful token refresh (authRestore.ts)
   * - Cleared on logout or session invalidation
   *
   * BACKWARD COMPATIBILITY:
   * This field is optional to support existing session bundles that were
   * saved before this field was added. If undefined, the auth restore logic
   * will attempt to fetch the profile or default to false.
   *
   * Added in: Story #95 (Onboarding Gate and User Flag Handling)
   */
  hasOnboarded?: boolean;
}

/**
 * Loads the stored session bundle from SecureStore.
 *
 * This function reads, parses, and validates the session bundle stored during
 * the last successful authentication or token refresh. It implements defensive
 * error handling to gracefully recover from corrupted or invalid data.
 *
 * Defensive Error Handling Strategy:
 * 1. SecureStore read errors -> log error, return null
 * 2. No stored data -> return null (normal unauthenticated state)
 * 3. JSON parse errors -> log error, clear storage, return null
 * 4. Invalid bundle structure -> log error, clear storage, return null
 * 5. Missing required fields -> log error, clear storage, return null
 *
 * The "clear on corruption" strategy ensures that invalid session data doesn't
 * persist across app restarts and cause repeated failures. The app will treat
 * corrupted sessions as "no session" and route to login.
 *
 * SECURITY:
 * - Never logs the session bundle contents (contains tokens)
 * - Only logs metadata (presence/absence, error types)
 * - Returns null on any error (fail-safe to unauthenticated state)
 *
 * @returns Promise resolving to stored session bundle or null if not found/invalid
 *
 * @example
 * ```typescript
 * const bundle = await loadStoredSession();
 * if (bundle) {
 *   // Valid session found, attempt restore/refresh
 *   const lastAuthTime = new Date(bundle.lastAuthSuccessAt).getTime();
 *   const isRecent = Date.now() - lastAuthTime < 7 * 24 * 60 * 60 * 1000;
 * } else {
 *   // No session or corrupted session, route to login
 * }
 * ```
 */
export async function loadStoredSession(): Promise<StoredSessionBundle | null> {
  try {
    // Read from SecureStore
    const stored = await SecureStore.getItemAsync(SESSION_BUNDLE_KEY, SECURE_STORE_OPTIONS);

    if (!stored) {
      // No stored session - normal unauthenticated state
      // This is expected on first app launch or after logout
      return null;
    }

    // Parse JSON with error handling
    let bundle: unknown;
    try {
      bundle = JSON.parse(stored);
    } catch (parseError) {
      // JSON parse error indicates corrupted data
      // Log the error and clear the corrupted storage
      const error = parseError instanceof Error ? parseError : new Error('JSON parse failed');
      logError(error, 'schema', {
        feature: 'auth',
        operation: 'session-load',
        metadata: {
          reason: 'json_parse_error',
          hasData: true,
        },
      });

      logAuthEvent('session-corrupted', {
        outcome: 'failure',
        metadata: {
          reason: 'json_parse_error',
        },
      });

      // Clear corrupted data to prevent repeated errors
      await clearStoredSession();
      return null;
    }

    // Validate bundle structure
    if (!bundle || typeof bundle !== 'object') {
      logError(new Error('Invalid session bundle: not an object'), 'schema', {
        feature: 'auth',
        operation: 'session-load',
        metadata: {
          reason: 'not_object',
          type: typeof bundle,
        },
      });

      logAuthEvent('session-corrupted', {
        outcome: 'failure',
        metadata: {
          reason: 'not_object',
        },
      });

      await clearStoredSession();
      return null;
    }

    // Type assertion for validation
    const candidate = bundle as Record<string, unknown>;

    // Validate required fields
    if (!candidate.session || typeof candidate.session !== 'object') {
      logError(new Error('Invalid session bundle: missing or invalid session'), 'schema', {
        feature: 'auth',
        operation: 'session-load',
        metadata: {
          reason: 'invalid_session_field',
          hasSession: !!candidate.session,
        },
      });

      logAuthEvent('session-corrupted', {
        outcome: 'failure',
        metadata: {
          reason: 'invalid_session_field',
        },
      });

      await clearStoredSession();
      return null;
    }

    if (!candidate.lastAuthSuccessAt || typeof candidate.lastAuthSuccessAt !== 'string') {
      const error = new Error('Invalid session bundle: missing or invalid lastAuthSuccessAt');
      logError(error, 'schema', {
        feature: 'auth',
        operation: 'session-load',
        metadata: {
          reason: 'invalid_lastAuthSuccessAt',
          hasField: !!candidate.lastAuthSuccessAt,
        },
      });

      logAuthEvent('session-corrupted', {
        outcome: 'failure',
        metadata: {
          reason: 'invalid_lastAuthSuccessAt',
        },
      });

      await clearStoredSession();
      return null;
    }

    // Validate lastAuthSuccessAt is a valid ISO 8601 date
    const lastAuthDate = new Date(candidate.lastAuthSuccessAt);
    if (isNaN(lastAuthDate.getTime())) {
      const error = new Error('Invalid session bundle: lastAuthSuccessAt is not a valid date');
      logError(error, 'schema', {
        feature: 'auth',
        operation: 'session-load',
        metadata: {
          reason: 'invalid_date_format',
        },
      });

      logAuthEvent('session-corrupted', {
        outcome: 'failure',
        metadata: {
          reason: 'invalid_date_format',
        },
      });

      await clearStoredSession();
      return null;
    }

    // Optional: validate needsRefresh if present
    if (candidate.needsRefresh !== undefined && typeof candidate.needsRefresh !== 'boolean') {
      logError(new Error('Invalid session bundle: needsRefresh is not a boolean'), 'schema', {
        feature: 'auth',
        operation: 'session-load',
        metadata: {
          reason: 'invalid_needsRefresh',
        },
      });

      logAuthEvent('session-corrupted', {
        outcome: 'failure',
        metadata: {
          reason: 'invalid_needsRefresh',
        },
      });

      await clearStoredSession();
      return null;
    }

    // All validations passed - return typed bundle
    // SECURITY: Do NOT log the bundle - it contains tokens
    logAuthEvent('session-load', {
      outcome: 'success',
      metadata: {
        hasNeedsRefresh: !!candidate.needsRefresh,
      },
    });

    return candidate as unknown as StoredSessionBundle;
  } catch (error) {
    // Catch-all for SecureStore errors or unexpected failures
    logError(
      error instanceof Error ? error : new Error('Unknown error loading session'),
      'server',
      {
        feature: 'auth',
        operation: 'session-load',
        metadata: {
          reason: 'storage_error',
        },
      }
    );

    logAuthEvent('session-load-error', {
      outcome: 'failure',
      metadata: {
        reason: 'storage_error',
      },
    });

    // Return null to fail gracefully (user will be routed to login)
    return null;
  }
}

/**
 * Saves a Supabase session to SecureStore with app metadata.
 *
 * This function is called after successful authentication or token refresh
 * to persist the session bundle for future cold-start restoration. The bundle
 * includes the Supabase session object plus app-specific metadata.
 *
 * When to call:
 * - After successful login (supabase.auth.signInWithPassword)
 * - After successful signup with auto-login
 * - After successful token refresh (supabase.auth.refreshSession)
 * - After successful password reset with auto-login
 *
 * When NOT to call:
 * - During logout (use clearStoredSession instead)
 * - On auth errors (let existing session persist or clear it)
 * - Before Supabase auth operation completes
 *
 * lastAuthSuccessAt Parameter:
 * - Pass Date.now() or current timestamp for login/refresh
 * - This timestamp drives the 7-day offline trust window logic
 * - Must be ISO 8601 format in UTC timezone
 *
 * Error Handling:
 * - SecureStore write errors are logged but not thrown
 * - Failures to save don't block the auth flow (user is still authenticated)
 * - Next cold start will have no cached session (must refresh via network)
 * - This fail-open strategy prioritizes availability over perfect persistence
 *
 * SECURITY:
 * - Never logs the session object (contains tokens)
 * - Only logs metadata (success/failure, presence of fields)
 * - Stores encrypted in SecureStore with device-only access
 *
 * @param session - Supabase session object from auth operation
 * @param lastAuthSuccessAt - ISO 8601 timestamp of successful auth (typically Date.now())
 * @returns Promise that resolves when save completes (or fails silently)
 *
 * @example
 * ```typescript
 * // After login
 * const { data } = await supabase.auth.signInWithPassword({ email, password });
 * if (data.session) {
 *   await saveSessionFromSupabase(data.session, new Date().toISOString());
 * }
 *
 * // After token refresh
 * const { data } = await supabase.auth.refreshSession();
 * if (data.session) {
 *   await saveSessionFromSupabase(data.session, new Date().toISOString());
 * }
 * ```
 */
export async function saveSessionFromSupabase(
  session: Session,
  lastAuthSuccessAt: string,
  hasOnboarded?: boolean
): Promise<void> {
  try {
    // Validate inputs
    if (!session) {
      logError(new Error('Cannot save session: session is null or undefined'), 'user', {
        feature: 'auth',
        operation: 'session-save',
        metadata: {
          reason: 'null_session',
        },
      });
      return;
    }

    if (!lastAuthSuccessAt || typeof lastAuthSuccessAt !== 'string') {
      logError(new Error('Cannot save session: lastAuthSuccessAt is invalid'), 'user', {
        feature: 'auth',
        operation: 'session-save',
        metadata: {
          reason: 'invalid_lastAuthSuccessAt',
        },
      });
      return;
    }

    // Create session bundle
    const bundle: StoredSessionBundle = {
      session,
      lastAuthSuccessAt,
      needsRefresh: false, // Reset on successful auth
      ...(hasOnboarded !== undefined && { hasOnboarded }), // Include only if defined
    };

    // Stringify bundle
    const serialized = JSON.stringify(bundle);

    // Write to SecureStore
    // SECURITY WARNING: serialized contains access_token and refresh_token
    // Never log this value
    await SecureStore.setItemAsync(SESSION_BUNDLE_KEY, serialized, SECURE_STORE_OPTIONS);

    // Log success (without sensitive data)
    logAuthEvent('session-save', {
      outcome: 'success',
      metadata: {
        hasSession: true,
        hasLastAuthSuccessAt: true,
      },
    });
  } catch (error) {
    // Log error but don't throw - save failures shouldn't block auth flow
    logError(
      error instanceof Error ? error : new Error('Unknown error saving session'),
      'server',
      {
        feature: 'auth',
        operation: 'session-save',
        metadata: {
          reason: 'storage_error',
        },
      }
    );

    logAuthEvent('session-save-error', {
      outcome: 'failure',
      metadata: {
        reason: 'storage_error',
      },
    });

    // Fail silently - user is still authenticated in current session
    // Next cold start will require network refresh (no cached session)
  }
}

/**
 * Clears the stored session bundle from SecureStore.
 *
 * This function removes the session bundle from encrypted storage, ensuring
 * that no session data persists after logout or when session becomes invalid.
 *
 * When to call:
 * - During user-initiated logout
 * - After forced logout due to session expiry
 * - After detecting corrupted session data
 * - When refresh token is invalid/expired
 * - When clearing all auth state
 *
 * Error Handling:
 * - SecureStore deletion errors are logged but not thrown
 * - Even if deletion fails, app proceeds with logout
 * - This fail-safe strategy ensures user can always log out
 * - Orphaned session data will be validated/cleared on next load attempt
 *
 * SECURITY:
 * - Ensures no sensitive tokens remain in storage after logout
 * - Critical for multi-user devices and shared access scenarios
 * - Part of the comprehensive auth state cleanup process
 *
 * @returns Promise that resolves when clear completes (or fails silently)
 *
 * @example
 * ```typescript
 * // During logout
 * await clearStoredSession();
 * await supabase.auth.signOut();
 * useStore.getState().clearUser();
 *
 * // After detecting invalid session
 * if (session.isInvalid) {
 *   await clearStoredSession();
 * }
 * ```
 */
export async function clearStoredSession(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SESSION_BUNDLE_KEY, SECURE_STORE_OPTIONS);

    logAuthEvent('session-cleared', {
      outcome: 'success',
    });
  } catch (error) {
    // Log error but don't throw - clear failures shouldn't block logout
    logError(
      error instanceof Error ? error : new Error('Unknown error clearing session'),
      'server',
      {
        feature: 'auth',
        operation: 'session-clear',
        metadata: {
          reason: 'storage_error',
        },
      }
    );

    logAuthEvent('session-clear-error', {
      outcome: 'failure',
      metadata: {
        reason: 'storage_error',
      },
    });

    // Fail silently - logout proceeds regardless
    // Orphaned data will be validated/cleared on next load
  }
}

/**
 * Marks the stored session as needing refresh.
 *
 * This function updates the needsRefresh flag in the stored session bundle
 * without modifying the session data itself. It's used to flag sessions that
 * were trusted during offline cold starts but still need refresh when online.
 *
 * When to call:
 * - After offline cold start within 7-day trust window
 * - When proceeding with cached session due to network unavailability
 * - Before routing user to app (to flag deferred refresh)
 *
 * The flag enables background "catch-up" refresh:
 * - Token refresh manager checks this flag on connectivity restore
 * - Triggers refresh attempt when network becomes available
 * - Ensures tokens are updated even if user stayed offline for days
 *
 * Error Handling:
 * - If no session exists, logs warning and returns (no-op)
 * - If read/write fails, logs error and returns (non-critical)
 * - Failures don't block app usage (refresh will be attempted anyway)
 *
 * @returns Promise that resolves when flag is set (or fails silently)
 *
 * @example
 * ```typescript
 * // During offline cold start
 * const bundle = await loadStoredSession();
 * if (bundle && isWithinTrustWindow(bundle.lastAuthSuccessAt)) {
 *   // Trust the cached session
 *   await markNeedsRefresh();
 *   // Proceed to app, refresh later when online
 * }
 * ```
 */
export async function markNeedsRefresh(): Promise<void> {
  try {
    // Load current session bundle
    const bundle = await loadStoredSession();

    if (!bundle) {
      // No session to mark - log warning and return
      // This is expected if called after logout or before first login
      logError(new Error('Cannot mark needs refresh: no stored session'), 'user', {
        feature: 'auth',
        operation: 'mark-needs-refresh',
        metadata: {
          reason: 'no_session',
        },
      });
      return;
    }

    // Update needsRefresh flag
    bundle.needsRefresh = true;

    // Save updated bundle
    const serialized = JSON.stringify(bundle);
    await SecureStore.setItemAsync(SESSION_BUNDLE_KEY, serialized, SECURE_STORE_OPTIONS);

    logAuthEvent('session-mark-needs-refresh', {
      outcome: 'success',
    });
  } catch (error) {
    // Log error but don't throw - flag update is non-critical
    logError(
      error instanceof Error ? error : new Error('Unknown error marking needs refresh'),
      'server',
      {
        feature: 'auth',
        operation: 'mark-needs-refresh',
        metadata: {
          reason: 'storage_error',
        },
      }
    );

    // Fail silently - refresh will be attempted anyway based on token expiry
  }
}

/**
 * Clears the needsRefresh flag from the stored session.
 *
 * This function resets the needsRefresh flag after a successful token refresh
 * completes. It's the complement to markNeedsRefresh().
 *
 * When to call:
 * - After successful token refresh (supabase.auth.refreshSession)
 * - When online refresh completes following offline startup
 * - As part of normal refresh flow cleanup
 *
 * Note: This function is typically not needed because saveSessionFromSupabase()
 * already sets needsRefresh to false. However, it's provided for explicit
 * flag management in edge cases.
 *
 * Error Handling:
 * - If no session exists, logs warning and returns (no-op)
 * - If read/write fails, logs error and returns (non-critical)
 * - Failures don't block app usage (flag will be reset on next save)
 *
 * @returns Promise that resolves when flag is cleared (or fails silently)
 *
 * @example
 * ```typescript
 * // After successful refresh following offline startup
 * const { data } = await supabase.auth.refreshSession();
 * if (data.session) {
 *   await saveSessionFromSupabase(data.session, new Date().toISOString());
 *   // needsRefresh is automatically cleared in saveSessionFromSupabase
 *   // But can explicitly call clearNeedsRefresh() if needed
 * }
 * ```
 */
export async function clearNeedsRefresh(): Promise<void> {
  try {
    // Load current session bundle
    const bundle = await loadStoredSession();

    if (!bundle) {
      // No session to update - this is expected after logout
      return;
    }

    // Clear needsRefresh flag
    bundle.needsRefresh = false;

    // Save updated bundle
    const serialized = JSON.stringify(bundle);
    await SecureStore.setItemAsync(SESSION_BUNDLE_KEY, serialized, SECURE_STORE_OPTIONS);

    logAuthEvent('session-clear-needs-refresh', {
      outcome: 'success',
    });
  } catch (error) {
    // Log error but don't throw - flag update is non-critical
    logError(
      error instanceof Error ? error : new Error('Unknown error clearing needs refresh'),
      'server',
      {
        feature: 'auth',
        operation: 'clear-needs-refresh',
        metadata: {
          reason: 'storage_error',
        },
      }
    );

    // Fail silently - flag will be reset on next saveSessionFromSupabase call
  }
}
