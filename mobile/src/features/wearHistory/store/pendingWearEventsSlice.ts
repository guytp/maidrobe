/**
 * Zustand slice for managing offline pending wear events queue.
 *
 * Provides persistence to AsyncStorage and atomic operations for:
 * - Adding events to the queue (with deduplication by outfitId+wornDate)
 * - Updating event status during sync attempts
 * - Removing events after successful sync
 * - Pruning stale/failed events
 *
 * @module features/wearHistory/store/pendingWearEventsSlice
 */

import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PendingWearEvent,
  PendingWearEventStatus,
  WearHistorySource,
  MAX_PENDING_WEAR_EVENTS,
  MAX_SYNC_ATTEMPTS,
  STALE_EVENT_AGE_MS,
} from '../types';

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generate a UUID v4-like string for local IDs.
 *
 * Uses crypto.getRandomValues for secure random numbers when available,
 * falls back to Math.random for older environments.
 *
 * Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 */
function generateLocalId(): string {
  const hexChars = '0123456789abcdef';

  // Get 16 random bytes
  let randomBytes: number[];
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    randomBytes = Array.from(arr);
  } else {
    // Fallback for environments without crypto
    randomBytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  }

  // Set version (4) and variant (8, 9, a, or b)
  randomBytes[6] = (randomBytes[6] & 0x0f) | 0x40; // version 4
  randomBytes[8] = (randomBytes[8] & 0x3f) | 0x80; // variant

  // Convert to hex string with dashes
  const hex = randomBytes.map((b) => hexChars[b >> 4] + hexChars[b & 0x0f]).join('');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ============================================================================
// Types
// ============================================================================

/**
 * Persisted state shape (only the queue array).
 */
interface PendingWearEventsState {
  /** Queue of pending wear events awaiting sync */
  pendingEvents: PendingWearEvent[];
  /** Whether the state has been hydrated from AsyncStorage */
  isHydrated: boolean;
}

/**
 * Input for adding a new pending wear event.
 */
export interface AddPendingWearEventInput {
  outfitId: string;
  itemIds: string[];
  wornDate: string;
  source: WearHistorySource;
  context?: string;
}

/**
 * Slice interface with state and actions.
 */
export interface PendingWearEventsSlice extends PendingWearEventsState {
  /**
   * Add a new pending wear event to the queue.
   * Deduplicates by (outfitId, wornDate) - replaces existing if found.
   */
  addPendingWearEvent: (input: AddPendingWearEventInput) => string;

  /**
   * Update an existing pending event's status and metadata.
   */
  updatePendingEvent: (
    localId: string,
    updates: Partial<Pick<PendingWearEvent, 'status' | 'attemptCount' | 'lastAttemptAt' | 'lastError'>>
  ) => void;

  /**
   * Mark an event as syncing (increment attempt count, set status).
   */
  markEventSyncing: (localId: string) => void;

  /**
   * Mark an event as failed with error details.
   */
  markEventFailed: (localId: string, error: string) => void;

  /**
   * Remove a pending event from the queue (after successful sync).
   */
  removePendingEvent: (localId: string) => void;

  /**
   * Remove all pending events for a specific outfit+date combination.
   */
  removePendingEventsForOutfitDate: (outfitId: string, wornDate: string) => void;

  /**
   * Get all pending events ready for sync (status === 'pending' or 'failed' with retries left).
   */
  getRetryableEvents: () => PendingWearEvent[];

  /**
   * Get pending events for a specific outfit (for UI indicators).
   */
  getPendingEventsForOutfit: (outfitId: string) => PendingWearEvent[];

  /**
   * Check if an outfit has any pending events (for syncing indicator).
   */
  hasPendingEventsForOutfit: (outfitId: string) => boolean;

  /**
   * Prune stale events (older than STALE_EVENT_AGE_MS) and excess events beyond MAX_PENDING_WEAR_EVENTS.
   */
  pruneStaleEvents: () => void;

  /**
   * Clear all pending events (for logout/testing).
   */
  clearAllPendingEvents: () => void;

