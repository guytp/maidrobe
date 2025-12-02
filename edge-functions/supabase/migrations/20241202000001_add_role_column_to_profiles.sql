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

-- Update RLS policy to ensure role is accessible for the user's own profile
-- The existing RLS policies allow users to read and update their own profile,
-- which is sufficient for role access. No additional policy needed.

-- Note: Role changes should be restricted to admin operations in production.
-- For now, RLS allows users to update their own profile (including role).
-- This can be tightened later with a separate admin-only policy if needed.
