-- Migration: Add wear_history RLS policies
-- Purpose: Enable row-level security and define access policies for wear history
-- Story: #442 - Wear History Data Model and Supabase Integration
-- Dependencies: 20241203000001_create_wear_history_table.sql
-- Idempotency: Safe to re-run; uses DROP POLICY IF EXISTS before CREATE
--
-- This is Step 3 of the wear history feature (Story #442). This migration adds:
--   - Row-level security enablement
--   - SELECT, INSERT, UPDATE, DELETE policies for authenticated users
--   - Documentation of service role access patterns

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================
--
-- Critical for security - ensures users can only access their own wear history.
-- Without RLS, any authenticated user could query all users' data.

ALTER TABLE public.wear_history ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- DROP EXISTING POLICIES (for idempotency)
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own wear history" ON public.wear_history;
DROP POLICY IF EXISTS "Users can insert their own wear history" ON public.wear_history;
DROP POLICY IF EXISTS "Users can update their own wear history" ON public.wear_history;
DROP POLICY IF EXISTS "Users can delete their own wear history" ON public.wear_history;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- SELECT Policy: Users can only view their own wear history
-- Used for: Timeline views, calendar displays, no-repeat window queries
CREATE POLICY "Users can view their own wear history"
  ON public.wear_history
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- INSERT Policy: Users can only create wear history for themselves
-- Enforces that user_id must match the authenticated user's ID
-- Prevents users from creating wear events attributed to other users
CREATE POLICY "Users can insert their own wear history"
  ON public.wear_history
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- UPDATE Policy: Users can only update their own wear history
-- USING clause: Restricts which rows can be targeted for update
-- WITH CHECK clause: Prevents changing user_id to a different owner
-- Together they ensure users can only modify their own data and cannot
-- transfer ownership of wear events to another user
CREATE POLICY "Users can update their own wear history"
  ON public.wear_history
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE Policy: Users can only delete their own wear history
-- Allows users to remove wear events they no longer want recorded
-- Note: Unlike items table, wear_history does not use soft-delete pattern
CREATE POLICY "Users can delete their own wear history"
  ON public.wear_history
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- SERVICE ROLE ACCESS PATTERNS
-- ============================================================================
--
-- Service role (used by Edge Functions with service_role key) bypasses RLS
-- automatically. No explicit policies are needed for service role access.
--
-- Service role should be used ONLY for:
--
--   1. Account Deletion (Privacy/GDPR compliance)
--      - When a user deletes their account, service role deletes all
--        wear_history rows for that user as part of the cascade
--      - Example: DELETE FROM wear_history WHERE user_id = $1
--
--   2. Data Export (Privacy/GDPR compliance)
--      - When a user requests data export, service role queries their
--        complete wear history for inclusion in the export package
--      - Example: SELECT * FROM wear_history WHERE user_id = $1
--
--   3. Analytics and Reporting (Admin only)
--      - Aggregated, anonymized analytics across all users
--      - Must not expose individual user data
--
--   4. Scheduled Maintenance
--      - Cleanup jobs for orphaned data
--      - Data integrity checks
--
-- IMPORTANT: Service role access must be:
--   - Carefully audited and logged
--   - Restricted to trusted server-side code only
--   - Never exposed to client applications
--   - Documented with clear justification for each use case
--
-- Edge Functions acting on behalf of a user should use the user's JWT
-- (user impersonation pattern) rather than service role, so that RLS
-- policies are automatically enforced.
--
-- ============================================================================
-- ANONYMOUS USER ACCESS
-- ============================================================================
--
-- No policies are defined for the `anon` role. Anonymous users cannot
-- access wear_history data. All access requires authentication.
--
-- ============================================================================
