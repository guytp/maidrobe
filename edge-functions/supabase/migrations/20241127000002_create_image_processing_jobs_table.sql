-- Migration: Create image_processing_jobs table
-- Purpose: Job queue table for asynchronous image processing (background removal + thumbnails)
-- Story: #229 - Implement Background Image Cleanup and Thumbnail Generation Pipeline
-- Dependencies: Requires 20241120000001_create_items_table.sql to have been applied
-- Idempotency: Safe to re-run; uses CREATE TABLE IF NOT EXISTS and DROP INDEX IF EXISTS

-- Create image_processing_jobs table for job queue
-- This table decouples job enqueueing (via trigger) from job processing (via Edge Function)
-- Benefits:
--   - Database trigger can safely enqueue without HTTP calls (no pg_net dependency)
--   - Jobs persist even if Edge Function is temporarily unavailable
--   - Supports retry logic with attempt tracking
--   - Idempotent via UNIQUE constraint on (item_id, original_key)
CREATE TABLE IF NOT EXISTS public.image_processing_jobs (
  -- Primary key: auto-incrementing for efficient queue ordering
  id BIGSERIAL PRIMARY KEY,

  -- Reference to the item being processed
  -- ON DELETE CASCADE ensures jobs are cleaned up when items are deleted
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,

  -- The original_key being processed - forms idempotency key with item_id
  -- This allows re-processing if original_key changes (user uploads new image)
  original_key TEXT NOT NULL,

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

  -- Timestamps for monitoring and debugging
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- When the job was picked up by a worker (null if pending)
  started_at TIMESTAMPTZ,

  -- When the job completed (succeeded or failed permanently)
  completed_at TIMESTAMPTZ,

  -- Idempotency constraint: only one job per (item_id, original_key) combination
  -- ON CONFLICT DO NOTHING in trigger ensures duplicate enqueues are safe
  UNIQUE(item_id, original_key)
);

-- Index on status for efficient job polling by workers
-- Workers query: SELECT * FROM image_processing_jobs WHERE status = 'pending' ORDER BY created_at LIMIT N
CREATE INDEX IF NOT EXISTS idx_image_processing_jobs_status
  ON public.image_processing_jobs(status)
  WHERE status IN ('pending', 'processing');

-- Index on item_id for efficient lookups when checking job status for an item
CREATE INDEX IF NOT EXISTS idx_image_processing_jobs_item_id
  ON public.image_processing_jobs(item_id);

-- Index on created_at for FIFO ordering when polling pending jobs
CREATE INDEX IF NOT EXISTS idx_image_processing_jobs_created_at
  ON public.image_processing_jobs(created_at)
  WHERE status = 'pending';

-- Drop existing trigger if it exists (for idempotency)
DROP TRIGGER IF EXISTS set_updated_at ON public.image_processing_jobs;

-- Create trigger to auto-update updated_at on any UPDATE
-- Reuses existing public.handle_updated_at() function from profiles migration
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.image_processing_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Enable Row Level Security
-- Jobs table is accessed by Edge Functions using service role, but RLS provides defense in depth
ALTER TABLE public.image_processing_jobs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Service role has full access to jobs" ON public.image_processing_jobs;
DROP POLICY IF EXISTS "Users can view their own jobs" ON public.image_processing_jobs;

-- RLS Policy: Allow authenticated users to view jobs for their own items
-- Users can check processing status but cannot modify jobs directly
CREATE POLICY "Users can view their own jobs"
  ON public.image_processing_jobs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.items
      WHERE items.id = image_processing_jobs.item_id
        AND items.user_id = auth.uid()
    )
  );

-- Note: No INSERT/UPDATE/DELETE policies for authenticated users
-- Job creation is handled by database trigger (runs with definer privileges)
-- Job updates are handled by Edge Functions using service role (bypasses RLS)

-- Add documentation comments
COMMENT ON TABLE public.image_processing_jobs IS 'Job queue for asynchronous image processing. Jobs are enqueued by database trigger and processed by Edge Functions. Idempotent via UNIQUE(item_id, original_key).';
COMMENT ON COLUMN public.image_processing_jobs.id IS 'Auto-incrementing primary key for FIFO ordering.';
COMMENT ON COLUMN public.image_processing_jobs.item_id IS 'Reference to the wardrobe item being processed.';
COMMENT ON COLUMN public.image_processing_jobs.original_key IS 'Storage key of the original image being processed. Forms idempotency key with item_id.';
COMMENT ON COLUMN public.image_processing_jobs.status IS 'Job status: pending (awaiting pickup), processing (worker claimed), completed (success), failed (permanent failure).';
COMMENT ON COLUMN public.image_processing_jobs.attempt_count IS 'Number of processing attempts made. Incremented each time a worker picks up the job.';
COMMENT ON COLUMN public.image_processing_jobs.max_attempts IS 'Maximum number of attempts before marking as permanently failed. Default 3.';
COMMENT ON COLUMN public.image_processing_jobs.last_error IS 'Error message from the most recent failed attempt.';
COMMENT ON COLUMN public.image_processing_jobs.created_at IS 'When the job was enqueued.';
COMMENT ON COLUMN public.image_processing_jobs.updated_at IS 'When the job was last updated. Auto-updated by trigger.';
COMMENT ON COLUMN public.image_processing_jobs.started_at IS 'When a worker started processing this job.';
COMMENT ON COLUMN public.image_processing_jobs.completed_at IS 'When the job completed (successfully or permanently failed).';
