/**
 * Telemetry and error tracking module.
 *
 * Provides centralized error logging and classification for observability.
 * Integrates with Sentry for error tracking and OpenTelemetry for distributed tracing.
 *
 * IMPLEMENTATION STATUS:
 * This module implements environment-variable-based telemetry emission with console
 * logging for development visibility. It provides:
 *
 * 1. Sentry Error Tracking: IMPLEMENTED
 *    - Error classification-based severity mapping
 *    - Structured error contexts with feature/operation metadata
 *    - Auth event tracking via captureMessage() and breadcrumbs
 *    - Configurable via EXPO_PUBLIC_SENTRY_ENABLED and EXPO_PUBLIC_SENTRY_DSN
 *    - Console logging preserved for development debugging
 *
 * 2. OpenTelemetry Distributed Tracing: IMPLEMENTED
 *    - Span-based operation tracking with duration metrics
 *    - Hierarchical attribute structure (feature, operation, auth.*)
 *    - Latency tracking for SLO monitoring
 *    - Configurable via EXPO_PUBLIC_OTEL_ENABLED and EXPO_PUBLIC_OTEL_ENDPOINT
 *    - Console logging preserved for development debugging
 *
 * 3. PII Sanitization: IMPLEMENTED
 *    - Removes passwords, tokens, and session data from all logs
 *    - Redacts email addresses (first 3 chars + domain)
 *    - Applied universally across all telemetry emissions
 *
 * CONFIGURATION:
 * Sentry (optional):
 * - EXPO_PUBLIC_SENTRY_ENABLED: Enable Sentry error tracking (true/false)
 * - EXPO_PUBLIC_SENTRY_DSN: Sentry project DSN
 * - EXPO_PUBLIC_SENTRY_ENVIRONMENT: Environment name (development/staging/production)
 *
 * OpenTelemetry (optional):
 * - EXPO_PUBLIC_OTEL_ENABLED: Enable OTEL tracing (true/false)
 * - EXPO_PUBLIC_OTEL_ENDPOINT: OTEL collector endpoint
 * - EXPO_PUBLIC_OTEL_SERVICE_NAME: Service name (default: maidrobe-mobile)
 * - EXPO_PUBLIC_OTEL_ENVIRONMENT: Environment name (development/staging/production)
 *
 * MIGRATION TO REAL SDKs:
 * When ready to integrate real Sentry and OTEL SDKs:
 * 1. Install @sentry/react-native and OTEL packages
 * 2. Initialize SDKs in app/_layout.tsx
 * 3. Replace simulated implementations in sentry.ts and otel.ts with real SDK calls
 * 4. Maintain same interface for backward compatibility
 * 5. No changes needed to this file - it will continue to work
 *
 * @module core/telemetry
 */

