# ADR 0003: User Management Database Schema Design

## Status
Proposed

## Context

We need to design and implement a foundational relational database schema for core user management to support identity and role-based access control (RBAC) for the Buzz A Tutor platform. The schema must accommodate multiple user types (students, tutors, parents/guardians, admins, institutional users) and be production-quality with appropriate constraints, indexing, and auditing fields.

This ADR establishes the design decisions for implementing the `users`, `roles`, `user_roles`, and `user_settings` tables, ensuring consistency with existing codebase patterns and future extensibility.

### Existing Patterns in Codebase

The Maidrobe project uses Supabase with PostgreSQL and established conventions:

- **Migrations**: Timestamped SQL files (`YYYYMMDDHHMMSS_description.sql`) in `/edge-functions/supabase/migrations/`
- **Primary Keys**: UUID using `uuid-ossp` extension (`uuid_generate_v4()`)
- **Timestamps**: `TIMESTAMPTZ NOT NULL DEFAULT NOW()` for `created_at` and `updated_at`
- **Auto-updates**: Shared `handle_updated_at()` trigger function for `updated_at` fields
- **Row Level Security**: Enabled on all tables with policies for `authenticated` and `service_role`
- **Constraints**: TEXT fields with CHECK constraints (not native PostgreSQL enums)
- **Soft Delete**: `is_deleted` boolean pattern exists in `items` table
- **Foreign Keys**: `ON DELETE CASCADE` used for user-related relationships (profiles → auth.users)
- **Documentation**: `COMMENT ON` statements for all tables and columns
- **Indexing**: `idx_table_name_column_name` naming convention

### Requirements from User Story #6

**Core Tables:**
1. `users` - Central user table with soft-delete and audit fields
2. `roles` - RBAC role definitions  
3. `user_roles` - Many-to-many join table
4. `user_settings` - User preferences and configuration

**Key Requirements:**
- UUID primary keys for all entities
- Soft-delete capability on `users` table
- Full audit trail (created_at, updated_at, created_by, updated_by)
- Unique constraints on emails, role codes, user-role pairs, and user settings
- Performance-critical indexes for authentication flows
- GDPR compliance support
- Future extensibility for permissions models, multi-tenancy, and profile extensions

## Decision

### 1. Enum vs Text for Enumerated Values

**Decision**: Use `TEXT` with `CHECK` constraints for both `user_status` and `auth_provider` fields.

**Rationale**:
- **Consistency**: Existing `profiles.role` column uses this pattern: `TEXT NOT NULL CHECK (role IN ('internal', 'beta', 'standard'))`
- **Portability**: TEXT is database-agnostic and works across PostgreSQL, MySQL, and SQLite; native PostgreSQL enums require database-specific ALTER TYPE commands
- **Flexibility**: Adding new values only requires dropping and re-adding the constraint in a migration, rather than database-specific enum modifications
- **Simplicity**: Avoids database-specific syntax and maintains migration portability

**Implementation Pattern**:
```sql
status TEXT NOT NULL DEFAULT 'PENDING'
  CHECK (status IN ('ACTIVE', 'PENDING', 'SUSPENDED', 'DELETED'))

auth_provider TEXT NOT NULL DEFAULT 'local' 
  CHECK (auth_provider IN ('local', 'google', 'facebook', 'saml'))
```

**Future Extensibility**: New user statuses or authentication providers can be added by modifying the CHECK constraint in a new migration without breaking backward compatibility.

### 2. Soft-Delete vs Hard-Delete Behavior

**Decision**: Implement soft-delete at the application level with hard-delete cascade at the database level.

**Rationale**:
- **Story Requirement**: Explicitly requires `is_deleted` and `deleted_at` fields on the `users` table for "soft-delete and potential anonymisation"
- **Compliance**: Supports GDPR "right to erasure" - soft-delete for immediate deactivation, hard-delete for permanent removal when legally mandated
- **Existing Pattern**: The `items` table uses `is_deleted` boolean pattern (documented in `items.md`), confirming this is an established pattern in the codebase
- **Audit Trail**: Soft-delete preserves historical data for reporting and analytics while marking records as inactive for application queries
- **Performance**: Application queries filter by `is_deleted = false` to maintain performance while keeping historical data available for analytics

**Behavior Matrix**:

| Operation | Application Layer | Database Layer | ON DELETE Action |
|-----------|-------------------|----------------|------------------|
| **User Deactivation** | Set `is_deleted = true`, `deleted_at = NOW()` | Maintain FK relationships | No cascade (FKs remain intact for potential restoration) |
| **User Restoration** | Set `is_deleted = false`, `deleted_at = NULL` | Restore normal operation | No changes needed |
| **Permanent Deletion** | Execute `DELETE FROM users WHERE id = ?` | CASCADE deletes all related records | CASCADE on all user FKs (roles, settings) |

