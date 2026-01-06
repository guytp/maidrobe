/**
 * Data access module for calendar integration operations.
 *
 * Provides a clean interface for querying and managing calendar integration
 * state from Supabase. This module encapsulates all database interactions
 * and can be reused by:
 * - Mobile app components (via React Query hooks)
 * - Edge Functions (for sync operations)
 *
 * Features:
 * - RLS-safe queries (filters by user_id)
 * - Consistent error handling with classification
 * - Support for multiple calendar providers
 * - User-centric data access patterns
 *
 * @module features/profile/api/calendarIntegrationRepository
 */

import { supabase } from '../../../services/supabase';
import { logError, logSuccess, type ErrorClassification } from '../../../core/telemetry';
import {
  type CalendarIntegrationRow,
  type CalendarIntegration,
  type CreateCalendarIntegrationParams,
  type CalendarProvider,
} from '../types';

// ============================================================================
// Logging Constants
// ============================================================================

/**
 * Feature name for telemetry logging.
 */
const FEATURE_NAME = 'calendarIntegration';

/**
 * Maps error codes to telemetry ErrorClassification.
 */
function mapErrorCodeToClassification(
  code: 'network' | 'server' | 'auth' | 'validation' | 'unknown'
): ErrorClassification {
  switch (code) {
    case 'network':
      return 'network';
    case 'auth':
    case 'validation':
      return 'user';
    case 'server':
    case 'unknown':
    default:
      return 'server';
  }
}

/**
 * Error thrown when calendar integration operations fail.
 *
 * Includes additional context for error classification and telemetry.
 */
export class CalendarIntegrationError extends Error {
  constructor(
    message: string,
    public readonly code: 'network' | 'server' | 'auth' | 'validation' | 'unknown',
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'CalendarIntegrationError';
  }
}

/**
 * Validates a UUID string format.
 */
function isValidUuid(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Classifies a Supabase error into a user-friendly category.
 */
function classifySupabaseError(error: unknown): 'network' | 'server' | 'auth' | 'unknown' {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Network errors
    if (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('connection') ||
      message.includes('timeout') ||
      message.includes('offline') ||
      message.includes('failed to fetch')
    ) {
      return 'network';
    }

    // Auth errors
    if (
      message.includes('jwt') ||
      message.includes('token') ||
      message.includes('unauthorized') ||
      message.includes('authentication') ||
      message.includes('row level security')
    ) {
      return 'auth';
    }
  }

  // Supabase error with code
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = String((error as { code: unknown }).code);

    // PostgreSQL/Supabase error codes
    if (code.startsWith('22') || code.startsWith('23')) {
      return 'server';
    }
    if (code === 'PGRST301' || code === '401') {
      return 'auth';
    }
  }

  return 'server';
}

/**
 * Transforms database row to client-side representation.
 */
