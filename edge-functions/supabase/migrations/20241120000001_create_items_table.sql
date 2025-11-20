-- Migration: Create items table
-- Purpose: Establish public.items table for wardrobe item data with image processing status tracking
-- Dependencies: Requires auth.users table (provided by Supabase Auth) and public.handle_updated_at() function
-- Idempotency: Safe to re-run; uses CREATE TABLE IF NOT EXISTS and DROP TRIGGER IF EXISTS

-- Create items table with full wardrobe item schema
-- This table stores all wardrobe items with metadata, image keys, and processing status
CREATE TABLE IF NOT EXISTS public.items (
  -- Primary key and user reference
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Wardrobe item metadata fields
  name TEXT,
  tags TEXT[],
  type TEXT,
  colour TEXT[],
  pattern TEXT,
  fabric TEXT,
  season TEXT[],
  fit TEXT,

  -- Image storage keys (Supabase Storage object keys)
  original_key TEXT,
  clean_key TEXT,
  thumb_key TEXT,

  -- Processing status fields with constraints
  image_processing_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (image_processing_status IN ('pending', 'processing', 'succeeded', 'failed')),
  attribute_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (attribute_status IN ('pending', 'processing', 'succeeded', 'failed')),

  -- Timestamp fields
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Soft delete support
  deleted_at TIMESTAMPTZ
);

-- Create indexes for query performance and future foreign key references
-- Primary key index on id is implicit from PRIMARY KEY constraint

-- Index on user_id for user-scoped queries and foreign key performance
CREATE INDEX IF NOT EXISTS idx_items_user_id
  ON public.items(user_id);

-- Composite index on (user_id, created_at DESC) for recency-based per-user listings
-- Supports queries like: SELECT * FROM items WHERE user_id = ? ORDER BY created_at DESC
-- This is the primary index for library views showing newest items first
CREATE INDEX IF NOT EXISTS idx_items_user_id_created_at
  ON public.items(user_id, created_at DESC);

-- Composite index on (user_id, updated_at DESC) for recently-modified listings
-- Supports queries like: SELECT * FROM items WHERE user_id = ? ORDER BY updated_at DESC
-- Useful for "recently updated" views and sync operations
CREATE INDEX IF NOT EXISTS idx_items_user_id_updated_at
  ON public.items(user_id, updated_at DESC);

-- Partial index on image_processing_status for background processing jobs
-- Only indexes rows with pending or processing status to minimize index size
-- Supports queries like: SELECT * FROM items WHERE image_processing_status = 'pending'
-- Used by Edge Functions to find items needing background removal and thumbnails
CREATE INDEX IF NOT EXISTS idx_items_image_processing_status
  ON public.items(image_processing_status)
  WHERE image_processing_status IN ('pending', 'processing');

-- Partial index on attribute_status for background processing jobs
-- Only indexes rows with pending or processing status to minimize index size
-- Supports queries like: SELECT * FROM items WHERE attribute_status = 'pending'
-- Used by Edge Functions to find items needing AI attribute detection
CREATE INDEX IF NOT EXISTS idx_items_attribute_status
  ON public.items(attribute_status)
  WHERE attribute_status IN ('pending', 'processing');

-- Drop existing trigger if it exists (for idempotency)
DROP TRIGGER IF EXISTS set_updated_at ON public.items;

-- Create trigger to auto-update updated_at on any UPDATE
-- Reuses existing public.handle_updated_at() function from profiles migration
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.items
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Enable Row Level Security
-- This is critical for security - ensures users can only access their own items
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can view their own items" ON public.items;
DROP POLICY IF EXISTS "Users can insert their own items" ON public.items;
DROP POLICY IF EXISTS "Users can update their own items" ON public.items;
DROP POLICY IF EXISTS "Users can delete their own items" ON public.items;

-- RLS Policy: Allow users to SELECT their own non-deleted items
-- Automatically filters out soft-deleted items (deleted_at IS NULL)
-- This ensures normal user-facing queries only return active items
CREATE POLICY "Users can view their own items"
  ON public.items
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id AND deleted_at IS NULL);

