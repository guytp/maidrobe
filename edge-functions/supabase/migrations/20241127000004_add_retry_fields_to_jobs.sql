-- Migration: Add retry and error classification fields to image_processing_jobs
-- Purpose: Support exponential backoff retries and error categorization for NFR compliance
-- Story: #229 - Implement Background Image Cleanup and Thumbnail Generation Pipeline
-- Dependencies: Requires 20241127000002_create_image_processing_jobs_table.sql
-- Idempotency: Safe to re-run; uses ADD COLUMN IF NOT EXISTS pattern via DO blocks

-- Add next_retry_at column for exponential backoff scheduling
-- Jobs won't be picked up until next_retry_at <= NOW() (or is NULL for immediate)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'image_processing_jobs'
      AND column_name = 'next_retry_at'
  ) THEN
    ALTER TABLE public.image_processing_jobs
      ADD COLUMN next_retry_at TIMESTAMPTZ;
  END IF;
END
$$;

-- Add error_category column for distinguishing transient vs permanent failures
-- Values: 'transient' (retry), 'permanent' (no retry)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'image_processing_jobs'
      AND column_name = 'error_category'
  ) THEN
    ALTER TABLE public.image_processing_jobs
      ADD COLUMN error_category TEXT
      CHECK (error_category IS NULL OR error_category IN ('transient', 'permanent'));
  END IF;
END
$$;

-- Add error_code column for normalized error classification
-- Examples: 'timeout', 'rate_limit', 'network', 'unsupported_format', 'not_found'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'image_processing_jobs'
      AND column_name = 'error_code'
  ) THEN
    ALTER TABLE public.image_processing_jobs
      ADD COLUMN error_code TEXT;
  END IF;
END
$$;

-- Add provider column to track which provider caused the error
-- Values: 'storage', 'replicate', 'internal'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'image_processing_jobs'
      AND column_name = 'error_provider'
  ) THEN
    ALTER TABLE public.image_processing_jobs
      ADD COLUMN error_provider TEXT;
  END IF;
END
$$;

-- Add processing_duration_ms column for performance monitoring
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'image_processing_jobs'
      AND column_name = 'processing_duration_ms'
  ) THEN
    ALTER TABLE public.image_processing_jobs
      ADD COLUMN processing_duration_ms INTEGER;
  END IF;
END
$$;

-- Create index on next_retry_at for efficient job polling with retry scheduling
-- Only index pending jobs that are ready for retry
DROP INDEX IF EXISTS idx_image_processing_jobs_next_retry;
CREATE INDEX idx_image_processing_jobs_next_retry
  ON public.image_processing_jobs(next_retry_at)
  WHERE status = 'pending';

-- Create index on started_at for stale job detection
-- Only index jobs currently in processing state
DROP INDEX IF EXISTS idx_image_processing_jobs_stale_detection;
CREATE INDEX idx_image_processing_jobs_stale_detection
  ON public.image_processing_jobs(started_at)
  WHERE status = 'processing';

-- Add documentation comments for new columns
COMMENT ON COLUMN public.image_processing_jobs.next_retry_at IS 'Timestamp when job can next be retried. NULL means immediate. Used for exponential backoff.';
COMMENT ON COLUMN public.image_processing_jobs.error_category IS 'Error classification: transient (will retry) or permanent (no retry).';
COMMENT ON COLUMN public.image_processing_jobs.error_code IS 'Normalized error code: timeout, rate_limit, network, unsupported_format, not_found, etc.';
COMMENT ON COLUMN public.image_processing_jobs.error_provider IS 'Provider that caused the error: storage, replicate, or internal.';
COMMENT ON COLUMN public.image_processing_jobs.processing_duration_ms IS 'Duration of the last processing attempt in milliseconds.';
