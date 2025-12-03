-- Migration: Add role column to profiles table
-- Purpose: Support cohort-based feature flag targeting for controlled rollouts
-- Story: #366 - Outfit Recommendation Engine Feature Flag and Controlled Rollout
-- Strategy: Add column with default value for existing and new users
-- Dependencies: 20241118000001_create_profiles_table.sql
-- Idempotency: Safe to re-run; checks if column exists before adding

-- Add role column with default 'standard' for all users
-- Valid values: 'internal', 'beta', 'standard'
DO $$
BEGIN
  -- Check if column already exists
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'role'
  ) THEN
    -- Add column with default value
    ALTER TABLE public.profiles
    ADD COLUMN role TEXT NOT NULL DEFAULT 'standard';

    -- Add check constraint for valid values
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('internal', 'beta', 'standard'));

    -- Add comment for documentation
    COMMENT ON COLUMN public.profiles.role IS 'User role/cohort for feature flag targeting. Values: internal (staff/testers), beta (early-access users), standard (all other users). Default: standard.';
  END IF;
END $$;

-- Create index for efficient filtering by role
-- This supports queries like "find all internal testers" for analytics
CREATE INDEX IF NOT EXISTS idx_profiles_role
  ON public.profiles(role);

-- ============================================================================
-- RLS POLICY UPDATE: Restrict role column updates to admin-only
-- ============================================================================
--
-- SECURITY RATIONALE:
-- The role column controls cohort-based feature flag targeting. If users could
-- modify their own role, they could:
-- 1. Self-upgrade from 'standard' to 'internal' or 'beta'
-- 2. Bypass feature flag gates and access unreleased features
-- 3. Circumvent the controlled rollout strategy
--
-- SOLUTION:
-- 1. Replace the existing "Users can update their own profile" policy with one
--    that prevents role column modifications
-- 2. Add a separate admin-only policy that allows role updates via service_role
--
-- This ensures:
-- - Users can still update other profile fields (future fields like display_name, etc.)
-- - Role changes require admin/backend intervention
-- - The principle of least privilege is maintained
-- ============================================================================

-- Drop the existing permissive update policy (from 20241118000001_create_profiles_table.sql)
-- This policy allowed users to update ALL columns including role
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Create a restrictive update policy for authenticated users
-- Users can update their own profile BUT cannot change their role
-- The WITH CHECK constraint ensures OLD.role = NEW.role (no role changes allowed)
CREATE POLICY "Users can update their own profile except role"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (
      -- ROLE IMMUTABILITY CHECK:
      -- In WITH CHECK, unqualified 'role' refers to the NEW value being written.
      -- This subquery fetches the CURRENT value from the database.
      -- By requiring NEW.role = current role, we prevent users from changing
      -- their own role while still allowing updates to other profile fields.
      SELECT role FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Create an admin-only policy for role updates
-- This policy allows the service_role (used by backend/admin operations) to update any profile
-- Service role bypasses RLS by default, but this explicit policy documents the intent
-- and ensures role updates are properly authorized when RLS is enforced
--
-- NOTE: Supabase service_role key should NEVER be exposed to clients.
-- Role changes should only happen through:
-- 1. Admin dashboard operations
-- 2. Backend Edge Functions using service_role
-- 3. Database migrations/scripts
CREATE POLICY "Service role can update any profile"
  ON public.profiles
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add comment documenting the security model
COMMENT ON POLICY "Users can update their own profile except role" ON public.profiles IS
  'Allows authenticated users to update their own profile data, but prevents modification of the role column to prevent self-upgrade attacks. Role changes require admin/service_role access.';

COMMENT ON POLICY "Service role can update any profile" ON public.profiles IS
  'Allows backend services using service_role to update any profile, including role changes. Used for admin operations and controlled cohort assignments.';
