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

-- Create function to enforce one-way transition for has_onboarded
-- Prevents updates from true back to false, allowing only false -> true
-- This ensures onboarding completion is permanent and cannot be reversed by client code
CREATE OR REPLACE FUNCTION public.enforce_has_onboarded_one_way()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if has_onboarded is being changed from true to false
  IF OLD.has_onboarded = true AND NEW.has_onboarded = false THEN
    RAISE EXCEPTION 'has_onboarded cannot be changed from true to false. Onboarding completion is permanent.'
      USING ERRCODE = '23514', -- check_violation
            HINT = 'has_onboarded can only transition from false to true or remain unchanged.';
  END IF;

  -- Allow all other transitions:
  -- - NULL -> false (during backfill or initial setup)
  -- - NULL -> true (during backfill)
  -- - false -> true (normal onboarding completion)
  -- - true -> true (no change)
  -- - false -> false (no change)
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists (for idempotency)
DROP TRIGGER IF EXISTS enforce_has_onboarded_one_way_trigger ON public.profiles;

-- Create trigger to enforce one-way transition on has_onboarded updates
-- Fires before any UPDATE that modifies the has_onboarded column
CREATE TRIGGER enforce_has_onboarded_one_way_trigger
  BEFORE UPDATE OF has_onboarded ON public.profiles
  FOR EACH ROW
  WHEN (OLD.has_onboarded IS DISTINCT FROM NEW.has_onboarded)
  EXECUTE FUNCTION public.enforce_has_onboarded_one_way();

-- Add comment for documentation
COMMENT ON FUNCTION public.enforce_has_onboarded_one_way() IS 'Trigger function that enforces one-way transition for has_onboarded column. Prevents changing from true to false, ensuring onboarding completion is permanent.';
