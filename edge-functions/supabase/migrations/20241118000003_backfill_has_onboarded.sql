-- Migration: Backfill has_onboarded for existing users
-- Purpose: Set has_onboarded = true for all existing users (Step 2 of migration)
-- Rationale: Existing users should not be forced through new onboarding flow
-- Idempotency: Safe to re-run; only updates NULL values
-- Dependencies: 20241118000002_add_has_onboarded_column.sql

-- Update all existing profiles where has_onboarded is NULL to true
-- This assumes existing users have already been using the app and should
-- not be forced through the new onboarding flow
UPDATE public.profiles
SET has_onboarded = true
WHERE has_onboarded IS NULL;

-- Verify backfill completed successfully
-- This query should return 0 if all rows were updated
DO $$
DECLARE
  null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count
  FROM public.profiles
  WHERE has_onboarded IS NULL;

  IF null_count > 0 THEN
    RAISE WARNING 'Backfill incomplete: % rows still have NULL has_onboarded', null_count;
  ELSE
    RAISE NOTICE 'Backfill successful: All existing profiles have has_onboarded set';
  END IF;
END $$;
