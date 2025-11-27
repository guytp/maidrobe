-- Migration: Create trigger function and triggers for attribute detection job enqueueing
-- Purpose: Automatically enqueue attribute detection jobs when items become eligible
-- Story: #235 - Implement AI Attribute Detection Pipeline for Wardrobe Items
-- Dependencies: Requires 20241127000006_create_attribute_detection_jobs_table.sql
-- Idempotency: Safe to re-run; uses CREATE OR REPLACE and DROP TRIGGER IF EXISTS

-- Create or replace the trigger function for enqueueing attribute detection jobs
-- This function is called on INSERT and UPDATE of items table
-- It enqueues a job when an item becomes eligible for attribute detection:
--   1. attribute_status is 'pending'
--   2. At least one image key is available (clean_key or original_key)
--
-- Image Key Selection Priority (per FR 2.2):
--   1. clean_key (background-removed image) - preferred for cleaner AI detection
--   2. original_key (original upload) - fallback if clean_key not available
--
-- Idempotency is guaranteed by:
--   - UNIQUE(item_id, image_key) constraint on attribute_detection_jobs
--   - ON CONFLICT DO UPDATE clause resets job to pending (supports retries)
--
-- Edge cases handled:
--   - New item with image and attribute_status='pending': enqueued on INSERT
--   - Status reset to 'pending': enqueued on UPDATE (manual retry request)
--   - clean_key becomes available: enqueued on UPDATE (better image now available)
--   - Duplicate enqueue attempts: updates existing job to pending via ON CONFLICT
--   - No usable image: silently skipped (Edge Function would fail anyway)
--
-- NOTE: This trigger does NOT change attribute_status to 'processing'.
-- The Edge Function is responsible for atomically transitioning from 'pending'
-- to 'processing' when it picks up the job. This prevents race conditions
-- and ensures items don't get stuck in 'processing' if the function fails to start.
--
-- SECURITY DEFINER Configuration:
-- ================================
-- This function uses SECURITY DEFINER to execute with the privileges of the
-- function owner (the role that runs this migration, typically postgres or
-- supabase_admin) rather than the invoking user.
--
-- Why SECURITY DEFINER is required:
--   - Row Level Security (RLS) is enabled on attribute_detection_jobs table
--   - Authenticated users have no INSERT policy on attribute_detection_jobs
--   - The trigger fires in the context of the authenticated user's session
--   - Without SECURITY DEFINER, the INSERT would fail due to RLS denial
--   - SECURITY DEFINER allows the trigger to bypass RLS for job creation
--
-- Function owner:
--   - Owner is the role executing this migration (postgres/supabase_admin)
--   - Owner role has superuser or sufficient privileges to bypass RLS
--   - Ownership can be verified: SELECT proowner::regrole FROM pg_proc
--                                WHERE proname = 'enqueue_attribute_detection_job';
--
-- Required privileges (granted implicitly to owner):
--   - INSERT, UPDATE on public.attribute_detection_jobs
--   - SELECT on public.items (via trigger context, NEW row is available)
--
-- Security constraints and considerations:
--   WARNING: SECURITY DEFINER functions execute with elevated privileges
--   WARNING: Any SQL injection vulnerability would execute as the owner role
--   WARNING: All inputs MUST be validated or come from trusted sources
--
--   Mitigations in place:
--   - No dynamic SQL (no EXECUTE with string concatenation)
--   - All values come from NEW record (trigger context, not user input)
--   - Parameterized INSERT with column values, not string interpolation
--   - Function only performs INSERT/UPDATE, no SELECT that could leak data
--   - ON CONFLICT DO UPDATE is safe and controlled
--
-- Maintenance warnings:
--   - DO NOT add dynamic SQL or EXECUTE statements to this function
--   - DO NOT use user-provided strings in any SQL construction
--   - DO NOT add SELECT statements that return data to callers
--   - DO NOT change to SECURITY INVOKER without adding INSERT policy
--   - Any modifications must be reviewed for privilege escalation risks
--
CREATE OR REPLACE FUNCTION public.enqueue_attribute_detection_job()
RETURNS TRIGGER AS $$
DECLARE
  selected_image_key TEXT;
