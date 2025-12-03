/**
 * Outfit Recommendation Stub Flag Evaluation Helper
 *
 * This module provides a dedicated client-side evaluation helper for the
 * `outfit_recommendation_stub` feature flag. It encapsulates all environment-
 * and cohort-specific logic with proper caching, fallback behavior, and
 * timeout handling.
 *
 * EVALUATION LOGIC:
 * 1. Fetch remote flag value from server with bounded timeout (400ms)
 * 2. If remote fetch succeeds, use that value (honour explicit OFF)
 * 3. If remote fetch fails/times out:
 *    a. Use last-known cached value if available
 *    b. Otherwise, apply environment-specific defaults:
 *       - development: ON for all users
 *       - staging: ON for internal, OFF for others
 *       - production: OFF for all users
 *
 * CACHING STRATEGY:
 * - Per-session cache: Module-level variable, stable for app session
 * - Cross-session cache: AsyncStorage, restored on app launch
 * - Cache cleared on logout
 *
 * SESSION STABILITY:
 * Once a flag value is determined for a session, it remains stable.
 * No mid-session flip-flopping due to network conditions or retries.
 *
 * STARTUP EVALUATION BEHAVIOR:
 * The useOutfitRecommendationStubFlag hook implements a two-phase startup:
 *
 * Phase 1 - Cache Initialization:
 *   On mount, the hook loads any persisted value from AsyncStorage into the
 *   session cache. This provides immediate UI decisions based on the last
 *   known value while waiting for the server.
 *
 * Phase 2 - Background Refresh:
 *   After cache initialization, the hook triggers a background refresh to
 *   fetch the latest value from the server. During this refresh:
 *   - resetSessionCache() is called to clear the session cache
 *   - evaluateOutfitRecommendationStubFlag() fetches a fresh value
 *
 *   IMPORTANT: There is a brief window (typically <500ms) between these calls
 *   where synchronous accessors behave as follows:
 *   - getOutfitRecommendationStubFlagSync() returns null
 *   - isOutfitRecommendationStubFlagEvaluated() returns false
 *   - canAccessRecommendations() returns { allowed: false, reason: 'flag_not_evaluated' }
 *
 *   This window does NOT affect consumers of the React hook, as the hook
 *   maintains its own local state and only updates after evaluation completes.
 *
 *   For imperative code that uses synchronous accessors during startup:
 *   - Use getOutfitRecommendationStubFlagWithFallback() for a value that never returns null
 *   - Or check the source field to detect fallback values and handle accordingly
 *
 * @module core/featureFlags/outfitRecommendationStubFlag
 * @see Story #366 - Outfit Recommendation Engine Feature Flag and Controlled Rollout
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../services/supabase';
import { checkIsOffline } from '../../features/recommendations/hooks/useNetworkStatus';
import { useStore } from '../state/store';
import { useProfile } from '../../features/auth/api/useProfile';
import { getAppEnvironment, type AppEnvironment } from './config';
import { trackFeatureFlagEvent } from '../telemetry';
import type { UserRole } from '../../features/auth/types/profile';
import { DEFAULT_USER_ROLE } from '../../features/auth/types/profile';

/**
 * Flag key constant for consistent usage in telemetry.
 */
const FLAG_KEY = 'outfit_recommendation_stub';

// ============================================================================
// Types
// ============================================================================

/**
 * Source of the evaluated flag value.
 *
 * - 'remote': Value fetched successfully from the server
 * - 'cached': Value restored from AsyncStorage (cross-session cache)
 * - 'fallback': Environment-specific default applied
 */
export type FlagValueSource = 'remote' | 'cached' | 'fallback';

/**
 * Result of evaluating the outfit recommendation stub flag.
 *
 * Contains the evaluated value plus metadata about how it was determined.
 * This information is useful for debugging, analytics, and understanding
 * the user's experience.
 */
export interface OutfitRecommendationStubFlagResult {
  /** Whether the outfit recommendation stub feature is enabled */
  enabled: boolean;
  /** How the value was determined */
  source: FlagValueSource;
  /** Current app environment */
  environment: AppEnvironment;
  /** User's role/cohort used for evaluation */
  userRole: UserRole;
  /** Timestamp when evaluation occurred */
  evaluatedAt: string;
}

/**
 * Cached flag value stored in AsyncStorage.
 */
interface CachedFlagValue {
  /** The cached flag value */
  enabled: boolean;
  /** User ID this cache belongs to */
  userId: string;
  /** User role at time of caching */
  userRole: UserRole;
  /** ISO timestamp when cached */
  cachedAt: string;
  /** Environment when cached */
  environment: AppEnvironment;
}

/**
 * Response structure from the get-feature-flags Edge Function.
 */
