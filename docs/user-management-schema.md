# User Management Database Schema Documentation

**Story**: #6 - Design and Implement Core User Management Database Schema  
**Migration**: `20241204000001_create_users_and_roles_tables.sql`  
**Date**: 2024-12-04

## Overview

This schema provides a complete user management system for the Buzz A Tutor platform, supporting multiple user types, role-based access control (RBAC), and per-user preferences with full audit trail and GDPR compliance.

## Tables

### 1. users (Core User Management)

**Purpose**: Central identity and authentication table

**Columns**:
- `id` (UUID, PK) - Auto-generated primary key
- `email` (TEXT, NOT NULL) - Unique email for authentication (partial unique)
- `display_name` (TEXT, NOT NULL) - User-facing name
- `status` (TEXT, NOT NULL) - ACTIVE, PENDING, SUSPENDED, DELETED
- `auth_provider` (TEXT, NOT NULL) - local, google, facebook, saml
- `auth_provider_id` (TEXT) - External provider ID (nullable)
- `is_deleted` (BOOLEAN, NOT NULL, DEFAULT false) - Soft-delete flag
- `deleted_at` (TIMESTAMPTZ) - When user was soft-deleted
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())
- `created_by` (UUID, FK) - Audit: who created
- `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())
- `updated_by` (UUID, FK) - Audit: who updated

**Constraints**:
- `users_status_check` (CHECK): status IN ('ACTIVE','PENDING','SUSPENDED','DELETED')
- `users_auth_provider_check` (CHECK): auth_provider IN ('local','google','facebook','saml')
- `users_created_by_fkey` (FK): created_by → users.id, ON DELETE SET NULL
- `users_updated_by_fkey` (FK): updated_by → users.id, ON DELETE SET NULL

**Indexes**:
- `idx_users_unique_email_active` - UNIQUE partial index on email WHERE is_deleted = false
- `idx_users_auth_provider_lookup` - Composite on (auth_provider, auth_provider_id)
- `idx_users_status` - On status
- `idx_users_is_deleted` - On is_deleted

**Row Level Security**:
- Users can view own record
- Users can update limited fields on own record
- Service role can manage all users

**ON DELETE Behavior**:
- Soft-delete: Set `is_deleted = true`, `deleted_at = NOW()`
- Hard-delete: CASCADE to user_roles and user_settings (via FK CASCADE)

### 2. roles (RBAC Role Definitions)

**Purpose**: Define platform-wide roles for access control

**Columns**:
- `id` (UUID, PK) - Auto-generated primary key
- `code` (TEXT, NOT NULL, UNIQUE) - Role identifier (e.g., STUDENT, TUTOR)
- `name` (TEXT, NOT NULL) - Human-readable name
- `description` (TEXT) - Optional detailed description
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())
- `created_by` (UUID, FK) - Audit: who created
- `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())
- `updated_by` (UUID, FK) - Audit: who updated

**Constraints**:
- `roles_code_unique` (UNIQUE): code must be globally unique
- `roles_created_by_fkey` (FK): created_by → users.id, ON DELETE SET NULL
- `roles_updated_by_fkey` (FK): updated_by → users.id, ON DELETE SET NULL

**Indexes**:
- `idx_roles_code_unique` - Unique index on code

**Row Level Security**:
- All authenticated users can view all roles
- Service role can manage roles (admin-only)

**ON DELETE Behavior**:
- RESTRICT on delete if role is assigned to users (via user_roles FK)

### 3. user_roles (Many-to-Many Join Table)

**Purpose**: Link users to their assigned roles

**Columns**:
- `id` (UUID, PK) - Auto-generated primary key
- `user_id` (UUID, NOT NULL, FK to users.id) - CASCADE
- `role_id` (UUID, NOT NULL, FK to roles.id) - RESTRICT
- `assigned_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW()) - Audit metadata
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())
- `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())

**Constraints**:
- `user_roles_user_id_role_id_unique` (UNIQUE): (user_id, role_id) prevents duplicates
- `user_roles_user_id_fkey` (FK): user_id → users.id, ON DELETE CASCADE
- `user_roles_role_id_fkey` (FK): role_id → roles.id, ON DELETE RESTRICT

**Indexes**:
- `idx_user_roles_user_id` - Fast lookups by user
- `idx_user_roles_role_id` - Fast lookups by role

**Row Level Security**:
- Users can view own role assignments
- Service role can manage role assignments

**ON DELETE Behavior**:
- CASCADE on user deletion (cleans up assignments)
- RESTRICT on role deletion (cannot delete role with active assignments)

### 4. user_settings (Per-User Preferences)

**Purpose**: Store user preferences and configuration (1:1 relationship)

