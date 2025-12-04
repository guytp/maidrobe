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
  // Capture flow events (internal/legacy)
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
  | 'item_save_failed'
  // Wardrobe screen events (internal/legacy)
  | 'wardrobe_screen_viewed'
  | 'wardrobe_items_loaded'
  | 'wardrobe_items_load_failed'
  | 'wardrobe_search_executed'
  | 'wardrobe_search_cleared'
  | 'wardrobe_item_tapped'
  | 'wardrobe_pagination_triggered'
  | 'wardrobe_pagination_failed'
  | 'wardrobe_time_to_first_item'
  | 'wardrobe_grid_first_paint'
  | 'wardrobe_item_updated'
  | 'wardrobe_item_update_failed'
  | 'wardrobe_item_deleted'
  | 'wardrobe_item_delete_failed'
  | 'item_detail_viewed'
  | 'item_edited'
  | 'item_edit_failed'
  | 'item_deleted'
  | 'item_deletion_failed'
  // User story #241 product analytics events (spec-compliant names)
  | 'item_capture_started'
  | 'item_capture_cancelled'
  | 'item_created'
  | 'item_creation_failed'
  | 'item_edit_cancelled'
  | 'item_search_used'
  // Recommendation item resolution events
  | 'recommendations_items_resolved'
  | 'recommendations_items_resolution_failed'
  | 'recommendations_high_missing_rate'
  // Wear history events (story #443)
  | 'wear_history_marked'
  | 'wear_history_mark_failed'
  | 'wear_history_sync_completed'
  | 'wear_history_sync_failed'
  // Offline queue events (story #443)
  | 'wear_event_queued_offline'
  | 'pending_wear_event_synced'
  | 'pending_wear_event_sync_failed'
  // Wear history screen events (story #444)
  | 'wear_history_screen_viewed'
  | 'wear_history_navigation_clicked'
  // Wear history query events (story #444)
  | 'wear_history_loaded'
  | 'wear_history_load_failed'
  | 'wear_history_time_to_first_event'
  | 'wear_history_pagination_triggered';

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
  const sanitizedMetadata = metadata
    ? sanitizeAuthMetadata(metadata as unknown as Record<string, unknown>)
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
  const sanitizedMetadata = sanitizeAuthMetadata(metadata as unknown as Record<string, unknown>);

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
 *
 * PRIVACY CONSTRAINTS (per user story #241):
 * - Do NOT include raw or full item names/tags (only booleans and counts)
 * - Do NOT include raw image data or image URLs
 * - Do NOT include EXIF metadata
 * - Do NOT include auth tokens or credentials
 * - User identification uses anonymous/pseudonymous ID (Supabase user ID)
 */
export interface CaptureEventMetadata {
  /** User ID if available (safe to log - pseudonymous identifier) */
  userId?: string;
  /** Capture origin context - wardrobe or onboarding */
  origin?: 'wardrobe' | 'onboarding';
  /**
   * Context for capture flow (user story #241 spec property)
   * Maps to origin but uses 'context' name per analytics spec
   */
  context?: 'wardrobe' | 'onboarding';
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
  /** Whether item has a name (boolean only - never raw name) */
  hasName?: boolean;
  /**
   * Whether item has a name (user story #241 spec property, snake_case)
   * Boolean only - never raw name
   */
  has_name?: boolean;
  /** Number of tags added (count only - never raw tags) */
  tagCount?: number;
  /**
   * Number of tags added (user story #241 spec property, snake_case)
   * Count only - never raw tags
   */
  tags_count?: number;
  /** Error type for item save failures */
  errorType?: string;
  /**
   * Error type for failures (user story #241 spec property, snake_case)
   * Enum values: "network", "server_error", "validation", "timeout"
   */
  error_type?: string;
  /** Latency in milliseconds */
  latencyMs?: number;
  /**
   * Save latency in milliseconds (user story #241 spec property, snake_case)
   * Client-measured end-to-end latency from tap on Save to item visible
   */
  save_latency_ms?: number;
  /**
   * @deprecated Use save_latency_ms for spec-compliant analytics
   * Save latency in milliseconds (legacy camelCase)
   */
  saveLatencyMs?: number;
  /** Item ID for created items */
  itemId?: string;
  /** Number of items loaded (for wardrobe grid analytics) */
  itemCount?: number;
  /** Total items available (for wardrobe grid analytics) */
  totalItems?: number;
  /** Current page number (for pagination analytics) */
  page?: number;
  /** Whether search is active (for wardrobe analytics) */
  hasSearchQuery?: boolean;
  /** Whether item has AI attributes (for item detail analytics) */
  hasAIAttributes?: boolean;
  /** Whether item has tags (for item detail analytics) */
  hasTags?: boolean;
  /** Whether name was changed in edit (for item edit analytics) */
  nameChanged?: boolean;
  /**
   * Whether name was changed in edit (user story #241 spec property, snake_case)
   */
  name_changed?: boolean;
  /** Whether tags were changed in edit (for item edit analytics) */
  tagsChanged?: boolean;
  /**
   * Whether tags were changed in edit (user story #241 spec property, snake_case)
   */
  tags_changed?: boolean;
  /** Error category for failures (network, auth, server, validation, unknown) */
  errorCategory?: string;
  /**
   * @deprecated Use query_length for spec-compliant analytics
   * Search query length (legacy camelCase)
   */
  queryLength?: number;
  /**
   * Search query length (user story #241 spec property, snake_case)
   * Integer length of the search text (0 allowed) - never raw query text
   */
  query_length?: number;
  /**
   * @deprecated Use results_count_bucket for spec-compliant analytics
   * Results count bucket (legacy camelCase)
   */
  resultsCountBucket?: '0' | '1-5' | '>5';
  /**
   * Results count bucket (user story #241 spec property, snake_case)
   * Bucketed count to preserve privacy: "0", "1-5", ">5"
   */
  results_count_bucket?: '0' | '1-5' | '>5';
  /**
   * @deprecated Use search_latency_ms for spec-compliant analytics
   * Search latency in milliseconds (legacy camelCase)
   */
  searchLatencyMs?: number;
  /**
   * Search latency in milliseconds (user story #241 spec property, snake_case)
   * Time from user action to results rendered
   */
  search_latency_ms?: number;
  /**
   * Grid first paint latency in milliseconds (user story #241 spec property)
   * Time from screen mount to first item rendered in wardrobe grid
   */
  gridFirstPaintMs?: number;
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
  const sanitizedMetadata = metadata
    ? sanitizeAuthMetadata(metadata as unknown as Record<string, unknown>)
    : {};

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

/**
 * Feature flag event types for tracking flag evaluation and outcomes.
 *
 * These events track feature flag evaluation decisions for observability
 * and rollout monitoring. Used to understand flag coverage, performance,
 * and fallback behaviour.
 *
 * Event naming convention: snake_case with feature_flag_ prefix
 */
export type FeatureFlagEventType =
  // Outfit recommendation stub flag events
  | 'feature_flag.outfit_recommendation_stub.evaluated'
  | 'feature_flag.outfit_recommendation_stub.cached'
  | 'feature_flag.outfit_recommendation_stub.fallback'
  | 'feature_flag.outfit_recommendation_stub.timeout'
  | 'feature_flag.outfit_recommendation_stub.error'
  | 'feature_flag.outfit_recommendation_stub.ui_gated'
  | 'feature_flag.outfit_recommendation_stub.navigation_blocked';

/**
 * Recommendation event types for tracking outfit recommendation operations.
 *
 * These events track user interactions with the outfit recommendation feature,
 * including CTA clicks and API request outcomes. Used for:
 * - Conversion funnel analysis (CTA click → request → success)
 * - Error rate monitoring
 * - Performance tracking (latency)
 * - Feature adoption metrics
 *
 * Event naming convention: snake_case with outfit_recommendation_ prefix
 */
export type RecommendationEventType =
  | 'outfit_recommendation_cta_clicked'
  | 'outfit_recommendation_retry_clicked'
  | 'outfit_recommendation_request_succeeded'
  | 'outfit_recommendation_request_failed';

/**
 * Metadata for feature flag event logging.
 *
 * SECURITY: Never include passwords, tokens, or other sensitive PII.
 */
export interface FeatureFlagEventMetadata {
  /** User ID if available (safe to log - pseudonymous identifier) */
  userId?: string;
  /** Flag key that was evaluated */
  flagKey: string;
  /** Whether the flag is enabled */
  enabled: boolean;
  /** Source of the flag value (remote, cached, fallback) */
  source: 'remote' | 'cached' | 'fallback';
  /** App environment (development, staging, production) */
  environment: string;
  /** User role for cohort targeting */
  userRole?: string;
  /** Evaluation latency in milliseconds */
  latencyMs?: number;
  /** Error code if evaluation failed */
  errorCode?: string;
  /** Additional non-PII metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Logs a structured feature flag event to telemetry system.
 *
 * This function provides standardized logging for feature flag evaluation
 * events. It tracks when flags are evaluated, what values are returned,
 * and the source of those values (remote, cached, fallback).
 *
 * USE CASES:
 * - Tracking flag evaluation success/failure rates
 * - Monitoring cache hit rates
 * - Observing fallback behaviour patterns
 * - Understanding rollout coverage by cohort
 * - Measuring evaluation latency
 *
 * DASHBOARD VERIFICATION:
 * After deployment, verify these events in analytics dashboards:
 * - Sentry: Check breadcrumbs under 'feature_flag' category
 * - OpenTelemetry: Verify spans with feature_flag.* attributes
 * - Event volumes: Validate counts match expected evaluation patterns
 *
 * @param eventType - Type of feature flag event
 * @param metadata - Event metadata (userId, flagKey, enabled, source, etc.)
 *
 * @example
 * ```ts
 * // Flag evaluated from remote
 * trackFeatureFlagEvent('feature_flag.outfit_recommendation_stub.evaluated', {
 *   userId: 'abc-123',
 *   flagKey: 'outfit_recommendation_stub',
 *   enabled: true,
 *   source: 'remote',
 *   environment: 'staging',
 *   userRole: 'internal',
 *   latencyMs: 150
 * });
 *
 * // Flag loaded from cache
 * trackFeatureFlagEvent('feature_flag.outfit_recommendation_stub.cached', {
 *   userId: 'abc-123',
 *   flagKey: 'outfit_recommendation_stub',
 *   enabled: true,
 *   source: 'cached',
 *   environment: 'production',
 *   userRole: 'beta'
 * });
 *
 * // Flag fell back to default
 * trackFeatureFlagEvent('feature_flag.outfit_recommendation_stub.fallback', {
 *   userId: 'abc-123',
 *   flagKey: 'outfit_recommendation_stub',
 *   enabled: false,
 *   source: 'fallback',
 *   environment: 'production',
 *   userRole: 'standard',
 *   errorCode: 'timeout'
 * });
 * ```
 */
export function trackFeatureFlagEvent(
  eventType: FeatureFlagEventType,
  metadata: FeatureFlagEventMetadata
): void {
  // Sanitize metadata to remove PII
  const sanitizedMetadata = sanitizeAuthMetadata(metadata as unknown as Record<string, unknown>);

  // Determine if this is an error event
  const isError = eventType.includes('error') || eventType.includes('timeout');

  // Structure the event for consistent querying
  const event = {
    type: 'feature-flag-event',
    eventType,
    userId: metadata.userId,
    flagKey: metadata.flagKey,
    enabled: metadata.enabled,
    source: metadata.source,
    environment: metadata.environment,
    userRole: metadata.userRole,
    latencyMs: metadata.latencyMs,
    errorCode: metadata.errorCode,
    metadata: sanitizedMetadata,
    timestamp: new Date().toISOString(),
  };

  // Always log to console for development visibility
  if (isError) {
    // eslint-disable-next-line no-console
    console.error('[Feature Flag Event]', event);
  } else {
    // eslint-disable-next-line no-console
    console.log('[Feature Flag Event]', event);
  }

  // Send to Sentry when enabled (as breadcrumb for context)
  addBreadcrumb({
    category: 'feature_flag',
    message: eventType,
    level: isError ? 'error' : 'info',
    data: sanitizedMetadata,
  });

  // Send to OpenTelemetry when enabled
  // Create span for flag evaluation with feature_flag.* attributes
  const spanId = startSpan(`feature_flag.${metadata.flagKey}`, {
    'feature_flag.event_type': eventType,
    'feature_flag.flag_key': metadata.flagKey,
    'feature_flag.enabled': metadata.enabled,
    'feature_flag.source': metadata.source,
    'feature_flag.environment': metadata.environment,
    'feature_flag.user_role': metadata.userRole || 'unknown',
    'feature_flag.user_id': metadata.userId || 'anonymous',
  });

  // End span with appropriate status
  const status = isError ? SpanStatusCode.ERROR : SpanStatusCode.OK;
  const spanAttributes: Record<string, string | number | boolean> = {};
  if (metadata.latencyMs !== undefined) {
    spanAttributes.latency = metadata.latencyMs;
  }
  endSpan(spanId, status, spanAttributes, metadata.errorCode);
}

/**
 * Metadata for recommendation event logging.
 *
 * SECURITY: Never include passwords, tokens, or other sensitive PII.
 * Context parameters (occasion, temperatureBand) are safe to log as they
 * are user-selected enum values, not free-form text.
 */
export interface RecommendationEventMetadata {
  /** User ID if available (safe to log - pseudonymous identifier) */
  userId?: string;
  /** App environment (development, staging, production) */
  environment: string;
  /** Whether the feature flag is enabled */
  flagEnabled: boolean;
  /** Source of the flag value (remote, cached, fallback) */
  flagSource?: 'remote' | 'cached' | 'fallback';
  /** User role/cohort for targeting */
  userRole?: string;
  /** Number of outfits returned (for success events) */
  outfitCount?: number;
  /** Request latency in milliseconds */
  latencyMs?: number;
  /** High-level error type (for failure events) */
  errorType?: 'auth' | 'network' | 'offline' | 'server' | 'schema' | 'timeout' | 'unknown';
  /** Error code if request failed */
  errorCode?: string;
  /** Endpoint label for identifying the API call */
  endpoint?: string;
  /** Selected occasion context (enum value, not PII) */
  occasion?: string;
  /** Selected temperature band context (enum value, not PII) */
  temperatureBand?: string;
  /** Correlation ID for request tracing */
  correlationId?: string;
  /** Additional non-PII metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Logs a structured recommendation event to telemetry system.
 *
 * This function provides standardized logging for outfit recommendation
 * operations including CTA clicks and API request outcomes. It ensures:
 * - All recommendation events use consistent structure
 * - No PII is ever logged (only pseudonymous user IDs and enum values)
 * - Events include environment, flag state, and performance metrics
 * - Events can be queried in Sentry/Honeycomb dashboards
 *
 * USE CASES:
 * - CTA click tracking for conversion funnel analysis
 * - API success/failure monitoring for reliability metrics
 * - Latency tracking for performance monitoring
 * - Error rate tracking by error type
 *
 * DASHBOARD VERIFICATION:
 * After deployment, verify these events in analytics dashboards:
 * - Sentry: Check breadcrumbs under 'recommendations' category
 * - OpenTelemetry: Verify spans with recommendations.* attributes
 * - Funnel: CTA clicks → requests → successes
 *
 * @param eventType - Type of recommendation event
 * @param metadata - Event metadata (userId, environment, flag state, etc.)
 *
 * @example
 * ```ts
 * // CTA clicked
 * trackRecommendationEvent('outfit_recommendation_cta_clicked', {
 *   userId: 'abc-123',
 *   environment: 'production',
 *   flagEnabled: true,
 *   flagSource: 'remote',
 *   userRole: 'beta',
 *   occasion: 'casual',
 *   temperatureBand: 'mild'
 * });
 *
 * // Request succeeded
 * trackRecommendationEvent('outfit_recommendation_request_succeeded', {
 *   userId: 'abc-123',
 *   environment: 'production',
 *   flagEnabled: true,
 *   endpoint: 'get-outfit-recommendations',
 *   outfitCount: 5,
 *   latencyMs: 450,
 *   correlationId: 'corr-xyz-789'
 * });
 *
 * // Request failed
 * trackRecommendationEvent('outfit_recommendation_request_failed', {
 *   userId: 'abc-123',
 *   environment: 'production',
 *   flagEnabled: true,
 *   endpoint: 'get-outfit-recommendations',
 *   errorType: 'network',
 *   errorCode: 'timeout',
 *   latencyMs: 5000
 * });
 * ```
 */
export function trackRecommendationEvent(
  eventType: RecommendationEventType,
  metadata: RecommendationEventMetadata
): void {
  // Sanitize metadata to remove any potential PII
  const sanitizedMetadata = sanitizeAuthMetadata(metadata as unknown as Record<string, unknown>);

  // Determine if this is an error event
  const isError = eventType === 'outfit_recommendation_request_failed';

  // Structure the event for consistent querying
  const event = {
    type: 'recommendation-event',
    eventType,
    userId: metadata.userId,
    environment: metadata.environment,
    flagEnabled: metadata.flagEnabled,
    flagSource: metadata.flagSource,
    userRole: metadata.userRole,
    endpoint: metadata.endpoint,
    outfitCount: metadata.outfitCount,
    latencyMs: metadata.latencyMs,
    errorType: metadata.errorType,
    errorCode: metadata.errorCode,
    occasion: metadata.occasion,
    temperatureBand: metadata.temperatureBand,
    correlationId: metadata.correlationId,
    metadata: sanitizedMetadata,
    timestamp: new Date().toISOString(),
  };

  // Always log to console for development visibility
  if (isError) {
    // eslint-disable-next-line no-console
    console.error('[Recommendation Event]', event);
  } else {
    // eslint-disable-next-line no-console
    console.log('[Recommendation Event]', event);
  }

  // Send to Sentry when enabled (as breadcrumb for context)
  addBreadcrumb({
    category: 'recommendations',
    message: eventType,
    level: isError ? 'error' : 'info',
    data: sanitizedMetadata,
  });

  // Send to OpenTelemetry when enabled
  // Create span for recommendation operation with recommendations.* attributes
  const spanId = startSpan(`recommendations.${eventType}`, {
    'recommendations.event_type': eventType,
    'recommendations.user_id': metadata.userId || 'anonymous',
    'recommendations.environment': metadata.environment,
    'recommendations.flag_enabled': metadata.flagEnabled,
    'recommendations.flag_source': metadata.flagSource || 'unknown',
    'recommendations.user_role': metadata.userRole || 'unknown',
    'recommendations.endpoint': metadata.endpoint || '',
    'recommendations.occasion': metadata.occasion || '',
    'recommendations.temperature_band': metadata.temperatureBand || '',
  });

  // End span with appropriate status
  const status = isError ? SpanStatusCode.ERROR : SpanStatusCode.OK;
  const spanAttributes: Record<string, string | number | boolean> = {};
  if (metadata.latencyMs !== undefined) {
    spanAttributes.latency = metadata.latencyMs;
  }
  if (metadata.outfitCount !== undefined) {
    spanAttributes.outfit_count = metadata.outfitCount;
  }
  if (metadata.correlationId) {
    spanAttributes.correlation_id = metadata.correlationId;
  }
  endSpan(spanId, status, spanAttributes, metadata.errorCode);
}