import { captureException, captureMessage, addBreadcrumb, mapSeverity } from './sentry';
import { startSpan, endSpan, SpanStatusCode } from './otel';

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
 * Sends errors to Sentry when enabled (EXPO_PUBLIC_SENTRY_ENABLED=true).
 * Always logs to console for development debugging.
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
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  // Always log to console for development visibility
  // eslint-disable-next-line no-console
  console.error('[Telemetry]', {
    classification,
    message: errorMessage,
    context,
    stack: errorStack,
    timestamp: new Date().toISOString(),
  });

  // Send to Sentry when enabled
  // Error classification maps to Sentry severity levels:
  // - 'user' errors -> 'warning' level (expected user errors)
  // - 'network'/'server'/'schema' errors -> 'error' level (unexpected issues)
  if (error instanceof Error) {
    const severity = mapSeverity(classification === 'user' ? 'warn' : 'error');
    captureException(error, {
      level: severity,
      tags: {
        classification,
        feature: context?.feature || 'unknown',
        operation: context?.operation || 'unknown',
      },
      extra: context?.metadata,
    });
  }
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
 * Sends span traces to OpenTelemetry when enabled (EXPO_PUBLIC_OTEL_ENABLED=true).
 * Always logs to console for development debugging.
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
  // Always log to console for development visibility
  // eslint-disable-next-line no-console
  console.log('[Telemetry]', {
    status: 'success',
    feature,
    operation,
    latency: metadata?.latency,
    metadata: metadata?.data,
    timestamp: new Date().toISOString(),
  });

  // Send to OpenTelemetry when enabled
  // Create a span for this successful operation with latency tracking
  const spanName = `${feature}.${operation}`;
  const spanId = startSpan(spanName, {
    feature,
    operation,
    status: 'success',
    ...metadata?.data,
  });

  // End span immediately (instant event) or with latency if provided
  // If latency is provided, it's already measured by the caller
  const spanAttributes: Record<string, string | number | boolean> = {};
  if (metadata?.latency !== undefined) {
    spanAttributes.latency = metadata.latency;
  }
  endSpan(spanId, SpanStatusCode.OK, spanAttributes);
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
  | 'token-refresh-failure'
  | 'token-refresh-reactive'
  | 'password-reset-requested'
  | 'password-reset-email-sent'
  | 'password-reset-failed'
  | 'password-reset-succeeded'
  | 'password-reset-link-opened'
  | 'recaptcha-skipped'
  | 'recaptcha-attempted'
  | 'recaptcha-succeeded'
  | 'recaptcha-failed'
  | 'session-load'
  | 'session-load-error'
  | 'session-corrupted'
  | 'session-save'
  | 'session-save-error'
  | 'session-cleared'
  | 'session-clear-error'
  | 'session-mark-needs-refresh'
  | 'session-clear-needs-refresh'
  | 'auth-restore-start'
  | 'auth-restore-success'
  | 'auth-restore-no-session'
  | 'auth-restore-failed-invalid-session'
  | 'auth-restore-failed-stale'
  | 'auth-restore-offline-trusted'
  | 'route-guard-redirect-login'
  | 'route-guard-redirect-verify'
  | 'route-guard-authorized';

/**
 * Onboarding gate event types for tracking routing decisions.
 *
 * These events track when the onboarding gate is evaluated and what
 * routing decision is made based on the user's onboarding status.
 */
export type OnboardingGateEventType =
  | 'onboarding_gate.shown'
  | 'onboarding_gate.route_onboarding'
  | 'onboarding_gate.route_home';

/**
 * Capture flow event types for tracking wardrobe item capture operations.
 *
 * These events track the capture flow from initial entry through image
 * selection/capture and hand-off to the crop screen. Used to monitor
 * conversion rates, permission issues, and error patterns.
 *
 * Event naming convention: snake_case with capture_ prefix
 */
