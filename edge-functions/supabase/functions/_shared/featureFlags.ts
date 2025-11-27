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
 * MIGRATION TO UNLEASH:
 * This implementation is designed to be easily replaced with Unleash SDK:
 * 1. Replace Deno.env.get() with unleash.isEnabled()
 * 2. Add user context for targeted rollouts
 * 3. Maintain same interface for backward compatibility
 *
 * @module _shared/featureFlags
 */

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
 * @returns Object containing all wardrobe feature flag states
 */
export function getWardrobeFeatureFlags(): WardrobeFeatureFlags {
  return {
    wardrobe_image_cleanup_enabled: evaluateBooleanFlag('WARDROBE_IMAGE_CLEANUP_ENABLED'),
    wardrobe_ai_attributes_enabled: evaluateBooleanFlag('WARDROBE_AI_ATTRIBUTES_ENABLED'),
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