BEGIN
  -- Only enqueue if item is eligible for attribute detection:
  -- 1. attribute_status is 'pending'
  -- 2. Has at least one usable image key
  IF NEW.attribute_status = 'pending' THEN
    -- Select the preferred image key: clean_key (preferred) or original_key (fallback)
    -- clean_key is preferred because:
    --   - Background is removed, giving cleaner garment detection
    --   - Consistent image format (JPEG)
    --   - Already processed and validated
    selected_image_key := COALESCE(NEW.clean_key, NEW.original_key);

    -- Only proceed if we have a usable image key
    IF selected_image_key IS NOT NULL THEN
      -- For UPDATE operations, only enqueue if something relevant changed:
      -- - attribute_status changed to 'pending' (retry requested)
      -- - clean_key changed (new/better image available)
      -- - original_key changed (new image uploaded, when no clean_key)
      -- For INSERT operations (TG_OP = 'INSERT'), always enqueue if eligible
      IF TG_OP = 'INSERT' OR
         (TG_OP = 'UPDATE' AND (
           OLD.attribute_status IS DISTINCT FROM NEW.attribute_status OR
           OLD.clean_key IS DISTINCT FROM NEW.clean_key OR
           (NEW.clean_key IS NULL AND OLD.original_key IS DISTINCT FROM NEW.original_key)
         ))
      THEN
        -- Insert job with idempotency protection
        -- ON CONFLICT DO UPDATE handles:
        --   1. Retry scenarios: resets existing job to pending
        --   2. Race conditions: multiple triggers for same item
        --   3. Image key changes: updates to use new image
        --
        -- The DO UPDATE clause resets the job to allow reprocessing:
        --   - status = 'pending': ready for pickup
        --   - image_key = EXCLUDED.image_key: use latest image key
        --   - Clears error fields for fresh attempt
        --   - Does NOT reset attempt_count to preserve retry history
        INSERT INTO public.attribute_detection_jobs (
          item_id,
          image_key,
          status
        )
        VALUES (
          NEW.id,
          selected_image_key,
          'pending'
        )
        ON CONFLICT (item_id, image_key) DO UPDATE SET
          status = 'pending',
          image_key = EXCLUDED.image_key,
          next_retry_at = NULL,
          updated_at = NOW()
        WHERE attribute_detection_jobs.status IN ('failed', 'completed');
        -- Note: The WHERE clause prevents resetting jobs that are already
        -- 'pending' or 'processing', avoiding interference with in-flight work
      END IF;
    END IF;
    -- If no usable image key, silently skip.
    -- The item will be picked up once clean_key or original_key is populated.
  END IF;

  -- Always return NEW to allow the triggering operation to proceed
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add documentation comment to the function
COMMENT ON FUNCTION public.enqueue_attribute_detection_job() IS 'Trigger function that enqueues attribute detection jobs when items have attribute_status=pending and a usable image key (clean_key preferred, original_key fallback). Idempotent via ON CONFLICT DO UPDATE. Uses SECURITY DEFINER to bypass RLS on attribute_detection_jobs table - see migration file header for security documentation.';

-- Drop existing triggers if they exist (for idempotency)
DROP TRIGGER IF EXISTS enqueue_attribute_detection_on_insert ON public.items;
DROP TRIGGER IF EXISTS enqueue_attribute_detection_on_update ON public.items;

-- Create trigger for INSERT operations
-- Fires when a new item is created with attribute_status='pending' and an image
-- AFTER INSERT ensures the item row exists before we reference it in the job
CREATE TRIGGER enqueue_attribute_detection_on_insert
  AFTER INSERT ON public.items
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_attribute_detection_job();

-- Create trigger for UPDATE operations
-- Fires when an existing item is updated (e.g., status reset to pending, new image)
-- AFTER UPDATE ensures the item changes are committed before job creation
-- The function itself filters to only relevant changes
CREATE TRIGGER enqueue_attribute_detection_on_update
  AFTER UPDATE ON public.items
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_attribute_detection_job();

-- Add documentation comments to triggers
COMMENT ON TRIGGER enqueue_attribute_detection_on_insert ON public.items IS 'Enqueues attribute detection job when new item is created with attribute_status=pending and a usable image key.';
COMMENT ON TRIGGER enqueue_attribute_detection_on_update ON public.items IS 'Enqueues attribute detection job when item attribute_status is reset to pending or when clean_key/original_key changes.';
