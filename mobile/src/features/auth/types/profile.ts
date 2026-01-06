import { z } from 'zod';

/**
 * User profile types for the auth feature.
 *
 * These types represent user profile data stored in the public.profiles table
 * in Supabase. The profile extends auth.users with application-specific fields.
 *
 * TYPE NAMING CONVENTION:
 * - Profile: Application-facing type with camelCase fields
 * - ProfileRow: Database row type with snake_case fields (matches Supabase schema)
 *
 * FIELD MAPPING:
 * - has_onboarded (DB) -> hasOnboarded (app)
 * - role (DB) -> role (app)
 * - created_at (DB) -> createdAt (app)
 * - updated_at (DB) -> updatedAt (app)
 */

/**
 * User role/cohort for feature flag targeting.
 *
 * Used to control access to features during controlled rollouts:
 * - 'internal': Maidrobe staff and internal testers
 * - 'beta': Selected early-access external users
 * - 'standard': All other users (default)
 *
 * @see Story #366 for outfit recommendation rollout targeting
 */
export type UserRole = 'internal' | 'beta' | 'standard';

/**
 * Valid user roles for validation.
 */
export const VALID_USER_ROLES: readonly UserRole[] = ['internal', 'beta', 'standard'] as const;

/**
 * Default user role assigned to new users.
 */
export const DEFAULT_USER_ROLE: UserRole = 'standard';

/**
 * Zod schema for user role validation.
 *
 * Validates that a role value is one of the allowed cohort types.
 * Defaults to 'standard' if the value is missing or invalid.
 */
export const UserRoleSchema = z.enum(['internal', 'beta', 'standard']).catch('standard');

/**
 * Zod schema for validating profile data from Supabase.
 *
 * This schema validates the raw response from the public.profiles table
 * to ensure data integrity before it enters the application layer. All
 * profile data must pass this validation before being mapped to the
 * application Profile type.
 *
 * Validation rules:
 * - id: Must be a valid UUID string
 * - has_onboarded: Must be a boolean
 * - role: Must be 'internal', 'beta', or 'standard' (defaults to 'standard')
 * - created_at: Must be a string (ISO 8601 timestamp from Postgres)
 * - updated_at: Must be a string (ISO 8601 timestamp from Postgres)
 *
 * @throws {z.ZodError} If the profile data doesn't match the expected schema
 *
 * @example
 * ```typescript
 * const { data } = await supabase.from('profiles').select('*').single();
 * const validatedData = ProfileRowSchema.parse(data);
 * const profile = mapProfileRowToProfile(validatedData);
 * ```
 */
export const ProfileRowSchema = z.object({
  id: z.string().uuid(),
  has_onboarded: z.boolean(),
  role: UserRoleSchema.default('standard'),
  created_at: z.string(),
  updated_at: z.string(),
});

/**
 * Database row structure for public.profiles table.
 *
 * This matches the exact schema in the database with snake_case field names.
 * Used for type-safe Supabase queries and responses.
 *
 * Note: This type is inferred from ProfileRowSchema to ensure runtime
 * validation and compile-time types stay in sync.
 */
export type ProfileRow = z.infer<typeof ProfileRowSchema>;

/**
 * Application-facing profile type with camelCase fields.
 *
 * This is the type used throughout the application. It provides a more
 * idiomatic TypeScript interface compared to the database row structure.
 *
 * @example
 * ```typescript
 * const profile: Profile = {
 *   id: 'user-uuid',
 *   hasOnboarded: true,
 *   role: 'standard',
 *   createdAt: '2024-01-01T00:00:00Z',
 *   updatedAt: '2024-01-02T00:00:00Z',
 * };
 * ```
 */
export interface Profile {
  /** User ID (references auth.users.id) */
  id: string;
  /** Whether the user has completed onboarding */
  hasOnboarded: boolean;
  /** User role/cohort for feature flag targeting */
  role: UserRole;
  /** Timestamp when profile was created */
  createdAt: string;
  /** Timestamp when profile was last updated */
  updatedAt: string;
}

/**
 * Converts a database profile row to application profile type.
 *
 * Transforms snake_case database fields to camelCase application fields.
 * This function should be used whenever fetching profile data from Supabase
 * to ensure consistent type usage throughout the application.
 *
 * @param row - Database profile row with snake_case fields
 * @returns Application profile with camelCase fields
 *
 * @example
 * ```typescript
 * const { data } = await supabase.from('profiles').select('*').single();
 * const profile = mapProfileRowToProfile(data);
 * // profile.hasOnboarded (camelCase) instead of data.has_onboarded
 * // profile.role for feature flag cohort targeting
 * ```
 */
export function mapProfileRowToProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    hasOnboarded: row.has_onboarded,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Update payload for profile mutations.
 *
 * Contains only the fields that can be updated by the client.
 * The id field is excluded (cannot be changed) and timestamps are
 * managed automatically by database triggers.
 */
export interface ProfileUpdatePayload {
  /** Whether the user has completed onboarding */
  has_onboarded?: boolean;
}