**Columns**:
- `id` (UUID, PK) - Auto-generated primary key
- `user_id` (UUID, NOT NULL, UNIQUE, FK to users.id) - 1:1, CASCADE
- `timezone` (TEXT, NOT NULL, DEFAULT 'UTC') - User timezone
- `language_code` (TEXT, NOT NULL, DEFAULT 'en-GB') - UI locale
- `receive_email_reminders` (BOOLEAN, NOT NULL, DEFAULT true) - Email notifications
- `receive_push_notifications` (BOOLEAN, NOT NULL, DEFAULT true) - Push notifications
- `high_contrast_mode` (BOOLEAN, NOT NULL, DEFAULT false) - Accessibility mode
- `kid_friendly_ui` (BOOLEAN, NOT NULL, DEFAULT false) - Student-friendly UI
- `extra_settings` (JSONB, NOT NULL, DEFAULT '{}') - Flexible storage
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())
- `created_by` (UUID, FK) - Audit: who created
- `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())
- `updated_by` (UUID, FK) - Audit: who updated

**Constraints**:
- `user_settings_user_id_unique` (UNIQUE): user_id UNIQUE (1:1)
- `user_settings_user_id_fkey` (FK): user_id → users.id, ON DELETE CASCADE
- `user_settings_created_by_fkey` (FK): created_by → users.id, ON DELETE SET NULL
- `user_settings_updated_by_fkey` (FK): updated_by → users.id, ON DELETE SET NULL

**Indexes**:
- Unique index on user_id (implicit from UNIQUE constraint)

**Row Level Security**:
- Users can view own settings
- Users can update own settings
- Service role can manage any settings

**ON DELETE Behavior**:
- CASCADE on user deletion (settings deleted automatically)

## Query Patterns

### Authentication Flows

```sql
-- Email/password authentication
SELECT id, email, display_name, status
FROM users
WHERE email = $1 AND is_deleted = false;

-- SSO authentication (Google, Facebook, SAML)
SELECT id, email, display_name, status
FROM users
WHERE auth_provider = $1 AND auth_provider_id = $2;
```

### RBAC Queries

```sql
-- Get all roles for a user
SELECT r.code, r.name, ur.assigned_at
FROM user_roles ur
JOIN roles r ON ur.role_id = r.id
WHERE ur.user_id = $1;

-- Get all users with a specific role
SELECT u.id, u.email, u.display_name
FROM user_roles ur
JOIN users u ON ur.user_id = u.id
WHERE ur.role_id = $1 AND u.is_deleted = false;
```

### Settings Queries

```sql
-- Get user preferences
SELECT timezone, language_code, receive_email_reminders,
       high_contrast_mode, kid_friendly_ui, extra_settings
FROM user_settings
WHERE user_id = $1;

-- Update user settings
UPDATE user_settings
SET timezone = $2, language_code = $3, extra_settings = $4
WHERE user_id = $1;
```

## Security Model

### Row Level Security (RLS)

All tables have RLS enabled with granular policies:

| Table | Policy Name | Command | Role | Condition |
|-------|-------------|---------|------|-----------|
| users | Users can view own record | SELECT | authenticated | user.id = auth.uid() |
| users | Users can update own profile | UPDATE | authenticated | user.id = auth.uid() |
| users | Service role can manage users | ALL | service_role | true |
| roles | Users can view all roles | SELECT | authenticated | true |
| roles | Service role can manage roles | ALL | service_role | true |
| user_roles | Users can view own role assignments | SELECT | authenticated | user_id = auth.uid() |
| user_roles | Service role can manage role assignments | ALL | service_role | true |
| user_settings | Users can view own settings | SELECT | authenticated | user_id = auth.uid() |
| user_settings | Users can update own settings | UPDATE | authenticated | user_id = auth.uid() |
| user_settings | Service role can manage settings | ALL | service_role | true |

**Principle**: Users can only access their own data; service_role (backend/admin) has full access.

## Reversibility

The migration is idempotent (safe to re-run) due to `IF NOT EXISTS` clauses. The exact file is:

**File**: `edge-functions/supabase/migrations/20241204000001_create_users_and_roles_tables.sql`

For manual rollback in development/testing:

```sql
-- Remove in reverse order (drop dependent objects first)
DROP TABLE IF EXISTS public.user_settings CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.roles CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP INDEX IF EXISTS idx_users_unique_email_active;
DROP INDEX IF EXISTS idx_users_auth_provider_lookup;
DROP INDEX IF EXISTS idx_users_status;
DROP INDEX IF EXISTS idx_users_is_deleted;
DROP INDEX IF EXISTS idx_roles_code_unique;
DROP INDEX IF EXISTS idx_user_roles_user_id;
DROP INDEX IF EXISTS idx_user_roles_role_id;
```

**Production Note**: Never rollback migrations. Always create new forward migrations.

## Performance Characteristics

**Target**: p95 < 50ms for all indexed queries

| Query Pattern | Index Used | Expected Performance |
|--------------|------------|---------------------|
| User by email | idx_users_unique_email_active | < 10ms |
| User by auth_provider | idx_users_auth_provider_lookup | < 10ms |
| User roles lookup | idx_user_roles_user_id + idx_roles_code_unique | < 20ms |
| Role users lookup | idx_user_roles_role_id | < 20ms |
| User settings retrieval | Implicit unique on user_id | < 10ms |

## Extensibility

### Future Enhancements

**user_roles**:
- Add `assigned_by` to track who assigned the role
- Add `expires_at` for temporary role assignments
- Add `tenant_id` for multi-tenancy support

**user_settings**:
- Add more preference columns as needed
- Store complex settings in `extra_settings` JSONB
- Add tenant-specific settings

**All tables**:
- UUID primary keys enable horizontal sharding
- Audit fields support compliance reporting
- Soft-delete enables GDPR-compliant operations

## Migration File

**Location**: `edge-functions/supabase/migrations/20241204000001_create_users_and_roles_tables.sql`

**Size**: 32,693 bytes (712 lines)

**Contents**:
- UUID extension setup
- users table (13 columns, 4 indexes, 3 policies)
- roles table (8 columns, 1 index, 2 policies)
- user_roles table (6 columns, 2 indexes, 2 policies)
- user_settings table (14 columns, 1 index, 3 policies)
- Auto-update triggers (all 4 tables)
- 40 verification queries
- Comprehensive documentation

## Verification

### Run Migration

```bash
cd edge-functions
supabase db reset  # Applies all migrations
supabase db lint   # Checks for issues
```

### Test the Schema

All 40 verification queries are included in the migration file. Key tests:

1. **Create test data**: Insert users, roles, assignments, settings
2. **Query data**: Verify relationships work
3. **Test CASCADE**: Delete user, verify assignments/settings deleted
4. **Test RESTRICT**: Try to delete role with assignments (should fail)
5. **Verify RLS**: Test access control policies
6. **Check indexes**: EXPLAIN queries to verify index usage
7. **Cleanup**: Remove test data

### Sample Verification Queries

```sql
-- Create test user
INSERT INTO users (email, display_name, status, auth_provider)
VALUES ('verify@example.com', 'Verify User', 'ACTIVE', 'local')
RETURNING id;

