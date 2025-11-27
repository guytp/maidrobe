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
COMMENT ON FUNCTION public.enqueue_image_processing_job() IS 'Trigger function that enqueues image processing jobs when items become eligible (original_key NOT NULL AND image_processing_status = pending). Idempotent via ON CONFLICT DO NOTHING.';

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
