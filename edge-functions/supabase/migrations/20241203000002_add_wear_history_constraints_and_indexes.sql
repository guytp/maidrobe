-- Migration: Add wear_history constraints and indexes
-- Purpose: Enforce uniqueness and optimize query performance for wear history
-- Story: #442 - Wear History Data Model and Supabase Integration
-- Dependencies: 20241203000001_create_wear_history_table.sql
-- Idempotency: Safe to re-run; uses IF NOT EXISTS and conditional constraint creation
--
-- This is Step 2 of the wear history feature (Story #442). This migration adds:
--   - Unique constraint on (user_id, outfit_id, worn_date) for upsert support
--   - Composite index for reverse-chronological queries
--   - Documentation of the intended upsert pattern

-- ============================================================================
-- UNIQUE CONSTRAINT: Prevent duplicate wear events
-- ============================================================================
--
-- Business rule: A user cannot have multiple wear events for the same outfit
-- on the same calendar day. If they try to log the same outfit twice on a day,
-- the second attempt should update the existing record (upsert pattern).
--
-- Constraint columns:
--   - user_id: Scopes the constraint to a single user
--   - outfit_id: The outfit being worn
--   - worn_date: The calendar date (not timestamp) of the wear event
--
-- Note: Using DO block for idempotent constraint creation since
-- ALTER TABLE ADD CONSTRAINT does not support IF NOT EXISTS syntax.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_wear_history_user_outfit_date'
      AND conrelid = 'public.wear_history'::regclass
  ) THEN
    ALTER TABLE public.wear_history
    ADD CONSTRAINT uq_wear_history_user_outfit_date
    UNIQUE (user_id, outfit_id, worn_date);

    RAISE NOTICE 'Created unique constraint uq_wear_history_user_outfit_date';
  ELSE
    RAISE NOTICE 'Unique constraint uq_wear_history_user_outfit_date already exists';
  END IF;
END $$;

-- ============================================================================
-- COMPOSITE INDEX: Reverse-chronological queries
-- ============================================================================
--
-- Primary use case: Fetching a user's wear history in reverse-chronological order
-- for timeline/calendar views and no-repeat window queries.
--
-- Query patterns supported:
--   1. Recent history: SELECT * FROM wear_history
--                      WHERE user_id = $1
--                      ORDER BY worn_date DESC, worn_at DESC
--                      LIMIT 50;
--
--   2. No-repeat window: SELECT * FROM wear_history
--                        WHERE user_id = $1
--                          AND worn_date >= $2  -- e.g., NOW() - interval '14 days'
--                        ORDER BY worn_date DESC, worn_at DESC;
--
--   3. Date range query: SELECT * FROM wear_history
--                        WHERE user_id = $1
--                          AND worn_date BETWEEN $2 AND $3
--                        ORDER BY worn_date DESC, worn_at DESC;
--
-- Index design rationale:
--   - user_id first: All queries are user-scoped (RLS enforces this anyway)
--   - worn_date DESC: Primary sort for calendar/timeline views
--   - worn_at DESC: Secondary sort for multiple events on same day (edge case)
--
-- Performance target: p95 < 200ms for first page (50 events) under typical load

CREATE INDEX IF NOT EXISTS idx_wear_history_user_date_worn
  ON public.wear_history (user_id, worn_date DESC, worn_at DESC);

-- ============================================================================
-- UPSERT PATTERN DOCUMENTATION
-- ============================================================================
--
-- The unique constraint enables an "upsert" pattern where clients can safely
-- log a wear event without first checking if one already exists for that
-- outfit on that day. If a duplicate exists, the mutable fields are updated.
--
-- RECOMMENDED UPSERT QUERY:
--
--   INSERT INTO public.wear_history (
--     user_id,
--     outfit_id,
--     item_ids,
--     worn_date,
--     worn_at,
--     context,
--     source,
--     notes
--   ) VALUES (
--     $1,  -- user_id (from auth.uid())
--     $2,  -- outfit_id
--     $3,  -- item_ids (UUID array)
--     $4,  -- worn_date (DATE)
--     $5,  -- worn_at (TIMESTAMPTZ, or DEFAULT for NOW())
--     $6,  -- context (TEXT, nullable)
--     $7,  -- source ('ai_recommendation', 'saved_outfit', 'manual_outfit', 'imported')
--     $8   -- notes (TEXT, nullable)
--   )
--   ON CONFLICT (user_id, outfit_id, worn_date)
--   DO UPDATE SET
--     -- Always update these mutable fields:
--     worn_at = EXCLUDED.worn_at,
--     context = EXCLUDED.context,
--     notes = EXCLUDED.notes,
--     updated_at = NOW(),
--     -- Optionally update these if the client provides new values:
--     -- (Use COALESCE to preserve existing values if new value is null)
--     item_ids = COALESCE(EXCLUDED.item_ids, wear_history.item_ids),
--     source = COALESCE(EXCLUDED.source, wear_history.source)
--   RETURNING *;
--
-- FIELD UPDATE SEMANTICS:
--
--   - worn_at: Always updated to reflect the latest timestamp of wear logging
--   - context: Always updated (client provides new context or null to clear)
--   - notes: Always updated (client provides new notes or null to clear)
--   - updated_at: Always set to NOW() on conflict (trigger also handles this)
--   - item_ids: Updated if provided; preserves existing if EXCLUDED is null
--   - source: Updated if provided; preserves existing if EXCLUDED is null
--
-- SUPABASE SDK USAGE (TypeScript):
--
--   const { data, error } = await supabase
--     .from('wear_history')
--     .upsert({
--       user_id: userId,
--       outfit_id: outfitId,
--       item_ids: itemIds,
--       worn_date: wornDate,
--       worn_at: new Date().toISOString(),
--       context: context ?? null,
--       source: source,
--       notes: notes ?? null,
--     }, {
--       onConflict: 'user_id,outfit_id,worn_date',
--       ignoreDuplicates: false,  // false = update on conflict
--     })
--     .select()
--     .single();
--
-- ============================================================================

-- Add comment to document the constraint purpose
COMMENT ON CONSTRAINT uq_wear_history_user_outfit_date ON public.wear_history IS
  'Prevents duplicate wear events for the same outfit on the same day. Enables upsert pattern via ON CONFLICT DO UPDATE.';

-- Add comment to document the index purpose
COMMENT ON INDEX idx_wear_history_user_date_worn IS
  'Composite index for reverse-chronological queries. Supports history listing, no-repeat window checks, and date range queries. Target: p95 < 200ms for 50-row page.';
