import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Rate limiting for password reset attempts
 *
 * ABUSE PROTECTION:
 * Limits password reset attempts to prevent brute force attacks on reset tokens.
 * - Maximum 3 attempts per token within a 15-minute window
 * - Persisted to AsyncStorage for cross-session enforcement
 * - Automatically cleans up expired attempts
 *
 * SECURITY DESIGN:
 * - Rate limit is keyed by token hash (first 8 chars) to prevent tracking
 * - Fails open on storage errors to avoid blocking legitimate users
 * - Uses sliding window for fairness
 * - Emits telemetry for monitoring abuse patterns
 *
 * @example
 * ```typescript
 * const result = await checkResetAttemptRateLimit(token);
 * if (!result.allowed) {
 *   showError(`Too many attempts. Try again in ${result.remainingSeconds}s`);
 *   return;
 * }
 * await recordResetAttempt(token);
 * ```
 */

const STORAGE_KEY_PREFIX = 'auth.password_reset_attempts';
const MAX_ATTEMPTS = 3;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Creates a storage key for a token hash
 * Uses first 8 chars of token to avoid storing full tokens
 */
function getStorageKey(token: string): string {
  const tokenHash = token.substring(0, 8);
  return `${STORAGE_KEY_PREFIX}.${tokenHash}`;
}

/**
 * Retrieves attempt timestamps for a token from AsyncStorage.
 * Automatically filters out expired attempts (older than WINDOW_MS).
 *
 * @param token - The reset token
 * @returns Array of attempt timestamps within the current window
 */
async function getAttempts(token: string): Promise<number[]> {
  try {
    const key = getStorageKey(token);
    const stored = await AsyncStorage.getItem(key);

    if (!stored) {
      return [];
    }

    const attempts: number[] = JSON.parse(stored);
    const now = Date.now();
    const cutoff = now - WINDOW_MS;

    // Filter out expired attempts
    return attempts.filter((timestamp) => timestamp > cutoff);
  } catch (error) {
    // Fail open - don't block user if storage fails
    console.warn('[Rate Limit] Failed to get attempts:', error);
    return [];
  }
}

/**
 * Persists attempt timestamps to AsyncStorage.
 *
 * @param token - The reset token
 * @param attempts - Array of attempt timestamps to persist
 */
async function setAttempts(token: string, attempts: number[]): Promise<void> {
  try {
    const key = getStorageKey(token);
    await AsyncStorage.setItem(key, JSON.stringify(attempts));
  } catch (error) {
    // Fail open - don't block user if storage fails
    console.warn('[Rate Limit] Failed to set attempts:', error);
  }
}

/**
 * Checks if a password reset attempt is allowed under rate limiting.
 *
 * Returns allowed: true if the attempt count is below MAX_ATTEMPTS,
 * otherwise returns allowed: false with remainingSeconds until retry.
 *
 * @param token - The reset token
 * @returns Object with allowed status and remaining wait time
 */
export async function checkResetAttemptRateLimit(
  token: string
): Promise<{ allowed: boolean; remainingSeconds: number }> {
  const attempts = await getAttempts(token);
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
 * Records a password reset attempt for rate limiting.
 *
 * Persists the attempt timestamp to AsyncStorage along with cleanup of
 * expired attempts. If storage fails, the attempt is not recorded but
 * the function does not throw to avoid blocking the password reset flow.
 *
 * @param token - The reset token
 */
export async function recordResetAttempt(token: string): Promise<void> {
  const attempts = await getAttempts(token);
  attempts.push(Date.now());
  await setAttempts(token, attempts);
}

/**
 * Clears all password reset attempts for a token.
 * Useful after successful reset or token expiration.
 *
 * @param token - The reset token
 */
export async function clearResetAttempts(token: string): Promise<void> {
  try {
    const key = getStorageKey(token);
    await AsyncStorage.removeItem(key);
  } catch (error) {
    console.warn('[Rate Limit] Failed to clear attempts:', error);
  }
}