-- Create test role
INSERT INTO roles (code, name)
VALUES ('VERIFICATION_ROLE', 'Verification Role')
RETURNING id;

-- Assign role
INSERT INTO user_roles (user_id, role_id)
VALUES (
  (SELECT id FROM users WHERE email = 'verify@example.com'),
  (SELECT id FROM roles WHERE code = 'VERIFICATION_ROLE')
);

-- Query user with roles
SELECT u.email, r.code, ur.assigned_at
FROM users u
JOIN user_roles ur ON u.id = ur.user_id
JOIN roles r ON ur.role_id = r.id
WHERE u.email = 'verify@example.com';
```

## Usage in Application

### Authentication Service

```typescript
// Find user by email
const { data: user } = await supabase
  .from('users')
  .select('*')
  .eq('email', email)
  .eq('is_deleted', false)
  .single();

// Find user by auth provider (SSO)
const { data: user } = await supabase
  .from('users')
  .select('*')
  .eq('auth_provider', provider)
  .eq('auth_provider_id', providerId)
  .single();
```

### Authorization Service

```typescript
// Get user's roles
const { data: roles } = await supabase
  .from('user_roles')
  .select('roles(code, name)')
  .eq('user_id', userId);
```

### Settings Service

```typescript
// Get user settings
const { data: settings } = await supabase
  .from('user_settings')
  .select('*')
  .eq('user_id', userId)
  .single();
```

## Constraints & ON DELETE Summary

| Table | Constraint | Type | ON DELETE | Purpose |
|-------|------------|------|-----------|---------|
| users | users_status_check | CHECK | N/A | Enforce valid status |
| users | users_auth_provider_check | CHECK | N/A | Enforce valid auth provider |
| users | users_created_by_fkey | FK | SET NULL | Audit trail preservation |
| users | users_updated_by_fkey | FK | SET NULL | Audit trail preservation |
| roles | roles_code_unique | UNIQUE | N/A | Unique role codes |
| roles | roles_created_by_fkey | FK | SET NULL | Audit trail preservation |
| roles | roles_updated_by_fkey | FK | SET NULL | Audit trail preservation |
| user_roles | user_roles_user_id_role_id_unique | UNIQUE | N/A | Prevent duplicates |
| user_roles | user_roles_user_id_fkey | FK | CASCADE | Cleanup on user delete |
| user_roles | user_roles_role_id_fkey | FK | RESTRICT | Maintain role integrity |
| user_settings | user_settings_user_id_unique | UNIQUE | N/A | Enforce 1:1 |
| user_settings | user_settings_user_id_fkey | FK | CASCADE | Cleanup on user delete |
| user_settings | user_settings_created_by_fkey | FK | SET NULL | Audit trail preservation |
| user_settings | user_settings_updated_by_fkey | FK | SET NULL | Audit trail preservation |

