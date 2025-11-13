import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Supabase client singleton for the mobile application.
 *
 * Initializes the Supabase JavaScript client with URL and anonymous key
 * from environment variables. The anonymous key is safe to use in client-side
 * code as Row Level Security (RLS) policies protect all data access.
 *
 * Authentication sessions are persisted using AsyncStorage, allowing users
 * to remain logged in across app restarts. This provides a seamless
 * authentication experience without requiring re-login.
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
 * - Uses AsyncStorage for session persistence across app restarts
 * - Auto-refreshes tokens to maintain active sessions
 * - Sessions persist indefinitely until explicit logout
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // Not applicable for mobile
  },
});
