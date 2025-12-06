-- Migration: Create prefs table
-- Purpose: Establish public.prefs table for user styling preferences including no-repeat window settings
-- Dependencies: Requires auth.users table (provided by Supabase Auth) and public.handle_updated_at() function
-- Idempotency: Safe to re-run; uses CREATE TABLE IF NOT EXISTS and DROP TRIGGER/POLICY IF EXISTS
--
-- This migration creates the prefs table to store user styling preferences:
--   - No-repeat window settings (days and mode) for outfit recommendations
--   - Colour preferences for styling suggestions
--   - Exclusions (items/styles user never wears)
--   - Comfort notes for AI context
--
-- The table has a 1:1 relationship with auth.users (user_id is both PK and FK).
-- Row Level Security ensures users can only access their own preferences.

-- Create prefs table with full schema
CREATE TABLE IF NOT EXISTS public.prefs (
  -- Primary key and user reference (1:1 relationship)
  -- user_id serves as both primary key and foreign key to auth.users
  -- This ensures exactly one prefs row per user
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- No-repeat window: number of days before allowing item/outfit repeats
  -- Range: 0-180 days in database (UI validates 0-90, DB allows buffer for future expansion)
  -- NOTE: DB range (0-180) intentionally exceeds UI range (0-90) to allow future UI expansion
  --       without requiring a database migration. UI validation is the primary constraint.
  -- Default: 7 days (one week) - balances variety with practicality
  -- 0 means user is okay with immediate repeats
  no_repeat_days INTEGER NOT NULL DEFAULT 7
    CHECK (no_repeat_days >= 0 AND no_repeat_days <= 180),

  -- No-repeat mode: granularity of repeat avoidance
  -- 'item': Avoid repeating key individual items within the window
  -- 'outfit': Only avoid repeating the exact same outfit combination
  -- Default: 'item' - recommended for most users, provides more variety
  no_repeat_mode TEXT NOT NULL DEFAULT 'item'
    CHECK (no_repeat_mode IN ('item', 'outfit')),

  -- Colour preferences: user's preferred colour palette tendencies
  -- Stores array of colour tags (e.g., ['neutrals'], ['bold_colours'])
  -- Empty array means no preference set
  -- Canonical values: 'neutrals', 'some_colour', 'bold_colours'
  colour_prefs TEXT[] NOT NULL DEFAULT '{}',

  -- Exclusions: items/styles user never wants recommended
  -- Mixed format array:
  --   - Known tags stored as-is (e.g., 'skirts', 'heels')
  --   - Free-text entries prefixed with 'free:' (e.g., 'free:no wool')
  -- Empty array means no exclusions
  exclusions TEXT[] NOT NULL DEFAULT '{}',

  -- Comfort notes: free-text field for additional styling context
  -- Used by AI to understand user preferences not captured by structured fields
  -- Examples: "prefer loose fits", "sensitive to rough fabrics"
  -- Nullable - not required
  comfort_notes TEXT,

  -- Timestamp fields following established patterns
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on user_id for query performance
-- While user_id is the primary key (implicitly indexed), this explicit index
-- documents the access pattern and ensures optimal performance for user lookups
-- Note: PostgreSQL automatically creates an index for PRIMARY KEY, so this is
-- technically redundant but included for documentation clarity
-- CREATE INDEX IF NOT EXISTS idx_prefs_user_id ON public.prefs(user_id);

-- Drop existing trigger if it exists (for idempotency)
DROP TRIGGER IF EXISTS set_updated_at ON public.prefs;

-- Create trigger to auto-update updated_at on any UPDATE
-- Reuses existing public.handle_updated_at() function from profiles migration
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.prefs
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Enable Row Level Security
-- Critical for security - ensures users can only access their own preferences
ALTER TABLE public.prefs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can view their own prefs" ON public.prefs;
DROP POLICY IF EXISTS "Users can insert their own prefs" ON public.prefs;
DROP POLICY IF EXISTS "Users can update their own prefs" ON public.prefs;
DROP POLICY IF EXISTS "Users can delete their own prefs" ON public.prefs;

-- RLS Policy: Allow users to SELECT their own preferences
-- Users can only read their own prefs row
CREATE POLICY "Users can view their own prefs"
  ON public.prefs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policy: Allow users to INSERT their own preferences
-- Users can only create a prefs row for themselves
-- This supports both manual creation and upsert operations
CREATE POLICY "Users can insert their own prefs"
  ON public.prefs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Allow users to UPDATE their own preferences
-- USING clause: Can only update rows they own
-- WITH CHECK clause: Cannot change user_id to another user
CREATE POLICY "Users can update their own prefs"
  ON public.prefs
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Allow users to DELETE their own preferences
-- Supports preference reset or account data management features
CREATE POLICY "Users can delete their own prefs"
  ON public.prefs
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Backfill prefs for existing users who don't have preferences yet
-- Creates default preferences (7-day item-level no-repeat) for all existing users
-- Uses ON CONFLICT DO NOTHING for safety (won't overwrite existing prefs)
-- This ensures all users have sensible defaults after migration
INSERT INTO public.prefs (
  user_id,
  no_repeat_days,
  no_repeat_mode,
  colour_prefs,
  exclusions,
  comfort_notes,
  created_at,
  updated_at
)
SELECT
  id,
  7,           -- Default: 7-day no-repeat window
  'item',      -- Default: Item-level no-repeat mode
  '{}',        -- Default: No colour preferences
  '{}',        -- Default: No exclusions
  NULL,        -- Default: No comfort notes
  NOW(),
  NOW()
FROM auth.users
WHERE NOT EXISTS (
  SELECT 1 FROM public.prefs WHERE prefs.user_id = auth.users.id
)
ON CONFLICT (user_id) DO NOTHING;

-- Add documentation comments
COMMENT ON TABLE public.prefs IS 'User styling preferences for outfit recommendations. Includes no-repeat window settings, colour preferences, exclusions, and comfort notes. Row-level security ensures users can only access their own preferences. 1:1 relationship with auth.users.';

COMMENT ON COLUMN public.prefs.user_id IS 'User ID, references auth.users(id). Primary key. Cascade delete when user is removed.';
COMMENT ON COLUMN public.prefs.no_repeat_days IS 'Number of days before allowing item/outfit repeats. Range 0-180. Default 7. Value 0 means okay with immediate repeats.';
COMMENT ON COLUMN public.prefs.no_repeat_mode IS 'Granularity of repeat avoidance: "item" (avoid repeating key items) or "outfit" (only avoid exact outfit repeats). Default "item".';
COMMENT ON COLUMN public.prefs.colour_prefs IS 'Array of colour preference tags: neutrals, some_colour, bold_colours. Empty array means no preference.';
COMMENT ON COLUMN public.prefs.exclusions IS 'Array of exclusion tags. Known tags stored as-is, free-text prefixed with "free:". Empty array means no exclusions.';
COMMENT ON COLUMN public.prefs.comfort_notes IS 'Free-text notes for additional styling context. Used by AI for personalization. Nullable.';
COMMENT ON COLUMN public.prefs.created_at IS 'Timestamp when the prefs record was created.';
COMMENT ON COLUMN public.prefs.updated_at IS 'Timestamp when the prefs record was last updated. Auto-updated by trigger.';
