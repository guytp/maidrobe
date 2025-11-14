import * as SecureStore from 'expo-secure-store';

/**
 * Secure storage adapter for Supabase authentication tokens.
 *
 * This adapter wraps Expo SecureStore to provide encrypted storage for
 * sensitive authentication tokens (access_token, refresh_token) using
 * platform-appropriate security mechanisms:
 *
 * Platform Security:
 * - iOS: Keychain with AES-256 encryption, device-only access
 * - Android: EncryptedSharedPreferences with AES-256-GCM encryption
 *
 * Security Configuration:
 * - keychainAccessible: ALWAYS_THIS_DEVICE_ONLY (iOS)
 *   Prevents backup to iCloud, limits access to this device only
 *
 * - requireAuthentication: false (CRITICAL DESIGN DECISION)
 *
 *   TRADE-OFF ANALYSIS:
 *   This setting allows token access without biometric/passcode authentication.
 *
 *   UX Benefits:
 *   - Enables seamless background token refresh (tokens can expire while app backgrounded)
 *   - No user interruption when Supabase refreshes tokens automatically
 *   - Smooth session management without authentication prompts
 *   - Background refresh works even when device is locked
 *
 *   Security Costs:
 *   - Tokens accessible without biometric/passcode authentication
 *   - If device is unlocked and compromised, tokens can be extracted
 *   - Lower barrier to token access than requireAuthentication: true
 *   - Relies solely on device unlock as authentication barrier
 *
 *   Project Requirements Alignment:
 *   - Prioritizes seamless UX over maximum security (consumer mobile app)
 *   - Assumes device-level security (screen lock) as primary defense layer
 *   - Platform encryption (iOS Keychain AES-256, Android EncryptedSharedPreferences)
 *     still protects tokens at rest from external access
 *   - Acceptable risk profile for non-critical consumer data
 *   - Background token refresh is essential for uninterrupted user experience
 *
 *   Alternative Approaches Considered:
 *   - requireAuthentication: true
 *     Rejected: Would break background token refresh entirely
 *     User would see "Session expired" after backgrounding app
 *   - Manual refresh on app foreground
 *     Rejected: Poor UX with session interruptions and re-login prompts
 *   - Shorter token TTL with frequent refresh
 *     Rejected: Increases refresh frequency but doesn't solve background issue
 *
 *   When to Reconsider This Decision:
 *   - App begins handling highly sensitive data (financial, health, PII)
 *   - Regulatory compliance requires additional authentication barriers
 *   - Security audit recommends stricter token access controls
 *   - Background token refresh becomes less critical to core UX
 *   - Platform provides alternative background refresh mechanisms
 *
 * Storage Keys:
 * - Supabase stores session data under keys managed by the auth client
 * - Typically: 'sb-<project-ref>-auth-token' or similar pattern
 * - Session data includes: access_token, refresh_token, expires_at, user
 *
 * SECURITY WARNING:
 * This adapter stores highly sensitive cryptographic tokens. The stored
 * session JSON contains:
 * - access_token: Bearer token for API authentication
 * - refresh_token: Long-lived token for obtaining new access tokens
 *
 * These tokens MUST:
 * - Never be logged to console, telemetry, or debug tools
 * - Never be exposed to UI components or React DevTools
 * - Never be duplicated to AsyncStorage or other insecure storage
 * - Only be accessed by Supabase client for authentication flows
 *
 * Implementation Notes:
 * - Implements Supabase storage interface (getItem, setItem, removeItem)
 * - All operations are async (returns Promises)
 * - Errors are logged but not thrown (fail-safe for auth flows)
 * - Returns null on error to prevent auth failures
 *
 * @module services/secureStorage
 */

/**
 * Options for SecureStore operations.
 * Configured for maximum security and compatibility with Supabase auth flows.
 */
const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  // iOS: Keychain accessibility - ALWAYS_THIS_DEVICE_ONLY
  // Prevents token backup to iCloud and limits access to this device
  keychainAccessible: SecureStore.ALWAYS_THIS_DEVICE_ONLY,

  // requireAuthentication: false - CRITICAL DESIGN DECISION
  //
  // This allows token access without biometric/passcode authentication.
  //
  // TRADE-OFF: Enables seamless background token refresh at the cost of making
  // tokens accessible without additional authentication if device is unlocked.
  //
  // JUSTIFICATION: This project prioritizes user experience (seamless session
  // management) over maximum security. Device-level security (screen lock) and
  // platform encryption (AES-256) provide baseline protection. This is an
  // acceptable risk for consumer mobile apps with non-critical data.
  //
  // CONTEXT: Supabase needs to refresh tokens automatically when the app is
  // backgrounded or inactive. Setting requireAuthentication: true would break
  // this functionality, causing session expiration and forcing re-login after
  // backgrounding the app - a poor user experience.
  //
  // IMPORTANT: Only change this to true if:
  // - App begins handling highly sensitive data (financial, health, PII)
  // - Regulatory compliance requires stricter token access controls
  // - Security audit identifies this as unacceptable risk
  // - Background token refresh is no longer essential to UX
  //
  // WARNING: Setting to true will break automatic background token refresh.
  requireAuthentication: false,
};

/**
 * Secure storage adapter implementing Supabase storage interface.
 *
 * Provides encrypted storage for authentication tokens using platform-native
 * secure storage mechanisms (iOS Keychain, Android EncryptedSharedPreferences).
 */
export const secureStorage = {
  /**
   * Retrieves an item from secure storage.
   *
   * SECURITY: This method returns encrypted session data that may contain
   * access_token and refresh_token. The caller (Supabase client) is
   * responsible for handling these tokens securely.
   *
   * @param key - Storage key (typically Supabase session key)
   * @returns Promise resolving to stored value or null if not found/error
   */
  async getItem(key: string): Promise<string | null> {
    try {
      const value = await SecureStore.getItemAsync(key, SECURE_STORE_OPTIONS);
      // Note: value is the session JSON string containing tokens
      // NEVER log this value - it contains sensitive cryptographic material
      return value;
    } catch (error) {
      // Log error without exposing key or value
      console.error('[SecureStorage] Error reading from secure storage:', error);
      // Return null to fail gracefully (Supabase will treat as no session)
      return null;
    }
  },

  /**
   * Stores an item in secure storage with encryption.
   *
   * SECURITY: This method receives encrypted session data containing
   * access_token and refresh_token. The value is stored encrypted using
   * AES-256 equivalent platform encryption.
   *
   * @param key - Storage key (typically Supabase session key)
   * @param value - Value to store (typically session JSON string with tokens)
   * @returns Promise that resolves when storage is complete
   */
  async setItem(key: string, value: string): Promise<void> {
    try {
      // SECURITY WARNING: value contains access_token and refresh_token
      // NEVER log the value parameter - it contains sensitive tokens
      await SecureStore.setItemAsync(key, value, SECURE_STORE_OPTIONS);
    } catch (error) {
      // Log error without exposing key or value
      console.error('[SecureStorage] Error writing to secure storage:', error);
      // Supabase expects this to not throw, so we silently fail
      // This may cause auth issues but prevents app crashes
    }
  },

  /**
   * Removes an item from secure storage.
   *
   * Used during logout to clear stored tokens.
   *
   * @param key - Storage key to remove (typically Supabase session key)
   * @returns Promise that resolves when item is removed
   */
  async removeItem(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key, SECURE_STORE_OPTIONS);
    } catch (error) {
      // Log error without exposing key
      console.error('[SecureStorage] Error removing from secure storage:', error);
      // Fail silently to prevent logout issues
    }
  },
};