**GDPR Compliance**: The CASCADE behavior supports complete data removal when legally required, while soft-delete provides the intermediate "anonymization-ready" state mentioned in the story's non-functional requirements.

### 3. ON DELETE Foreign Key Actions

**Decision Matrix**:

| Foreign Key | Referenced Table | ON DELETE Action | Justification |
|-------------|------------------|------------------|---------------|
| `user_roles.user_id` | `users.id` | **CASCADE** | When a user is permanently deleted, their role assignments must be cleaned up automatically. This aligns with the existing `profiles` → `auth.users` relationship pattern used in the codebase. |
| `user_roles.role_id` | `roles.id` | **RESTRICT** | Prevents deleting a role that has active user assignments. Requires explicit removal of all user assignments first, protecting data integrity. |
| `user_settings.user_id` | `users.id` | **CASCADE** | User settings are intrinsically tied to the user. Permanently deleting a user should automatically clean up their settings. |

**Data Consistency**: These choices ensure referential integrity while supporting both soft-delete (FKs maintained) and hard-delete (automatic cleanup) operations.

### 4. UUID Generation Strategy

**Decision**: Use `uuid_generate_v4()` with `uuid-ossp` extension.

**Rationale**:
- **Existing Pattern**: All existing migrations explicitly call `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`
- **Code Consistency**: Using the same pattern as existing tables maintains codebase uniformity
- **Explicit Control**: Generating UUIDs at the database layer provides predictable behavior
- **Portability**: While PostgreSQL 13+ includes `gen_random_uuid()`, using the extension maintains compatibility with existing migration patterns

**Implementation**: 
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
id UUID PRIMARY KEY DEFAULT uuid_generate_v4()
```

### 5. Audit Field Implementation

**Decision**: Full audit trail with `created_by` and `updated_by` UUID foreign keys to `users.id`.

**Implementation Pattern**:

| Field | Type | Nullability | Default | Notes |
|-------|------|-------------|---------|-------|
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `NOW()` | Set once at creation |
| `created_by` | `UUID` | Nullable | NULL | References `users.id`, nullable for system operations |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | `NOW()` | Managed by `handle_updated_at()` trigger |
| `updated_by` | `UUID` | Nullable | NULL | References `users.id`, nullable for system operations |

**Rationale**:
- **Story Requirement**: Explicitly requires `created_by` and `updated_by` columns
- **Existing Pattern**: All tables have `created_at` and `updated_at`; we extend this pattern with the `_by` fields
- **System Operations**: Both `_by` fields are nullable to support system-initiated operations (e.g., user registration trigger, migration backfills)
- **Future Audit**: These fields enable future "last modified by" audit trails and compliance reporting requirements
- **FK Behavior**: `ON DELETE SET NULL` for both `_by` fields - if a user who created/updated a record is deleted, the audit trail maintains the timestamp but loses the user reference

**Trigger Strategy**: Reuse the existing `handle_updated_at()` trigger function rather than creating new ones, maintaining consistency with the `profiles` table pattern.

### 6. Row Level Security (RLS) Policies

**Decision**: Enable RLS on all tables with granular access policies.

**Policy Design by Table**:

**`users` Table**:
- `authenticated` role: SELECT own record only (`auth.uid() = id`)
- `service_role` role: SELECT/UPDATE/INSERT/DELETE all records (admin operations)
- Rationale: Authentication flows need to query user status during login; application logic enforces business rules

**`roles` Table**:
- `authenticated` role: SELECT all records (UI needs to display role names/options)
- `service_role` role: CREATE/UPDATE/DELETE (admin role management)
- Rationale: Users need to see their available roles and role descriptions; role assignments are managed through `user_roles`

**`user_roles` Table** (Join Table):
- `authenticated` role: SELECT own assignments (`auth.uid() = user_id`)
- `service_role` role: Full CRUD (admin assigns/revokes roles)
- Rationale: Prevents users from self-assigning roles; maintains RBAC integrity

**`user_settings` Table**:
- `authenticated` role: SELECT/UPDATE/INSERT own settings (`auth.uid() = user_id`)
- `service_role` role: Full CRUD (admin override capability)
- Rationale: Users manage their own preferences; admins can assist or override when needed

**RLS Enablement Pattern**:
```sql
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;
```

**Security Rationale**: This design balances security (users can't access others' data) with UI requirements (role display, settings management) while maintaining the principle of least privilege.

### 7. Indexing Strategy

**Decision**: Implement all required indexes plus additional optimizations for common query patterns.

**Required Indexes** (from story requirements):

1. **`users.email`** - Supports authentication lookups by email
2. **`users(auth_provider, auth_provider_id)`** - Composite index for SSO provider lookups (Google, Facebook, SAML)
3. **`user_roles.user_id`** - Fast retrieval of all roles for a specific user
4. **`user_roles.role_id`** - Fast retrieval of all users with a specific role
5. **`user_settings.user_id`** - Fast retrieval of user preferences

**Recommended Additional Indexes** (for performance optimization):

6. **`users(is_deleted, email)`** - Supports "active user by email" queries with soft-delete filter
7. **`users(status)`** - Filtering user management views by status (PENDING, SUSPENDED, etc.)
8. **`roles(code)`** - Covered by unique constraint, but explicit for query plan clarity

**Index Naming Convention**: Follow existing pattern `idx_table_name_column_name` (e.g., `idx_users_email`)

**Performance Target**: These indexes support the story's requirement of p95 < 50ms for user + roles lookup queries:

```sql
-- Example optimized query
SELECT u.*, array_agg(r.code) as roles
FROM users u
LEFT JOIN user_roles ur ON u.id = ur.user_id
LEFT JOIN roles r ON ur.role_id = r.id
WHERE u.email = $1 
  AND u.is_deleted = false
  AND u.status = 'ACTIVE'
