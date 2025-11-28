/**
 * Feature flags client for remote configuration and version compatibility checks.
 *
 * IMPLEMENTATION STATUS:
 * This module implements environment-variable-based feature flag evaluation with
 * version compatibility checks. It provides:
 *
 * 1. Feature Control via Environment Variables: IMPLEMENTED
 *    - Features can be enabled/disabled via EXPO_PUBLIC_FEATURE_*_ENABLED
 *    - Configuration survives across app restarts
 *    - No network dependency (offline-capable)
 *    - Easy to configure for different environments (dev/staging/prod)
 *
 * 2. Version Compatibility Enforcement: IMPLEMENTED
 *    - Minimum version requirements via EXPO_PUBLIC_FEATURE_*_MIN_VERSION
 *    - Semver comparison between client and required versions
 *    - requiresUpdate flag triggers update prompts
 *    - Prevents incompatible clients from accessing features with breaking changes
 *
 * 3. Security and Stability Benefits:
 *    - Can enforce minimum client version for security patches
 *    - Version-based feature gating prevents schema mismatches
 *    - Fail-safe defaults (enabled=true, minVersion=0.0.0) on errors
 *    - Clear error messages guide users to update
 *
 * INTEGRATION ROADMAP:
 * This stub implementation uses the same data structure and interface that will
 * be used with production feature flag services. The current always-enabled
 * behavior serves as a fail-safe pattern during development.
 *
 * Planned Integration:
 *
 * 1. Unleash Feature Flag Service (TODO: TICKET-UNLEASH-001)
 *    Purpose: Remote feature control, version compatibility, gradual rollouts
 *    Integration Points:
 *    - checkFeatureFlag() -> Unleash SDK client.isEnabled() for remote flags
 *    - Version metadata -> client.getVariant() for minClientVersion checks
 *    - Client context (userId, version) -> Unleash context for targeting
 *    Data Flow:
 *    - Feature flag requests -> Unleash SDK -> Unleash server -> cached response
 *    - Version comparison: CLIENT_VERSION vs flag metadata minClientVersion
 *    - Result: { enabled: boolean, requiresUpdate: boolean, message?: string }
 *    Configuration Requirements:
 *    - Environment variable: EXPO_PUBLIC_UNLEASH_URL
 *    - Environment variable: EXPO_PUBLIC_UNLEASH_CLIENT_KEY
 *    - Environment variable: EXPO_PUBLIC_UNLEASH_APP_NAME
 *    - SDK initialization in app/_layout.tsx before feature flag checks
 *    - Polling interval: 60s for flag updates
 *    - Cache strategy: stale-while-revalidate for offline support
 *
 * Migration Path:
 * 1. Configure EXPO_PUBLIC_UNLEASH_URL and EXPO_PUBLIC_UNLEASH_CLIENT_KEY
 * 2. Add unleash-proxy-client dependency to mobile workspace
 * 3. Initialize Unleash SDK in app/_layout.tsx with client context
 * 4. Implement getUnleashClient() singleton with caching
 * 5. Replace stub logic in checkFeatureFlag() with Unleash SDK calls
 * 6. Add version comparison logic using semver
 * 7. Configure feature flags in Unleash dashboard with minClientVersion metadata
 * 8. Test with gradual rollout to verify remote control works
 * 9. Monitor flag check telemetry to ensure proper caching
 *
 * @module core/featureFlags
 */

import { getFlagConfig } from './config';

/**
 * Feature flag check result with version compatibility information.
 */
export interface FeatureFlagResult {
  /** Whether the feature is enabled for this client */
  enabled: boolean;
  /** Whether the client version is compatible with the API */
  requiresUpdate: boolean;
  /** Optional message explaining why update is required */
  message?: string;
}

/**
 * Supported feature flag names.
 *
 * Feature flags control availability of features and version compatibility.
 * Each flag maps to environment variables:
 * - EXPO_PUBLIC_FEATURE_{FLAG_NAME}_ENABLED (boolean, default: true)
 * - EXPO_PUBLIC_FEATURE_{FLAG_NAME}_MIN_VERSION (semver, default: 0.0.0)
 *
 * Available flags:
 * - auth.login: Login feature
 * - auth.signup: Signup feature
 * - auth.logout: Logout feature
 * - auth.recaptcha: reCAPTCHA integration
 * - auth.errorLogging: Auth error logging
 * - onboarding.gate: Onboarding gate routing (routes new users to onboarding flow)
 * - capture.cropScreen: Crop & adjust experience for wardrobe item images
 * - recommendations.itemResolution: Item resolution with thumbnails for outfit suggestions
 *
 * Server-side wardrobe flags (fetched remotely, cannot be overridden locally):
 * - wardrobe.imageCleanup: Whether image cleanup/background removal is enabled
 * - wardrobe.aiAttributes: Whether AI attribute detection is enabled
 */