  /**
   * Mark hydration as complete.
   */
  setHydrated: (hydrated: boolean) => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: PendingWearEventsState = {
  pendingEvents: [],
  isHydrated: false,
};

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate a single pending event from persisted storage.
 */
function isValidPendingEvent(event: unknown): event is PendingWearEvent {
  if (!event || typeof event !== 'object') return false;

  const e = event as Record<string, unknown>;

  return (
    typeof e.localId === 'string' &&
    typeof e.outfitId === 'string' &&
    Array.isArray(e.itemIds) &&
    e.itemIds.every((id) => typeof id === 'string') &&
    typeof e.wornDate === 'string' &&
    typeof e.source === 'string' &&
    ['ai_recommendation', 'saved_outfit', 'manual_outfit', 'imported'].includes(e.source as string) &&
    typeof e.createdAt === 'string' &&
    typeof e.attemptCount === 'number' &&
    typeof e.status === 'string' &&
    ['pending', 'syncing', 'failed'].includes(e.status as string)
  );
}

/**
 * Validate and sanitize persisted state.
 */
export function validatePersistedPendingEventsState(state: unknown): PendingWearEventsState {
  if (!state || typeof state !== 'object') {
    return initialState;
  }

  const stateObj = state as Record<string, unknown>;

  if (!Array.isArray(stateObj.pendingEvents)) {
    return initialState;
  }

  // Filter to only valid events and reset any 'syncing' status to 'pending'
  // (in case app was killed mid-sync)
  const validEvents = stateObj.pendingEvents
    .filter(isValidPendingEvent)
    .map((event) => ({
      ...event,
      // Reset syncing status to pending on rehydration
      status: event.status === 'syncing' ? ('pending' as PendingWearEventStatus) : event.status,
    }));

  return {
    pendingEvents: validEvents,
    isHydrated: false,
  };
}

// ============================================================================
// Slice Factory
// ============================================================================

/**
 * Create the pending wear events slice with AsyncStorage persistence.
 */
export const createPendingWearEventsSlice = persist<PendingWearEventsSlice>(
  (set, get) => ({
    ...initialState,

    addPendingWearEvent: (input) => {
      const localId = generateLocalId();
      const now = new Date().toISOString();

      const newEvent: PendingWearEvent = {
        localId,
        outfitId: input.outfitId,
        itemIds: input.itemIds,
        wornDate: input.wornDate,
        source: input.source,
        context: input.context,
        createdAt: now,
        attemptCount: 0,
        status: 'pending',
      };

      set((state) => {
        // Deduplicate by (outfitId, wornDate) - remove existing if found
        const filteredEvents = state.pendingEvents.filter(
          (e) => !(e.outfitId === input.outfitId && e.wornDate === input.wornDate)
        );

        // Add new event and enforce max queue size
        let updatedEvents = [...filteredEvents, newEvent];

        // If over limit, remove oldest events first
        if (updatedEvents.length > MAX_PENDING_WEAR_EVENTS) {
          // Sort by createdAt ascending (oldest first), then slice to keep newest
          updatedEvents = updatedEvents
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
            .slice(-MAX_PENDING_WEAR_EVENTS);
        }

        return { pendingEvents: updatedEvents };
      });

      return localId;
    },

    updatePendingEvent: (localId, updates) => {
      set((state) => ({
        pendingEvents: state.pendingEvents.map((event) =>
          event.localId === localId ? { ...event, ...updates } : event
        ),
      }));
    },

    markEventSyncing: (localId) => {
      const now = new Date().toISOString();
      set((state) => ({
        pendingEvents: state.pendingEvents.map((event) =>
          event.localId === localId
            ? {
                ...event,
                status: 'syncing' as PendingWearEventStatus,
                attemptCount: event.attemptCount + 1,
                lastAttemptAt: now,
              }
            : event
        ),
      }));
    },

    markEventFailed: (localId, error) => {
      set((state) => ({
        pendingEvents: state.pendingEvents.map((event) =>
          event.localId === localId
            ? {
                ...event,
                status: 'failed' as PendingWearEventStatus,
                lastError: error,
              }
            : event
        ),
      }));
    },

    removePendingEvent: (localId) => {
      set((state) => ({
        pendingEvents: state.pendingEvents.filter((event) => event.localId !== localId),
      }));
    },

    removePendingEventsForOutfitDate: (outfitId, wornDate) => {
      set((state) => ({
        pendingEvents: state.pendingEvents.filter(
          (event) => !(event.outfitId === outfitId && event.wornDate === wornDate)
        ),
      }));
    },

    getRetryableEvents: () => {
      const { pendingEvents } = get();
      return pendingEvents.filter(
        (event) =>
          event.status === 'pending' ||
          (event.status === 'failed' && event.attemptCount < MAX_SYNC_ATTEMPTS)
      );
    },

    getPendingEventsForOutfit: (outfitId) => {
      const { pendingEvents } = get();
      return pendingEvents.filter((event) => event.outfitId === outfitId);
    },

    hasPendingEventsForOutfit: (outfitId) => {
      const { pendingEvents } = get();
      return pendingEvents.some((event) => event.outfitId === outfitId);
    },

    pruneStaleEvents: () => {
      const now = Date.now();
      set((state) => ({
        pendingEvents: state.pendingEvents.filter((event) => {
          const eventAge = now - new Date(event.createdAt).getTime();
          // Remove if stale OR if permanently failed (max attempts reached)
          if (eventAge > STALE_EVENT_AGE_MS) return false;
          if (event.status === 'failed' && event.attemptCount >= MAX_SYNC_ATTEMPTS) return false;
          return true;
        }),
      }));
    },

    clearAllPendingEvents: () => {
      set({ pendingEvents: [] });
    },

    setHydrated: (hydrated) => {
      set({ isHydrated: hydrated });
    },
  }),
  {
    name: 'maidrobe-pending-wear-events',
    storage: createJSONStorage(() => AsyncStorage),
    version: 1,

    // Only persist the pendingEvents array
    partialize: (state) =>
      ({
        pendingEvents: state.pendingEvents,
      }) as PendingWearEventsSlice,

    // Validate persisted state on rehydration
    migrate: (persistedState: unknown, version: number) => {
      if (version === 1) {
        const validated = validatePersistedPendingEventsState(persistedState);
        return validated as PendingWearEventsSlice;
      }
      return initialState as PendingWearEventsSlice;
    },

    // Mark hydration complete and prune stale events
    onRehydrateStorage: () => (state) => {
      if (state) {
        state.setHydrated(true);
        // Prune stale events on app restart
        state.pruneStaleEvents();
      }
    },
  }
);