interface FeatureFlagsResponse {
  success: boolean;
  flags?: {
    wardrobe_image_cleanup_enabled: boolean;
    wardrobe_ai_attributes_enabled: boolean;
    outfit_recommendation_stub_enabled: boolean;
  };
  timestamp?: string;
  error?: string;
  code?: string;
  defaults_used?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * AsyncStorage key for cross-session flag cache.
 */
const CACHE_STORAGE_KEY = 'maidrobe-outfit-recommendation-stub-cache';

/**
 * Timeout for remote flag fetch in milliseconds.
 * Per NFRs: 300-500ms timeout after which fallback logic is triggered.
 */
const REMOTE_FETCH_TIMEOUT_MS = 400;

/**
 * Maximum age for cached values in milliseconds (24 hours).
 * Stale cache is still used as fallback but logged for monitoring.
 */
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// ============================================================================
// Session Cache (Module-level)
// ============================================================================

/**
 * Per-session cache for the evaluated flag result.
 *
 * Once populated, this value is used for the remainder of the app session
 * to prevent mid-session flip-flopping. Reset on app restart or logout.
 */
let sessionCache: OutfitRecommendationStubFlagResult | null = null;

/**
 * Flag indicating whether evaluation is currently in progress.
 * Prevents concurrent evaluations from racing.
 */
let evaluationInProgress: Promise<OutfitRecommendationStubFlagResult> | null = null;

// ============================================================================
// Environment-Specific Defaults
// ============================================================================

/**
 * Gets the environment-specific default flag value.
 *
 * These defaults are used when:
 * - Remote fetch fails or times out
 * - No cached value is available
 * - Flag key is missing from server response
 *
 * Default logic per user story:
 * - development: ON for all users (unblock local development)
 * - staging: ON for internal testers, OFF for others
 * - production: OFF for all users (explicit config required)
 *
 * @param environment - Current app environment
 * @param userRole - User's role/cohort
 * @returns Default flag value for this environment and role
 */
function getEnvironmentDefault(environment: AppEnvironment, userRole: UserRole): boolean {
  switch (environment) {
    case 'development':
      // Development: ON for all users to unblock local development
      return true;

    case 'staging':
      // Staging: ON for internal testers only
      return userRole === 'internal';

    case 'production':
      // Production: OFF for all by default (explicit config required)
      return false;

    default:
      // Fallback to safe default (OFF)
      return false;
  }
}

// ============================================================================
// Cross-Session Cache (AsyncStorage)
// ============================================================================

/**
 * Loads cached flag value from AsyncStorage.
 *
 * Returns null if:
 * - No cached value exists
 * - Cache is for a different user
 * - Cache is corrupted/invalid
 *
 * Note: Does NOT check cache age - caller should check if needed.
 *
 * @param userId - Current user's ID
 * @returns Cached value or null
 */
async function loadCachedFlagValue(userId: string): Promise<CachedFlagValue | null> {
  try {
    const cached = await AsyncStorage.getItem(CACHE_STORAGE_KEY);

    if (!cached) {
      return null;
    }

    const parsed = JSON.parse(cached) as CachedFlagValue;

    // Validate cache belongs to this user
    if (parsed.userId !== userId) {
      // Cache is for different user - don't use it
      return null;
    }

    // Validate required fields exist
    if (
      typeof parsed.enabled !== 'boolean' ||
      typeof parsed.cachedAt !== 'string' ||
      typeof parsed.userRole !== 'string'
    ) {
      // Cache is corrupted
      return null;
    }

    return parsed;
  } catch {
    // Parse error or storage error - return null
    return null;
  }
}

/**
 * Saves flag value to AsyncStorage for cross-session persistence.
 *
 * @param value - Flag value to cache
 * @param userId - User ID this cache belongs to
 * @param userRole - User's role at time of caching
 * @param environment - Environment at time of caching
 */
async function saveCachedFlagValue(
  value: boolean,
  userId: string,
  userRole: UserRole,
  environment: AppEnvironment
): Promise<void> {
  try {
    const cacheEntry: CachedFlagValue = {
      enabled: value,
      userId,
      userRole,
      cachedAt: new Date().toISOString(),
      environment,
    };

    await AsyncStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(cacheEntry));
  } catch {
    // Storage error - log but don't fail
    // eslint-disable-next-line no-console
    console.warn('[OutfitRecommendationStubFlag] Failed to save cache');
  }
}

/**
 * Clears the cross-session cache.
 *
 * Should be called on logout to ensure fresh evaluation for next user.
 */
export async function clearOutfitRecommendationStubFlagCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_STORAGE_KEY);
    // Also clear session cache
    sessionCache = null;
    evaluationInProgress = null;
  } catch {
    // Storage error - log but don't fail
    // eslint-disable-next-line no-console
    console.warn('[OutfitRecommendationStubFlag] Failed to clear cache');
  }
}

