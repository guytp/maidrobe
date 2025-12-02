/**
 * Structured logging module for Supabase Edge Functions.
 *
 * This module provides consistent, structured JSON logging across all Edge Functions
 * with support for correlation IDs and environment tagging.
 *
 * ARCHITECTURE:
 * - All logs are JSON-formatted for easy parsing by log aggregation tools
 * - Correlation IDs enable end-to-end request tracing from mobile client to backend
 * - Environment tagging supports log filtering and dashboard separation
 *
 * CORRELATION ID PROPAGATION:
 * - Mobile client generates a correlation ID (UUID v4) for each operation
 * - Correlation ID is passed via X-Correlation-ID header
 * - All logs for a single operation share the same correlation ID
 * - If no correlation ID is provided, a new one is generated server-side
 *
 * PRIVACY REQUIREMENTS:
 * - NEVER log user content (images, item names, descriptions)
 * - NEVER log authentication tokens or secrets
 * - ONLY log operational metadata (IDs, timestamps, durations, error codes)
 * - User IDs may be logged for operational purposes (required for debugging)
 *
 * ENVIRONMENT CONFIGURATION:
 * - ENVIRONMENT: 'development' | 'staging' | 'production' (default: 'development')
 *
 * @module _shared/structuredLogger
 */

/**
 * Valid log levels for structured logging.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Environment names for log tagging.
 */
export type Environment = 'development' | 'staging' | 'production';

/**
 * Base fields present in all log entries.
 */
export interface BaseLogEntry {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Log level */
  level: LogLevel;
  /** Event name for filtering/grouping */
  event: string;
  /** Correlation ID for request tracing */
  correlation_id: string;
  /** Environment name */
  environment: Environment;
  /** Function name that emitted the log */
  function_name: string;
}

/**
 * Extended log entry with optional operational metadata.
 *
 * These fields are all considered safe to log from a privacy perspective.
 */
export interface LogEntry extends BaseLogEntry {
  /** User ID (safe to log for operational purposes) */
  user_id?: string;
  /** Item ID being processed */
  item_id?: string;
  /** Job ID for async processing */
  job_id?: number;
  /** Operation duration in milliseconds */
  duration_ms?: number;
  /** Error code for categorization */
  error_code?: string;
  /** Error category for grouping */
  error_category?: string;
  /** Error message (sanitized, no PII) */
  error_message?: string;
  /** HTTP status code */
  status_code?: number;
  /** Whether operation was skipped (e.g., feature flag OFF) */
  skipped?: boolean;
  /** Reason for skipping */
  skip_reason?: string;
  /** Feature flag states at time of execution */
  feature_flags?: Record<string, boolean>;
  /** Additional safe metadata */
  metadata?: Record<string, string | number | boolean | null>;
}

/**
 * Configuration for the structured logger.
 */
export interface LoggerConfig {
  /** Function name for log attribution */
  functionName: string;
  /** Correlation ID for request tracing */
  correlationId: string;
  /** Environment name */
  environment: Environment;
}

/**
 * Extracts correlation ID from request headers.
 *
 * Looks for the X-Correlation-ID header and returns its value.
 * Returns undefined if the header is not present.
 *
 * @param request - The incoming HTTP request
 * @returns The correlation ID from headers, or undefined
 */
export function extractCorrelationId(request: Request): string | undefined {
  return request.headers.get('X-Correlation-ID') ?? undefined;
}

/**
 * Generates a new correlation ID.
 *
 * Uses crypto.randomUUID() for UUID v4 generation.
 * This is used when no correlation ID is provided by the client.
 *
 * @returns A new UUID v4 correlation ID
 */
export function generateCorrelationId(): string {
  return crypto.randomUUID();
}

/**
 * Gets the correlation ID from request or generates a new one.
 *
 * @param request - The incoming HTTP request
 * @returns The correlation ID (from request or newly generated)
 */
export function getOrGenerateCorrelationId(request: Request): string {
  return extractCorrelationId(request) ?? generateCorrelationId();
}

/**
 * Gets the current environment from environment variables.
 *
 * Reads the ENVIRONMENT variable and validates it.
 * Defaults to 'development' if not set or invalid.
 *
 * @returns The current environment name
 */
export function getEnvironment(): Environment {
  const env = Deno.env.get('ENVIRONMENT');

  if (env === 'production' || env === 'staging' || env === 'development') {
    return env;
  }

  // Default to development for safety
  return 'development';
}

/**
 * Creates a structured logger instance for a specific function.
 *
 * The logger maintains correlation ID and environment across all log calls,
 * ensuring consistent tracing and filtering.
 *
 * USAGE:
 * ```typescript
 * const correlationId = getOrGenerateCorrelationId(request);
 * const logger = createLogger('process-item-image', correlationId);
 *
 * logger.info('processing_started', { item_id: itemId, user_id: userId });
 *
 * try {
 *   // ... processing logic
 *   logger.info('processing_completed', { item_id: itemId, duration_ms: elapsed });
 * } catch (error) {
 *   logger.error('processing_failed', {
 *     item_id: itemId,
 *     error_code: 'PROCESSING_ERROR',
 *     error_message: error.message,
 *   });
 * }
 * ```
 *
 * @param functionName - Name of the Edge Function
 * @param correlationId - Correlation ID for request tracing
 * @param environment - Optional environment override (defaults to env var)
 * @returns A logger instance with bound configuration
 */