function fromDatabaseRow(row: CalendarIntegrationRow): CalendarIntegration {
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    isConnected: row.is_connected,
    connectedEmail: row.connected_email,
    connectedAt: row.connected_at,
    disconnectedAt: row.disconnected_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Fetches the calendar integration for a specific user and provider.
 *
 * Returns null if no integration exists for the user/provider combination.
 *
 * @param userId - The authenticated user's ID
 * @param provider - The calendar provider (e.g., 'google')
 * @returns The calendar integration or null if not found
 * @throws {CalendarIntegrationError} If the query fails
 *
 * @example
 * ```ts
 * const integration = await getCalendarIntegration(
 *   'user-123',
 *   'google'
 * );
 * if (integration?.isConnected) {
 *   console.log('Connected as:', integration.connectedEmail);
 * }
 * ```
 */
export async function getCalendarIntegration(
  userId: string,
  provider: CalendarProvider
): Promise<CalendarIntegration | null> {
  const startTime = Date.now();

  // Validate required parameters
  if (!userId || !isValidUuid(userId)) {
    throw new CalendarIntegrationError('Invalid user ID', 'validation');
  }

  if (!provider) {
    throw new CalendarIntegrationError('Provider is required', 'validation');
  }

  try {
    // Query the calendar_integrations table
    const { data, error } = await supabase
      .from('calendar_integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', provider)
      .maybeSingle();

    if (error) {
      const errorCode = classifySupabaseError(error);
      const calendarError = new CalendarIntegrationError(
        `Failed to fetch calendar integration: ${error.message}`,
        errorCode,
        error
      );

      logError(calendarError, mapErrorCodeToClassification(errorCode), {
        feature: FEATURE_NAME,
        operation: 'getCalendarIntegration',
        metadata: {
          userId,
          provider,
          errorCode,
          latencyMs: Date.now() - startTime,
        },
      });

      throw calendarError;
    }

    // Return null if no integration found
    if (!data) {
      logSuccess(FEATURE_NAME, 'getCalendarIntegration', {
        latency: Date.now() - startTime,
        data: {
          userId,
          provider,
          found: false,
        },
      });
      return null;
    }

    // Transform and return the integration
    const integration = fromDatabaseRow(data as CalendarIntegrationRow);

    logSuccess(FEATURE_NAME, 'getCalendarIntegration', {
      latency: Date.now() - startTime,
      data: {
        userId,
        provider,
        found: true,
        isConnected: integration.isConnected,
        connectedEmail: integration.connectedEmail,
      },
    });

    return integration;
  } catch (error) {
    // Re-throw CalendarIntegrationError as-is (already logged above)
    if (error instanceof CalendarIntegrationError) {
      throw error;
    }

    // Wrap and log unexpected errors
    const errorCode = classifySupabaseError(error);
    const calendarError = new CalendarIntegrationError(
      error instanceof Error ? error.message : 'An unexpected error occurred',
      errorCode,
      error
    );

    logError(calendarError, mapErrorCodeToClassification(errorCode), {
      feature: FEATURE_NAME,
      operation: 'getCalendarIntegration',
      metadata: {
        userId,
        provider,
        errorCode,
        latencyMs: Date.now() - startTime,
      },
    });

    throw calendarError;
  }
}

/**
 * Creates or updates a calendar integration using the upsert pattern.
 *
 * @param userId - The authenticated user's ID
 * @param provider - The calendar provider
 * @param params - Integration parameters
 * @returns The created or updated integration
 * @throws {CalendarIntegrationError} If the operation fails
 *
 * @example
 * ```ts
 * const integration = await upsertCalendarIntegration(
 *   'user-123',
 *   'google',
 *   {
 *     isConnected: true,
 *     connectedEmail: 'user@gmail.com',
 *   }
 * );
 * ```
 */
export async function upsertCalendarIntegration(
  userId: string,
  provider: CalendarProvider,
  params: CreateCalendarIntegrationParams
): Promise<CalendarIntegration> {
  const startTime = Date.now();

  // Validate required parameters
  if (!userId || !isValidUuid(userId)) {
    throw new CalendarIntegrationError('Invalid user ID', 'validation');
  }

  if (!provider) {
    throw new CalendarIntegrationError('Provider is required', 'validation');
  }

  try {
    // Build the upsert record
    const record = {
      user_id: userId,
      provider,
      is_connected: params.isConnected,
      connected_email: params.connectedEmail ?? null,
      last_error: params.lastError ?? null,
      updated_at: new Date().toISOString(),
    };

    // Perform upsert
    const { data, error } = await supabase
      .from('calendar_integrations')
      .upsert(record, {
        onConflict: 'user_id,provider',
        ignoreDuplicates: false,
      })
      .select('*')
      .single();

    if (error) {
      const errorCode = classifySupabaseError(error);
      const calendarError = new CalendarIntegrationError(
        `Failed to upsert calendar integration: ${error.message}`,
        errorCode,
        error
      );

      logError(calendarError, mapErrorCodeToClassification(errorCode), {
        feature: FEATURE_NAME,
        operation: 'upsertCalendarIntegration',
        metadata: {
          userId,
          provider,
          isConnected: params.isConnected,
          errorCode,
          latencyMs: Date.now() - startTime,
        },
      });

      throw calendarError;
    }

    if (!data) {
      const calendarError = new CalendarIntegrationError(
        'No data returned from upsert operation',
        'server'
      );

      logError(calendarError, 'server', {
        feature: FEATURE_NAME,
        operation: 'upsertCalendarIntegration',
        metadata: {
          userId,
          provider,
          isConnected: params.isConnected,
          latencyMs: Date.now() - startTime,
        },
      });

      throw calendarError;
    }

    // Transform and return the integration
    const integration = fromDatabaseRow(data as CalendarIntegrationRow);

    logSuccess(FEATURE_NAME, 'upsertCalendarIntegration', {
      latency: Date.now() - startTime,
      data: {
        userId,
        provider,
        isConnected: integration.isConnected,
        connectedEmail: integration.connectedEmail,
        integrationId: integration.id,
      },
    });

    return integration;
  } catch (error) {
    // Re-throw CalendarIntegrationError as-is (already logged above)
    if (error instanceof CalendarIntegrationError) {
      throw error;
    }

    // Wrap and log unexpected errors
    const errorCode = classifySupabaseError(error);
    const calendarError = new CalendarIntegrationError(
      error instanceof Error ? error.message : 'An unexpected error occurred',
      errorCode,
      error
    );

    logError(calendarError, mapErrorCodeToClassification(errorCode), {
      feature: FEATURE_NAME,
      operation: 'upsertCalendarIntegration',
      metadata: {
        userId,
        provider,
        errorCode,
        latencyMs: Date.now() - startTime,
      },
    });

    throw calendarError;
  }
}