/**
 * Initializes the session cache from AsyncStorage on app launch.
 *
 * This function should be called early in the app lifecycle (e.g., during
 * auth restore) to enable immediate UI decisions based on cached values
 * before the remote flag fetch completes.
 *
 * After calling this function:
 * - getOutfitRecommendationStubFlagSync() may return a cached value
 * - A subsequent call to evaluateOutfitRecommendationStubFlag() will
 *   perform a background refresh and update the cache if needed
 *
 * @param userId - Current user's ID
 * @param userRole - User's role for fallback calculation
 * @returns The cached result if available, or null if no valid cache exists
 *
 * @example
 * ```typescript
 * // During auth restore, after user is authenticated
 * const cachedResult = await initializeOutfitRecommendationStubFlagFromCache(
 *   user.id,
 *   profile.role
 * );
 *
 * if (cachedResult) {
 *   // Can use cachedResult.enabled for immediate UI decisions
 *   // Then trigger background refresh
 *   evaluateOutfitRecommendationStubFlag(user.id, profile.role);
 * }
 * ```
 */
export async function initializeOutfitRecommendationStubFlagFromCache(
  userId: string,
  userRole: UserRole = DEFAULT_USER_ROLE
): Promise<OutfitRecommendationStubFlagResult | null> {
  // If session cache already exists, return it
  if (sessionCache !== null) {
    return sessionCache;
  }

  // Try to load from AsyncStorage
  const cached = await loadCachedFlagValue(userId);

  if (cached === null) {
    return null;
  }

  // Check if cache is for current user (already validated in loadCachedFlagValue)
  // Create result from cached value
  const environment = getAppEnvironment();
  const result: OutfitRecommendationStubFlagResult = {
    enabled: cached.enabled,
    source: 'cached',
    environment,
    userRole: cached.userRole as UserRole,
    evaluatedAt: new Date().toISOString(),
  };

  // Populate session cache for immediate sync access
  sessionCache = result;

  return result;
}

// ============================================================================
// Remote Flag Fetch
// ============================================================================

/**
 * Fetches the flag value from the server with bounded timeout.
 *
 * Makes a request to the get-feature-flags Edge Function with the user's
 * role as a query parameter for cohort-based targeting.
 *
 * ERROR HANDLING:
 * - Network errors: Logged and return null (will trigger fallback)
 * - Timeout (400ms): Logged as timeout and return null
 * - Invalid response: Logged and return null
 * - All errors are tracked via telemetry for observability
 *
 * @param userRole - User's role for cohort targeting
 * @param userId - User ID for logging (not used for targeting)
 * @returns Flag value from server, or null if fetch failed/timed out
 */
async function fetchRemoteFlagValue(userRole: UserRole, userId: string): Promise<boolean | null> {
  const startTime = Date.now();
  const environment = getAppEnvironment();

  // Promise.race to implement timeout since Supabase functions.invoke
  // doesn't directly support AbortSignal
  const timeoutPromise = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), REMOTE_FETCH_TIMEOUT_MS);
  });

  try {
    // Build query params for cohort targeting
    // Note: URLSearchParams handles encoding automatically, but we apply
    // encodeURIComponent defensively to ensure user_id remains safe if
    // ID formats change or if this code is refactored to use string concatenation.
    const queryParams = new URLSearchParams({
      role: userRole,
      user_id: encodeURIComponent(userId),
    });

    const fetchPromise = supabase.functions.invoke<FeatureFlagsResponse>(
      `get-feature-flags?${queryParams.toString()}`,
      { method: 'GET' }
    );

    // Race between fetch and timeout
    const result = await Promise.race([
      fetchPromise,
      timeoutPromise.then(() => ({
        data: null,
        error: { message: 'timeout' } as { message: string },
      })),
    ]);

    const { data, error } = result;
    const latencyMs = Date.now() - startTime;

    // Check if timeout occurred (error message will be 'timeout')
    if (error?.message === 'timeout') {
      // eslint-disable-next-line no-console
      console.warn('[OutfitRecommendationStubFlag] Remote fetch timed out');

      // Track timeout event
      trackFeatureFlagEvent('feature_flag.outfit_recommendation_stub.timeout', {
        userId,
        flagKey: FLAG_KEY,
        enabled: false,
        source: 'fallback',
        environment,
        userRole,
        latencyMs,
        errorCode: 'timeout',
        metadata: {
          timeoutMs: REMOTE_FETCH_TIMEOUT_MS,
        },
      });

      return null;
    }

    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[OutfitRecommendationStubFlag] Remote fetch error:', error.message);

      // Track error event
      trackFeatureFlagEvent('feature_flag.outfit_recommendation_stub.error', {
        userId,
        flagKey: FLAG_KEY,
        enabled: false,
        source: 'fallback',
        environment,
        userRole,
        latencyMs,
        errorCode: 'supabase_error',
        metadata: {
          errorMessage: error.message,
        },
      });

      return null;
    }

    if (!data || !data.success || !data.flags) {
      // eslint-disable-next-line no-console
      console.warn('[OutfitRecommendationStubFlag] Invalid response:', data);

      // Track invalid response
      trackFeatureFlagEvent('feature_flag.outfit_recommendation_stub.error', {
        userId,
        flagKey: FLAG_KEY,
        enabled: false,
        source: 'fallback',
        environment,
        userRole,
        latencyMs,
        errorCode: 'invalid_response',
        metadata: {
          hasData: !!data,
          success: data?.success,
          hasFlags: !!data?.flags,
        },
      });

      return null;
    }

    // Return the flag value (honour explicit OFF from server)
    return data.flags.outfit_recommendation_stub_enabled;
  } catch (err) {
    const latencyMs = Date.now() - startTime;

    // eslint-disable-next-line no-console
    console.warn('[OutfitRecommendationStubFlag] Remote fetch failed:', err);

    // Track error event
    trackFeatureFlagEvent('feature_flag.outfit_recommendation_stub.error', {
      userId,
      flagKey: FLAG_KEY,
      enabled: false,
      source: 'fallback',
      environment,
      userRole,
      latencyMs,
      errorCode: 'fetch_error',
      metadata: {
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });

    return null;
  }
}

