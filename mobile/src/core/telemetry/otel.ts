/**
 * OpenTelemetry (OTEL) module for distributed tracing and observability.
 *
 * IMPLEMENTATION STATUS:
 * This module provides a simulated OpenTelemetry implementation that can be
 * easily replaced with the real OTEL SDK when ready for production.
 *
 * CURRENT APPROACH:
 * - Environment variable based enable/disable (EXPO_PUBLIC_OTEL_ENABLED)
 * - Console-based logging when enabled for development visibility
 * - Type-safe interfaces matching OTEL SDK structure
 * - Duration tracking for latency metrics
 * - Hierarchical span support (parent/child relationships)
 * - No external dependencies (offline-capable)
 *
 * MIGRATION TO REAL OTEL:
 * When ready to integrate real OpenTelemetry SDK:
 * 1. Install @opentelemetry/api and @opentelemetry/sdk-trace-base
 * 2. Install trace exporter (e.g., @opentelemetry/exporter-trace-otlp-http)
 * 3. Configure EXPO_PUBLIC_OTEL_ENDPOINT environment variable
 * 4. Initialize TracerProvider in app/_layout.tsx
 * 5. Replace simulated implementations with real SDK calls
 * 6. Maintain same interface for backward compatibility
 *
 * @module core/telemetry/otel
 */

/**
 * Span status code following OpenTelemetry specification.
 */
export enum SpanStatusCode {
  /** The operation completed successfully */
  OK = 'OK',
  /** The operation failed with an error */
  ERROR = 'ERROR',
  /** The status is unset (default) */
  UNSET = 'UNSET',
}

/**
 * Span context for tracking distributed traces.
 */
export interface SpanContext {
  /** Unique identifier for this span */
  spanId: string;
  /** Trace identifier linking related spans */
  traceId: string;
  /** Parent span identifier (if this is a child span) */
  parentSpanId?: string;
}

/**
 * Active span tracking operation timing and metadata.
 */
export interface Span {
  /** Span context (IDs, trace info) */
  context: SpanContext;
  /** Span name/operation */
  name: string;
  /** Start time (milliseconds since epoch) */
  startTime: number;
  /** End time (milliseconds since epoch) */
  endTime?: number;
  /** Status of the span */
  status: {
    code: SpanStatusCode;
    message?: string;
  };
  /** Span attributes (metadata) */
  attributes: Record<string, string | number | boolean>;
}

/**
 * OpenTelemetry configuration.
 */
interface OtelConfig {
  /** Whether OTEL is enabled */
  enabled: boolean;
  /** OTEL collector endpoint */
  endpoint?: string;
  /** Service name for trace identification */
  serviceName: string;
  /** Environment (development, staging, production) */
  environment?: string;
}

/**
 * Loads OTEL configuration from environment variables.
 *
 * Environment Variables:
 * - EXPO_PUBLIC_OTEL_ENABLED: Enable/disable OTEL (true/false)
 * - EXPO_PUBLIC_OTEL_ENDPOINT: OTEL collector endpoint
 * - EXPO_PUBLIC_OTEL_SERVICE_NAME: Service name for traces
 * - EXPO_PUBLIC_OTEL_ENVIRONMENT: Environment name
 *
 * @returns OTEL configuration
 */
function getOtelConfig(): OtelConfig {
  const enabled = process.env.EXPO_PUBLIC_OTEL_ENABLED?.toLowerCase() === 'true';
  const endpoint = process.env.EXPO_PUBLIC_OTEL_ENDPOINT;
  const serviceName = process.env.EXPO_PUBLIC_OTEL_SERVICE_NAME || 'maidrobe-mobile';
  const environment = process.env.EXPO_PUBLIC_OTEL_ENVIRONMENT || 'development';

  return {
    enabled,
    endpoint,
    serviceName,
    environment,
  };
}

/**
 * OTEL client singleton.
 */
let otelClient: OtelConfig | null = null;

/**
 * Active spans map for tracking in-flight operations.
 */
const activeSpans = new Map<string, Span>();

/**
 * Gets or initializes the OTEL client.
 *
 * This function lazily initializes the OTEL configuration on first call.
 * In a real implementation, this would initialize the OTEL TracerProvider.
 *
 * @returns OTEL configuration
 */
export function getTracer(): OtelConfig {
  if (otelClient === null) {
    otelClient = getOtelConfig();

    if (otelClient.enabled) {
      // eslint-disable-next-line no-console
      console.log('[OTEL] Tracer initialized', {
        serviceName: otelClient.serviceName,
        environment: otelClient.environment,
        endpoint: otelClient.endpoint || 'not configured',
      });
    }
  }

  return otelClient;
}

/**
 * Generates a random ID for spans and traces.
 *
 * In production, this would use OTEL SDK's ID generation utilities.
 *
 * @param length - Length of the ID (default: 16)
 * @returns Random hexadecimal ID
 */
function generateId(length: number = 16): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * Starts a new span for tracing an operation.
 *
 * CURRENT IMPLEMENTATION:
 * Creates an in-memory span object and logs to console when OTEL is enabled.
 * In production, this would call tracer.startSpan() to create a real OTEL span.
 *
 * MIGRATION TO REAL OTEL:
 * Replace with:
 * ```typescript
 * const tracer = trace.getTracer(serviceName);
 * const span = tracer.startSpan(name, { attributes, parent });
 * return span;
 * ```
 *
 * @param name - Name of the operation being traced
 * @param attributes - Metadata to attach to the span
 * @param parentSpanId - Optional parent span ID for hierarchical traces
 * @returns Span ID for ending the span later
 *
 * @example
 * ```typescript
 * const spanId = startSpan('auth.login', {
 *   'user.email': 'user@example.com',
 *   'auth.method': 'password',
 * });
 * // ... perform operation ...
 * endSpan(spanId, SpanStatusCode.OK);
 * ```
 */
