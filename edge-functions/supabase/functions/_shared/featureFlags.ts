/**
 * Feature flags module for Supabase Edge Functions.
 *
 * This module provides server-side feature flag evaluation for wardrobe-related
 * features. The server is the authoritative source of truth - these flags control
 * backend processing behaviour directly.
 *
 * ARCHITECTURE:
 * - Server-side evaluation: Flags are read from environment variables on the server
 * - Safe defaults: Both flags default to `false` when env vars are missing or invalid
 * - No client override: Client can read flags for UI purposes but cannot influence backend
 *
 * FEATURE FLAGS:
 * - wardrobe_image_cleanup_enabled: Controls whether background removal is performed
 * - wardrobe_ai_attributes_enabled: Controls whether AI attribute detection runs
 *
 * ENVIRONMENT VARIABLES:
 * - WARDROBE_IMAGE_CLEANUP_ENABLED: 'true' to enable image cleanup (default: false)
 * - WARDROBE_AI_ATTRIBUTES_ENABLED: 'true' to enable AI attributes (default: false)
 *
 * SAFE DEFAULT RATIONALE:
 * Both flags default to `false` to ensure that if configuration is missing or
 * corrupted, the system fails safely by not performing potentially expensive
 * or unwanted operations. This is a conservative approach that:
 * - Prevents unexpected API costs from AI services
 * - Allows gradual rollout of new features
 * - Provides a clear "off switch" for emergency situations
 *
 * PRIVACY GUARANTEE - EXIF STRIPPING:
 * -----------------------------------
 * IMPORTANT: These feature flags control PROCESSING features, NOT privacy protections.
 *
 * EXIF metadata stripping is ALWAYS enforced regardless of flag state:
 * - Client-side: All images are re-encoded via expo-image-manipulator before upload
 * - Server-side: All processed images are re-encoded via ImageScript.encodeJPEG()
 *
 * When wardrobe_image_cleanup_enabled is FALSE:
 * - No background removal occurs
 * - No clean/thumb variants are generated
 * - BUT original images are still EXIF-free (client stripped before upload)
 * - User privacy is maintained through mandatory client-side processing
 *
 * This separation ensures privacy protections are NEVER dependent on feature flags.
 *
 * MIGRATION TO UNLEASH:
 * This implementation is designed to be easily replaced with Unleash SDK:
 * 1. Replace Deno.env.get() with unleash.isEnabled()
 * 2. Add user context for targeted rollouts
 * 3. Maintain same interface for backward compatibility
 *
 * @module _shared/featureFlags
 */

/**
 * User role/cohort for feature flag targeting.
 *
 * Used to control access to features during controlled rollouts:
 * - 'internal': Maidrobe staff and internal testers
 * - 'beta': Selected early-access external users
 * - 'standard': All other users (default)
 */
export type UserRole = 'internal' | 'beta' | 'standard';

/**
 * Environment names for flag evaluation.
 */
export type FlagEnvironment = 'development' | 'staging' | 'production';

/**
 * Wardrobe feature flag configuration.
 *
 * Contains the evaluated state of all wardrobe-related feature flags.
 * All values are booleans indicating whether the feature is enabled.
 */
export interface WardrobeFeatureFlags {
  /**
   * Whether image cleanup (background removal) is enabled.
   * When false, the process-item-image function will skip background removal
   * and only generate thumbnails from the original image.
   */
  wardrobe_image_cleanup_enabled: boolean;

  /**
   * Whether AI attribute detection is enabled.
   * When false, the detect-item-attributes function will skip AI processing
   * and leave items without AI-detected attributes.
   */
  wardrobe_ai_attributes_enabled: boolean;

  /**
   * Whether the outfit recommendation stub is enabled for the user.
   * Evaluation considers environment and user cohort/role.
   *
   * Environment-specific defaults:
   * - development: ON for all users
   * - staging: ON for internal, OFF for others
   * - production: OFF for all (explicit config required)
   */
  outfit_recommendation_stub_enabled: boolean;
}

/**
 * Structured log entry for feature flag evaluation.
 */
interface FeatureFlagLogEntry {
  timestamp: string;
  level: 'info' | 'warn';
  event: string;
  flag_name: string;
  flag_value: boolean;
  source: 'environment' | 'default';
}