-- RLS Policy: Allow users to INSERT items with their own user_id
-- Enforces that user_id must match the authenticated user
-- This prevents users from creating items for other users
CREATE POLICY "Users can insert their own items"
  ON public.items
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Allow users to UPDATE their own items
-- USING clause restricts which rows can be updated (must be owned by user)
-- WITH CHECK clause prevents changing user_id to another user
CREATE POLICY "Users can update their own items"
  ON public.items
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Allow users to DELETE their own items
-- Note: Soft delete (setting deleted_at) is preferred and uses UPDATE policy
-- This DELETE policy allows hard deletion if needed
CREATE POLICY "Users can delete their own items"
  ON public.items
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Service Role and Edge Functions Access Pattern:
--
-- Edge Functions should authenticate as the user they are acting on behalf of:
--   1. Receive user JWT from client request or extract from auth context
--   2. Create Supabase client with the user's JWT:
--        const supabase = createClient(
--          supabaseUrl,
--          supabaseAnonKey,
--          { global: { headers: { Authorization: `Bearer ${userJwt}` } } }
--        )
--   3. RLS policies automatically enforce user_id = auth.uid() for that user
--   4. Edge Functions can only access items belonging to the authenticated user
--
-- This user impersonation pattern ensures:
--   - Background jobs (image processing, attribute detection) respect user boundaries
--   - No single Edge Function can access all users' data
--   - Audit trails show operations performed as the user
--
-- Service role (bypasses RLS) should ONLY be used for:
--   - Administrative operations (bulk data migrations, system maintenance)
--   - Cross-user analytics or reporting (with appropriate access controls)
--   - Scheduled cleanup jobs that operate on all users (e.g., purging old deleted items)
--
-- IMPORTANT: Service role access must be:
--   - Carefully audited and logged
--   - Restricted to trusted server-side code only
--   - Never exposed to client applications
--   - Documented with clear justification for each use case
--
-- Anonymous users are denied all access (no policies defined for anon role).

-- Add documentation comments
COMMENT ON TABLE public.items IS 'Wardrobe items with metadata, image storage keys, and processing status. Row-level security ensures users can only access their own items. Supports soft delete via deleted_at.';
COMMENT ON COLUMN public.items.id IS 'Unique identifier for the item. Primary key.';
COMMENT ON COLUMN public.items.user_id IS 'Owner of the item. References auth.users(id) with cascade delete.';
COMMENT ON COLUMN public.items.name IS 'User-provided name or label for the item.';
COMMENT ON COLUMN public.items.tags IS 'User-defined tags for organization and search.';
COMMENT ON COLUMN public.items.type IS 'Item type (e.g., shirt, pants, dress). May be set by AI or user.';
COMMENT ON COLUMN public.items.colour IS 'Detected or user-specified colours. Array allows multi-colour items.';
COMMENT ON COLUMN public.items.pattern IS 'Pattern description (e.g., striped, solid, floral).';
COMMENT ON COLUMN public.items.fabric IS 'Fabric type (e.g., cotton, wool, polyester).';
COMMENT ON COLUMN public.items.season IS 'Suitable seasons (e.g., summer, winter). Array allows multi-season items.';
COMMENT ON COLUMN public.items.fit IS 'Fit description (e.g., slim, regular, loose).';
COMMENT ON COLUMN public.items.original_key IS 'Supabase Storage key for original uploaded image.';
COMMENT ON COLUMN public.items.clean_key IS 'Supabase Storage key for background-removed/cleaned image.';
COMMENT ON COLUMN public.items.thumb_key IS 'Supabase Storage key for thumbnail image.';
COMMENT ON COLUMN public.items.image_processing_status IS 'Status of background removal and thumbnail generation: pending, processing, succeeded, or failed.';
COMMENT ON COLUMN public.items.attribute_status IS 'Status of AI attribute detection (type, colour, pattern, etc.): pending, processing, succeeded, or failed.';
COMMENT ON COLUMN public.items.created_at IS 'Timestamp when the item was created.';
COMMENT ON COLUMN public.items.updated_at IS 'Timestamp when the item was last updated. Auto-updated by trigger.';
COMMENT ON COLUMN public.items.deleted_at IS 'Timestamp when the item was soft-deleted. NULL means active, non-NULL means deleted.';
