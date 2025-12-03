-- Migration: Create wear_history table
-- Purpose: Establish public.wear_history table for tracking when users wear outfits
-- Dependencies: Requires auth.users table (provided by Supabase Auth) and public.handle_updated_at() function
-- Idempotency: Safe to re-run; uses CREATE TABLE IF NOT EXISTS and DROP TRIGGER IF EXISTS
--
-- This is Step 1 of the wear history feature (Story #442). This migration creates the core
-- table structure. Subsequent migrations will add:
--   - Unique constraint and indexes (Step 2)
--   - Row Level Security policies (Step 3)
--
-- Note on outfit_id: This column stores the outfit identifier but does not have a foreign key
-- constraint because outfits may be ephemeral (AI recommendations) or persisted (saved outfits).
-- The source column indicates the origin of the wear event.

-- Create wear_history table with full schema
-- This table records each time a user marks an outfit as worn, supporting:
--   - Wear history timeline and calendar views
--   - No-repeat window enforcement for outfit recommendations
--   - Usage analytics and pattern detection
CREATE TABLE IF NOT EXISTS public.wear_history (
  -- Primary key with server-generated UUID
  -- Unlike items (which use client-generated UUIDv7), wear_history uses server-generated
  -- UUIDs since wear events are typically created via API calls, not offline-first workflows.
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User ownership - references auth.users for RLS and cascade delete
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Outfit reference - stores the outfit ID that was worn
  -- No FK constraint: outfits may be ephemeral (AI recommendations) or saved
  -- The source column indicates the origin type
  outfit_id UUID NOT NULL,

  -- Denormalized snapshot of item IDs that were part of the outfit at wear time
  -- Stored as array to preserve the outfit composition even if the outfit is later modified
  -- This supports accurate wear history display and no-repeat calculations
  item_ids UUID[] NOT NULL,

  -- User-local calendar date when the outfit was worn
  -- Used for uniqueness constraint and no-repeat window queries
  -- Stored as DATE (not TIMESTAMPTZ) to represent the calendar day regardless of timezone
  worn_date DATE NOT NULL,

  -- Precise timestamp when the wear event was recorded
  -- Defaults to NOW() for convenience; can be overridden for imported data
  worn_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Free-form context description (e.g., "client lunch", "office", "wedding")
  -- Nullable to allow quick wear logging without requiring additional input
  context TEXT,

  -- Source of the wear event indicating how the outfit was created/selected
  -- Used for analytics and to understand user behavior patterns
  -- Values:
  --   - ai_recommendation: Outfit suggested by the AI recommendation engine
  --   - saved_outfit: User selected from their saved outfits
  --   - manual_outfit: User manually assembled the outfit
  --   - imported: Wear event imported from external source (e.g., data migration)
  source TEXT NOT NULL
    CHECK (source IN ('ai_recommendation', 'saved_outfit', 'manual_outfit', 'imported')),

  -- Optional notes for journaling and annotations
  -- Supports future features like outfit journaling, mood tracking, etc.
  notes TEXT,

  -- Timestamp fields following established patterns
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Drop existing trigger if it exists (for idempotency)
DROP TRIGGER IF EXISTS set_updated_at ON public.wear_history;

-- Create trigger to auto-update updated_at on any UPDATE
-- Reuses existing public.handle_updated_at() function from profiles migration
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.wear_history
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Add documentation comments
COMMENT ON TABLE public.wear_history IS 'Records when users wear outfits. Supports wear history timeline, no-repeat window enforcement, and usage analytics. Row-level security ensures users can only access their own wear history.';

COMMENT ON COLUMN public.wear_history.id IS 'Unique identifier for the wear event. Primary key with server-generated UUID.';
COMMENT ON COLUMN public.wear_history.user_id IS 'Owner of the wear event. References auth.users(id) with cascade delete.';
COMMENT ON COLUMN public.wear_history.outfit_id IS 'Identifier of the outfit that was worn. No FK constraint as outfits may be ephemeral or saved.';
COMMENT ON COLUMN public.wear_history.item_ids IS 'Denormalized array of item UUIDs that comprised the outfit at wear time. Preserves outfit composition for historical accuracy.';
COMMENT ON COLUMN public.wear_history.worn_date IS 'User-local calendar date when the outfit was worn. Used for uniqueness constraint and no-repeat queries.';
COMMENT ON COLUMN public.wear_history.worn_at IS 'Precise timestamp when the wear event was recorded. Defaults to NOW().';
COMMENT ON COLUMN public.wear_history.context IS 'Free-form description of the occasion (e.g., "client lunch", "office"). Nullable.';
COMMENT ON COLUMN public.wear_history.source IS 'Origin of the wear event: ai_recommendation, saved_outfit, manual_outfit, or imported.';
COMMENT ON COLUMN public.wear_history.notes IS 'Optional notes for journaling and annotations. Nullable.';
COMMENT ON COLUMN public.wear_history.created_at IS 'Timestamp when the wear event record was created.';
COMMENT ON COLUMN public.wear_history.updated_at IS 'Timestamp when the wear event record was last updated. Auto-updated by trigger.';
