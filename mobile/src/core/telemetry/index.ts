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