// ============================================================================
// Main Evaluation Function
// ============================================================================

/**
 * Evaluates the outfit recommendation stub flag for a user.
 *
 * This is the main entry point for flag evaluation. It handles:
 * 1. Session cache check (return immediately if already evaluated)
 * 2. Offline detection (skip remote fetch if offline)
 * 3. Remote flag fetch with timeout
 * 4. Fallback to cached value or environment defaults
 * 5. Session cache population for stability
 *
 * IMPORTANT: Once evaluated, the result is cached for the session.
 * Call this early in the app lifecycle (e.g., after auth) and reuse
 * the result via getOutfitRecommendationStubFlagSync().
 *
 * @param userId - Current user's ID (from auth state)
 * @param userRole - User's role/cohort (from profile)
 * @returns Evaluated flag result with metadata
 *
 * @example
 * ```typescript
 * // After auth restore, evaluate the flag
 * const result = await evaluateOutfitRecommendationStubFlag(user.id, profile.role);
 *
 * if (result.enabled) {
 *   // Show outfit recommendation UI
 * }
 *
 * // Log for analytics
 * trackEvent('feature_flag_evaluated', {
 *   flag_key: 'outfit_recommendation_stub',
 *   value: result.enabled ? 'on' : 'off',
 *   source: result.source,
 *   environment: result.environment,
 * });
 * ```
 */
export async function evaluateOutfitRecommendationStubFlag(
  userId: string,
  userRole: UserRole = DEFAULT_USER_ROLE
): Promise<OutfitRecommendationStubFlagResult> {
  // Check session cache first
  if (sessionCache !== null) {
    return sessionCache;
  }

  // Prevent concurrent evaluations
  if (evaluationInProgress !== null) {
    return evaluationInProgress;
  }

  // Start evaluation
  evaluationInProgress = performEvaluation(userId, userRole);

  try {
    const result = await evaluationInProgress;
    sessionCache = result;
    return result;
  } finally {
    evaluationInProgress = null;
  }
}

/**
 * Internal evaluation implementation.
 *
 * Separated from main function to handle concurrency properly.
 * Includes telemetry tracking for observability.
 */
