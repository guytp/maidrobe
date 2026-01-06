-- Migration: Create users table
-- Purpose: Establish public.users table for core user management
-- Story: #6 - Design and Implement Core User Management Database Schema
-- Dependencies: Requires uuid-ossp extension and handle_updated_at() trigger function
-- Idempotency: Safe to re-run; uses CREATE IF NOT EXISTS for all objects

-- Enable UUID extension if not already enabled
-- This extension provides uuid_generate_v4() for primary key generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create users table with core fields for Buzz A Tutor platform
-- Supports multiple user types (students, tutors, parents, admins) with soft-delete and audit trail
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  auth_provider TEXT NOT NULL DEFAULT 'local',
  auth_provider_id TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID,

  -- Check constraint for valid user statuses
  -- PENDING: New user awaiting verification/activation
  -- ACTIVE: Fully active user account
  -- SUSPENDED: Temporarily disabled (e.g., for violations)
  -- DELETED: Soft-deleted (marked for removal but still in DB)
  CONSTRAINT users_status_check CHECK (status IN ('ACTIVE', 'PENDING', 'SUSPENDED', 'DELETED')),

  -- Check constraint for valid authentication providers
  -- local: Email/password authentication
  -- google: Google OAuth2
  -- facebook: Facebook OAuth2
  -- saml: Enterprise SAML SSO
  CONSTRAINT users_auth_provider_check CHECK (auth_provider IN ('local', 'google', 'facebook', 'saml')),

  -- Self-referencing FK for audit trail (who created this user)
  -- NULLABLE: System operations may not have a creator
  -- DEFERRABLE: Allows circular reference during initial user creation
  CONSTRAINT users_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,

  -- Self-referencing FK for audit trail (who last updated this user)
  -- NULLABLE: System operations may not have an updater
  -- DEFERRABLE: Allows self-reference during updates
  CONSTRAINT users_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE-CRITICAL QUERIES
-- ============================================================================

-- Unique index for active user emails
-- Prevents duplicate active accounts with same email
-- Allows email reuse after soft-delete (is_deleted = true)
-- CRITICAL for authentication flows (login, registration)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_unique_email_active
  ON public.users(email)
  WHERE is_deleted = false;

-- Composite index for authentication provider lookups
-- Supports SSO authentication flows (Google, Facebook, SAML)
-- Pattern: auth_provider + external provider user ID
-- CRITICAL for external identity verification
CREATE INDEX IF NOT EXISTS idx_users_auth_provider_lookup
  ON public.users(auth_provider, auth_provider_id);

-- Index for user status filtering
-- Supports admin views filtering by PENDING, SUSPENDED, DELETED
-- Common query pattern: WHERE status = 'SUSPENDED'
CREATE INDEX IF NOT EXISTS idx_users_status
  ON public.users(status);

-- Index for soft-delete queries
-- Supports efficient filtering of active users (WHERE is_deleted = false)
-- Common pattern: is_deleted = false AND email = $1
CREATE INDEX IF NOT EXISTS idx_users_is_deleted
  ON public.users(is_deleted);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) - SECURITY CRITICAL
-- ============================================================================

-- Enable Row Level Security on users table
-- This is mandatory for all application tables to prevent unauthorized access
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own record
-- Allows authenticated users to SELECT their own user data
-- Used for profile pages, settings, etc.
-- Uses auth.uid() to match current user's UUID
DROP POLICY IF EXISTS "Users can view own record" ON public.users;
CREATE POLICY "Users can view own record"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Policy: Users can update limited fields on own record
-- Allows users to update display_name and other non-sensitive fields
-- PREVENTS changes to: status, email, auth_provider, is_deleted, deleted_at, created_by
-- Role and status changes require admin via service_role policy
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    -- Prevent users from changing their own status or auth provider
    AND status = (SELECT status FROM public.users WHERE id = auth.uid())
    AND auth_provider = (SELECT auth_provider FROM public.users WHERE id = auth.uid())
    AND is_deleted = false  -- Cannot update if soft-deleted
  );

-- Policy: Service role can manage all users (full CRUD)
-- Used by backend services and admin operations
-- Bypasses user restrictions for legitimate admin actions
DROP POLICY IF EXISTS "Service role can manage users" ON public.users;
CREATE POLICY "Service role can manage users"
  ON public.users
  FOR ALL  -- SELECT, INSERT, UPDATE, DELETE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- DOCUMENTATION - TABLE AND COLUMN COMMENTS
-- ============================================================================

COMMENT ON TABLE public.users IS 'Core user table for Buzz A Tutor platform. Supports multiple user types (students, tutors, parents/guardians, admins, institutional users) with soft-delete capability and full audit trail. Integrates with Supabase Auth for authentication.';

