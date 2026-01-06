/**
 * Profile feature type definitions.
 *
 * This module defines types for profile-related features including:
 * - Calendar integration state and management
 *
 * @module features/profile/types
 */

/**
 * Supported calendar providers.
 */
export type CalendarProvider = 'google' | 'outlook' | 'apple';

/**
 * Database representation of a user's calendar integration.
 *
 * Uses snake_case to match Supabase column names directly.
 */
export interface CalendarIntegrationRow {
  /** Unique identifier */
  id: string;

  /** User who owns this integration (UUID foreign key to auth.users) */
  user_id: string;

  /** Calendar provider (e.g., 'google') */
  provider: CalendarProvider;

  /** Whether the integration is currently connected */
  is_connected: boolean;

  /** Email address associated with the connected account */
  connected_email: string | null;

  /** When the integration was first connected */
  connected_at: string | null;

  /** When the integration was disconnected (if applicable) */
  disconnected_at: string | null;

  /** Last error message if connection failed */
  last_error: string | null;

  /** When the record was created */
  created_at: string;

  /** When the record was last updated */
  updated_at: string;
}

/**
 * Client-side representation of calendar integration state.
 *
 * Transforms database snake_case to camelCase for React components.
 */
export interface CalendarIntegration {
  /** Unique identifier */
  id: string;

  /** User who owns this integration */
  userId: string;

  /** Calendar provider */
  provider: CalendarProvider;

  /** Whether the integration is currently connected */
  isConnected: boolean;

  /** Email address associated with the connected account */
  connectedEmail: string | null;

  /** When the integration was first connected */
  connectedAt: string | null;

  /** When the integration was disconnected (if applicable) */
  disconnectedAt: string | null;

  /** Last error message if connection failed */
  lastError: string | null;

  /** When the record was created */
  createdAt: string;

  /** When the record was last updated */
  updatedAt: string;
}

/**
 * Parameters for creating or updating a calendar integration.
 */
export interface CreateCalendarIntegrationParams {
  /** Calendar provider */
  provider: CalendarProvider;

  /** Whether the integration is connected */
  isConnected: boolean;

  /** Email address of the connected account */
  connectedEmail?: string | null;

  /** Connection error message (if any) */
  lastError?: string | null;
}