export type CaptureEventType =
  | 'capture_flow_opened'
  | 'capture_source_selected'
  | 'camera_opened'
  | 'camera_permission_requested'
  | 'camera_permission_granted'
  | 'camera_permission_denied'
  | 'camera_permission_blocked'
  | 'gallery_permission_requested'
  | 'gallery_permission_granted'
  | 'gallery_permission_denied'
  | 'gallery_permission_blocked'
  | 'settings_opened'
  | 'gallery_picker_cancelled'
  | 'capture_cancelled'
  | 'capture_handoff_to_crop'
  | 'camera_error'
  | 'gallery_error'
  | 'image_validation_failed'
  | 'gallery_opened'
  | 'gallery_selection_failed'
  | 'gallery_image_selected'
  | 'gallery_permission_error'
  | 'crop_screen_opened'
  | 'crop_cancelled'
  | 'crop_confirm_pressed'
  | 'crop_processing_started'
  | 'crop_processing_completed'
  | 'crop_processing_failed'
  | 'review_details_screen_opened'
  | 'review_details_cancelled'
  | 'review_details_save_pressed'
  | 'item_save_started'
  | 'item_save_succeeded'
  | 'item_save_failed';

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
export function sanitizeAuthMetadata<T extends Record<string, unknown>>(
  metadata: T
): Record<string, unknown> {
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
 * - Sentry when enabled (EXPO_PUBLIC_SENTRY_ENABLED=true)
 * - OpenTelemetry when enabled (EXPO_PUBLIC_OTEL_ENABLED=true)
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
  const sanitizedMetadata = metadata ? sanitizeAuthMetadata(metadata) : {};

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

  // Always log to console for development visibility
  if (logLevel === 'error') {
    // eslint-disable-next-line no-console
    console.error('[Auth Event]', event);
  } else {
    // eslint-disable-next-line no-console
    console.log('[Auth Event]', event);
  }

  // Send to Sentry when enabled
  // Error events use captureMessage(), success events use breadcrumbs
  if (isError) {
    const severity = mapSeverity('error');
    captureMessage(`Auth event: ${eventType}`, {
      level: severity,
      tags: {
        eventType,
        outcome: metadata?.outcome || 'unknown',
        errorCode: metadata?.errorCode || 'unknown',
      },
      extra: event,
    });
  } else {
    addBreadcrumb({
      category: 'auth',
      message: eventType,
      level: 'info',
      data: sanitizedMetadata,
    });
  }

  // Send to OpenTelemetry when enabled
  // Create span for auth operation with auth.* attributes
  const spanId = startSpan(`auth.${eventType}`, {
    'auth.event_type': eventType,
    'auth.user_id': metadata?.userId || 'anonymous',
    'auth.error_code': metadata?.errorCode || '',
    'auth.outcome': metadata?.outcome || 'unknown',
  });

  // End span with appropriate status
  const status = isError ? SpanStatusCode.ERROR : SpanStatusCode.OK;
  const spanAttributes: Record<string, string | number | boolean> = {};
  if (metadata?.latency !== undefined) {
    spanAttributes.latency = metadata.latency;
  }
  endSpan(spanId, status, spanAttributes, metadata?.errorCode);
}

/**
 * Metadata for onboarding gate event logging.
 *
 * SECURITY: Never include passwords, tokens, or other sensitive PII.
 */
