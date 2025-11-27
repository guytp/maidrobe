-- Migration: Create attribute_detection_jobs table
-- Purpose: Job queue table for asynchronous AI attribute detection pipeline
-- Story: #235 - Implement AI Attribute Detection Pipeline for Wardrobe Items
-- Dependencies: Requires 20241120000001_create_items_table.sql to have been applied
-- Idempotency: Safe to re-run; uses CREATE TABLE IF NOT EXISTS and DROP INDEX IF EXISTS

-- Create attribute_detection_jobs table for job queue
-- This table decouples job enqueueing (via trigger) from job processing (via Edge Function)
-- Benefits:
--   - Database trigger can safely enqueue without HTTP calls (no pg_net dependency)
--   - Jobs persist even if Edge Function is temporarily unavailable
--   - Supports retry logic with attempt tracking
--   - Idempotent via UNIQUE constraint on (item_id, image_key)
--
-- Key difference from image_processing_jobs:
--   - Uses image_key instead of original_key (can be clean_key or original_key)
--   - Tracks which image source was used for detection
CREATE TABLE IF NOT EXISTS public.attribute_detection_jobs (
  -- Primary key: auto-incrementing for efficient queue ordering
  id BIGSERIAL PRIMARY KEY,

  -- Reference to the item being processed
  -- ON DELETE CASCADE ensures jobs are cleaned up when items are deleted
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,

  -- The image_key being used for detection - forms idempotency key with item_id
  -- This is either clean_key (preferred) or original_key (fallback)
  -- Allows re-processing if the image source changes (e.g., clean_key becomes available)
  image_key TEXT NOT NULL,

  -- Job status for tracking progress
  -- Values: pending (awaiting pickup), processing (worker claimed), completed, failed
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),

  -- Retry tracking
  -- attempt_count: number of processing attempts made
  -- max_attempts: configurable per-job limit (default 3)
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,

  -- Error tracking for debugging failed jobs
  last_error TEXT,

  -- Error classification for retry logic (matches image_processing_jobs pattern)
  -- error_category: 'transient' (will retry) or 'permanent' (no retry)
  error_category TEXT
    CHECK (error_category IS NULL OR error_category IN ('transient', 'permanent')),

  -- error_code: normalized error code matching attribute_error_reason values
  error_code TEXT
    CHECK (error_code IS NULL OR error_code IN (
      'timeout',
      'invalid_json',
      'missing_image',
      'rate_limited',
      'config_error',
      'network',
      'server_error',
      'unknown'
    )),

  -- error_provider: which provider caused the error
  error_provider TEXT
    CHECK (error_provider IS NULL OR error_provider IN ('storage', 'openai', 'internal')),

  -- Timestamps for monitoring and debugging
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- When the job was picked up by a worker (null if pending)
  started_at TIMESTAMPTZ,

  -- When the job completed (succeeded or failed permanently)
  completed_at TIMESTAMPTZ,

  -- Next retry time for exponential backoff scheduling
  -- Jobs won't be picked up until next_retry_at <= NOW() (or is NULL for immediate)
  next_retry_at TIMESTAMPTZ,

  -- Processing duration for observability
  processing_duration_ms INTEGER,

  -- Idempotency constraint: only one job per (item_id, image_key) combination
  -- ON CONFLICT handling in trigger ensures duplicate enqueues are safe
  UNIQUE(item_id, image_key)
);

-- Index on status for efficient job polling by workers
-- Workers query: SELECT * FROM attribute_detection_jobs WHERE status = 'pending' ORDER BY created_at LIMIT N
CREATE INDEX IF NOT EXISTS idx_attribute_detection_jobs_status
  ON public.attribute_detection_jobs(status)
  WHERE status IN ('pending', 'processing');

-- Index on item_id for efficient lookups when checking job status for an item
CREATE INDEX IF NOT EXISTS idx_attribute_detection_jobs_item_id
  ON public.attribute_detection_jobs(item_id);

-- Index on created_at for FIFO ordering when polling pending jobs
CREATE INDEX IF NOT EXISTS idx_attribute_detection_jobs_created_at
  ON public.attribute_detection_jobs(created_at)
  WHERE status = 'pending';

