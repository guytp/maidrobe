-- Migration: Create trigger function and triggers for image processing job enqueueing
-- Purpose: Automatically enqueue image processing jobs when items become eligible
-- Story: #229 - Implement Background Image Cleanup and Thumbnail Generation Pipeline
-- Dependencies: Requires 20241127000002_create_image_processing_jobs_table.sql
-- Idempotency: Safe to re-run; uses CREATE OR REPLACE and DROP TRIGGER IF EXISTS

-- Create or replace the trigger function for enqueueing image processing jobs
-- This function is called on INSERT and UPDATE of items table
-- It enqueues a job when an item becomes eligible for processing:
--   1. original_key is not null (image has been uploaded)
--   2. image_processing_status is 'pending' (awaiting processing)
--
-- Idempotency is guaranteed by:
--   - UNIQUE(item_id, original_key) constraint on image_processing_jobs
--   - ON CONFLICT DO NOTHING clause in INSERT
--
-- Edge cases handled:
--   - New item with image: enqueued on INSERT
--   - Status reset to 'pending': enqueued on UPDATE (reprocessing request)
--   - New original_key uploaded: enqueued on UPDATE (new image version)
--   - Duplicate enqueue attempts: silently ignored via ON CONFLICT
--
-- SECURITY DEFINER Configuration:
-- ================================
-- This function uses SECURITY DEFINER to execute with the privileges of the
-- function owner (the role that runs this migration, typically postgres or
-- supabase_admin) rather than the invoking user.
--
-- Why SECURITY DEFINER is required:
--   - Row Level Security (RLS) is enabled on image_processing_jobs table
--   - Authenticated users have no INSERT policy on image_processing_jobs
--   - The trigger fires in the context of the authenticated user's session
--   - Without SECURITY DEFINER, the INSERT would fail due to RLS denial
--   - SECURITY DEFINER allows the trigger to bypass RLS for job creation
--
-- Function owner:
--   - Owner is the role executing this migration (postgres/supabase_admin)
--   - Owner role has superuser or sufficient privileges to bypass RLS
--   - Ownership can be verified: SELECT proowner::regrole FROM pg_proc
--                                WHERE proname = 'enqueue_image_processing_job';
--
-- Required privileges (granted implicitly to owner):
--   - INSERT on public.image_processing_jobs
--   - SELECT on public.items (via trigger context, NEW row is available)
--
-- Security constraints and considerations:
--   ⚠️  SECURITY DEFINER functions execute with elevated privileges
--   ⚠️  Any SQL injection vulnerability would execute as the owner role
--   ⚠️  All inputs MUST be validated or come from trusted sources
--
--   Mitigations in place:
--   ✓ No dynamic SQL (no EXECUTE with string concatenation)
--   ✓ All values come from NEW record (trigger context, not user input)
--   ✓ Parameterized INSERT with column values, not string interpolation
--   ✓ Function only performs INSERT, no SELECT that could leak data
--   ✓ ON CONFLICT DO NOTHING prevents information disclosure via errors
--
-- Maintenance warnings:
--   - DO NOT add dynamic SQL or EXECUTE statements to this function
--   - DO NOT use user-provided strings in any SQL construction
--   - DO NOT add SELECT statements that return data to callers
--   - DO NOT change to SECURITY INVOKER without adding INSERT policy
--   - Any modifications must be reviewed for privilege escalation risks
--
CREATE OR REPLACE FUNCTION public.enqueue_image_processing_job()
RETURNS TRIGGER AS $$
BEGIN
  -- Only enqueue if item is eligible for processing:
  -- 1. Has an original image uploaded (original_key IS NOT NULL)
  -- 2. Is in pending status (waiting to be processed)
  IF NEW.original_key IS NOT NULL AND NEW.image_processing_status = 'pending' THEN
    -- For UPDATE operations, only enqueue if something relevant changed:
    -- - original_key changed (new image uploaded)
    -- - status changed to 'pending' (reprocessing requested)
    -- For INSERT operations (TG_OP = 'INSERT'), always enqueue if eligible
    IF TG_OP = 'INSERT' OR
       (TG_OP = 'UPDATE' AND (
         OLD.original_key IS DISTINCT FROM NEW.original_key OR
         OLD.image_processing_status IS DISTINCT FROM NEW.image_processing_status
       ))
    THEN
      -- Insert job with idempotency protection
      -- ON CONFLICT DO NOTHING ensures duplicate (item_id, original_key) pairs are ignored
      -- This handles race conditions and repeated status changes gracefully
      INSERT INTO public.image_processing_jobs (item_id, original_key, status)
      VALUES (NEW.id, NEW.original_key, 'pending')
      ON CONFLICT (item_id, original_key) DO NOTHING;
    END IF;
  END IF;

  -- Always return NEW to allow the triggering operation to proceed
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add documentation comment to the function
COMMENT ON FUNCTION public.enqueue_image_processing_job() IS 'Trigger function that enqueues image processing jobs when items become eligible (original_key NOT NULL AND image_processing_status = pending). Idempotent via ON CONFLICT DO NOTHING. Uses SECURITY DEFINER to bypass RLS on image_processing_jobs table - see migration file header for security documentation.';

-- Drop existing triggers if they exist (for idempotency)
DROP TRIGGER IF EXISTS enqueue_image_processing_on_insert ON public.items;
DROP TRIGGER IF EXISTS enqueue_image_processing_on_update ON public.items;

-- Create trigger for INSERT operations
-- Fires when a new item is created with an image ready for processing
-- AFTER INSERT ensures the item row exists before we reference it in the job
CREATE TRIGGER enqueue_image_processing_on_insert
  AFTER INSERT ON public.items
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_image_processing_job();

-- Create trigger for UPDATE operations
-- Fires when an existing item is updated (e.g., new image uploaded, status reset)
-- AFTER UPDATE ensures the item changes are committed before job creation
-- The function itself filters to only relevant changes (original_key or status changes)
CREATE TRIGGER enqueue_image_processing_on_update
  AFTER UPDATE ON public.items
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_image_processing_job();

-- Add documentation comments to triggers
COMMENT ON TRIGGER enqueue_image_processing_on_insert ON public.items IS 'Enqueues image processing job when new item is created with original_key and pending status.';
COMMENT ON TRIGGER enqueue_image_processing_on_update ON public.items IS 'Enqueues image processing job when item original_key changes or status is reset to pending.';
