import { createClient } from '@supabase/supabase-js';
import { secureStorage } from './secureStorage';
import { createInterceptedFetch } from './supabaseInterceptor';

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
 * - Sessions persist indefinitely until explicit logout
 * - Tokens stored with AES-256 equivalent encryption
 * - Device-only access (no iCloud backup on iOS)
 *
 * TOKEN REFRESH STRATEGY:
 * This client has autoRefreshToken DISABLED because we use a custom token
 * refresh manager (useTokenRefreshManager) that provides:
 *
 * 1. Proactive refresh: Tokens refreshed 5 minutes before expiry to prevent
 *    401 errors during normal app usage. Supabase's built-in refresh timing
 *    is opaque and cannot guarantee this specific window.
 *
 * 2. Network-aware refresh: Pauses scheduled refresh when offline and resumes
 *    when connectivity restored. Prevents unnecessary failed requests and
 *    battery drain.
 *
 * 3. Exponential backoff: Transient failures retry with 1s base delay, 2x
 *    multiplier, max 3 attempts as required by acceptance criteria. Supabase's
 *    built-in retry logic does not match these specific requirements.
 *
 * 4. Structured telemetry: All refresh attempts logged to Sentry/Honeycomb
 *    with userId, latency, outcome for observability. Supabase refresh events
 *    provide limited telemetry visibility.
 *
 * 5. Deduplication: Concurrent refresh requests share a single promise to
 *    prevent redundant network calls and race conditions.
 *
 * 6. Reactive refresh: HTTP-level interceptor catches 401 responses from
 *    any authenticated API call, invokes refreshToken(), and retries the
 *    failed request once on successful refresh. Forces logout if refresh
 *    fails or refresh token is invalid/expired.
 *
 * The custom refresh manager is implemented in:
 * mobile/src/features/auth/hooks/useTokenRefreshManager.ts
 *
 * The reactive refresh interceptor is implemented in:
 * mobile/src/services/supabaseInterceptor.ts
 *
 * IMPORTANT: Do NOT re-enable autoRefreshToken. Running both systems
 * simultaneously causes race conditions, redundant refresh requests, and
 * unpredictable behavior. The custom manager is the single source of truth
 * for all token refresh operations.
 *
 * SECURITY WARNING:
 * The storage adapter handles sensitive authentication tokens.
 * Never log, inspect, or expose the session data stored by this client.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: false, // DISABLED: Custom refresh manager used instead
    persistSession: true,
    detectSessionInUrl: false, // Not applicable for mobile
  },
  global: {
    fetch: createInterceptedFetch(), // Custom fetch for 401 interception and retry
  },
});