GROUP BY u.id;
```

**Index Maintenance**: All indexes use `CREATE INDEX IF NOT EXISTS` for idempotency, following the existing migration pattern.

### 8. Unique Constraints

**Decision**: Implement all required unique constraints to ensure data integrity.

| Table | Unique Constraint | Purpose |
|-------|-------------------|---------|
| `users` | `email` (partial: `is_deleted = false`) | Prevents duplicate active accounts with same email |
| `roles` | `code` | Ensures role codes are globally unique identifiers |
| `user_roles` | Composite: `(user_id, role_id)` | Prevents duplicate role assignments to same user |
| `user_settings` | `user_id` | Enforces 1:1 relationship between users and settings |

**Partial Unique Index for Users.Email**:
```sql
-- Allows reusing email after user is soft-deleted
CREATE UNIQUE INDEX idx_users_unique_email_active 
ON users(email) 
WHERE is_deleted = false;
```

**Rationale**: This allows email reuse after a user is soft-deleted and anonymized while preventing duplicate active accounts.

### 9. Default Values and Data Integrity

**Decision**: Sensible defaults for all columns to ensure data integrity.

**Users Table Defaults**:
- `status`: `'PENDING'` (new users require activation/verification)
- `auth_provider`: `'local'` (default to local authentication)
- `is_deleted`: `false` (new users are active by default)
- `deleted_at`: `NULL` (not deleted)

**User Settings Defaults**:
- `timezone`: `'UTC'` (safe default, user can customize)
- `language_code`: `'en-GB'` (UK-based platform default)
- `receive_email_reminders`: `true` (opt-in by default)
- `receive_push_notifications`: `true` (opt-in by default)
- `high_contrast_mode`: `false` (accessibility opt-in)
- `kid_friendly_ui`: `false` (student-specific opt-in)
- `extra_settings`: `'{}'` (empty JSON object)

**Audit Field Defaults**:
- `created_at`: `NOW()` (automatic at creation)
- `created_by`: `NULL` (system operations may not have a user context)
- `updated_at`: `NOW()` (automatic at creation and updates)
- `updated_by`: `NULL` (system operations may not have a user context)

### 10. Migration Architecture

**Decision**: Single migration file containing all four tables for atomic deployment.

**File Name**: `20241204000001_create_user_management_schema.sql`

**Migration Structure**:
```sql
-- Header comments (purpose, dependencies, idempotency)
-- Enable uuid-ossp extension
-- Create users table
-- Create roles table  
-- Create user_roles table
-- Create user_settings table
-- Create all indexes
-- Enable RLS on all tables
-- Create RLS policies
-- Add COMMENT ON statements
-- Verification queries
```

**Rationale**:
- **Atomicity**: All tables created together ensures referential integrity
- **Dependency Management**: No complex inter-migration dependencies
- **Rollback**: Single migration is easier to rollback if needed
- **Testing**: All changes tested together in staging

**Idempotency**: Every statement uses `IF NOT EXISTS`, `DROP IF EXISTS`, or `DO $$` blocks to ensure safe re-run capability.

### 11. Future Extensibility Design

**Decision**: Schema design anticipates future extensions without requiring structural changes.

**Accommodating Future Requirements**:

- **Permissions Model**: The `roles` table design supports adding `permissions` and `role_permissions` tables later. The `user_roles` table doesn't need modification.

- **Multi-Tenancy**: UUID primary keys and clear foreign key relationships won't prevent future addition of `tenant_id` columns to `users` and related tables.

- **Profile Extensions**: The `users` table stores only core identity fields. Future tables (`student_profiles`, `tutor_profiles`, `parent_profiles`) can reference `users.id` without modifying the core schema.

- **Additional User Settings**: The `extra_settings` JSONB column in `user_settings` accommodates future preferences without schema changes.

- **Authentication Enhancements**: The `auth_provider` TEXT field with check constraint can accommodate new providers by constraint modification rather than structural changes.

- **Role Hierarchy**: Flat role design in database; any hierarchy logic can be implemented in application layer or via future `role_hierarchies` table without breaking existing consumers.

### 12. Privacy and GDPR Compliance

**Decision**: Schema design supports GDPR compliance requirements.

**Compliance Features**:

- **Soft Delete**: `is_deleted` and `deleted_at` support the "right to erasure" implementation strategy
- **Audit Trail**: `created_by`/`updated_by` fields support compliance reporting and data access auditing
- **Data Portability**: Structured schema with clear relationships supports data export requirements
- **Access Control**: RLS policies ensure users can only access their own data
- **Complete Deletion**: CASCADE FK behavior enables complete data removal when legally mandated
- **Minimization**: Core schema stores only necessary identity fields; sensitive PII can be anonymized in the `users` table while preserving referential integrity

**PII Strategy**: Password hashes, MFA secrets, and other sensitive credentials are intentionally excluded from this schema (handled by Supabase Auth), minimizing PII in application tables.

## Consequences

### Positive Consequences

1. **Consistency**: All design decisions align with existing codebase patterns, reducing cognitive load for developers
2. **Portability**: TEXT-based constraints and standard SQL features ensure database portability if needed
3. **Performance**: Comprehensive indexing strategy meets the < 50ms p95 latency requirement for authentication flows
4. **Security**: RLS policies and RESTRICT on role deletion maintain data integrity and prevent privilege escalation
5. **Future-Proof**: Schema design supports all mentioned future extensions (permissions, multi-tenancy, profile extensions) without structural changes
6. **Compliance**: Soft-delete and audit fields support GDPR and other regulatory requirements
7. **Maintainability**: Single migration file, shared trigger functions, and consistent naming conventions reduce maintenance overhead

### Negative Consequences

1. **Email Reuse Complexity**: Partial unique index on `users.email` requires developers to remember to filter `is_deleted = false` in queries
2. **CASCADE Risk**: Database-level CASCADE deletion could accidentally remove data if application logic incorrectly issues DELETE instead of soft-delete
3. **Trigger Dependency**: Reliance on existing `handle_updated_at()` trigger creates implicit dependency that must be documented
4. **NO ACTION Default**: PostgreSQL defaults to NO ACTION for FKs, so explicit ON DELETE must be specified in migration to avoid surprises
5. **Setting Defaults**: User settings defaults (timezone, language) are opinionated and may need adjustment based on actual user base geography

### Mitigation Strategies

- **Developer Documentation**: Add helper functions in application layer to handle soft-delete filters consistently
- **Code Reviews**: Enforce policy that user deletion must use soft-delete pattern, with hard-delete requiring explicit approval
- **Migration Comments**: Document trigger dependency in migration file header
- **Explicit FK Definitions**: Always specify ON DELETE behavior explicitly in CREATE TABLE statements
- **Environment Configuration**: Make timezone and language defaults configurable via environment variables

## Implementation Checklist

- [ ] Create migration file with all four tables
- [ ] Implement TEXT fields with CHECK constraints for enumerated values
- [ ] Add soft-delete columns with appropriate defaults
- [ ] Define ON DELETE actions (CASCADE for user FKs, RESTRICT for role FKs)
- [ ] Add full audit trail columns (created_by, updated_by)
- [ ] Create all required indexes for performance
- [ ] Enable Row Level Security on all tables
- [ ] Define RLS policies for authenticated and service_role roles
- [ ] Add COMMENT ON statements for documentation
- [ ] Create ERD diagram in `/docs/user-management-erd.md`
- [ ] Create detailed schema documentation in `/docs/user-management-schema.md`
- [ ] Add verification queries to migration file
- [ ] Test migration reversibility (`supabase db reset`)
- [ ] Verify performance targets with test data

## References

- User Story #6: Design and Implement Core User Management Database Schema
- Existing Migration: `20241118000001_create_profiles_table.sql` (for RLS and trigger patterns)
- Existing Migration: `20241202000001_add_role_column_to_profiles.sql` (for TEXT check constraints)
- Database Documentation: `/docs/items.md` (for soft-delete pattern reference)
- Supabase RLS Documentation: https://supabase.com/docs/guides/auth/row-level-security

---

**Decision Date**: 2024-12-04  
**Decided By**: AI Agent (following codebase pattern analysis)  
**Status**: Proposed - Ready for Implementation
