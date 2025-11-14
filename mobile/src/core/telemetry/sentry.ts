/**
 * Sentry telemetry module for error tracking and monitoring.
 *
 * IMPLEMENTATION STATUS:
 * This module provides a simulated Sentry client implementation that can be
 * easily replaced with the real Sentry SDK when ready for production.
 *
 * CURRENT APPROACH:
 * - Environment variable based enable/disable (EXPO_PUBLIC_SENTRY_ENABLED)
 * - Console-based logging when enabled for development visibility
 * - Type-safe interfaces matching Sentry SDK structure
 * - No external dependencies (offline-capable)
 *
 * MIGRATION TO REAL SENTRY:
 * When ready to integrate the real Sentry SDK:
 * 1. Install @sentry/react-native package
 * 2. Configure EXPO_PUBLIC_SENTRY_DSN environment variable
 * 3. Initialize Sentry.init() in app/_layout.tsx
 * 4. Replace simulated implementations with real SDK calls
 * 5. Maintain same interface for backward compatibility
 *
 * @module core/telemetry/sentry
 */

/**
 * Sentry severity levels for error categorization.
 */
export type SentrySeverity = 'debug' | 'info' | 'warning' | 'error' | 'fatal';

/**
 * Sentry breadcrumb for tracking user actions and events.
 */
export interface SentryBreadcrumb {
  /** Category of the breadcrumb (e.g., 'auth', 'navigation') */
  category?: string;
  /** Human-readable message */
  message: string;
  /** Severity level */
  level?: SentrySeverity;
  /** Additional structured data */
  data?: Record<string, unknown>;
  /** Timestamp (auto-populated if not provided) */
  timestamp?: number;
}

/**
 * Sentry client configuration.
 */
interface SentryConfig {
  /** Whether Sentry is enabled */
  enabled: boolean;
  /** Sentry DSN (Data Source Name) */
  dsn?: string;
  /** Environment (development, staging, production) */
  environment?: string;
}

/**
 * Loads Sentry configuration from environment variables.
 *
 * Environment Variables:
 * - EXPO_PUBLIC_SENTRY_ENABLED: Enable/disable Sentry (true/false)
 * - EXPO_PUBLIC_SENTRY_DSN: Sentry project DSN
 * - EXPO_PUBLIC_SENTRY_ENVIRONMENT: Environment name
 *
 * @returns Sentry configuration
 */
function getSentryConfig(): SentryConfig {
  const enabled =
    process.env.EXPO_PUBLIC_SENTRY_ENABLED?.toLowerCase() === 'true';
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  const environment = process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT || 'development';

  return {
    enabled,
    dsn,
    environment,
  };
}

/**
 * Sentry client singleton.
 */
let sentryClient: SentryConfig | null = null;

/**
 * Gets or initializes the Sentry client.
 *
 * This function lazily initializes the Sentry configuration on first call.
 * In a real implementation, this would initialize the Sentry SDK.
 *
 * @returns Sentry configuration
 */
export function getSentryClient(): SentryConfig {
  if (sentryClient === null) {
    sentryClient = getSentryConfig();

    if (sentryClient.enabled) {
      // eslint-disable-next-line no-console
      console.log('[Sentry] Initialized', {
        environment: sentryClient.environment,
        dsn: sentryClient.dsn ? '***configured***' : 'not configured',
      });
    }
  }

  return sentryClient;
}

/**
 * Captures an exception and sends it to Sentry.
 *
 * CURRENT IMPLEMENTATION:
 * Logs to console when Sentry is enabled. In production, this would call
 * Sentry.captureException() to send the error to Sentry servers.
 *
 * MIGRATION TO REAL SENTRY:
 * Replace with: Sentry.captureException(error, { tags, extra, level })
 *
 * @param error - The error to capture
 * @param options - Additional context for the error
 * @param options.tags - Tags for categorizing the error
 * @param options.extra - Additional metadata
 * @param options.level - Severity level
 *
 * @example
 * ```typescript
 * captureException(new Error('Login failed'), {
 *   tags: { feature: 'auth', operation: 'login' },
 *   extra: { userId: '123' },
 *   level: 'error',
 * });
 * ```
 */