async function performEvaluation(
  userId: string,
  userRole: UserRole
): Promise<OutfitRecommendationStubFlagResult> {
  const environment = getAppEnvironment();
  const evaluatedAt = new Date().toISOString();
  const startTime = Date.now();

  // Check if offline - skip remote fetch if so
  const isOffline = await checkIsOffline();

  let remoteValue: boolean | null = null;

  if (!isOffline) {
    // Attempt remote fetch with timeout
    remoteValue = await fetchRemoteFlagValue(userRole, userId);
  }

  // If we got a remote value, use it (honour explicit OFF)
  if (remoteValue !== null) {
    // Save to cache for future sessions
    await saveCachedFlagValue(remoteValue, userId, userRole, environment);

    const result: OutfitRecommendationStubFlagResult = {
      enabled: remoteValue,
      source: 'remote',
      environment,
      userRole,
      evaluatedAt,
    };

    // Track successful remote evaluation
    trackFeatureFlagEvent('feature_flag.outfit_recommendation_stub.evaluated', {
      userId,
      flagKey: FLAG_KEY,
      enabled: remoteValue,
      source: 'remote',
      environment,
      userRole,
      latencyMs: Date.now() - startTime,
    });

    return result;
  }

  // Remote fetch failed or we're offline - try cached value
  const cached = await loadCachedFlagValue(userId);

  if (cached !== null) {
    // Check if cache is stale (but still use it)
    const cacheAge = Date.now() - new Date(cached.cachedAt).getTime();
    if (cacheAge > CACHE_MAX_AGE_MS) {
      // eslint-disable-next-line no-console
      console.warn('[OutfitRecommendationStubFlag] Using stale cache', {
        cacheAgeHours: Math.round(cacheAge / (60 * 60 * 1000)),
      });
    }

    const result: OutfitRecommendationStubFlagResult = {
      enabled: cached.enabled,
      source: 'cached',
      environment,
      userRole,
      evaluatedAt,
    };

    // Track cached value usage
    trackFeatureFlagEvent('feature_flag.outfit_recommendation_stub.cached', {
      userId,
      flagKey: FLAG_KEY,
      enabled: cached.enabled,
      source: 'cached',
      environment,
      userRole,
      latencyMs: Date.now() - startTime,
      metadata: {
        cacheAgeHours: Math.round(cacheAge / (60 * 60 * 1000)),
        isStale: cacheAge > CACHE_MAX_AGE_MS,
        isOffline,
      },
    });

    return result;
  }

  // No remote value and no cache - use environment default
  const defaultValue = getEnvironmentDefault(environment, userRole);

  const result: OutfitRecommendationStubFlagResult = {
    enabled: defaultValue,
    source: 'fallback',
    environment,
    userRole,
    evaluatedAt,
  };

  // Track fallback usage
  trackFeatureFlagEvent('feature_flag.outfit_recommendation_stub.fallback', {
    userId,
    flagKey: FLAG_KEY,
    enabled: defaultValue,
    source: 'fallback',
    environment,
    userRole,
    latencyMs: Date.now() - startTime,
    metadata: {
      isOffline,
      reason: isOffline ? 'offline' : 'remote_fetch_failed',
    },
  });

  return result;
}

// ============================================================================
// Synchronous Accessor
// ============================================================================

/**
 * Gets the cached flag result synchronously.
 *
 * Returns the session-cached result if available, otherwise null.
 * This is useful in synchronous contexts (render functions, store getters)
 * where you can't await the evaluation.
 *
 * IMPORTANT: This only returns a value after evaluateOutfitRecommendationStubFlag()
 * has been called at least once in the current session. Call the async version
 * early in the app lifecycle to populate the session cache.
 *
 * STARTUP BEHAVIOR:
 * During the hook's background refresh phase (see module docs), this function
 * temporarily returns null even if a cached value was previously loaded from
 * AsyncStorage. This window typically lasts <500ms while the server fetch
 * completes. If your code cannot handle null during startup, use
 * getOutfitRecommendationStubFlagWithFallback() instead.
 *
 * @returns Cached result or null if not yet evaluated (or during background refresh)
 *
 * @example
 * ```typescript
 * // In a component or store getter
 * const flagResult = getOutfitRecommendationStubFlagSync();
 *
 * if (flagResult === null) {
 *   // Not yet evaluated - show loading or use safe default
 *   return null;
 * }
 *
 * return flagResult.enabled;
 * ```
 */
export function getOutfitRecommendationStubFlagSync(): OutfitRecommendationStubFlagResult | null {
  return sessionCache;
}

/**
 * Checks if the flag has been evaluated in this session.
 *
 * @returns true if flag has been evaluated, false otherwise
 */
export function isOutfitRecommendationStubFlagEvaluated(): boolean {
  return sessionCache !== null;
}

// ============================================================================
// Synchronous Fallback Accessor
// ============================================================================

/**
 * Gets the flag value synchronously with fallback to environment default.
 *
 * Unlike getOutfitRecommendationStubFlagSync(), this function always returns
 * a result. If the flag hasn't been evaluated yet, it returns the environment-
 * specific default with source='fallback'.
 *
 * This is useful for UI that needs to render immediately without waiting
 * for async evaluation. The UI should update once proper evaluation completes.
 *
 * @param userRole - User's role for fallback calculation
 * @returns Flag result (from cache or fallback)
 *
 * @example
 * ```typescript
 * // In a render function that can't wait for async
 * const { enabled, source } = getOutfitRecommendationStubFlagWithFallback('standard');
 *
 * // source will be 'fallback' if not yet evaluated
 * if (source === 'fallback') {
 *   // Consider showing loading state or triggering async evaluation
 * }
 * ```
 */
