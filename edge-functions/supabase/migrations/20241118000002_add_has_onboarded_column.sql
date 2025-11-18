-- Migration: Add has_onboarded column to profiles table
-- Purpose: Add onboarding completion flag (Step 1 of backwards-compatible migration)
-- Strategy: Add column as NULLABLE first to allow gradual rollout
-- Dependencies: 20241118000001_create_profiles_table.sql
-- Idempotency: Safe to re-run; checks if column exists before adding

-- Add has_onboarded column as nullable (no default yet)
-- This allows existing rows to remain valid during migration
DO $$
BEGIN
  -- Check if column already exists
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'has_onboarded'
  ) THEN
    -- Add column as nullable boolean
    ALTER TABLE public.profiles
    ADD COLUMN has_onboarded BOOLEAN;

    -- Add comment for documentation
    COMMENT ON COLUMN public.profiles.has_onboarded IS 'Whether the user has completed the onboarding flow. NULL indicates migration in progress, true indicates completed, false indicates not completed.';
  END IF;
END $$;

-- Create index for efficient filtering by onboarding status
-- This supports queries like "find users who haven't onboarded"
CREATE INDEX IF NOT EXISTS idx_profiles_has_onboarded
  ON public.profiles(has_onboarded)
  WHERE has_onboarded IS NOT NULL;
