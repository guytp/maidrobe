import { createClient } from '@supabase/supabase-js';
import { secureStorage } from './secureStorage';

/**
 * Supabase client singleton for the mobile application.
 *
 * Initializes the Supabase JavaScript client with URL and anonymous key
 * from environment variables. The anonymous key is safe to use in client-side
 * code as Row Level Security (RLS) policies protect all data access.
 *
 * Authentication sessions are persisted using Expo SecureStore with platform-
 * appropriate encryption (AES-256 equivalent). Tokens are stored securely in:
 * - iOS: Keychain with device-only access
 * - Android: EncryptedSharedPreferences with AES-256-GCM
 *
 * SECURITY: Access tokens and refresh tokens are stored encrypted and are
 * never exposed to AsyncStorage, logs, or debugging tools. Only token metadata
 * (expiry time, token type) is exposed via the Zustand session store.
 *
 * Environment variables required:
 * - EXPO_PUBLIC_SUPABASE_URL: Your Supabase project URL
 * - EXPO_PUBLIC_SUPABASE_ANON_KEY: Your Supabase anonymous/public key
 *
 * @throws {Error} If required environment variables are not set
 */

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL environment variable. ' + 'Please set it in your .env file.'
  );
}

if (!supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_ANON_KEY environment variable. ' +
      'Please set it in your .env file.'
  );
}

/**
 * Configured Supabase client instance.
 *
 * Provides access to:
 * - Database queries (supabase.from)
 * - Authentication (supabase.auth)
 * - Storage (supabase.storage)
 * - Edge Functions (supabase.functions)
 * - Realtime subscriptions (supabase.channel)
 *
 * Auth configuration:
 * - Uses SecureStore for encrypted session persistence
 * - Auto-refreshes tokens to maintain active sessions
 * - Sessions persist indefinitely until explicit logout
 * - Tokens stored with AES-256 equivalent encryption
 * - Device-only access (no iCloud backup on iOS)
 *
 * SECURITY WARNING:
 * The storage adapter handles sensitive authentication tokens.
 * Never log, inspect, or expose the session data stored by this client.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // Not applicable for mobile
  },
});