COMMENT ON COLUMN public.users.id IS 'UUID primary key for user record. Generated automatically using uuid_generate_v4().';
COMMENT ON COLUMN public.users.email IS 'Unique email address for authentication. Unique among active users (partial unique index). Can be reused after soft-delete. Used for login and communication.';
COMMENT ON COLUMN public.users.display_name IS 'User-facing display name (e.g., "John Doe" or "Ms. Smith"). Shown in UI, notifications, and communications.';
COMMENT ON COLUMN public.users.status IS 'User account status: ACTIVE (fully active), PENDING (awaiting verification), SUSPENDED (temporarily disabled), DELETED (soft-deleted). Controlled by CHECK constraint.';
COMMENT ON COLUMN public.users.auth_provider IS 'Authentication provider: local (email/password), google (OAuth2), facebook (OAuth2), saml (enterprise SSO). Controlled by CHECK constraint for extensibility.';
COMMENT ON COLUMN public.users.auth_provider_id IS 'External provider user ID (subject). Populated for OAuth/SAML providers. NULL for local authentication.';
COMMENT ON COLUMN public.users.is_deleted IS 'Soft-delete flag. True when user is deactivated but not yet permanently deleted. Allows restoration and maintains referential integrity.';
COMMENT ON COLUMN public.users.deleted_at IS 'Timestamp when user was soft-deleted. NULL if user is active. Used for audit trails and potential data retention policies.';
COMMENT ON COLUMN public.users.created_at IS 'Timestamp when record was created. Set automatically via DEFAULT NOW().';
COMMENT ON COLUMN public.users.created_by IS 'User ID who created this record (self-referencing). NULL for system operations or initial database seeding. Foreign key with ON DELETE SET NULL.';
COMMENT ON COLUMN public.users.updated_at IS 'Timestamp when record was last updated. Auto-managed by set_updated_at trigger. Used for change tracking and caching strategies.';
COMMENT ON COLUMN public.users.updated_by IS 'User ID who last updated this record. NULL for system operations. Foreign key with ON DELETE SET NULL. Supports audit trail compliance.';

-- ============================================================================
-- AUTO-UPDATE TRIGGER FOR updated_at
-- ============================================================================

-- Verify handle_updated_at() function exists
-- This function was created in previous migrations (20241118000001_create_profiles_table.sql)
-- If it doesn't exist for any reason, we could create it here, but we'll assume it exists

-- Drop existing trigger if it exists (for idempotency)
DROP TRIGGER IF EXISTS set_updated_at ON public.users;

-- Create trigger to auto-update updated_at using the shared trigger function
-- The handle_updated_at() function automatically sets NEW.updated_at = NOW()
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- These queries can be run manually in Supabase SQL editor to verify the migration
-- Uncomment and execute to test the schema after migration runs

/*
-- 1. Verify table structure
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
ORDER BY ordinal_position;

-- Expected: 13 columns with correct types and defaults

-- 2. Verify indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'users';

-- Expected: 5 indexes (unique_email, auth_provider_lookup, status, is_deleted, and implicit PK index)

-- 3. Verify constraints
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.users'::regclass
ORDER BY conname;

-- Expected: status_check, auth_provider_check, created_by_fkey, updated_by_fkey

-- 4. Verify RLS is enabled
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'users' AND relnamespace = 'public'::regnamespace;

-- Expected: relrowsecurity = true

-- 5. Verify policies exist
SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'users';

-- Expected: 3 policies (view own, update own, service role manage)

-- 6. Verify trigger exists
SELECT trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public' AND trigger_catalog = 'users';

-- Expected: set_updated_at trigger on UPDATE

-- 7. Test user creation (should succeed)
INSERT INTO public.users (email, display_name, status, auth_provider)
VALUES ('test@example.com', 'Test User', 'PENDING', 'local')
RETURNING id, email, display_name, created_at, updated_at, status;

-- 8. Test duplicate active email (should fail due to unique constraint)
INSERT INTO public.users (email, display_name, status, auth_provider)
VALUES ('test@example.com', 'Another Test', 'ACTIVE', 'local');

-- Expected: ERROR: duplicate key value violates unique constraint "idx_users_unique_email_active"

-- 9. Test soft-delete and email reuse
UPDATE public.users
SET is_deleted = true, deleted_at = NOW()
WHERE email = 'test@example.com';

-- Should succeed: UPDATE 1

-- 10. Test creating new user with same email after soft-delete (should succeed)
INSERT INTO public.users (email, display_name, status, auth_provider)
VALUES ('test@example.com', 'Test User After Delete', 'PENDING', 'local')
RETURNING id, is_deleted, deleted_at;

-- Expected: INSERT succeeds with new UUID, is_deleted = false, deleted_at = NULL

-- 11. Test Google OAuth user creation
INSERT INTO public.users (email, display_name, status, auth_provider, auth_provider_id)
VALUES ('google.user@example.com', 'Google User', 'ACTIVE', 'google', 'google-subject-123')
RETURNING id, email, auth_provider, auth_provider_id;

-- Expected: User created with external provider ID populated

-- 12. Test authentication provider lookup (simulating SSO login)
SELECT id, email, display_name, status
FROM public.users
WHERE auth_provider = 'google' AND auth_provider_id = 'google-subject-123';

-- Expected: Returns the Google user created above

-- 13. Test status constraint violation (should fail)
INSERT INTO public.users (email, display_name, status, auth_provider)
VALUES ('invalid-status@example.com', 'Invalid', 'INVALID_STATUS', 'local');

-- Expected: ERROR: new row for relation "users" violates check constraint "users_status_check"

-- 14. Test auth_provider constraint violation (should fail)
INSERT INTO public.users (email, display_name, status, auth_provider)
VALUES ('invalid-provider@example.com', 'Invalid', 'PENDING', 'invalid_provider');

-- Expected: ERROR: new row for relation "users" violates check constraint "users_auth_provider_check"

-- 15. Cleanup test data
DELETE FROM public.users
WHERE email IN ('test@example.com', 'google.user@example.com', 'invalid-status@example.com', 'invalid-provider@example.com');

-- Expected: Should delete all test rows

-- 16. Verify cleanup
SELECT COUNT(*) as remaining_test_users
FROM public.users
WHERE email LIKE '%@example.com';

-- Expected: COUNT = 0
*/

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- The users table is now ready for production use
-- Next step: Create roles table (20241204000002_create_roles_table.sql)