export function getOutfitRecommendationStubFlagWithFallback(
  userRole: UserRole = DEFAULT_USER_ROLE
): OutfitRecommendationStubFlagResult {
  // Return session cache if available
  if (sessionCache !== null) {
    return sessionCache;
  }

  // Return fallback
  const environment = getAppEnvironment();
  const defaultValue = getEnvironmentDefault(environment, userRole);

  return {
    enabled: defaultValue,
    source: 'fallback',
    environment,
    userRole,
    evaluatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Imperative Navigation Guard
// ============================================================================

/**
 * Result of the imperative navigation guard check.
 */
export interface NavigationGuardResult {
  /** Whether access to recommendation features is allowed */
  allowed: boolean;
  /** Reason for the decision */
  reason: 'flag_enabled' | 'flag_disabled' | 'flag_not_evaluated' | 'no_user';
  /** The flag result if available */
  flagResult: OutfitRecommendationStubFlagResult | null;
}

/**
 * Imperative guard function for checking recommendation feature access.
 *
 * This function provides a synchronous check for use in event handlers,
 * navigation callbacks, and other imperative contexts where you can't use
 * a React hook.
 *
 * USE CASES:
 * - CTA button onPress handlers (defensive check even if button is hidden)
 * - Deep link handlers before navigating to recommendation screens
 * - Notification tap handlers
 * - Any programmatic navigation to recommendation features
 *
 * BEHAVIOUR:
 * - If flag is evaluated and enabled: returns { allowed: true }
 * - If flag is evaluated and disabled: returns { allowed: false }
 * - If flag is not yet evaluated: returns { allowed: false } (safe default)
 *
 * STARTUP BEHAVIOR:
 * During the hook's background refresh phase (see module docs), this function
 * returns { allowed: false, reason: 'flag_not_evaluated' } even if a cached
 * value was previously available. This is a safe default that prevents access
 * during the brief window (<500ms) while fresh evaluation completes.
 *
 * This conservative approach ensures that:
 * 1. No false positives occur if the server-side flag has been disabled
 * 2. Users don't see features flash on/off during startup
 *
 * If your use case requires allowing access during this window based on the
 * last known value, consider using getOutfitRecommendationStubFlagWithFallback()
 * and implementing your own guard logic.
 *
 * This function does NOT trigger evaluation - it only checks the current
 * session cache. Ensure evaluateOutfitRecommendationStubFlag() has been
 * called earlier in the app lifecycle (e.g., after auth restore).
 *
 * @returns Guard result with allowed status and reason
 *
 * @example
 * ```typescript
 * // In a CTA button handler
 * const handleGetOutfitIdeas = () => {
 *   const guard = canAccessRecommendations();
 *
 *   if (!guard.allowed) {
 *     // Silently no-op or show appropriate feedback
 *     console.log('Recommendations not available:', guard.reason);
 *     return;
 *   }
 *
 *   // Proceed with fetching recommendations
 *   fetchRecommendations();
 * };
 *
 * // In a deep link handler
 * const handleDeepLink = (url: string) => {
 *   if (url.includes('/recommendations')) {
 *     const guard = canAccessRecommendations();
 *     if (!guard.allowed) {
 *       router.replace('/home');
 *       return;
 *     }
 *   }
 *   // Handle other deep links...
 * };
 * ```
 */
export function canAccessRecommendations(): NavigationGuardResult {
  // Check if we have an evaluated flag result
  const flagResult = getOutfitRecommendationStubFlagSync();

  if (flagResult === null) {
    // Flag not yet evaluated - deny access as safe default
    return {
      allowed: false,
      reason: 'flag_not_evaluated',
      flagResult: null,
    };
  }

  if (flagResult.enabled) {
    return {
      allowed: true,
      reason: 'flag_enabled',
      flagResult,
    };
  }

  return {
    allowed: false,
    reason: 'flag_disabled',
    flagResult,
  };
}

// ============================================================================
// Session Cache Reset
// ============================================================================

/**
 * Resets the session cache to force re-evaluation.
 *
 * This function clears both the session cache and any in-progress evaluation,
 * allowing a fresh evaluation to occur on the next call to
 * evaluateOutfitRecommendationStubFlag().
 *
 * USAGE CONTEXTS:
 * 1. Testing: Reset state between test cases
 * 2. Hook background refresh: Called by useOutfitRecommendationStubFlag to
 *    force a fresh server fetch after loading from AsyncStorage cache
 * 3. Manual refresh: Called by the hook's refresh() function
 *
 * IMPACT ON SYNCHRONOUS ACCESSORS:
 * After calling this function and before evaluation completes:
 * - getOutfitRecommendationStubFlagSync() returns null
 * - isOutfitRecommendationStubFlagEvaluated() returns false
 * - canAccessRecommendations() returns { allowed: false, reason: 'flag_not_evaluated' }
 *
 * This is intentional - it creates a brief window where synchronous accessors
 * report no cached value, ensuring the next evaluation fetches fresh data.
 * React hook consumers are unaffected as the hook maintains local state.
 *
 * For code that cannot tolerate null values during this window, use
 * getOutfitRecommendationStubFlagWithFallback() instead.
 *
 * @internal
 */
export function resetSessionCache(): void {
  sessionCache = null;
  evaluationInProgress = null;
}

// ============================================================================
// React Hook
// ============================================================================

/**
 * Hook result for outfit recommendation stub flag.
 */
export interface UseOutfitRecommendationStubFlagResult {
  /** The evaluated flag result, or null if still evaluating */
  result: OutfitRecommendationStubFlagResult | null;
  /** Whether the flag is currently being evaluated */
  isLoading: boolean;
  /** Whether evaluation has completed at least once */
  isEvaluated: boolean;
  /** Whether the feature is enabled (convenience shortcut) */
  isEnabled: boolean;
  /** Trigger re-evaluation (useful after profile changes) */
  refresh: () => Promise<void>;
}

/**
 * React hook for consuming the outfit recommendation stub flag.
 *
 * This hook automatically:
 * 1. Gets user ID from Zustand auth state
 * 2. Gets user role from profile (via React Query)
 * 3. Evaluates the flag with proper caching
 * 4. Returns the result with loading state
 *
 * The hook is designed for use in components that need to gate UI based on
 * the flag. It handles all the complexity of user context and evaluation.
 *
 * TWO-PHASE STARTUP:
 * The hook implements a two-phase initialization for optimal UX:
 *
 * Phase 1 - Cache Initialization (immediate):
 *   Loads persisted flag value from AsyncStorage into session cache.
 *   If found, the hook immediately returns this cached value (isLoading=false).
 *   This enables instant UI decisions without waiting for the network.
 *
 * Phase 2 - Background Refresh (async):
 *   After cache initialization, triggers a server fetch for fresh data.
 *   During this phase:
 *   - The hook's local state is preserved (no UI flicker)
 *   - resetSessionCache() clears the module-level cache
 *   - evaluateOutfitRecommendationStubFlag() fetches from server
 *   - On completion, the hook updates its state with the fresh value
 *
 *   Note: Synchronous accessors (getOutfitRecommendationStubFlagSync, etc.)
 *   return null during this refresh window. This does NOT affect hook consumers
 *   because the hook maintains its own React state.
 *
 * @returns Hook result with flag state, loading status, and refresh function
 *
 * @example
 * ```typescript
 * function HomeScreen() {
 *   const { isEnabled, isLoading, result } = useOutfitRecommendationStubFlag();
 *
 *   if (isLoading) {
 *     // Optionally show loading state
 *     return <LoadingSkeleton />;
 *   }
 *
 *   return (
 *     <View>
 *       {isEnabled && <OutfitRecommendationUI />}
 *     </View>
 *   );
 * }
 * ```
 */
export function useOutfitRecommendationStubFlag(): UseOutfitRecommendationStubFlagResult {
  const user = useStore((state) => state.user);
  const { data: profile, isLoading: isProfileLoading } = useProfile(user?.id);

  const [result, setResult] = useState<OutfitRecommendationStubFlagResult | null>(() =>
    getOutfitRecommendationStubFlagSync()
  );
  const [isLoading, setIsLoading] = useState(() => !isOutfitRecommendationStubFlagEvaluated());
  const [hasInitializedFromCache, setHasInitializedFromCache] = useState(false);
  const [hasTriggeredBackgroundRefresh, setHasTriggeredBackgroundRefresh] = useState(false);

  // Ref to track if we had a valid result before starting background refresh.
  // This avoids relying on stale closure values in async callbacks.
  const hadResultBeforeRefreshRef = useRef(false);

  // Step 1: Initialize from AsyncStorage cache immediately for fast UI
  // This runs once per user to populate session cache from persisted cache
  useEffect(() => {
    // Skip if no user or already initialized
    if (!user?.id || hasInitializedFromCache) {
      return;
    }

    // Try to load from AsyncStorage for immediate UI
    initializeOutfitRecommendationStubFlagFromCache(user.id, profile?.role ?? DEFAULT_USER_ROLE)
      .then((cachedResult) => {
        setHasInitializedFromCache(true);
        if (cachedResult !== null) {
          setResult(cachedResult);
          setIsLoading(false);
        }
      })
      .catch(() => {
        setHasInitializedFromCache(true);
      });
  }, [user?.id, profile?.role, hasInitializedFromCache]);

  // Step 2: Trigger background refresh to get fresh value from server
  // This updates the session cache with the latest server value
  //
  // FLOW OVERVIEW:
  // 1. resetSessionCache() clears the module-level cache (getOutfitRecommendationStubFlagSync
  //    will return null during the refresh window)
  // 2. evaluateOutfitRecommendationStubFlag() fetches fresh value from server
  // 3. On SUCCESS: Use the fresh server value
  // 4. On FAILURE: If we had no result before refresh, compute environment-based fallback
  //    using getOutfitRecommendationStubFlagWithFallback() - we cannot use
  //    getOutfitRecommendationStubFlagSync() here because the cache was cleared in step 1
  useEffect(() => {
    // Skip if no user
    if (!user?.id) {
      setResult(null);
      setIsLoading(false);
      return;
    }

    // Skip if profile is still loading
    if (isProfileLoading) {
      return;
    }

    // Skip if we haven't tried cache initialization yet
    if (!hasInitializedFromCache) {
      return;
    }

    // Skip if we've already triggered background refresh this session
    if (hasTriggeredBackgroundRefresh) {
      // Just sync with current session cache
      const sessionValue = getOutfitRecommendationStubFlagSync();
      if (sessionValue !== null && sessionValue !== result) {
        setResult(sessionValue);
      }
      return;
    }

    // === BEGIN BACKGROUND REFRESH ===
    // Mark that we're starting the refresh (only once per session)
    setHasTriggeredBackgroundRefresh(true);

    // Capture whether we have a valid result BEFORE clearing the cache.
    // This ref is used in the error handler to decide if we need a fallback.
    hadResultBeforeRefreshRef.current = result !== null;

    // If we don't have a cached result yet, show loading state.
    // If we do have a result, the refresh happens silently (no loading indicator).
    const showLoadingDuringRefresh = result === null;
    if (showLoadingDuringRefresh) {
      setIsLoading(true);
    }

    // Clear the session cache to force fresh evaluation from server.
    // IMPORTANT: After this call, getOutfitRecommendationStubFlagSync() returns null
    // until evaluateOutfitRecommendationStubFlag() completes.
    resetSessionCache();

    // Capture userRole for use in callbacks (avoid stale closure issues)
    const userRole = profile?.role ?? DEFAULT_USER_ROLE;

    evaluateOutfitRecommendationStubFlag(user.id, userRole)
      .then((freshResult) => {
        // SUCCESS PATH: Use the fresh server-evaluated result
        setResult(freshResult);
        setIsLoading(false);
      })
      .catch(() => {
        // FAILURE PATH: Server fetch failed or timed out
        //
        // We need to decide what value to use:
        // - If we had a result before the refresh started, keep it (React state
        //   is preserved, so `result` in the component remains valid)
        // - If we had NO result before refresh, we must provide a fallback value
        //
        // We use the ref to check this, not the closure's `result` variable,
        // because the closure value might be stale if this effect ran multiple times.
        //
        // IMPORTANT: We use getOutfitRecommendationStubFlagWithFallback() here because:
        // 1. resetSessionCache() was called, so getOutfitRecommendationStubFlagSync() returns null
        // 2. getOutfitRecommendationStubFlagWithFallback() computes environment-based defaults
        //    and never returns null
        if (!hadResultBeforeRefreshRef.current) {
          const fallback = getOutfitRecommendationStubFlagWithFallback(userRole);
          setResult(fallback);
        }
        // If we had a result before refresh, we keep it (don't call setResult,
        // so the existing React state value remains unchanged)
        setIsLoading(false);
      });
  }, [
    user?.id,
    profile?.role,
    isProfileLoading,
    hasInitializedFromCache,
    hasTriggeredBackgroundRefresh,
    result,
  ]);

  // Refresh function for manual re-evaluation
  // This follows the same pattern as the background refresh but is user-triggered.
  const refresh = useCallback(async () => {
    if (!user?.id) {
      return;
    }

    const userRole = profile?.role ?? DEFAULT_USER_ROLE;

    // Clear the session cache to force fresh evaluation from server.
    // After this, getOutfitRecommendationStubFlagSync() returns null.
    resetSessionCache();
    setIsLoading(true);

    try {
      // SUCCESS PATH: Use fresh server-evaluated result
      const freshResult = await evaluateOutfitRecommendationStubFlag(user.id, userRole);
      setResult(freshResult);
    } catch {
      // FAILURE PATH: Server fetch failed
      // Use getOutfitRecommendationStubFlagWithFallback() to compute environment-based
      // defaults since the session cache was cleared and sync accessors return null.
      const fallback = getOutfitRecommendationStubFlagWithFallback(userRole);
      setResult(fallback);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, profile?.role]);

  return {
    result,
    isLoading,
    isEvaluated: result !== null,
    isEnabled: result?.enabled ?? false,
    refresh,
  };
}
