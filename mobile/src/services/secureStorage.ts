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
 * - requireAuthentication: false
 *   Allows background token refresh without user authentication
 *   (Supabase needs to refresh tokens when app is backgrounded)
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

  // Do not require biometric/passcode authentication for token access
  // This is necessary for background token refresh when app is not active
  // Supabase needs to refresh tokens automatically without user interaction
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
