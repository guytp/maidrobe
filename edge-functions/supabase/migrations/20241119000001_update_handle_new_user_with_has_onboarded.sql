-- Migration: Update handle_new_user to explicitly set has_onboarded
-- Purpose: Ensure new user profiles explicitly include has_onboarded = false
-- Rationale: Make onboarding flag initialization explicit rather than relying solely on DEFAULT
-- Dependencies: 20241118000004_finalize_has_onboarded_constraint.sql
-- Idempotency: Safe to re-run; uses CREATE OR REPLACE FUNCTION

-- Update handle_new_user function to explicitly set has_onboarded = false
-- This ensures new users are correctly initialized without relying solely on DEFAULT constraint
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, created_at, updated_at, has_onboarded)
  VALUES (NEW.id, NOW(), NOW(), false)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update function comment for documentation
COMMENT ON FUNCTION public.handle_new_user() IS 'Trigger function that automatically creates a profile row when a new user signs up via auth.users. Initializes has_onboarded to false for new users.';

-- Verify function was updated successfully
DO $$
DECLARE
  function_source TEXT;
BEGIN
  -- Get the function definition
  SELECT pg_get_functiondef(oid) INTO function_source
  FROM pg_proc
  WHERE proname = 'handle_new_user'
    AND pronamespace = 'public'::regnamespace;

  -- Check if has_onboarded is mentioned in the function
  IF function_source LIKE '%has_onboarded%' THEN
    RAISE NOTICE 'handle_new_user function successfully updated to include has_onboarded';
  ELSE
    RAISE WARNING 'handle_new_user function may not include has_onboarded initialization';
  END IF;
END $$;
