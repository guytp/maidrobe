/**
 * Telemetry and error tracking module.
 *
 * Provides centralized error logging and classification for observability.
 * Currently logs to console; designed to integrate with Sentry and other
 * telemetry services in the future.
 */

/**
 * Error classification types based on error origin and responsibility.
 *
 * - user: Client-side errors caused by user actions (validation, auth)
 * - network: Network connectivity issues (offline, timeout, DNS)
 * - server: Backend/API errors (5xx, edge function failures)
 * - schema: Data validation/parsing errors (unexpected response format)
 */
export type ErrorClassification = 'user' | 'network' | 'server' | 'schema';

/**
 * Context information for error logging.
 */
export interface ErrorContext {
  /** Feature or module where error occurred */
  feature?: string;
  /** Specific operation being performed */
  operation?: string;
  /** Additional metadata for debugging */
  metadata?: Record<string, unknown>;
}

/**
 * Maps error classification to user-friendly message suitable for display.
 *
 * Converts technical error classifications into clear, actionable messages
 * that end users can understand without technical knowledge.
 *
 * @param classification - The error classification type
 * @returns User-friendly error message with actionable guidance
 *
 * @example
 * ```ts
 * const classification = classifyError(error);
 * const message = getUserFriendlyMessage(classification);
 * // message: "Unable to connect. Please check your internet connection."
 * ```
 */
export function getUserFriendlyMessage(classification: ErrorClassification): string {
  switch (classification) {
    case 'network':
      return 'Unable to connect. Please check your internet connection.';
    case 'server':
      return 'Service temporarily unavailable. Please try again later.';
    case 'schema':
      return 'Received unexpected response. Please contact support if this persists.';
    case 'user':
      return 'Invalid request. Please check your input and try again.';
  }
}

/**
 * Logs an error with classification and context to telemetry system.
 *
 * In production, this would send errors to Sentry or similar service.
 * Currently logs to console for development purposes.
 *
 * @param error - The error object to log
 * @param classification - Error type classification
 * @param context - Additional context about where/why error occurred
 *
 * @example
 * ```ts
 * try {
 *   await apiCall();
 * } catch (error) {
 *   logError(error, 'network', {
 *     feature: 'healthcheck',
 *     operation: 'fetch',
 *   });
 * }
 * ```
 */
export function logError(
  error: unknown,
  classification: ErrorClassification,
  context?: ErrorContext
): void {
  // TODO: Integrate with Sentry when SENTRY_DSN is configured
  // For now, log to console with structured format for debugging

  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  // eslint-disable-next-line no-console
  console.error('[Telemetry]', {
    classification,
    message: errorMessage,
    context,
    stack: errorStack,
    timestamp: new Date().toISOString(),
  });

  // Future: Send to Sentry
  // if (process.env.EXPO_PUBLIC_SENTRY_DSN) {
  //   Sentry.captureException(error, {
  //     level: classification === 'user' ? 'warning' : 'error',
  //     tags: { classification },
  //     contexts: { details: context },
  //   });
  // }
}

/**
 * Metadata for success event logging.
 */
export interface SuccessMetadata {
  /** Request latency in milliseconds */
  latency?: number;
  /** Additional non-PII metadata for observability */
  data?: Record<string, unknown>;
}

/**
 * Logs a success event with metadata to telemetry system.
 *
 * In production, this would send events to observability platform (Honeycomb, etc.).
 * Currently logs to console for development purposes with structured format.
 *
 * Use this for logging successful operations with performance metrics and
 * relevant metadata to support SLO tracking and observability.
 *
 * @param feature - Feature or module where operation succeeded
 * @param operation - Specific operation that completed successfully
 * @param metadata - Optional metadata including latency and additional data
 *
 * @example
 * ```ts
 * logSuccess('auth', 'signup', {
 *   latency: 250,
 *   data: { userId: 'abc-123', emailVerified: false }
 * });
 * ```
 */
export function logSuccess(feature: string, operation: string, metadata?: SuccessMetadata): void {
  // TODO: Integrate with OpenTelemetry/Honeycomb when configured
  // For now, log to console with structured format for debugging

  // eslint-disable-next-line no-console
  console.log('[Telemetry]', {
    status: 'success',
    feature,
    operation,
    latency: metadata?.latency,
    metadata: metadata?.data,
    timestamp: new Date().toISOString(),
  });

  // Future: Send to OpenTelemetry
  // if (process.env.EXPO_PUBLIC_OTEL_ENDPOINT) {
  //   tracer.startSpan(operation, {
  //     attributes: {
  //       'feature': feature,
  //       'status': 'success',
  //       'latency': metadata?.latency,
  //       ...metadata?.data,
  //     },
  //   }).end();
  // }
}

/**
 * Auth event types for structured authentication logging.
 */
export type AuthEventType =
  | 'login-success'
  | 'login-failure'
  | 'logout-success'
  | 'logout-failure'
  | 'logout-forced'
  | 'token-refresh-success'
  | 'token-refresh-failure';

/**
 * Metadata for authentication event logging.
 *
 * SECURITY: Never include passwords, tokens, or other sensitive PII.
 * Email addresses should be redacted or omitted entirely.
 */