export function captureException(
  error: Error,
  options?: {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
    level?: SentrySeverity;
  }
): void {
  const client = getSentryClient();

  if (!client.enabled) {
    return;
  }

  // Simulated Sentry error capture
  // In production, this would be: Sentry.captureException(error, options)
  // eslint-disable-next-line no-console
  console.error('[Sentry] Captured exception:', {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    level: options?.level || 'error',
    tags: options?.tags,
    extra: options?.extra,
    environment: client.environment,
  });
}

/**
 * Captures a message and sends it to Sentry.
 *
 * CURRENT IMPLEMENTATION:
 * Logs to console when Sentry is enabled. In production, this would call
 * Sentry.captureMessage() to send the message to Sentry servers.
 *
 * MIGRATION TO REAL SENTRY:
 * Replace with: Sentry.captureMessage(message, { tags, extra, level })
 *
 * @param message - The message to capture
 * @param options - Additional context for the message
 * @param options.tags - Tags for categorizing the message
 * @param options.extra - Additional metadata
 * @param options.level - Severity level
 *
 * @example
 * ```typescript
 * captureMessage('User completed onboarding', {
 *   tags: { feature: 'onboarding' },
 *   level: 'info',
 * });
 * ```
 */
export function captureMessage(
  message: string,
  options?: {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
    level?: SentrySeverity;
  }
): void {
  const client = getSentryClient();

  if (!client.enabled) {
    return;
  }

  // Simulated Sentry message capture
  // In production, this would be: Sentry.captureMessage(message, options)
  // eslint-disable-next-line no-console
  console.log('[Sentry] Captured message:', {
    message,
    level: options?.level || 'info',
    tags: options?.tags,
    extra: options?.extra,
    environment: client.environment,
  });
}

/**
 * Adds a breadcrumb to the Sentry event trail.
 *
 * Breadcrumbs are a trail of events that happened prior to an error.
 * They help understand the context and sequence of actions leading to issues.
 *
 * CURRENT IMPLEMENTATION:
 * Logs to console when Sentry is enabled. In production, this would call
 * Sentry.addBreadcrumb() to add the breadcrumb to the current scope.
 *
 * MIGRATION TO REAL SENTRY:
 * Replace with: Sentry.addBreadcrumb(breadcrumb)
 *
 * @param breadcrumb - The breadcrumb to add
 *
 * @example
 * ```typescript
 * addBreadcrumb({
 *   category: 'auth',
 *   message: 'User initiated login',
 *   level: 'info',
 *   data: { email: 'user@example.com' },
 * });
 * ```
 */
export function addBreadcrumb(breadcrumb: SentryBreadcrumb): void {
  const client = getSentryClient();

  if (!client.enabled) {
    return;
  }

  // Add timestamp if not provided
  const enrichedBreadcrumb = {
    ...breadcrumb,
    timestamp: breadcrumb.timestamp || Date.now() / 1000, // Sentry uses seconds
  };

  // Simulated Sentry breadcrumb
  // In production, this would be: Sentry.addBreadcrumb(enrichedBreadcrumb)
  // eslint-disable-next-line no-console
  console.log('[Sentry] Added breadcrumb:', {
    ...enrichedBreadcrumb,
    environment: client.environment,
  });
}

/**
 * Maps generic severity levels to Sentry severity levels.
 *
 * This mapping ensures consistent severity handling across different
 * telemetry systems (Sentry, OTEL, etc.).
 *
 * @param level - Generic severity level
 * @returns Sentry severity level
 */
export function mapSeverity(level: 'info' | 'warn' | 'error' | 'fatal'): SentrySeverity {
  const mapping: Record<string, SentrySeverity> = {
    info: 'info',
    warn: 'warning',
    error: 'error',
    fatal: 'fatal',
  };

  return mapping[level] || 'error';
}
