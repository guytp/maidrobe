import { createClient } from '@supabase/supabase-js';

/**
 * Supabase client singleton for the mobile application.
 *
 * Initializes the Supabase JavaScript client with URL and anonymous key
 * from environment variables. The anonymous key is safe to use in client-side
 * code as Row Level Security (RLS) policies protect all data access.
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
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Store session in async storage for persistence
    storage: undefined, // Will be configured with AsyncStorage in future
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // Not applicable for mobile
  },
});
