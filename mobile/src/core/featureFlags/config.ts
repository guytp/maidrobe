/**
 * Feature flag configuration module.
 *
 * This module provides configuration management for feature flags, reading from
 * environment variables to control feature availability and version requirements.
 * Designed to be easily replaceable with Unleash or other feature flag services.
 *
 * ENVIRONMENT VARIABLES:
 * Feature flag states (default: true if not specified):
 * - EXPO_PUBLIC_FEATURE_AUTH_LOGIN_ENABLED
 * - EXPO_PUBLIC_FEATURE_AUTH_SIGNUP_ENABLED
 * - EXPO_PUBLIC_FEATURE_AUTH_LOGOUT_ENABLED
 * - EXPO_PUBLIC_FEATURE_CAPTURE_CROPSCREEN_ENABLED
 *
 * Minimum required versions (default: 0.0.0 if not specified):
 * - EXPO_PUBLIC_FEATURE_AUTH_LOGIN_MIN_VERSION
 * - EXPO_PUBLIC_FEATURE_AUTH_SIGNUP_MIN_VERSION
 * - EXPO_PUBLIC_FEATURE_AUTH_LOGOUT_MIN_VERSION
 * - EXPO_PUBLIC_FEATURE_CAPTURE_CROPSCREEN_MIN_VERSION
 *
 * Custom update message (default: generic message):
 * - EXPO_PUBLIC_FEATURE_UPDATE_MESSAGE
 *
 * MIGRATION TO UNLEASH:
 * When migrating to Unleash, this module can be replaced with Unleash SDK calls
 * while maintaining the same FlagConfig interface for backward compatibility.
 */

import type { FeatureFlagName } from './index';

/**
 * Feature flag configuration.
 */
export interface FlagConfig {
  /** Whether the feature is enabled */
  enabled: boolean;
  /** Minimum required client version (semver) */
  minVersion: string;
  /** Custom message to display when update is required */
  message?: string;
}

/**
 * Default update message when client version is incompatible.
 */
const DEFAULT_UPDATE_MESSAGE = 'Please update your app to continue.';

/**
 * Parses a boolean environment variable.
 *
 * Handles various string representations of boolean values:
 * - 'true', '1', 'yes' -> true
 * - 'false', '0', 'no' -> false
 * - undefined, empty -> defaultValue
 *
 * @param value - Environment variable value
 * @param defaultValue - Default value if parsing fails
 * @returns Parsed boolean value
 */
function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === '') {
    return defaultValue;
  }

  const normalized = value.toLowerCase().trim();

  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }

  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }

  return defaultValue;
}

/**
 * Gets feature flag configuration from environment variables.
 *
 * This function reads environment variables to determine feature flag state
 * and version requirements. It provides sensible defaults (enabled=true,
 * minVersion='0.0.0') to maintain fail-safe behavior.
 *
 * Environment Variable Naming Convention:
 * - State: EXPO_PUBLIC_FEATURE_{FLAG_NAME}_ENABLED
 * - Version: EXPO_PUBLIC_FEATURE_{FLAG_NAME}_MIN_VERSION
 *
 * Where {FLAG_NAME} is the flag name with dots replaced by underscores and
 * converted to uppercase. For example:
 * - 'auth.login' -> 'AUTH_LOGIN'
 * - 'auth.signup' -> 'AUTH_SIGNUP'
 *
 * @param flagName - The name of the feature flag
 * @returns Flag configuration with enabled state and version requirements
 *
 * @example
 * ```typescript
 * const config = getFlagConfig('auth.login');
 * // config = { enabled: true, minVersion: '0.1.0', message: 'Please update...' }
 * ```
 */
export function getFlagConfig(flagName: FeatureFlagName): FlagConfig {
  // Convert flag name to environment variable format
  // 'auth.login' -> 'AUTH_LOGIN'
  const envPrefix = flagName.toUpperCase().replace(/\./g, '_');

  // Read enabled state (default: true for fail-safe behavior)
  const enabledKey = `EXPO_PUBLIC_FEATURE_${envPrefix}_ENABLED`;
  const enabled = parseBoolean(process.env[enabledKey], true);

  // Read minimum version requirement (default: '0.0.0' - no restriction)
  const versionKey = `EXPO_PUBLIC_FEATURE_${envPrefix}_MIN_VERSION`;
  const minVersion = process.env[versionKey] || '0.0.0';

  // Read custom update message (default: generic message)
  const message = process.env.EXPO_PUBLIC_FEATURE_UPDATE_MESSAGE || DEFAULT_UPDATE_MESSAGE;

  return {
    enabled,
    minVersion,
    message,
  };
}
