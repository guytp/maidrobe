/**
 * Tests for the pending wear events offline queue slice.
 *
 * This test suite validates the behavior of the pendingWearEventsSlice,
 * including queue operations, deduplication, validation, and state management.
 *
 * @module __tests__/wearHistory/pendingWearEventsSlice.test
 */

import { create } from 'zustand';
import {
  createPendingWearEventsSlice,
  validatePersistedPendingEventsState,
  AddPendingWearEventInput,
  PendingWearEventsSlice,
} from '../../src/features/wearHistory/store/pendingWearEventsSlice';
import { PendingWearEvent } from '../../src/features/wearHistory/types';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

/**
 * Helper to create a fresh store instance for each test.
 * This avoids state leakage between tests.
 */
function createTestStore() {
  return create<PendingWearEventsSlice>()(createPendingWearEventsSlice);
}

/**
 * Helper to create a valid pending event input.
 */
function createEventInput(overrides: Partial<AddPendingWearEventInput> = {}): AddPendingWearEventInput {
  return {
    outfitId: 'outfit-1',
    itemIds: ['item-1', 'item-2'],
    wornDate: '2024-01-15',
    source: 'ai_recommendation',
    context: 'Test context',
    ...overrides,
  };
}

/**
 * Helper to create a valid pending event for validation tests.
 */
function createValidPendingEvent(overrides: Partial<PendingWearEvent> = {}): PendingWearEvent {
  return {
    localId: 'local-123',
    outfitId: 'outfit-1',
    itemIds: ['item-1', 'item-2'],
    wornDate: '2024-01-15',
    source: 'ai_recommendation',
    context: 'Test context',
    createdAt: '2024-01-15T10:00:00.000Z',
    attemptCount: 0,
    status: 'pending',
    ...overrides,
  };
}

