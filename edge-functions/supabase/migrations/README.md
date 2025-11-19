# Supabase Database Migrations

This directory contains SQL migration files for the Maidrobe database schema.

## Overview

Migrations are ordered SQL files that incrementally build and modify the database schema. They are designed to be:
- **Idempotent**: Safe to run multiple times without adverse effects
- **Backwards compatible**: Allow gradual rollout without breaking older clients
- **Versioned**: Timestamped filenames ensure correct execution order

## Migration Naming Convention

Migrations follow the naming pattern:

```
YYYYMMDDHHMMSS_description.sql
```

Example: `20241118000001_create_profiles_table.sql`

The timestamp prefix ensures migrations run in chronological order.

## Running Migrations

### Local Development

Apply migrations to your local Supabase instance:

```bash
cd edge-functions
supabase db reset           # Reset local DB and apply all migrations
supabase db push            # Apply new migrations only
```

### Production

Apply migrations to remote Supabase project:

```bash
cd edge-functions
supabase db push --linked   # Push to linked remote project
```

Or use the Supabase Dashboard:
1. Go to SQL Editor
2. Copy migration content
3. Execute manually

## Current Migrations

### 1. Create Profiles Table (20241118000001)

Creates the `public.profiles` table with:
- Core fields: `id`, `created_at`, `updated_at`
- Foreign key to `auth.users(id)`
- Row Level Security (RLS) policies
- Auto-update trigger for `updated_at`
- Auto-creation trigger for new users

**RLS Policies:**
- Users can view their own profile
- Users can update their own profile
- Users can insert their own profile

### 2. Add has_onboarded Column (20241118000002)

Adds `has_onboarded` boolean column to profiles:
- Initially nullable (no default)
- Allows gradual migration
- Indexed for query performance

### 3. Backfill has_onboarded (20241118000003)

Backfills existing profiles:
- Sets `has_onboarded = true` for all existing users
- Prevents existing users from seeing onboarding flow
- Idempotent: only updates NULL values

### 4. Finalize has_onboarded Constraints (20241118000004)

Applies final constraints:
- Sets `NOT NULL` constraint
- Sets `DEFAULT false` for new users
- Completes backwards-compatible migration

### 5. Update handle_new_user with has_onboarded (20241119000001)

Updates the `handle_new_user` trigger function:
- Explicitly sets `has_onboarded = false` for new user profiles
- Makes initialization explicit rather than relying solely on DEFAULT constraint
- Ensures consistent behavior across all new user signups

## Migration Strategy

The `has_onboarded` column uses a three-phase migration strategy:

**Phase 1: Add Column (Nullable)**
- Add column without constraints
- Existing rows remain valid
- Older clients continue to function

**Phase 2: Backfill Data**
- Set existing users to `has_onboarded = true`
- Ensures they skip onboarding
- Idempotent operation

**Phase 3: Add Constraints**
- Enforce `NOT NULL` constraint
- Set `DEFAULT false` for new users
- Complete data integrity

This approach allows:
- Zero-downtime deployment
- Gradual client rollout
- Safe rollback if needed

## Rollback Strategy

To rollback migrations in local development:

```bash
cd edge-functions
supabase db reset
```

For production rollbacks:
1. Create a new migration that reverses changes
2. Test thoroughly in staging
3. Apply via `supabase db push --linked`

**Note**: Never edit or delete existing migrations. Always create new migrations to modify schema.

## Testing Migrations

Test migrations locally before applying to production:

```bash
# Start local Supabase
npm run edge:dev

# Reset and apply all migrations
cd edge-functions
supabase db reset

# Verify schema
supabase db diff

# Test RLS policies
# (Create test users and verify access controls)
```

## Security Considerations

### Row Level Security (RLS)

All tables MUST have RLS enabled:

```sql
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
```

### RLS Policy Patterns

**Read own data:**
```sql
CREATE POLICY "policy_name"
  ON table_name
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
```

**Write own data:**
```sql
CREATE POLICY "policy_name"
  ON table_name
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### Never Skip RLS

- Always enable RLS on new tables
- Test policies with multiple user accounts
- Use `authenticated` role for user-facing tables
- Use `service_role` only for admin operations

## Troubleshooting

### Migration fails: "column already exists"

The migration is not idempotent. Add conditional logic:

```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'table_name' AND column_name = 'column_name'
  ) THEN
    ALTER TABLE table_name ADD COLUMN column_name TYPE;
  END IF;
END $$;
```

### Migration fails: "relation does not exist"

Ensure migrations run in order:
- Check timestamp prefix
- Verify dependencies listed in migration header
- Run `supabase db reset` to reapply all migrations

### RLS denies legitimate access

Test policies with actual user context:

```sql
-- Simulate authenticated user
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claim.sub TO 'user-uuid';

-- Try query
SELECT * FROM profiles WHERE id = 'user-uuid';
```

## Additional Resources

- [Supabase Migrations Guide](https://supabase.com/docs/guides/cli/local-development#database-migrations)
- [PostgreSQL Migration Best Practices](https://www.postgresql.org/docs/current/ddl-alter.html)
- [Row Level Security Documentation](https://supabase.com/docs/guides/auth/row-level-security)