export function createLogger(
  functionName: string,
  correlationId: string,
  environment?: Environment
): StructuredLogger {
  const config: LoggerConfig = {
    functionName,
    correlationId,
    environment: environment ?? getEnvironment(),
  };

  return new StructuredLogger(config);
}

/**
 * Structured logger class for consistent JSON logging.
 *
 * Provides methods for each log level with automatic inclusion of
 * correlation ID, environment, and function name.
 */
export class StructuredLogger {
  private readonly config: LoggerConfig;

  constructor(config: LoggerConfig) {
    this.config = config;
  }

  /**
   * Gets the correlation ID for this logger instance.
   */
  get correlationId(): string {
    return this.config.correlationId;
  }

  /**
   * Gets the environment for this logger instance.
   */
  get environment(): Environment {
    return this.config.environment;
  }

  /**
   * Gets the function name for this logger instance.
   */
  get functionName(): string {
    return this.config.functionName;
  }

  /**
   * Logs a debug-level message.
   *
   * Use for detailed diagnostic information during development.
   * May be filtered out in production log aggregation.
   */
  debug(event: string, data?: Partial<Omit<LogEntry, keyof BaseLogEntry>>): void {
    this.log('debug', event, data);
  }

  /**
   * Logs an info-level message.
   *
   * Use for normal operational events (request received, processing started, etc.).
   */
  info(event: string, data?: Partial<Omit<LogEntry, keyof BaseLogEntry>>): void {
    this.log('info', event, data);
  }

  /**
   * Logs a warn-level message.
   *
   * Use for unexpected but recoverable situations (retries, fallbacks, etc.).
   */
  warn(event: string, data?: Partial<Omit<LogEntry, keyof BaseLogEntry>>): void {
    this.log('warn', event, data);
  }

  /**
   * Logs an error-level message.
   *
   * Use for errors that affect request processing or indicate system issues.
   */
  error(event: string, data?: Partial<Omit<LogEntry, keyof BaseLogEntry>>): void {
    this.log('error', event, data);
  }

  /**
   * Internal logging implementation.
   *
   * Constructs the full log entry and outputs to console.
   * Console methods are used intentionally for Edge Function observability.
   */
  private log(
    level: LogLevel,
    event: string,
    data?: Partial<Omit<LogEntry, keyof BaseLogEntry>>
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      correlation_id: this.config.correlationId,
      environment: this.config.environment,
      function_name: this.config.functionName,
      ...data,
    };

    const message = JSON.stringify(entry);
    const prefix = `[${this.config.functionName}]`;

    // Console logging is intentional for Edge Function observability
    switch (level) {
      case 'debug':
        // eslint-disable-next-line no-console
        console.debug(prefix, message);
        break;
      case 'info':
        // eslint-disable-next-line no-console
        console.log(prefix, message);
        break;
      case 'warn':
        // eslint-disable-next-line no-console
        console.warn(prefix, message);
        break;
      case 'error':
        // eslint-disable-next-line no-console
        console.error(prefix, message);
        break;
    }
  }
}

/**
 * Creates a child logger with additional context.
 *
 * Useful for adding item-specific or job-specific context to logs
 * without repeating the same fields on every log call.
 *
 * USAGE:
 * ```typescript
 * const logger = createLogger('process-item-image', correlationId);
 * const itemLogger = withContext(logger, { item_id: itemId, user_id: userId });
 *
 * itemLogger.info('processing_started');
 * // ... logs include item_id and user_id automatically
 * itemLogger.info('processing_completed', { duration_ms: elapsed });
 * ```
 *
 * @param logger - Parent logger instance
 * @param context - Additional context to include in all logs
 * @returns A new logger that includes the context in all log calls
 */
export function withContext(
  logger: StructuredLogger,
  context: Partial<Omit<LogEntry, keyof BaseLogEntry>>
): ContextualLogger {
  return new ContextualLogger(logger, context);
}

/**
 * Logger wrapper that adds consistent context to all log calls.
 */
export class ContextualLogger {
  private readonly logger: StructuredLogger;
  private readonly context: Partial<Omit<LogEntry, keyof BaseLogEntry>>;

  constructor(logger: StructuredLogger, context: Partial<Omit<LogEntry, keyof BaseLogEntry>>) {
    this.logger = logger;
    this.context = context;
  }

  /**
   * Gets the correlation ID from the underlying logger.
   */
  get correlationId(): string {
    return this.logger.correlationId;
  }

  debug(event: string, data?: Partial<Omit<LogEntry, keyof BaseLogEntry>>): void {
    this.logger.debug(event, { ...this.context, ...data });
  }

  info(event: string, data?: Partial<Omit<LogEntry, keyof BaseLogEntry>>): void {
    this.logger.info(event, { ...this.context, ...data });
  }

  warn(event: string, data?: Partial<Omit<LogEntry, keyof BaseLogEntry>>): void {
    this.logger.warn(event, { ...this.context, ...data });
  }

  error(event: string, data?: Partial<Omit<LogEntry, keyof BaseLogEntry>>): void {
    this.logger.error(event, { ...this.context, ...data });
  }
}
