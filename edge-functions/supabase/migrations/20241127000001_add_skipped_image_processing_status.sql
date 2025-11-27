-- Migration: Add 'skipped' to image_processing_status enum values
-- Purpose: Enable intentional bypassing of image processing for special imports and admin overrides
-- Story: #229 - Implement Background Image Cleanup and Thumbnail Generation Pipeline
-- Dependencies: Requires 20241120000001_create_items_table.sql to have been applied
-- Idempotency: Safe to re-run; uses DROP CONSTRAINT IF EXISTS and re-creates constraint

-- Drop the existing check constraint on image_processing_status
-- Note: PostgreSQL uses the format {table}_{column}_check for inline CHECK constraints
ALTER TABLE public.items
  DROP CONSTRAINT IF EXISTS items_image_processing_status_check;

-- Add updated check constraint with 'skipped' value
-- Status values:
--   - pending: Item has non-null original_key and is waiting to be processed
--   - processing: Processing is currently running for the current original_key
--   - succeeded: Processing completed successfully, clean_key/thumb_key are populated
--   - failed: Processing failed after retries or due to non-recoverable error
--   - skipped: Processing is intentionally not run (special imports, admin override)
ALTER TABLE public.items
  ADD CONSTRAINT items_image_processing_status_check
  CHECK (image_processing_status IN ('pending', 'processing', 'succeeded', 'failed', 'skipped'));

-- Update the column comment to document the new status value
COMMENT ON COLUMN public.items.image_processing_status IS 'Status of background removal and thumbnail generation: pending (awaiting processing), processing (in progress), succeeded (completed), failed (error after retries), or skipped (intentionally bypassed).';