-- Index on next_retry_at for efficient job polling with retry scheduling
-- Only index pending jobs that are ready for retry
CREATE INDEX IF NOT EXISTS idx_attribute_detection_jobs_next_retry
  ON public.attribute_detection_jobs(next_retry_at)
  WHERE status = 'pending';

-- Index on started_at for stale job detection
-- Only index jobs currently in processing state
CREATE INDEX IF NOT EXISTS idx_attribute_detection_jobs_stale_detection
  ON public.attribute_detection_jobs(started_at)
  WHERE status = 'processing';

-- Drop existing trigger if it exists (for idempotency)
DROP TRIGGER IF EXISTS set_updated_at ON public.attribute_detection_jobs;

-- Create trigger to auto-update updated_at on any UPDATE
-- Reuses existing public.handle_updated_at() function from profiles migration
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.attribute_detection_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Enable Row Level Security
-- Jobs table is accessed by Edge Functions using service role, but RLS provides defense in depth
ALTER TABLE public.attribute_detection_jobs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can view their own attribute detection jobs" ON public.attribute_detection_jobs;

-- RLS Policy: Allow authenticated users to view jobs for their own items
-- Users can check processing status but cannot modify jobs directly
CREATE POLICY "Users can view their own attribute detection jobs"
  ON public.attribute_detection_jobs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.items
      WHERE items.id = attribute_detection_jobs.item_id
        AND items.user_id = auth.uid()
    )
  );

-- Note: No INSERT/UPDATE/DELETE policies for authenticated users
-- Job creation is handled by database trigger (runs with definer privileges)
-- Job updates are handled by Edge Functions using service role (bypasses RLS)

-- Add documentation comments
COMMENT ON TABLE public.attribute_detection_jobs IS 'Job queue for asynchronous AI attribute detection. Jobs are enqueued by database trigger when items have attribute_status=pending and a usable image key. Processed by Edge Functions. Idempotent via UNIQUE(item_id, image_key).';
COMMENT ON COLUMN public.attribute_detection_jobs.id IS 'Auto-incrementing primary key for FIFO ordering.';
COMMENT ON COLUMN public.attribute_detection_jobs.item_id IS 'Reference to the wardrobe item being processed.';
COMMENT ON COLUMN public.attribute_detection_jobs.image_key IS 'Storage key of the image used for detection (clean_key preferred, original_key fallback). Forms idempotency key with item_id.';
COMMENT ON COLUMN public.attribute_detection_jobs.status IS 'Job status: pending (awaiting pickup), processing (worker claimed), completed (success), failed (permanent failure).';
COMMENT ON COLUMN public.attribute_detection_jobs.attempt_count IS 'Number of processing attempts made. Incremented each time a worker picks up the job.';
COMMENT ON COLUMN public.attribute_detection_jobs.max_attempts IS 'Maximum number of attempts before marking as permanently failed. Default 3.';
COMMENT ON COLUMN public.attribute_detection_jobs.last_error IS 'Error message from the most recent failed attempt.';
COMMENT ON COLUMN public.attribute_detection_jobs.error_category IS 'Error classification: transient (will retry) or permanent (no retry).';
COMMENT ON COLUMN public.attribute_detection_jobs.error_code IS 'Normalized error code: timeout, invalid_json, missing_image, rate_limited, config_error, etc.';
COMMENT ON COLUMN public.attribute_detection_jobs.error_provider IS 'Provider that caused the error: storage, openai, or internal.';
COMMENT ON COLUMN public.attribute_detection_jobs.created_at IS 'When the job was enqueued.';
COMMENT ON COLUMN public.attribute_detection_jobs.updated_at IS 'When the job was last updated. Auto-updated by trigger.';
COMMENT ON COLUMN public.attribute_detection_jobs.started_at IS 'When a worker started processing this job.';
COMMENT ON COLUMN public.attribute_detection_jobs.completed_at IS 'When the job completed (successfully or permanently failed).';
COMMENT ON COLUMN public.attribute_detection_jobs.next_retry_at IS 'Timestamp when job can next be retried. NULL means immediate. Used for exponential backoff.';
COMMENT ON COLUMN public.attribute_detection_jobs.processing_duration_ms IS 'Duration of the last processing attempt in milliseconds.';
