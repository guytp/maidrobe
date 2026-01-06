# User Management Schema - Entity Relationship Diagram

## Schema Overview

This diagram represents the complete user management schema for Buzz A Tutor platform, including core user data, RBAC roles, join tables, and user preferences.

```mermaid
erDiagram
    users ||--o{ user_roles : assigns
    roles ||--o{ user_roles : assigned_to
    users ||--|| user_settings : has
    users }o--o| users : audits
    
    users {
        uuid id PK "UUID primary key, auto-generated"
        text email "Unique email for auth (partial unique)"
        text display_name "User-facing display name"
        text status "ACTIVE, PENDING, SUSPENDED, DELETED"
        text auth_provider "local, google, facebook, saml"
        text auth_provider_id "External provider ID (nullable)"
        bool is_deleted "Soft-delete flag (default false)"
        timestamp deleted_at "When soft-deleted (nullable)"
        timestamp created_at "Auto-set"
        uuid created_by FK "Audit: who created"
        timestamp updated_at "Auto-updated (trigger)"
        uuid updated_by FK "Audit: who updated"
    }
    
    roles {
        uuid id PK "UUID primary key, auto-generated"
        text code UK "Unique role code (e.g., STUDENT)"
        text name "Human-readable name"
        text description "Optional description"
        timestamp created_at "Auto-set"
        uuid created_by FK "Audit: who created"
        timestamp updated_at "Auto-updated (trigger)"
        uuid updated_by FK "Audit: who updated"
    }
    
    user_roles {
        uuid id PK "UUID primary key, auto-generated"
        uuid user_id FK "→ users.id, CASCADE on delete"
        uuid role_id FK "→ roles.id, RESTRICT on delete"
        timestamp assigned_at "When assigned (audit)"
        timestamp created_at "Auto-set"
        timestamp updated_at "Auto-updated (trigger)"
    }
    
    user_settings {
        uuid id PK "UUID primary key, auto-generated"
        uuid user_id FK UK "→ users.id, UNIQUE, CASCADE"
        text timezone "Default: UTC"
        text language_code "Default: en-GB"
        bool receive_email_reminders "Default: true"
        bool receive_push_notifications "Default: true"
        bool high_contrast_mode "Default: false"
        bool kid_friendly_ui "Default: false"
        jsonb extra_settings "Flexible JSON storage, default: {}"
        timestamp created_at "Auto-set"
        uuid created_by FK "Audit: who created"
        timestamp updated_at "Auto-updated (trigger)"
        uuid updated_by FK "Audit: who updated"
    }
```

## Relationships

### Primary Relationships

1. **users → user_roles**: One-to-many (CASCADE on delete)
   - When a user is deleted, their role assignments are automatically cleaned up
   - Supports GDPR "right to erasure"

2. **roles → user_roles**: One-to-many (RESTRICT on delete)
   - Prevents deleting a role that has active assignments
   - Maintains referential integrity

3. **users → user_settings**: One-to-one (CASCADE on delete)
   - Each user has exactly one settings record
   - Settings are deleted when user is deleted

4. **users → users**: Self-referencing (audit trail)
   - created_by and updated_by reference users.id
   - ON DELETE SET NULL (preserves audit trail if creator is deleted)

## Indexes

### Performance-Critical Indexes

| Table | Index Name | Columns | Type | Purpose |
|-------|-----------|---------|------|---------|
| users | idx_users_unique_email_active | email | UNIQUE PARTIAL | Authentication lookups (active users only) |
| users | idx_users_auth_provider_lookup | auth_provider, auth_provider_id | COMPOSITE | SSO authentication flows |
| users | idx_users_status | status | BTREE | Filtering users by status |
| users | idx_users_is_deleted | is_deleted | BTREE | Soft-delete queries |
| roles | idx_roles_code_unique | code | UNIQUE | Role lookups by code |
| user_roles | idx_user_roles_user_id | user_id | BTREE | Find all roles for a user |
| user_roles | idx_user_roles_role_id | role_id | BTREE | Find all users with a role |
| user_settings | (implicit) | user_id | UNIQUE | 1:1 relationship enforcement |