/**
 * Emits a structured log entry for feature flag evaluation.
 *
 * Logs flag evaluations for observability and debugging. Includes:
 * - Flag name and resolved value
 * - Whether the value came from environment or default
 * - Timestamp for correlation with other logs
 *
 * @param flagName - Name of the flag being evaluated
 * @param value - Resolved value of the flag
 * @param fromEnvironment - Whether the value came from an environment variable
 */
function logFlagEvaluation(flagName: string, value: boolean, fromEnvironment: boolean): void {
  const entry: FeatureFlagLogEntry = {
    timestamp: new Date().toISOString(),
    level: fromEnvironment ? 'info' : 'warn',
    event: 'feature_flag_evaluated',
    flag_name: flagName,
    flag_value: value,
    source: fromEnvironment ? 'environment' : 'default',
  };

  const message = JSON.stringify(entry);

  // Console logging is intentional for Edge Function observability
  if (fromEnvironment) {
    // eslint-disable-next-line no-console
    console.log('[FeatureFlags]', message);
  } else {
    // Warn when using default value - indicates missing configuration
    // eslint-disable-next-line no-console
    console.warn('[FeatureFlags]', message);
  }
}

/**
 * Evaluates a boolean feature flag from environment variables.
 *
 * SAFE DEFAULT BEHAVIOUR:
 * Returns `false` (safe default) when:
 * - Environment variable is not set
 * - Environment variable is empty string
 * - Environment variable has any value other than exactly 'true'
 *
 * Returns `true` only when environment variable is exactly 'true' (case-sensitive).
 *
 * @param envVarName - Name of the environment variable to read
 * @returns Evaluated boolean value (safe default: false)
 */
function evaluateBooleanFlag(envVarName: string): boolean {
  const value = Deno.env.get(envVarName);

  // Safe default: only enable if explicitly set to 'true'
  const enabled = value === 'true';
  const fromEnvironment = value !== undefined && value !== '';

  logFlagEvaluation(envVarName, enabled, fromEnvironment);

  return enabled;
}

/**
 * Gets the current environment from environment variables.
 *
 * @returns The current environment name (defaults to 'development')
 */
function getEnvironment(): FlagEnvironment {
  const env = Deno.env.get('ENVIRONMENT');
  if (env === 'production' || env === 'staging' || env === 'development') {
    return env;
  }
  return 'development';
}

/**
 * Validates a user role string.
 *
 * @param role - The role string to validate
 * @returns Valid UserRole or 'standard' as default
 */
function validateUserRole(role: string | undefined): UserRole {
  if (role === 'internal' || role === 'beta' || role === 'standard') {
    return role;
  }
  return 'standard';
}

/**
 * Context for evaluating user-specific feature flags.
 */
export interface UserFlagContext {
  /** User's role/cohort for targeting */
  role?: UserRole;
  /** User ID (for logging, not targeting) */
  userId?: string;
}

/**
 * Evaluates the outfit_recommendation_stub flag with environment and cohort targeting.
 *
 * EVALUATION LOGIC:
 *
 * 1. Check explicit configuration (OUTFIT_RECOMMENDATION_STUB_ENABLED env var)
 *    - If explicitly set to 'true' or 'false', use that value
 *    - Explicit OFF always honoured regardless of environment/cohort
 *
 * 2. If not explicitly configured, apply environment-specific defaults:
 *    - Development: ON for all users (unblock development)
 *    - Staging: ON for internal testers, OFF for others
 *    - Production: OFF for all users (requires explicit enablement)
 *
 * 3. Cohort targeting (when explicitly configured per cohort):
 *    - OUTFIT_RECOMMENDATION_STUB_INTERNAL_ENABLED: Override for internal users
 *    - OUTFIT_RECOMMENDATION_STUB_BETA_ENABLED: Override for beta users
 *
 * @param context - User context for cohort-based targeting
 * @returns Whether the flag is enabled for this user
 */
