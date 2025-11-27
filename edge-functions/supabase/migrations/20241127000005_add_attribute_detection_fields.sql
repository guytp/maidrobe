-- Migration: Add attribute detection tracking fields to items table
-- Purpose: Support AI attribute detection pipeline with timestamp and error tracking
-- Story: #235 - Implement AI Attribute Detection Pipeline for Wardrobe Items
-- Dependencies: Requires 20241120000001_create_items_table.sql
-- Idempotency: Safe to re-run; uses ADD COLUMN IF NOT EXISTS pattern via DO blocks
--
-- This migration adds two fields to support the attribute detection pipeline:
-- - attribute_last_run_at: Tracks when detection was last attempted (success or failure)
-- - attribute_error_reason: Stores categorized error codes when detection fails
--
-- Note: The core attribute columns (type, colour, pattern, fabric, season, fit)
-- and attribute_status already exist from the original items table migration.
-- This migration only adds the tracking/error fields required for the pipeline.
--
-- RLS: Existing row-level policies on items table automatically cover these new
-- columns since they operate at row level based on user_id, not column level.

-- Add attribute_last_run_at column for tracking detection attempts
-- Records timestamp of last AI detection run (both success and failure cases)
-- Used for observability, debugging, and manual retry decisions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'items'
      AND column_name = 'attribute_last_run_at'
  ) THEN
    ALTER TABLE public.items
      ADD COLUMN attribute_last_run_at TIMESTAMPTZ;
  END IF;
END
$$;

-- Add attribute_error_reason column for categorized error tracking
-- Stores normalized error codes when attribute_status = 'failed'
-- Values align with story FR 1.1 and FR 6.2:
--   - 'timeout': Model call exceeded 15-second timeout
--   - 'invalid_json': Model response was malformed or failed validation
--   - 'missing_image': No valid image key (clean_key or original_key) available
--   - 'rate_limited': Provider returned 429 rate limit error
--   - 'config_error': Missing API key, invalid endpoint, or misconfiguration
-- NULL when attribute_status is not 'failed' or when cleared after success
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'items'
      AND column_name = 'attribute_error_reason'
  ) THEN
    ALTER TABLE public.items
      ADD COLUMN attribute_error_reason TEXT
      CHECK (attribute_error_reason IS NULL OR attribute_error_reason IN (
        'timeout',
        'invalid_json',
        'missing_image',
        'rate_limited',
        'config_error'
      ));
  END IF;
END
$$;

-- Add documentation comments for new columns
COMMENT ON COLUMN public.items.attribute_last_run_at IS 'Timestamp of last AI attribute detection attempt. Updated on both success and failure. NULL if detection has never run.';
COMMENT ON COLUMN public.items.attribute_error_reason IS 'Categorized error code when attribute_status is failed: timeout, invalid_json, missing_image, rate_limited, or config_error. Cleared (NULL) on successful detection.';