**Target Performance**: p95 < 50ms for all indexed queries

## Constraints & ON DELETE Behavior

### Constraint Summary

| Table | Constraint | Type | Definition |
|-------|------------|------|------------|
| users | users_status_check | CHECK | status IN ('ACTIVE','PENDING','SUSPENDED','DELETED') |
| users | users_auth_provider_check | CHECK | auth_provider IN ('local','google','facebook','saml') |
| users | users_created_by_fkey | FK | created_by → users.id, ON DELETE SET NULL |
| users | users_updated_by_fkey | FK | updated_by → users.id, ON DELETE SET NULL |
| roles | roles_code_unique | UNIQUE | code must be globally unique |
| roles | roles_created_by_fkey | FK | created_by → users.id, ON DELETE SET NULL |
| roles | roles_updated_by_fkey | FK | updated_by → users.id, ON DELETE SET NULL |
| user_roles | user_roles_user_id_role_id_unique | UNIQUE | (user_id, role_id) prevents duplicates |
| user_roles | user_roles_user_id_fkey | FK | user_id → users.id, ON DELETE CASCADE |
| user_roles | user_roles_role_id_fkey | FK | role_id → roles.id, ON DELETE RESTRICT |
| user_settings | user_settings_user_id_unique | UNIQUE | user_id UNIQUE (1:1) |
| user_settings | user_settings_user_id_fkey | FK | user_id → users.id, ON DELETE CASCADE |
| user_settings | user_settings_created_by_fkey | FK | created_by → users.id, ON DELETE SET NULL |
| user_settings | user_settings_updated_by_fkey | FK | updated_by → users.id, ON DELETE SET NULL |

### ON DELETE Behavior Summary

| Relationship | ON DELETE | Rationale |
|-------------|-----------|-----------|
| users.created_by → users.id | SET NULL | Audit trail preservation |
| users.updated_by → users.id | SET NULL | Audit trail preservation |
| roles.created_by → users.id | SET NULL | Audit trail preservation |
| roles.updated_by → users.id | SET NULL | Audit trail preservation |
| user_roles.user_id → users.id | CASCADE | Cleanup on user deletion (GDPR) |
| user_roles.role_id → roles.id | RESTRICT | Prevent deleting assigned roles |
| user_settings.user_id → users.id | CASCADE | 1:1 relationship cleanup |
| user_settings.created_by → users.id | SET NULL | Audit trail preservation |
| user_settings.updated_by → users.id | SET NULL | Audit trail preservation |

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

The migration is idempotent (safe to re-run) due to `IF NOT EXISTS` clauses. For rollback in development:

**Manual Rollback Commands** (for testing only):
```sql
-- Remove in reverse order (drop dependent objects first)
DROP TABLE IF EXISTS public.user_settings CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.roles CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP INDEX IF EXISTS idx_users_unique_email_active;
DROP INDEX IF EXISTS idx_users_auth_provider_lookup;
DROP INDEX IF EXISTS idx_user_roles_user_id;
DROP INDEX IF EXISTS idx_user_roles_role_id;
DROP INDEX IF EXISTS idx_roles_code_unique;
```

**Note**: In production, never rollback migrations. Always create new forward migrations to make changes.

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

## Performance Characteristics

**Target**: p95 < 50ms for all indexed queries

| Operation | Expected Latency | Index Used |
|----------|------------------|------------|
| User by email | <10ms | idx_users_unique_email_active |
| User by auth_provider | <10ms | idx_users_auth_provider_lookup |
| User roles lookup | <20ms | idx_user_roles_user_id + idx_roles_code_unique |
| Role users lookup | <20ms | idx_user_roles_role_id |
| Settings retrieval | <10ms | Unique constraint on user_id |

## Verification

Run verification queries after applying migration:

```bash
cd edge-functions
supabase db reset
supabase db lint
```

Then execute all verification queries from the migration file.