export function evaluateOutfitRecommendationStubFlag(context?: UserFlagContext): boolean {
  const environment = getEnvironment();
  const userRole = validateUserRole(context?.role);

  // Check for cohort-specific overrides first
  const cohortOverrideEnvVar = `OUTFIT_RECOMMENDATION_STUB_${userRole.toUpperCase()}_ENABLED`;
  const cohortOverride = Deno.env.get(cohortOverrideEnvVar);

  if (cohortOverride !== undefined && cohortOverride !== '') {
    const enabled = cohortOverride === 'true';
    logFlagEvaluation(`${cohortOverrideEnvVar} (cohort: ${userRole})`, enabled, true);
    return enabled;
  }

  // Check for global explicit configuration
  const globalValue = Deno.env.get('OUTFIT_RECOMMENDATION_STUB_ENABLED');

  if (globalValue !== undefined && globalValue !== '') {
    const enabled = globalValue === 'true';
    logFlagEvaluation('OUTFIT_RECOMMENDATION_STUB_ENABLED', enabled, true);
    return enabled;
  }

  // Apply environment-specific defaults
  let defaultEnabled: boolean;

  switch (environment) {
    case 'development':
      // Development: ON for all users to unblock local development
      defaultEnabled = true;
      break;

    case 'staging':
      // Staging: ON for internal testers only
      defaultEnabled = userRole === 'internal';
      break;

    case 'production':
      // Production: OFF for all by default (explicit config required)
      defaultEnabled = false;
      break;

    default:
      // Fallback to safe default (OFF)
      defaultEnabled = false;
  }

  logFlagEvaluation(
    `OUTFIT_RECOMMENDATION_STUB (env: ${environment}, role: ${userRole})`,
    defaultEnabled,
    false
  );

  return defaultEnabled;
}

/**
 * Retrieves the current state of wardrobe feature flags.
 *
 * This function evaluates all wardrobe-related feature flags from environment
 * variables and returns their current state. Each flag defaults to `false`
 * if not explicitly set to 'true'.
 *
 * USAGE:
 * ```typescript
 * const flags = getWardrobeFeatureFlags();
 *
 * if (!flags.wardrobe_image_cleanup_enabled) {
 *   // Skip background removal, use original image
 *   return { skipped: true, reason: 'feature_disabled' };
 * }
 *
 * // Proceed with image cleanup...
 * ```
 *
 * SAFE DEFAULTS:
 * All flags default to `false` to ensure safe behaviour when configuration
 * is missing. This means:
 * - New deployments start with features disabled
 * - Missing env vars don't accidentally enable expensive operations
 * - Features can be explicitly enabled per environment
 *
 * @param userContext - Optional user context for cohort-based flag targeting
 * @returns Object containing all wardrobe feature flag states
 */
export function getWardrobeFeatureFlags(userContext?: UserFlagContext): WardrobeFeatureFlags {
  return {
    wardrobe_image_cleanup_enabled: evaluateBooleanFlag('WARDROBE_IMAGE_CLEANUP_ENABLED'),
    wardrobe_ai_attributes_enabled: evaluateBooleanFlag('WARDROBE_AI_ATTRIBUTES_ENABLED'),
    outfit_recommendation_stub_enabled: evaluateOutfitRecommendationStubFlag(userContext),
  };
}

/**
 * Checks if image cleanup feature is enabled.
 *
 * Convenience function for checking the image cleanup flag.
 * Equivalent to `getWardrobeFeatureFlags().wardrobe_image_cleanup_enabled`.
 *
 * @returns true if image cleanup is enabled, false otherwise (safe default: false)
 */
export function isImageCleanupEnabled(): boolean {
  return evaluateBooleanFlag('WARDROBE_IMAGE_CLEANUP_ENABLED');
}

/**
 * Checks if AI attributes feature is enabled.
 *
 * Convenience function for checking the AI attributes flag.
 * Equivalent to `getWardrobeFeatureFlags().wardrobe_ai_attributes_enabled`.
 *
 * @returns true if AI attributes is enabled, false otherwise (safe default: false)
 */
export function isAIAttributesEnabled(): boolean {
  return evaluateBooleanFlag('WARDROBE_AI_ATTRIBUTES_ENABLED');
}

/**
 * Checks if outfit recommendation stub is enabled for a user.
 *
 * Convenience function for checking the outfit recommendation stub flag
 * with user context for cohort-based targeting.
 *
 * @param context - User context for cohort-based targeting
 * @returns true if outfit recommendation stub is enabled for this user
 */
export function isOutfitRecommendationStubEnabled(context?: UserFlagContext): boolean {
  return evaluateOutfitRecommendationStubFlag(context);
}