export function startSpan(
  name: string,
  attributes?: Record<string, string | number | boolean>,
  parentSpanId?: string
): string {
  const tracer = getTracer();

  // Generate unique IDs
  const spanId = generateId(16);
  const traceId = parentSpanId
    ? activeSpans.get(parentSpanId)?.context.traceId || generateId(32)
    : generateId(32);

  const span: Span = {
    context: {
      spanId,
      traceId,
      parentSpanId,
    },
    name,
    startTime: Date.now(),
    status: {
      code: SpanStatusCode.UNSET,
    },
    attributes: attributes || {},
  };

  activeSpans.set(spanId, span);

  if (tracer.enabled) {
    // eslint-disable-next-line no-console
    console.log('[OTEL] Span started:', {
      spanId: span.context.spanId,
      traceId: span.context.traceId,
      parentSpanId: span.context.parentSpanId,
      name: span.name,
      attributes: span.attributes,
      serviceName: tracer.serviceName,
      environment: tracer.environment,
    });
  }

  return spanId;
}

/**
 * Ends an active span and records its completion.
 *
 * CURRENT IMPLEMENTATION:
 * Calculates duration, updates span status, logs to console, and removes from
 * active spans map. In production, this would call span.end() on a real OTEL span.
 *
 * MIGRATION TO REAL OTEL:
 * Replace with:
 * ```typescript
 * span.setStatus({ code: statusCode, message });
 * if (attributes) span.setAttributes(attributes);
 * span.end();
 * ```
 *
 * @param spanId - The span ID returned from startSpan()
 * @param statusCode - Final status of the operation
 * @param attributes - Additional attributes to add before ending
 * @param statusMessage - Optional status message (e.g., error description)
 *
 * @example
 * ```typescript
 * const spanId = startSpan('database.query', { 'db.operation': 'SELECT' });
 * try {
 *   const result = await executeQuery();
 *   endSpan(spanId, SpanStatusCode.OK, { 'db.rows': result.length });
 * } catch (error) {
 *   endSpan(spanId, SpanStatusCode.ERROR, {}, error.message);
 * }
 * ```
 */
export function endSpan(
  spanId: string,
  statusCode: SpanStatusCode,
  attributes?: Record<string, string | number | boolean>,
  statusMessage?: string
): void {
  const tracer = getTracer();
  const span = activeSpans.get(spanId);

  if (!span) {
    if (tracer.enabled) {
      // eslint-disable-next-line no-console
      console.warn('[OTEL] Attempted to end unknown span:', spanId);
    }
    return;
  }

  // Update span with final state
  span.endTime = Date.now();
  span.status = {
    code: statusCode,
    message: statusMessage,
  };

  if (attributes) {
    span.attributes = { ...span.attributes, ...attributes };
  }

  // Calculate duration
  const duration = span.endTime - span.startTime;

  if (tracer.enabled) {
    // eslint-disable-next-line no-console
    console.log('[OTEL] Span ended:', {
      spanId: span.context.spanId,
      traceId: span.context.traceId,
      parentSpanId: span.context.parentSpanId,
      name: span.name,
      duration: `${duration}ms`,
      status: span.status,
      attributes: span.attributes,
      serviceName: tracer.serviceName,
      environment: tracer.environment,
    });
  }

  // Remove from active spans
  activeSpans.delete(spanId);

  // In production, the OTEL SDK would export this span to the collector
}

/**
 * Sets additional attributes on an active span.
 *
 * Useful for adding context that becomes available after the span starts.
 *
 * CURRENT IMPLEMENTATION:
 * Updates the in-memory span object. In production, this would call
 * span.setAttributes() on a real OTEL span.
 *
 * MIGRATION TO REAL OTEL:
 * Replace with: span.setAttributes(attributes)
 *
 * @param spanId - The span ID to update
 * @param attributes - Attributes to add/update
 *
 * @example
 * ```typescript
 * const spanId = startSpan('api.request');
 * // ... perform request ...
 * setSpanAttributes(spanId, { 'http.status_code': 200 });
 * endSpan(spanId, SpanStatusCode.OK);
 * ```
 */
export function setSpanAttributes(
  spanId: string,
  attributes: Record<string, string | number | boolean>
): void {
  const span = activeSpans.get(spanId);

  if (!span) {
    return;
  }

  span.attributes = { ...span.attributes, ...attributes };
}

/**
 * Records an exception within a span context.
 *
 * This associates an error with a specific operation for better debugging.
 *
 * CURRENT IMPLEMENTATION:
 * Logs the exception to console. In production, this would call
 * span.recordException() on a real OTEL span.
 *
 * MIGRATION TO REAL OTEL:
 * Replace with: span.recordException(error, attributes)
 *
 * @param spanId - The span ID to record the exception in
 * @param error - The error to record
 * @param attributes - Additional context about the error
 *
 * @example
 * ```typescript
 * const spanId = startSpan('auth.login');
 * try {
 *   await login();
 * } catch (error) {
 *   recordException(spanId, error, { 'error.handled': true });
 *   endSpan(spanId, SpanStatusCode.ERROR, {}, error.message);
 * }
 * ```
 */
export function recordException(
  spanId: string,
  error: Error,
  attributes?: Record<string, string | number | boolean>
): void {
  const tracer = getTracer();
  const span = activeSpans.get(spanId);

  if (!span || !tracer.enabled) {
    return;
  }

  // eslint-disable-next-line no-console
  console.error('[OTEL] Exception recorded in span:', {
    spanId: span.context.spanId,
    traceId: span.context.traceId,
    name: span.name,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    attributes,
    serviceName: tracer.serviceName,
    environment: tracer.environment,
  });
}