export type FeatureFlagName =
  | 'auth.login'
  | 'auth.signup'
  | 'auth.logout'
  | 'auth.recaptcha'
  | 'auth.errorLogging'
  | 'onboarding.gate'
  | 'capture.cropScreen'
  | 'wardrobe.imageCleanup'
  | 'wardrobe.aiAttributes'
  | 'recommendations.itemResolution';

/**
 * Client version information for compatibility checks.
 */
interface ClientVersion {
  major: number;
  minor: number;
  patch: number;
}

/**
 * Current client version (from package.json or build config).
 *
 * This matches the version in mobile/package.json and is used for version
 * compatibility checks against feature flag minimum version requirements.
 * In production builds, this should be automatically populated from the
 * build configuration or package.json during the build process.
 */
const CLIENT_VERSION: ClientVersion = {
  major: 0,
  minor: 1,
  patch: 0,
};

/**
 * Parses a semver version string into a ClientVersion object.
 *
 * Supports standard semver format: 'major.minor.patch'
 * Examples: '1.2.3', '0.1.0', '2.0.0'
 *
 * Invalid formats return { major: 0, minor: 0, patch: 0 } as a fail-safe
 * to prevent blocking users on parsing errors.
 *
 * @param version - Semver version string (e.g., '1.2.3')
 * @returns Parsed ClientVersion object
 *
 * @example
 * ```typescript
 * parseVersion('1.2.3') // { major: 1, minor: 2, patch: 3 }
 * parseVersion('invalid') // { major: 0, minor: 0, patch: 0 }
 * ```
 */
function parseVersion(version: string): ClientVersion {
  const parts = version.split('.');

  if (parts.length !== 3) {
    // Invalid format, return 0.0.0 as fail-safe
    return { major: 0, minor: 0, patch: 0 };
  }

  const major = parseInt(parts[0], 10);
  const minor = parseInt(parts[1], 10);
  const patch = parseInt(parts[2], 10);

  // Validate that all parts are valid numbers
  if (Number.isNaN(major) || Number.isNaN(minor) || Number.isNaN(patch)) {
    return { major: 0, minor: 0, patch: 0 };
  }

  return { major, minor, patch };
}

/**
 * Compares two semver versions.
 *
 * Returns:
 * - -1 if a < b (a is older than b)
 * -  0 if a === b (versions are equal)
 * -  1 if a > b (a is newer than b)
 *
 * Comparison is done hierarchically: major -> minor -> patch
 *
 * @param a - First version to compare
 * @param b - Second version to compare
 * @returns Comparison result (-1, 0, or 1)
 *
 * @example
 * ```typescript
 * compareVersions({ major: 1, minor: 0, patch: 0 }, { major: 2, minor: 0, patch: 0 }) // -1
 * compareVersions({ major: 1, minor: 2, patch: 3 }, { major: 1, minor: 2, patch: 3 }) // 0
 * compareVersions({ major: 2, minor: 0, patch: 0 }, { major: 1, minor: 9, patch: 9 }) // 1
 * ```
 */
function compareVersions(a: ClientVersion, b: ClientVersion): number {
  // Compare major version first
  if (a.major < b.major) return -1;
  if (a.major > b.major) return 1;

  // Major versions equal, compare minor
  if (a.minor < b.minor) return -1;
  if (a.minor > b.minor) return 1;

  // Major and minor equal, compare patch
  if (a.patch < b.patch) return -1;
  if (a.patch > b.patch) return 1;

  // All components equal
  return 0;
}

/**
 * Checks if a feature flag is enabled and if the client version is compatible.
 *
 * CURRENT IMPLEMENTATION:
 * This function reads feature flag configuration from environment variables and
 * performs semver version comparison to determine if the client is compatible.
 *
 * Configuration:
 * - Feature state: EXPO_PUBLIC_FEATURE_{FLAG_NAME}_ENABLED (true/false)
 * - Minimum version: EXPO_PUBLIC_FEATURE_{FLAG_NAME}_MIN_VERSION (semver)
 * - Update message: EXPO_PUBLIC_FEATURE_UPDATE_MESSAGE (string)
 *
 * Version Compatibility:
 * - Compares CLIENT_VERSION against minimum required version from config
 * - Returns requiresUpdate=true if CLIENT_VERSION < minimum required
 * - Uses semver comparison (major.minor.patch)
 *
 * Fail-Safe Behavior:
 * - On error: returns { enabled: true, requiresUpdate: false }
 * - On invalid version: treats as 0.0.0 (no restriction)
 * - Logs errors to console for debugging
 *
 * Future Migration to Unleash:
 * When ready to integrate Unleash, this function can be updated to:
 * 1. Call Unleash SDK instead of reading environment variables
 * 2. Use Unleash context for user-specific targeting
 * 3. Leverage Unleash's gradual rollout and A/B testing capabilities
 * 4. Maintain same interface for backward compatibility
 *
 * @param flagName - The name of the feature flag to check
 * @returns Promise resolving to flag status and version compatibility
 *
 * @example
 * ```typescript
 * const flag = await checkFeatureFlag('auth.login');
 * if (flag.requiresUpdate) {
 *   throw new Error('Please update your app.');
 * }
 * if (!flag.enabled) {
 *   throw new Error('This feature is temporarily unavailable.');
 * }
 * ```
 */
