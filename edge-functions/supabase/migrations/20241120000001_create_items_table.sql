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

-- Drop existing trigger if it exists (for idempotency)
DROP TRIGGER IF EXISTS set_updated_at ON public.items;

-- Create trigger to auto-update updated_at on any UPDATE
-- Reuses existing public.handle_updated_at() function from profiles migration
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.items
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

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