describe('pendingWearEventsSlice', () => {
  describe('addPendingWearEvent', () => {
    describe('Basic Queue Operations', () => {
      it('should add a single event to an empty queue', () => {
        const store = createTestStore();
        const input = createEventInput();

        const localId = store.getState().addPendingWearEvent(input);

        expect(localId).toBeDefined();
        expect(typeof localId).toBe('string');
        expect(localId.length).toBeGreaterThan(0);

        const events = store.getState().pendingEvents;
        expect(events).toHaveLength(1);
        expect(events[0].outfitId).toBe(input.outfitId);
        expect(events[0].itemIds).toEqual(input.itemIds);
        expect(events[0].wornDate).toBe(input.wornDate);
        expect(events[0].source).toBe(input.source);
        expect(events[0].context).toBe(input.context);
        expect(events[0].status).toBe('pending');
        expect(events[0].attemptCount).toBe(0);
      });

      it('should add multiple events with different outfitId and wornDate combinations', () => {
        const store = createTestStore();

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-1',
          wornDate: '2024-01-15',
        }));

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-2',
          wornDate: '2024-01-15',
        }));

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-1',
          wornDate: '2024-01-16',
        }));

        const events = store.getState().pendingEvents;
        expect(events).toHaveLength(3);
      });

      it('should generate unique localIds for each event', () => {
        const store = createTestStore();

        const localId1 = store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-1',
          wornDate: '2024-01-15',
        }));

        const localId2 = store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-2',
          wornDate: '2024-01-16',
        }));

        expect(localId1).not.toBe(localId2);
      });

      it('should set createdAt timestamp when adding event', () => {
        const store = createTestStore();
        const beforeAdd = new Date().toISOString();

        store.getState().addPendingWearEvent(createEventInput());

        const afterAdd = new Date().toISOString();
        const event = store.getState().pendingEvents[0];

        expect(event.createdAt).toBeDefined();
        expect(event.createdAt >= beforeAdd).toBe(true);
        expect(event.createdAt <= afterAdd).toBe(true);
      });

      it('should handle event without optional context', () => {
        const store = createTestStore();
        const input = createEventInput({ context: undefined });

        store.getState().addPendingWearEvent(input);

        const event = store.getState().pendingEvents[0];
        expect(event.context).toBeUndefined();
      });
    });

    describe('Deduplication by (outfitId, wornDate)', () => {
      it('should replace existing event when adding duplicate outfitId+wornDate', () => {
        const store = createTestStore();

        // Add first event
        const firstLocalId = store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-1',
          wornDate: '2024-01-15',
          context: 'First context',
        }));

        expect(store.getState().pendingEvents).toHaveLength(1);

        // Add duplicate (same outfitId + wornDate)
        const secondLocalId = store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-1',
          wornDate: '2024-01-15',
          context: 'Updated context',
        }));

        // Should still have only one event
        const events = store.getState().pendingEvents;
        expect(events).toHaveLength(1);

        // Should have the updated context and new localId
        expect(events[0].context).toBe('Updated context');
        expect(events[0].localId).toBe(secondLocalId);
        expect(events[0].localId).not.toBe(firstLocalId);
      });

      it('should not deduplicate events with same outfitId but different wornDate', () => {
        const store = createTestStore();

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-1',
          wornDate: '2024-01-15',
        }));

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-1',
          wornDate: '2024-01-16',
        }));

        const events = store.getState().pendingEvents;
        expect(events).toHaveLength(2);
        expect(events.map(e => e.wornDate)).toContain('2024-01-15');
        expect(events.map(e => e.wornDate)).toContain('2024-01-16');
      });

      it('should not deduplicate events with same wornDate but different outfitId', () => {
        const store = createTestStore();

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-1',
          wornDate: '2024-01-15',
        }));

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-2',
          wornDate: '2024-01-15',
        }));

        const events = store.getState().pendingEvents;
        expect(events).toHaveLength(2);
        expect(events.map(e => e.outfitId)).toContain('outfit-1');
        expect(events.map(e => e.outfitId)).toContain('outfit-2');
      });

      it('should reset status and attemptCount when replacing existing event', () => {
        const store = createTestStore();

        // Add first event
        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-1',
          wornDate: '2024-01-15',
        }));

        // Simulate the event being marked as failed with retries
        store.getState().markEventSyncing(store.getState().pendingEvents[0].localId);
        store.getState().markEventFailed(store.getState().pendingEvents[0].localId, 'Network error');

        // Verify it's in failed state
        expect(store.getState().pendingEvents[0].status).toBe('failed');
        expect(store.getState().pendingEvents[0].attemptCount).toBe(1);

        // Add duplicate - should replace with fresh event
        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-1',
          wornDate: '2024-01-15',
          context: 'Retry context',
        }));

        const event = store.getState().pendingEvents[0];
        expect(event.status).toBe('pending');
        expect(event.attemptCount).toBe(0);
        expect(event.context).toBe('Retry context');
      });

      it('should handle multiple deduplication replacements correctly', () => {
        const store = createTestStore();

        // Add initial event
        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-1',
          wornDate: '2024-01-15',
          context: 'First',
        }));

        // Replace it
        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-1',
          wornDate: '2024-01-15',
          context: 'Second',
        }));

        // Replace it again
        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-1',
          wornDate: '2024-01-15',
          context: 'Third',
        }));

        const events = store.getState().pendingEvents;
        expect(events).toHaveLength(1);
        expect(events[0].context).toBe('Third');
      });

      it('should preserve other events when deduplicating', () => {
        const store = createTestStore();

        // Add multiple events
        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-1',
          wornDate: '2024-01-15',
        }));

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-2',
          wornDate: '2024-01-16',
        }));

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-3',
          wornDate: '2024-01-17',
        }));

        expect(store.getState().pendingEvents).toHaveLength(3);

        // Replace middle event
        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-2',
          wornDate: '2024-01-16',
          context: 'Updated outfit-2',
        }));

        const events = store.getState().pendingEvents;
        expect(events).toHaveLength(3);

        // Verify all events are present with correct data
        const outfit1 = events.find(e => e.outfitId === 'outfit-1');
        const outfit2 = events.find(e => e.outfitId === 'outfit-2');
        const outfit3 = events.find(e => e.outfitId === 'outfit-3');

        expect(outfit1).toBeDefined();
        expect(outfit2).toBeDefined();
        expect(outfit3).toBeDefined();
        expect(outfit2?.context).toBe('Updated outfit-2');
      });
    });

    describe('Different Source Types', () => {
      it('should accept ai_recommendation source', () => {
        const store = createTestStore();
        store.getState().addPendingWearEvent(createEventInput({ source: 'ai_recommendation' }));
        expect(store.getState().pendingEvents[0].source).toBe('ai_recommendation');
      });

      it('should accept saved_outfit source', () => {
        const store = createTestStore();
        store.getState().addPendingWearEvent(createEventInput({ source: 'saved_outfit' }));
        expect(store.getState().pendingEvents[0].source).toBe('saved_outfit');
      });

      it('should accept manual_outfit source', () => {
        const store = createTestStore();
        store.getState().addPendingWearEvent(createEventInput({ source: 'manual_outfit' }));
        expect(store.getState().pendingEvents[0].source).toBe('manual_outfit');
      });

      it('should accept imported source', () => {
        const store = createTestStore();
        store.getState().addPendingWearEvent(createEventInput({ source: 'imported' }));
        expect(store.getState().pendingEvents[0].source).toBe('imported');
      });
    });
  });

  describe('validatePersistedPendingEventsState', () => {
    describe('Valid State', () => {
      it('should accept valid state with pending events', () => {
        const validState = {
          pendingEvents: [createValidPendingEvent()],
        };

        const result = validatePersistedPendingEventsState(validState);

        expect(result.pendingEvents).toHaveLength(1);
        expect(result.pendingEvents[0].outfitId).toBe('outfit-1');
      });

      it('should accept valid state with empty events array', () => {
        const validState = {
          pendingEvents: [],
        };

        const result = validatePersistedPendingEventsState(validState);

        expect(result.pendingEvents).toHaveLength(0);
      });

      it('should accept valid state with multiple events', () => {
        const validState = {
          pendingEvents: [
            createValidPendingEvent({ localId: 'local-1', outfitId: 'outfit-1' }),
            createValidPendingEvent({ localId: 'local-2', outfitId: 'outfit-2' }),
          ],
        };

        const result = validatePersistedPendingEventsState(validState);

        expect(result.pendingEvents).toHaveLength(2);
      });

      it('should reset syncing status to pending on rehydration', () => {
        const validState = {
          pendingEvents: [
            createValidPendingEvent({ status: 'syncing' }),
          ],
        };

        const result = validatePersistedPendingEventsState(validState);

        expect(result.pendingEvents[0].status).toBe('pending');
      });

      it('should preserve pending status on rehydration', () => {
        const validState = {
          pendingEvents: [
            createValidPendingEvent({ status: 'pending' }),
          ],
        };

        const result = validatePersistedPendingEventsState(validState);

        expect(result.pendingEvents[0].status).toBe('pending');
      });

      it('should preserve failed status on rehydration', () => {
        const validState = {
          pendingEvents: [
            createValidPendingEvent({ status: 'failed' }),
          ],
        };

        const result = validatePersistedPendingEventsState(validState);

        expect(result.pendingEvents[0].status).toBe('failed');
      });
    });

    describe('Invalid State Types', () => {
      it('should return initial state for null', () => {
        const result = validatePersistedPendingEventsState(null);

        expect(result).toEqual({
          pendingEvents: [],
          isHydrated: false,
        });
      });

      it('should return initial state for undefined', () => {
        const result = validatePersistedPendingEventsState(undefined);

        expect(result).toEqual({
          pendingEvents: [],
          isHydrated: false,
        });
      });

      it('should return initial state for string', () => {
        const result = validatePersistedPendingEventsState('invalid');

        expect(result).toEqual({
          pendingEvents: [],
          isHydrated: false,
        });
      });

      it('should return initial state for number', () => {
        const result = validatePersistedPendingEventsState(123);

        expect(result).toEqual({
          pendingEvents: [],
          isHydrated: false,
        });
      });

      it('should return initial state for array', () => {
        const result = validatePersistedPendingEventsState([]);

        expect(result).toEqual({
          pendingEvents: [],
          isHydrated: false,
        });
      });

      it('should return initial state for empty object', () => {
        const result = validatePersistedPendingEventsState({});

        expect(result).toEqual({
          pendingEvents: [],
          isHydrated: false,
        });
      });
    });

    describe('Invalid pendingEvents', () => {
      it('should return initial state when pendingEvents is not an array', () => {
        const invalidState = {
          pendingEvents: 'not-an-array',
        };

        const result = validatePersistedPendingEventsState(invalidState);

        expect(result).toEqual({
          pendingEvents: [],
          isHydrated: false,
        });
      });

      it('should filter out events with missing localId', () => {
        const invalidState = {
          pendingEvents: [
            { ...createValidPendingEvent(), localId: undefined },
          ],
        };

        const result = validatePersistedPendingEventsState(invalidState);

        expect(result.pendingEvents).toHaveLength(0);
      });

      it('should filter out events with missing outfitId', () => {
        const invalidState = {
          pendingEvents: [
            { ...createValidPendingEvent(), outfitId: undefined },
          ],
        };

        const result = validatePersistedPendingEventsState(invalidState);

        expect(result.pendingEvents).toHaveLength(0);
      });

      it('should filter out events with invalid source', () => {
        const invalidState = {
          pendingEvents: [
            { ...createValidPendingEvent(), source: 'invalid_source' },
          ],
        };

        const result = validatePersistedPendingEventsState(invalidState);

        expect(result.pendingEvents).toHaveLength(0);
      });

      it('should filter out events with invalid status', () => {
        const invalidState = {
          pendingEvents: [
            { ...createValidPendingEvent(), status: 'invalid_status' },
          ],
        };

        const result = validatePersistedPendingEventsState(invalidState);

        expect(result.pendingEvents).toHaveLength(0);
      });

      it('should filter out events with non-array itemIds', () => {
        const invalidState = {
          pendingEvents: [
            { ...createValidPendingEvent(), itemIds: 'not-an-array' },
          ],
        };

        const result = validatePersistedPendingEventsState(invalidState);

        expect(result.pendingEvents).toHaveLength(0);
      });

      it('should keep valid events and filter out invalid ones', () => {
        const mixedState = {
          pendingEvents: [
            createValidPendingEvent({ localId: 'valid-1' }),
            { ...createValidPendingEvent(), localId: undefined }, // invalid
            createValidPendingEvent({ localId: 'valid-2' }),
          ],
        };

        const result = validatePersistedPendingEventsState(mixedState);

        expect(result.pendingEvents).toHaveLength(2);
        expect(result.pendingEvents.map(e => e.localId)).toEqual(['valid-1', 'valid-2']);
      });
    });
  });

  describe('Queue Helper Methods', () => {
    describe('getPendingEventsForOutfit', () => {
      it('should return events for specific outfit', () => {
        const store = createTestStore();

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-1',
          wornDate: '2024-01-15',
        }));

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-1',
          wornDate: '2024-01-16',
        }));

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-2',
          wornDate: '2024-01-15',
        }));

        const outfit1Events = store.getState().getPendingEventsForOutfit('outfit-1');
        expect(outfit1Events).toHaveLength(2);
        expect(outfit1Events.every(e => e.outfitId === 'outfit-1')).toBe(true);
      });

      it('should return empty array if no events for outfit', () => {
        const store = createTestStore();

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-1',
          wornDate: '2024-01-15',
        }));

        const events = store.getState().getPendingEventsForOutfit('outfit-nonexistent');
        expect(events).toHaveLength(0);
      });
    });

    describe('hasPendingEventsForOutfit', () => {
      it('should return true if outfit has pending events', () => {
        const store = createTestStore();

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-1',
          wornDate: '2024-01-15',
        }));

        expect(store.getState().hasPendingEventsForOutfit('outfit-1')).toBe(true);
      });

      it('should return false if outfit has no pending events', () => {
        const store = createTestStore();

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-1',
          wornDate: '2024-01-15',
        }));

        expect(store.getState().hasPendingEventsForOutfit('outfit-2')).toBe(false);
      });

      it('should return false for empty queue', () => {
        const store = createTestStore();
        expect(store.getState().hasPendingEventsForOutfit('outfit-1')).toBe(false);
      });
    });

    describe('removePendingEvent', () => {
      it('should remove event by localId', () => {
        const store = createTestStore();

        const localId = store.getState().addPendingWearEvent(createEventInput());

        expect(store.getState().pendingEvents).toHaveLength(1);

        store.getState().removePendingEvent(localId);

        expect(store.getState().pendingEvents).toHaveLength(0);
      });

      it('should not affect other events when removing', () => {
        const store = createTestStore();

        const localId1 = store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-1',
          wornDate: '2024-01-15',
        }));

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-2',
          wornDate: '2024-01-16',
        }));

        store.getState().removePendingEvent(localId1);

        const events = store.getState().pendingEvents;
        expect(events).toHaveLength(1);
        expect(events[0].outfitId).toBe('outfit-2');
      });
    });

    describe('removePendingEventsForOutfitDate', () => {
      it('should remove events matching outfitId and wornDate', () => {
        const store = createTestStore();

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-1',
          wornDate: '2024-01-15',
        }));

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-1',
          wornDate: '2024-01-16',
        }));

        store.getState().removePendingEventsForOutfitDate('outfit-1', '2024-01-15');

        const events = store.getState().pendingEvents;
        expect(events).toHaveLength(1);
        expect(events[0].wornDate).toBe('2024-01-16');
      });
    });

    describe('clearAllPendingEvents', () => {
      it('should remove all events from queue', () => {
        const store = createTestStore();

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-1',
          wornDate: '2024-01-15',
        }));

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-2',
          wornDate: '2024-01-16',
        }));

        expect(store.getState().pendingEvents).toHaveLength(2);

        store.getState().clearAllPendingEvents();

        expect(store.getState().pendingEvents).toHaveLength(0);
      });
    });
  });

  describe('Event Status Management', () => {
    describe('markEventSyncing', () => {
      it('should update status to syncing and increment attemptCount', () => {
        const store = createTestStore();

        const localId = store.getState().addPendingWearEvent(createEventInput());

        store.getState().markEventSyncing(localId);

        const event = store.getState().pendingEvents[0];
        expect(event.status).toBe('syncing');
        expect(event.attemptCount).toBe(1);
        expect(event.lastAttemptAt).toBeDefined();
      });

      it('should increment attemptCount on each call', () => {
        const store = createTestStore();

        const localId = store.getState().addPendingWearEvent(createEventInput());

        store.getState().markEventSyncing(localId);
        expect(store.getState().pendingEvents[0].attemptCount).toBe(1);

        // Reset to pending to allow another sync attempt
        store.getState().markEventFailed(localId, 'error');

        store.getState().markEventSyncing(localId);
        expect(store.getState().pendingEvents[0].attemptCount).toBe(2);
      });
    });

    describe('markEventFailed', () => {
      it('should update status to failed and set error', () => {
        const store = createTestStore();

        const localId = store.getState().addPendingWearEvent(createEventInput());
        store.getState().markEventSyncing(localId);
        store.getState().markEventFailed(localId, 'Network timeout');

        const event = store.getState().pendingEvents[0];
        expect(event.status).toBe('failed');
        expect(event.lastError).toBe('Network timeout');
      });
    });
  });
});