export interface AuthEventMetadata {
  /** User ID if available (safe to log) */
  userId?: string;
  /** Error code or classification if failure */
  errorCode?: string;
  /** Operation outcome (success/failure/forced) */
  outcome?: string;
  /** Request latency in milliseconds */
  latency?: number;
  /** Additional non-PII metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Sanitizes authentication metadata to remove any PII.
 *
 * This function ensures that sensitive information is never logged to
 * telemetry systems. It filters out known PII fields and redacts email
 * addresses if present.
 *
 * SECURITY:
 * - Removes: password, token, session, refresh_token, access_token
 * - Redacts: email to first 3 chars + domain
 * - Preserves: userId, errorCode, outcome, latency
 *
 * @param metadata - Raw metadata that may contain PII
 * @returns Sanitized metadata safe for logging
 *
 * @example
 * ```ts
 * const raw = { userId: '123', email: 'user@example.com', password: 'secret' };
 * const safe = sanitizeAuthMetadata(raw);
 * // { userId: '123', email: 'use***@example.com' }
 * ```
 */
export function sanitizeAuthMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  // List of PII fields to exclude
  const excludeFields = [
    'password',
    'token',
    'session',
    'refresh_token',
    'access_token',
    'accessToken',
    'refreshToken',
  ];

  for (const [key, value] of Object.entries(metadata)) {
    // Skip excluded PII fields
    if (excludeFields.includes(key)) {
      continue;
    }

    // Redact email addresses
    if (key === 'email' && typeof value === 'string') {
      const emailParts = value.split('@');
      if (emailParts.length === 2) {
        const localPart = emailParts[0];
        const domain = emailParts[1];
        const redacted = localPart.substring(0, 3) + '***@' + domain;
        sanitized[key] = redacted;
      }
      continue;
    }

    // Include safe fields
    sanitized[key] = value;
  }

  return sanitized;
}

/**
 * Logs a structured authentication event to telemetry system.
 *
 * This function provides standardized logging for all authentication-related
 * operations including login, logout, and token refresh. It ensures that:
 * - All auth events use consistent structure
 * - No PII (passwords, tokens) is ever logged
 * - Events include userId, errorCode, outcome, and latency
 * - Events can be easily queried in Sentry/Honeycomb
 *
 * SECURITY:
 * - Automatically sanitizes metadata to remove PII
 * - Never logs raw tokens, passwords, or session objects
 * - Email addresses are redacted if present
 *
 * Integration:
 * - Console logging in development
 * - Sentry in production (when SENTRY_DSN configured)
 * - OpenTelemetry/Honeycomb (when OTEL_ENDPOINT configured)
 *
 * @param eventType - Type of auth event (login-success, logout-forced, etc.)
 * @param metadata - Event metadata (userId, errorCode, outcome, latency)
 *
 * @example
 * ```ts
 * // Login success
 * logAuthEvent('login-success', {
 *   userId: 'abc-123',
 *   outcome: 'success',
 *   latency: 250
 * });
 *
 * // Token refresh failure
 * logAuthEvent('token-refresh-failure', {
 *   userId: 'abc-123',
 *   errorCode: 'invalid_grant',
 *   outcome: 'failure',
 *   latency: 100
 * });
 *
 * // Forced logout
 * logAuthEvent('logout-forced', {
 *   userId: 'abc-123',
 *   outcome: 'forced',
 *   metadata: { reason: 'session_expired' }
 * });
 * ```
 */
export function logAuthEvent(eventType: AuthEventType, metadata?: AuthEventMetadata): void {
  // Sanitize metadata to remove PII
  const sanitizedMetadata = metadata
    ? sanitizeAuthMetadata(metadata as Record<string, unknown>)
    : {};

  // Determine log level based on event type
  const isError = eventType.includes('failure') || eventType.includes('forced');
  const logLevel = isError ? 'error' : 'info';

  // Structure the event for consistent querying
  const event = {
    type: 'auth-event',
    eventType,
    userId: metadata?.userId,
    errorCode: metadata?.errorCode,
    outcome: metadata?.outcome,
    latency: metadata?.latency,
    metadata: sanitizedMetadata,
    timestamp: new Date().toISOString(),
  };

  // Log to console with appropriate level
  if (logLevel === 'error') {
    // eslint-disable-next-line no-console
    console.error('[Auth Event]', event);
  } else {
    // eslint-disable-next-line no-console
    console.log('[Auth Event]', event);
  }

  // Future: Send to Sentry
  // if (process.env.EXPO_PUBLIC_SENTRY_DSN) {
  //   if (isError) {
  //     Sentry.captureMessage(`Auth event: ${eventType}`, {
  //       level: 'error',
  //       tags: { eventType, outcome: metadata?.outcome },
  //       contexts: { auth: event },
  //     });
  //   } else {
  //     Sentry.addBreadcrumb({
  //       category: 'auth',
  //       message: eventType,
  //       level: 'info',
  //       data: event,
  //     });
  //   }
  // }

  // Future: Send to OpenTelemetry
  // if (process.env.EXPO_PUBLIC_OTEL_ENDPOINT) {
  //   tracer.startSpan(eventType, {
  //     attributes: {
  //       'auth.event_type': eventType,
  //       'auth.user_id': metadata?.userId,
  //       'auth.error_code': metadata?.errorCode,
  //       'auth.outcome': metadata?.outcome,
  //       'auth.latency': metadata?.latency,
  //     },
  //   }).end();
  // }
}