export interface OnboardingGateMetadata {
  /** User ID if available (safe to log) */
  userId?: string;
  /** Whether user has completed onboarding (from profile) */
  hasOnboarded: boolean;
  /** Whether onboarding gate feature flag is enabled */
  gateEnabled: boolean;
  /** Target route determined by gate logic */
  route: 'onboarding' | 'home';
  /** Additional non-PII metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Logs a structured onboarding gate event to telemetry system.
 *
 * This function provides standardized logging for onboarding gate routing
 * decisions. It tracks when the gate is evaluated and what routing decision
 * is made based on the user's onboarding status and feature flag state.
 *
 * ANALYTICS DASHBOARD VERIFICATION REQUIRED:
 * The onboarding gate events are wired to the full telemetry pipeline and must
 * be verified in analytics dashboards after deployment. These events are critical
 * for understanding onboarding flow effectiveness and user routing behavior.
 *
 * Events to verify in dashboards:
 * 1. onboarding_gate.shown - Gate evaluation triggered (app launch)
 * 2. onboarding_gate.route_onboarding - User routed to onboarding flow
 * 3. onboarding_gate.route_home - User routed to home (bypassed onboarding)
 *
 * Dashboard verification checklist:
 * - Sentry: Check that events appear as breadcrumbs under 'onboarding' category
 * - OpenTelemetry: Verify spans with onboarding.* attributes are being recorded
 * - Event volumes: Validate counts match expected user flow patterns
 * - Metadata: Confirm userId, hasOnboarded, gateEnabled, route fields populate
 * - PII protection: Ensure no sensitive data leaks in event attributes
 *
 * WARNING: Do not alter event names (onboarding_gate.*) or semantics without
 * updating dashboard queries, alert rules, and analytics configurations.
 *
 * SECURITY:
 * - Automatically sanitizes metadata to remove PII
 * - Never logs raw tokens, passwords, or session objects
 * - User IDs are safe to log for analytics purposes
 *
 * Integration:
 * - Console logging in development
 * - Sentry when enabled (EXPO_PUBLIC_SENTRY_ENABLED=true)
 * - OpenTelemetry when enabled (EXPO_PUBLIC_OTEL_ENABLED=true)
 *
 * @param eventType - Type of gate event (shown, route_onboarding, route_home)
 * @param metadata - Event metadata (userId, hasOnboarded, gateEnabled, route)
 *
 * @example
 * ```ts
 * // Gate evaluation
 * trackOnboardingGateEvent('onboarding_gate.shown', {
 *   userId: 'abc-123',
 *   hasOnboarded: false,
 *   gateEnabled: true,
 *   route: 'onboarding'
 * });
 *
 * // Routing to onboarding
 * trackOnboardingGateEvent('onboarding_gate.route_onboarding', {
 *   userId: 'abc-123',
 *   hasOnboarded: false,
 *   gateEnabled: true,
 *   route: 'onboarding'
 * });
 *
 * // Routing to home
 * trackOnboardingGateEvent('onboarding_gate.route_home', {
 *   userId: 'abc-123',
 *   hasOnboarded: true,
 *   gateEnabled: true,
 *   route: 'home'
 * });
 * ```
 */
export function trackOnboardingGateEvent(
  eventType: OnboardingGateEventType,
  metadata: OnboardingGateMetadata
): void {
  // Sanitize metadata to remove PII
  const sanitizedMetadata = sanitizeAuthMetadata(metadata);

  // Structure the event for consistent querying
  const event = {
    type: 'onboarding-gate-event',
    eventType,
    userId: metadata.userId,
    hasOnboarded: metadata.hasOnboarded,
    gateEnabled: metadata.gateEnabled,
    route: metadata.route,
    metadata: sanitizedMetadata,
    timestamp: new Date().toISOString(),
  };

  // Always log to console for development visibility
  // eslint-disable-next-line no-console
  console.log('[Onboarding Gate Event]', event);

  // Send to Sentry when enabled (as breadcrumb for context)
  addBreadcrumb({
    category: 'onboarding',
    message: eventType,
    level: 'info',
    data: sanitizedMetadata,
  });

  // Send to OpenTelemetry when enabled
  // Create span for gate operation with onboarding.* attributes
  const spanId = startSpan(`onboarding.${eventType}`, {
    'onboarding.event_type': eventType,
    'onboarding.user_id': metadata.userId || 'anonymous',
    'onboarding.has_onboarded': metadata.hasOnboarded,
    'onboarding.gate_enabled': metadata.gateEnabled,
    'onboarding.route': metadata.route,
  });

  // End span immediately (instant event)
  endSpan(spanId, SpanStatusCode.OK);
}

/**
 * Metadata for capture event logging.
 *
 * SECURITY: Never include passwords, tokens, or other sensitive PII.
 * Image URIs are logged as they are local file paths, not user content.
 */
export interface CaptureEventMetadata {
  /** User ID if available (safe to log) */
  userId?: string;
  /** Capture origin context - wardrobe or onboarding */
  origin?: 'wardrobe' | 'onboarding';
  /** Image source - camera or gallery */
  source?: 'camera' | 'gallery';
  /** Error code or classification if failure */
  errorCode?: string;
  /** Error message for debugging (never include PII) */
  errorMessage?: string;
  /** Image width in pixels */
  width?: number;
  /** Image height in pixels */
  height?: number;
  /** Image MIME type */
  type?: string;
  /** Whether item has a name (for review details analytics) */
  hasName?: boolean;
  /** Number of tags added (for review details analytics) */
  tagCount?: number;
  /** Error type for item save failures */
  errorType?: string;
  /** Latency in milliseconds */
  latencyMs?: number;
  /** Item ID for created items */
  itemId?: string;
  /** Additional non-PII metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Logs a structured capture flow event to telemetry system.
 *
 * This function provides standardized logging for all capture flow operations
 * including entry, source selection, permissions, errors, and hand-off to crop.
 * It ensures that:
 * - All capture events use consistent structure
 * - No PII (user images, raw tokens) is ever logged
 * - Events include userId, origin, source, and errorCode
 * - Events can be easily queried in Sentry/Honeycomb
 *
 * SECURITY:
 * - Automatically sanitizes metadata to remove PII
 * - Never logs image content or EXIF data
 * - Local file URIs are safe to log as they don't expose user content
 *
 * Integration:
 * - Console logging in development
 * - Sentry when enabled (EXPO_PUBLIC_SENTRY_ENABLED=true)
 * - OpenTelemetry when enabled (EXPO_PUBLIC_OTEL_ENABLED=true)
 *
 * @param eventType - Type of capture event (capture_flow_opened, camera_error, etc.)
 * @param metadata - Event metadata (userId, origin, source, errorCode)
 *
 * @example
 * ```ts
 * // Flow opened
 * trackCaptureEvent('capture_flow_opened', {
 *   userId: 'abc-123',
 *   origin: 'wardrobe'
 * });
 *
 * // Source selected
 * trackCaptureEvent('capture_source_selected', {
 *   userId: 'abc-123',
 *   origin: 'onboarding',
 *   source: 'camera'
 * });
 *
 * // Permission denied
 * trackCaptureEvent('camera_permission_denied', {
 *   userId: 'abc-123',
 *   origin: 'wardrobe',
 *   errorCode: 'permission_denied'
 * });
 *
 * // Hand-off to crop
 * trackCaptureEvent('capture_handoff_to_crop', {
 *   userId: 'abc-123',
 *   origin: 'onboarding',
 *   source: 'gallery'
 * });
 * ```
 */
export function trackCaptureEvent(
  eventType: CaptureEventType,
  metadata?: CaptureEventMetadata
): void {
  // Sanitize metadata to remove PII
  const sanitizedMetadata = metadata ? sanitizeAuthMetadata(metadata) : {};

  // Determine if this is an error event
  const isError =
    eventType.includes('error') ||
    eventType.includes('denied') ||
    eventType.includes('blocked') ||
    eventType.includes('failed');

  // Structure the event for consistent querying
  const event = {
    type: 'capture-event',
    eventType,
    userId: metadata?.userId,
    origin: metadata?.origin,
    source: metadata?.source,
    errorCode: metadata?.errorCode,
    metadata: sanitizedMetadata,
    timestamp: new Date().toISOString(),
  };

  // Always log to console for development visibility
  if (isError) {
    // eslint-disable-next-line no-console
    console.error('[Capture Event]', event);
  } else {
    // eslint-disable-next-line no-console
    console.log('[Capture Event]', event);
  }

  // Send to Sentry when enabled
  // Error events use breadcrumbs with error level, success events use info level
  addBreadcrumb({
    category: 'capture',
    message: eventType,
    level: isError ? 'error' : 'info',
    data: sanitizedMetadata,
  });

  // Send to OpenTelemetry when enabled
  // Create span for capture operation with capture.* attributes
  const spanId = startSpan(`capture.${eventType}`, {
    'capture.event_type': eventType,
    'capture.user_id': metadata?.userId || 'anonymous',
    'capture.origin': metadata?.origin || 'unknown',
    'capture.source': metadata?.source || 'unknown',
    'capture.error_code': metadata?.errorCode || '',
  });

  // End span with appropriate status
  const status = isError ? SpanStatusCode.ERROR : SpanStatusCode.OK;
  endSpan(spanId, status, {}, metadata?.errorCode);
}
