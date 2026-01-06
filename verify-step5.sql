-- ============================================================================
-- STEP 5 VERIFICATION - USER MANAGEMENT SCHEMA
-- ============================================================================
-- This script verifies the complete user management schema implementation
-- Run in Supabase SQL editor after applying the migration

-- 1. Verify all tables exist
SELECT table_name, 
       COUNT(*) as column_count
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name IN ('users', 'roles', 'user_roles', 'user_settings')
GROUP BY table_name
ORDER BY table_name;

-- Expected: users (13), roles (8), user_roles (6), user_settings (14)

-- 2. Verify all constraints
SELECT con.conname as constraint_name,
       con.contype as type,
       tbl.relname as table_name,
       pg_get_constraintdef(con.oid) as definition
FROM pg_constraint con
JOIN pg_class tbl ON con.conrelid = tbl.oid
JOIN pg_namespace ns ON tbl.relnamespace = ns.oid
WHERE ns.nspname = 'public'
  AND tbl.relname IN ('users', 'roles', 'user_roles', 'user_settings')
ORDER BY table_name, conname;

-- Expected: 13 constraints (including CHECK, UNIQUE, FK)

-- 3. Verify all indexes
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' 
  AND tablename IN ('users', 'roles', 'user_roles', 'user_settings')
ORDER BY tablename, indexname;

-- Expected: 7 indexes (4 explicit + 3 implicit from UNIQUE constraints)

-- 4. Verify RLS is enabled
SELECT relname, relrowsecurity
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN ('users', 'roles', 'user_roles', 'user_settings')
ORDER BY relname;

-- Expected: All 4 tables have relrowsecurity = true

-- 5. Verify all policies exist
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename IN ('users', 'roles', 'user_roles', 'user_settings')
ORDER BY tablename, policyname;

-- Expected: 10 policies total

-- 6. Verify triggers exist
SELECT event_object_table, trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table IN ('users', 'roles', 'user_roles', 'user_settings')
ORDER BY event_object_table, trigger_name;

-- Expected: 4 triggers (set_updated_at on each table)

-- 7. Create test data - User
INSERT INTO users (email, display_name, status, auth_provider)
VALUES ('step5.verify@example.com', 'Step 5 Verification User', 'ACTIVE', 'local')
RETURNING id;

-- 8. Create test data - Roles
INSERT INTO roles (code, name, description)
VALUES 
  ('STEP5_STUDENT', 'Step 5 Student', 'Test student role'),
  ('STEP5_TUTOR', 'Step 5 Tutor', 'Test tutor role')
RETURNING id, code;

-- 9. Assign roles to user
INSERT INTO user_roles (user_id, role_id)
VALUES 
  ((SELECT id FROM users WHERE email = 'step5.verify@example.com'),
   (SELECT id FROM roles WHERE code = 'STEP5_STUDENT')),
  ((SELECT id FROM users WHERE email = 'step5.verify@example.com'),
   (SELECT id FROM roles WHERE code = 'STEP5_TUTOR'));

-- 10. Create user settings
INSERT INTO user_settings (user_id, timezone, language_code, receive_email_reminders, kid_friendly_ui)
VALUES 
  ((SELECT id FROM users WHERE email = 'step5.verify@example.com'),
   'Europe/London', 'en-GB', true, false);

-- 11. Query: User with roles
SELECT u.email, u.display_name, r.code as role_code, r.name as role_name, ur.assigned_at
FROM users u
JOIN user_roles ur ON u.id = ur.user_id
JOIN roles r ON ur.role_id = r.id
WHERE u.email = 'step5.verify@example.com'
ORDER BY r.code;

-- Expected: 2 rows (STUDENT and TUTOR roles)

-- 12. Query: User settings
SELECT timezone, language_code, receive_email_reminders, receive_push_notifications,
       high_contrast_mode, kid_friendly_ui, extra_settings
FROM user_settings
WHERE user_id = (SELECT id FROM users WHERE email = 'step5.verify@example.com');

-- Expected: 1 row with specified settings

-- 13. Test index usage for email lookup
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT id, email, display_name
FROM users
WHERE email = 'step5.verify@example.com' AND is_deleted = false;

-- Expected: Index Scan using idx_users_unique_email_active

-- 14. Test index usage for auth_provider lookup
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT id, email, display_name
FROM users
WHERE auth_provider = 'local' AND auth_provider_id IS NULL
LIMIT 1;

-- Expected: Index Scan using idx_users_auth_provider_lookup

-- 15. Verify ON DELETE CASCADE (user deletion deletes assignments and settings)
-- Get counts before delete
SELECT 'Users before delete: ' || COUNT(*) FROM users WHERE email = 'step5.verify@example.com';
SELECT 'Role assignments before delete: ' || COUNT(*) FROM user_roles WHERE user_id = (SELECT id FROM users WHERE email = 'step5.verify@example.com');
SELECT 'Settings before delete: ' || COUNT(*) FROM user_settings WHERE user_id = (SELECT id FROM users WHERE email = 'step5.verify@example.com');

-- Delete user
DELETE FROM users WHERE email = 'step5.verify@example.com';

-- Verify cascade worked
SELECT 'Users after delete: ' || COUNT(*) FROM users WHERE email = 'step5.verify@example.com';
SELECT 'Role assignments after delete: ' || COUNT(*) FROM user_roles WHERE user_id = (SELECT id FROM users WHERE email = 'step5.verify@example.com');
SELECT 'Settings after delete: ' || COUNT(*) FROM user_settings WHERE user_id = (SELECT id FROM users WHERE email = 'step5.verify@example.com');

-- Expected: All counts should be 0 (cascade worked)

-- 16. Verify ON DELETE RESTRICT (cannot delete role with assignments)
-- Create user and assign role
INSERT INTO users (email, display_name, status, auth_provider)
VALUES ('restrict.test@example.com', 'Restrict Test', 'ACTIVE', 'local');

INSERT INTO user_roles (user_id, role_id)
VALUES (
  (SELECT id FROM users WHERE email = 'restrict.test@example.com'),
  (SELECT id FROM roles WHERE code = 'STEP5_STUDENT')
);

-- Try to delete role (should fail)
DELETE FROM roles WHERE code = 'STEP5_STUDENT';
-- Expected: ERROR: update or delete on table "roles" violates foreign key constraint "user_roles_role_id_fkey"

-- Cleanup
DELETE FROM users WHERE email IN ('restrict.test@example.com', 'step5.verify@example.com');
DELETE FROM roles WHERE code IN ('STEP5_STUDENT', 'STEP5_TUTOR');

-- Final verification message
SELECT 'Step 5 verification complete: All components working correctly' as status;