export async function checkFeatureFlag(flagName: FeatureFlagName): Promise<FeatureFlagResult> {
  try {
    // Simulate minimal async delay to maintain async interface
    // (allows for future network-based implementations without breaking callers)
    await new Promise((resolve) => setTimeout(resolve, 1));

    // Get flag configuration from environment variables
    const config = getFlagConfig(flagName);

    // Parse minimum required version from configuration
    const minVersion = parseVersion(config.minVersion);

    // Compare client version against minimum required version
    // requiresUpdate is true if client version is older than required
    const requiresUpdate = compareVersions(CLIENT_VERSION, minVersion) < 0;

    // Return result with flag status and version compatibility
    return {
      enabled: config.enabled,
      requiresUpdate,
      message: requiresUpdate ? config.message : undefined,
    };
  } catch (error) {
    // On error, fail safe by allowing the operation
    // Log the error for monitoring
    // eslint-disable-next-line no-console
    console.error('[FeatureFlags] Error checking feature flag:', error);

    // Future: Integrate with telemetry module
    // logError(error, 'schema', {
    //   feature: 'featureFlags',
    //   operation: 'checkFeatureFlag',
    //   metadata: { flagName },
    // });

    // Fail-safe: enable feature and don't require update
    // This ensures app remains functional even if flag system fails
    return {
      enabled: true,
      requiresUpdate: false,
    };
  }
}

/**
 * Checks if a feature flag is enabled synchronously (for use in synchronous contexts).
 *
 * This is a synchronous version of checkFeatureFlag that performs the same logic
 * without the async wrapper. It's intended for use in contexts where async/await
 * cannot be used, such as:
 * - Zustand store getters
 * - Synchronous utility functions
 * - React render functions (prefer hooks in most cases)
 *
 * BEHAVIOR: This function performs the exact same checks as checkFeatureFlag(),
 * including version compatibility checks. The only difference is that it returns
 * the result synchronously instead of returning a Promise. This is possible because
 * the current implementation reads from environment variables synchronously.
 *
 * For most use cases, prefer the async checkFeatureFlag() function. Only use
 * this synchronous version when absolutely necessary in synchronous contexts
 * where async/await cannot be used.
 *
 * @param flagName - The name of the feature flag to check
 * @returns Flag status with enabled state and version compatibility
 *
 * @example
 * ```typescript
 * // In a Zustand store getter
 * deriveRoute: () => {
 *   const onboardingGateEnabled = checkFeatureFlagSync('onboarding.gate').enabled;
 *   // Use onboardingGateEnabled for routing logic...
 * }
 * ```
 */
export function checkFeatureFlagSync(flagName: FeatureFlagName): FeatureFlagResult {
  try {
    // Get flag configuration from environment variables
    const config = getFlagConfig(flagName);

    // Parse minimum required version from configuration
    const minVersion = parseVersion(config.minVersion);

    // Compare client version against minimum required version
    // requiresUpdate is true if client version is older than required
    const requiresUpdate = compareVersions(CLIENT_VERSION, minVersion) < 0;

    // Return result with flag status and version compatibility
    return {
      enabled: config.enabled,
      requiresUpdate,
      message: requiresUpdate ? config.message : undefined,
    };
  } catch (error) {
    // On error, fail safe by allowing the operation
    // Log the error for monitoring
    // eslint-disable-next-line no-console
    console.error('[FeatureFlags] Error checking feature flag (sync):', error);

    // Fail-safe: enable feature and don't require update
    // This ensures app remains functional even if flag system fails
    return {
      enabled: true,
      requiresUpdate: false,
    };
  }
}

/**
 * Gets the current client version.
 *
 * @returns Client version object
 */
export function getClientVersion(): ClientVersion {
  return { ...CLIENT_VERSION };
}

// Re-export wardrobe feature flags hook and types
export {
  useWardrobeFeatureFlags,
  prefetchWardrobeFeatureFlags,
  WARDROBE_FEATURE_FLAGS_QUERY_KEY,
  type WardrobeFeatureFlags,
  type UseWardrobeFeatureFlagsResult,
} from './useWardrobeFeatureFlags';
