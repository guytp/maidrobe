-- Migration: Finalize has_onboarded constraints
-- Purpose: Add NOT NULL constraint and default value (Step 3 of migration)
-- Strategy: After backfill completes, enforce data integrity with constraints
-- Dependencies: 20241118000003_backfill_has_onboarded.sql
-- Idempotency: Safe to re-run; PostgreSQL allows re-adding constraints

-- Set default value for new rows
-- New users will have has_onboarded = false by default
ALTER TABLE public.profiles
ALTER COLUMN has_onboarded SET DEFAULT false;

-- Add NOT NULL constraint
-- This is safe because backfill migration has already set all NULL values to true
ALTER TABLE public.profiles
ALTER COLUMN has_onboarded SET NOT NULL;

-- Update column comment with final semantics
COMMENT ON COLUMN public.profiles.has_onboarded IS 'Whether the user has completed the onboarding flow. Defaults to false for new users. Set to true when user completes or skips onboarding.';

-- Verify constraint was applied successfully
DO $$
DECLARE
  is_nullable TEXT;
  column_default TEXT;
BEGIN
  -- Check if column is NOT NULL
  SELECT is_nullable, column_default INTO is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'has_onboarded';

  IF is_nullable = 'NO' THEN
    RAISE NOTICE 'NOT NULL constraint successfully applied to has_onboarded';
  ELSE
    RAISE WARNING 'NOT NULL constraint not applied to has_onboarded';
  END IF;

  IF column_default IS NOT NULL THEN
    RAISE NOTICE 'Default value successfully set to: %', column_default;
  ELSE
    RAISE WARNING 'Default value not set for has_onboarded';
  END IF;
END $$;
