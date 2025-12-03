/**
 * Wear History feature type definitions.
 *
 * This module defines types for tracking when users wear outfits, supporting:
 * - Wear event creation and updates (upsert pattern)
 * - Paginated history queries for timeline views
 * - Date range queries for no-repeat window enforcement
 * - Data export for GDPR compliance
 *
 * Types use snake_case to match Supabase column names directly.
 *
 * @module features/wearHistory/types
 */

/**
 * Source of how the wear event was created.
 *
 * Used for analytics and understanding user behavior patterns:
 * - ai_recommendation: Outfit suggested by the AI recommendation engine
 * - saved_outfit: User selected from their saved outfits
 * - manual_outfit: User manually assembled the outfit
 * - imported: Wear event imported from external source (e.g., data migration)
 */
export type WearHistorySource = 'ai_recommendation' | 'saved_outfit' | 'manual_outfit' | 'imported';

/**
 * Database row representation of a wear history event.
 *
 * Uses snake_case to match Supabase column names directly.
 * This is the shape returned by Supabase queries.
 */
export interface WearHistoryRow {
  /** Unique identifier for the wear event (UUID) */
  id: string;

  /** User who owns this wear event (UUID foreign key to auth.users) */
  user_id: string;

  /** Identifier of the outfit that was worn (UUID, no FK - outfits may be ephemeral) */
  outfit_id: string;

  /** Array of item UUIDs that comprised the outfit at wear time */
  item_ids: string[];

  /** User-local calendar date when the outfit was worn (YYYY-MM-DD) */
  worn_date: string;

  /** Precise timestamp when the wear event was recorded (ISO 8601, UTC) */
  worn_at: string;

  /** Free-form description of the occasion (e.g., "client lunch", "office") */
  context: string | null;

  /** Source of the wear event indicating how the outfit was created/selected */
  source: WearHistorySource;

  /** Optional notes for journaling and annotations */
  notes: string | null;

  /** Timestamp when the record was created (ISO 8601, UTC) */
  created_at: string;

  /** Timestamp when the record was last updated (ISO 8601, UTC) */
  updated_at: string;
}

/**
 * Supabase projection string for wear history queries.
 *
 * Projects all fields for full wear history display.
 * Use with supabase.from('wear_history').select(WEAR_HISTORY_PROJECTION).
 */
export const WEAR_HISTORY_PROJECTION =
  'id, user_id, outfit_id, item_ids, worn_date, worn_at, context, source, notes, created_at, updated_at' as const;

/**
 * Payload for creating or updating a wear event.
 *
 * Used with createOrUpdateWearEvent(). The user_id, outfit_id, and worn_date
 * form the unique constraint for upsert behavior.
 */
export interface CreateWearEventPayload {
  /** Array of item UUIDs that comprise the outfit */
  item_ids: string[];

  /** Precise timestamp when marked as worn (defaults to now if not provided) */
  worn_at?: string;

  /** Free-form description of the occasion */
  context?: string | null;

  /** Source of the wear event */
  source: WearHistorySource;

  /** Optional notes for journaling */
  notes?: string | null;
}

/**
 * Parameters for paginated wear history queries.
 */
export interface GetWearHistoryParams {
  /** Maximum number of events to return (default: 20) */
  limit?: number;

  /** Number of events to skip for pagination (default: 0) */
  offset?: number;
}

/**
 * Response from paginated wear history fetch operation.
 */
export interface GetWearHistoryResponse {
  /** Array of wear history events for the current page */
  events: WearHistoryRow[];

  /** Total count of events matching the query (for pagination) */
  total: number;

  /** Whether there are more events to load */
  hasMore: boolean;
}

/**
 * Response from date range wear history query.
 */
export interface GetWearHistoryWindowResponse {
  /** Array of wear history events within the date range */
  events: WearHistoryRow[];
}

/**
 * Default page size for wear history pagination.
 *
 * Matches the default used in wardrobe items for consistency.
 */
export const DEFAULT_WEAR_HISTORY_PAGE_SIZE = 20;

// ============================================================================
// Pending Wear Events (Offline Queue)
// ============================================================================

/**
 * Status of a pending wear event in the offline queue.
 */
export type PendingWearEventStatus = 'pending' | 'syncing' | 'failed';

/**
 * A wear event waiting to be synced to the server.
 *
 * Used for offline-first functionality. Events are queued locally
 * when the device is offline or when server errors occur, then
 * synced when connectivity is restored.
 *
 * The queue is deduplicated by (outfitId, wornDate) - if a user
 * marks the same outfit as worn on the same date multiple times
 * while offline, only the latest event is kept.
 */
export interface PendingWearEvent {
  /** Locally-generated unique ID (UUID) for queue management */
  localId: string;

  /** Outfit ID being marked as worn */
  outfitId: string;

  /** Snapshot of item IDs in the outfit at the time of wear */
  itemIds: string[];

  /** User-local calendar date (YYYY-MM-DD) */
  wornDate: string;

  /** Optional occasion/context description */
  context?: string;

  /** Source indicating how the outfit was selected */
  source: WearHistorySource;

  /** ISO 8601 timestamp when the event was created locally */
  createdAt: string;

  /** Number of sync attempts made */
  attemptCount: number;

  /** Current status of the pending event */
  status: PendingWearEventStatus;

  /** ISO 8601 timestamp of last sync attempt, if any */
  lastAttemptAt?: string;

  /** Error message from last failed attempt, if any */
  lastError?: string;
}

/**
 * Maximum number of events allowed in the pending queue.
 * Older events are pruned when this limit is exceeded.
 */
export const MAX_PENDING_WEAR_EVENTS = 50;

/**
 * Maximum number of sync attempts before an event is considered permanently failed.
 */
export const MAX_SYNC_ATTEMPTS = 3;

/**
 * Age in milliseconds after which stale pending events are pruned (7 days).
 */
export const STALE_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
