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
import {
  PendingWearEvent,
  MAX_PENDING_WEAR_EVENTS,
  MAX_SYNC_ATTEMPTS,
  STALE_EVENT_AGE_MS,
} from '../../src/features/wearHistory/types';

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

    describe('Maximum Queue Size Enforcement', () => {
      it('should keep all events when at exactly MAX_PENDING_WEAR_EVENTS', () => {
        const store = createTestStore();

        // Add exactly MAX events
        for (let i = 0; i < MAX_PENDING_WEAR_EVENTS; i++) {
          store.getState().addPendingWearEvent(createEventInput({
            outfitId: `outfit-${i}`,
            wornDate: `2024-01-${String(i + 1).padStart(2, '0')}`,
          }));
        }

        expect(store.getState().pendingEvents).toHaveLength(MAX_PENDING_WEAR_EVENTS);
      });

      it('should evict oldest event when exceeding MAX_PENDING_WEAR_EVENTS by one', () => {
        const store = createTestStore();

        // Store original toISOString before mocking
        const originalToISOString = Date.prototype.toISOString;
        let mockTime = new Date('2024-01-01T00:00:00.000Z').getTime();

        // Override toISOString for controlled timestamps (use original to avoid recursion)
        jest.spyOn(Date.prototype, 'toISOString').mockImplementation(function (this: Date) {
          return originalToISOString.call(new Date(mockTime));
        });

        // Add MAX events with incrementing timestamps
        for (let i = 0; i < MAX_PENDING_WEAR_EVENTS; i++) {
          mockTime = new Date('2024-01-01T00:00:00.000Z').getTime() + i * 1000; // 1 second apart
          store.getState().addPendingWearEvent(createEventInput({
            outfitId: `outfit-${i}`,
            wornDate: `2024-01-${String(i + 1).padStart(2, '0')}`,
          }));
        }

        expect(store.getState().pendingEvents).toHaveLength(MAX_PENDING_WEAR_EVENTS);

        // The first event should be outfit-0
        const hasOutfit0Before = store.getState().pendingEvents.some(e => e.outfitId === 'outfit-0');
        expect(hasOutfit0Before).toBe(true);

        // Add one more event (the newest)
        mockTime = new Date('2024-01-01T00:00:00.000Z').getTime() + MAX_PENDING_WEAR_EVENTS * 1000;
        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-new',
          wornDate: '2024-12-31',
        }));

        // Should still be at MAX
        expect(store.getState().pendingEvents).toHaveLength(MAX_PENDING_WEAR_EVENTS);

        // The oldest event (outfit-0) should have been evicted
        const hasOutfit0After = store.getState().pendingEvents.some(e => e.outfitId === 'outfit-0');
        expect(hasOutfit0After).toBe(false);

        // The new event should be present
        const hasNewOutfit = store.getState().pendingEvents.some(e => e.outfitId === 'outfit-new');
        expect(hasNewOutfit).toBe(true);

        // Restore Date
        jest.restoreAllMocks();
      });

      it('should never exceed MAX_PENDING_WEAR_EVENTS regardless of how many events are added', () => {
        const store = createTestStore();

        // Add significantly more events than the limit
        const totalEventsToAdd = MAX_PENDING_WEAR_EVENTS + 20;

        for (let i = 0; i < totalEventsToAdd; i++) {
          store.getState().addPendingWearEvent(createEventInput({
            outfitId: `outfit-${i}`,
            wornDate: `2024-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
          }));

          // Verify at each step that we never exceed the limit
          expect(store.getState().pendingEvents.length).toBeLessThanOrEqual(MAX_PENDING_WEAR_EVENTS);
        }

        // Final state should be exactly at the limit
        expect(store.getState().pendingEvents).toHaveLength(MAX_PENDING_WEAR_EVENTS);
      });

      it('should keep newest events and evict oldest based on createdAt timestamp', () => {
        const store = createTestStore();

        // Store original toISOString before mocking
        const originalToISOString = Date.prototype.toISOString;
        const baseTime = new Date('2024-01-01T00:00:00.000Z').getTime();

        // Mock toISOString to return controlled timestamps (use original to avoid recursion)
        let callCount = 0;
        jest.spyOn(Date.prototype, 'toISOString').mockImplementation(function () {
          const timestamp = new Date(baseTime + callCount * 60000); // 1 minute apart
          callCount++;
          return originalToISOString.call(timestamp);
        });

        // Add MAX + 5 events
        const totalEvents = MAX_PENDING_WEAR_EVENTS + 5;
        for (let i = 0; i < totalEvents; i++) {
          store.getState().addPendingWearEvent(createEventInput({
            outfitId: `outfit-${i}`,
            wornDate: `2024-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
          }));
        }

        jest.restoreAllMocks();

        // Should have exactly MAX events
        expect(store.getState().pendingEvents).toHaveLength(MAX_PENDING_WEAR_EVENTS);

        // The first 5 events (outfit-0 through outfit-4) should have been evicted
        for (let i = 0; i < 5; i++) {
          const hasOldEvent = store.getState().pendingEvents.some(e => e.outfitId === `outfit-${i}`);
          expect(hasOldEvent).toBe(false);
        }

        // Events outfit-5 through outfit-(MAX+4) should still be present
        for (let i = 5; i < totalEvents; i++) {
          const hasEvent = store.getState().pendingEvents.some(e => e.outfitId === `outfit-${i}`);
          expect(hasEvent).toBe(true);
        }
      });

      it('should handle eviction correctly when deduplication reduces count before limit check', () => {
        const store = createTestStore();

        // Add MAX-1 events
        for (let i = 0; i < MAX_PENDING_WEAR_EVENTS - 1; i++) {
          store.getState().addPendingWearEvent(createEventInput({
            outfitId: `outfit-${i}`,
            wornDate: `2024-01-${String(i + 1).padStart(2, '0')}`,
          }));
        }

        expect(store.getState().pendingEvents).toHaveLength(MAX_PENDING_WEAR_EVENTS - 1);

        // Add a duplicate (same outfitId + wornDate as outfit-0)
        // This should replace, not add, so count stays at MAX-1
        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-0',
          wornDate: '2024-01-01',
          context: 'Updated context',
        }));

        expect(store.getState().pendingEvents).toHaveLength(MAX_PENDING_WEAR_EVENTS - 1);

        // Add one more new event to reach exactly MAX
        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-new',
          wornDate: '2024-12-31',
        }));

        expect(store.getState().pendingEvents).toHaveLength(MAX_PENDING_WEAR_EVENTS);
      });

      it('should verify MAX_PENDING_WEAR_EVENTS constant value is reasonable', () => {
        // This test documents the expected configuration value
        // If this fails, it indicates the constant has changed and tests may need updating
        expect(MAX_PENDING_WEAR_EVENTS).toBe(50);
        expect(MAX_PENDING_WEAR_EVENTS).toBeGreaterThan(0);
        expect(MAX_PENDING_WEAR_EVENTS).toBeLessThanOrEqual(1000); // Reasonable upper bound
      });

      it('should preserve event data integrity during eviction', () => {
        const store = createTestStore();

        // Store original toISOString before mocking
        const originalToISOString = Date.prototype.toISOString;
        let mockTime = new Date('2024-01-01T00:00:00.000Z').getTime();

        // Mock timestamps for deterministic ordering (use original to avoid recursion)
        jest.spyOn(Date.prototype, 'toISOString').mockImplementation(function () {
          const timestamp = new Date(mockTime);
          mockTime += 1000;
          return originalToISOString.call(timestamp);
        });

        // Add MAX + 1 events with specific data
        for (let i = 0; i <= MAX_PENDING_WEAR_EVENTS; i++) {
          store.getState().addPendingWearEvent(createEventInput({
            outfitId: `outfit-${i}`,
            wornDate: `2024-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
            itemIds: [`item-${i}-a`, `item-${i}-b`],
            context: `Context for outfit ${i}`,
            source: 'ai_recommendation',
          }));
        }

        jest.restoreAllMocks();

        // Verify the remaining events have correct data structure
        const events = store.getState().pendingEvents;
        expect(events).toHaveLength(MAX_PENDING_WEAR_EVENTS);

        // Check a surviving event has all its data intact
        const lastEvent = events.find(e => e.outfitId === `outfit-${MAX_PENDING_WEAR_EVENTS}`);
        expect(lastEvent).toBeDefined();
        expect(lastEvent?.itemIds).toEqual([`item-${MAX_PENDING_WEAR_EVENTS}-a`, `item-${MAX_PENDING_WEAR_EVENTS}-b`]);
        expect(lastEvent?.context).toBe(`Context for outfit ${MAX_PENDING_WEAR_EVENTS}`);
        expect(lastEvent?.source).toBe('ai_recommendation');
        expect(lastEvent?.status).toBe('pending');
        expect(lastEvent?.attemptCount).toBe(0);
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

  describe('Stale Event Pruning', () => {
    describe('pruneStaleEvents', () => {
      it('should remove events older than STALE_EVENT_AGE_MS', () => {
        const store = createTestStore();

        // Store original toISOString before mocking
        const originalToISOString = Date.prototype.toISOString;

        // Create an event with a timestamp 8 days ago (older than 7-day threshold)
        const eightDaysAgo = Date.now() - (8 * 24 * 60 * 60 * 1000);
        jest.spyOn(Date.prototype, 'toISOString').mockImplementation(function () {
          return originalToISOString.call(new Date(eightDaysAgo));
        });

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'stale-outfit',
          wornDate: '2024-01-01',
        }));

        jest.restoreAllMocks();

        expect(store.getState().pendingEvents).toHaveLength(1);

        // Prune stale events
        store.getState().pruneStaleEvents();

        // The stale event should be removed
        expect(store.getState().pendingEvents).toHaveLength(0);
      });

      it('should keep events younger than STALE_EVENT_AGE_MS', () => {
        const store = createTestStore();

        // Store original function before mocking
        const originalToISOString = Date.prototype.toISOString;

        // Create an event with a timestamp 1 day ago (well within 7-day threshold)
        const oneDayAgo = Date.now() - (1 * 24 * 60 * 60 * 1000);
        jest.spyOn(Date.prototype, 'toISOString').mockImplementation(function () {
          return originalToISOString.call(new Date(oneDayAgo));
        });

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'fresh-outfit',
          wornDate: '2024-01-15',
        }));

        jest.restoreAllMocks();

        expect(store.getState().pendingEvents).toHaveLength(1);

        // Prune stale events
        store.getState().pruneStaleEvents();

        // The fresh event should remain
        expect(store.getState().pendingEvents).toHaveLength(1);
        expect(store.getState().pendingEvents[0].outfitId).toBe('fresh-outfit');
      });

      it('should remove stale events regardless of their status', () => {
        const store = createTestStore();

        // Store original function before mocking
        const originalToISOString = Date.prototype.toISOString;

        // Create events with timestamps 10 days ago
        const tenDaysAgo = Date.now() - (10 * 24 * 60 * 60 * 1000);
        jest.spyOn(Date.prototype, 'toISOString').mockImplementation(function () {
          return originalToISOString.call(new Date(tenDaysAgo));
        });

        // Add pending event
        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'stale-pending',
          wornDate: '2024-01-01',
        }));

        // Add syncing event
        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'stale-syncing',
          wornDate: '2024-01-02',
        }));
        const syncingLocalId = store.getState().pendingEvents.find(
          e => e.outfitId === 'stale-syncing'
        )?.localId;
        if (syncingLocalId) {
          store.getState().markEventSyncing(syncingLocalId);
        }

        // Add failed event
        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'stale-failed',
          wornDate: '2024-01-03',
        }));
        const failedLocalId = store.getState().pendingEvents.find(
          e => e.outfitId === 'stale-failed'
        )?.localId;
        if (failedLocalId) {
          store.getState().markEventSyncing(failedLocalId);
          store.getState().markEventFailed(failedLocalId, 'Network error');
        }

        jest.restoreAllMocks();

        expect(store.getState().pendingEvents).toHaveLength(3);

        // Verify we have all three statuses
        const statuses = store.getState().pendingEvents.map(e => e.status);
        expect(statuses).toContain('pending');
        expect(statuses).toContain('syncing');
        expect(statuses).toContain('failed');

        // Prune stale events
        store.getState().pruneStaleEvents();

        // All events should be removed regardless of status
        expect(store.getState().pendingEvents).toHaveLength(0);
      });

      it('should remove events at exactly the staleness threshold', () => {
        const store = createTestStore();

        // Store original toISOString before mocking
        const originalToISOString = Date.prototype.toISOString;

        // Set a fixed "now" time
        const fixedNow = new Date('2024-01-15T12:00:00.000Z').getTime();
        jest.spyOn(Date, 'now').mockReturnValue(fixedNow);

        // Create event at exactly STALE_EVENT_AGE_MS + 1ms ago (just over threshold)
        const justOverThreshold = fixedNow - STALE_EVENT_AGE_MS - 1;
        jest.spyOn(Date.prototype, 'toISOString').mockImplementation(function () {
          return originalToISOString.call(new Date(justOverThreshold));
        });

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'threshold-outfit',
          wornDate: '2024-01-08',
        }));

        // Restore toISOString but keep Date.now mocked
        jest.spyOn(Date.prototype, 'toISOString').mockRestore();

        expect(store.getState().pendingEvents).toHaveLength(1);

        // Prune with the mocked Date.now
        store.getState().pruneStaleEvents();

        // Event just over threshold should be removed
        expect(store.getState().pendingEvents).toHaveLength(0);

        jest.restoreAllMocks();
      });

      it('should keep events just under the staleness threshold', () => {
        const store = createTestStore();

        // Store original function before mocking
        const originalToISOString = Date.prototype.toISOString;

        // Set a fixed "now" time
        const fixedNow = new Date('2024-01-15T12:00:00.000Z').getTime();
        jest.spyOn(Date, 'now').mockReturnValue(fixedNow);

        // Create event at STALE_EVENT_AGE_MS - 1 hour ago (just under threshold)
        const justUnderThreshold = fixedNow - STALE_EVENT_AGE_MS + (60 * 60 * 1000);
        jest.spyOn(Date.prototype, 'toISOString').mockImplementation(function () {
          return originalToISOString.call(new Date(justUnderThreshold));
        });

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'threshold-outfit',
          wornDate: '2024-01-08',
        }));

        // Restore toISOString but keep Date.now mocked
        jest.spyOn(Date.prototype, 'toISOString').mockRestore();

        expect(store.getState().pendingEvents).toHaveLength(1);

        // Prune with the mocked Date.now
        store.getState().pruneStaleEvents();

        // Event just under threshold should remain
        expect(store.getState().pendingEvents).toHaveLength(1);
        expect(store.getState().pendingEvents[0].outfitId).toBe('threshold-outfit');

        jest.restoreAllMocks();
      });

      it('should handle mixed stale and non-stale events correctly', () => {
        const store = createTestStore();

        // Store original function before mocking
        const originalToISOString = Date.prototype.toISOString;

        // Set a fixed "now" time
        const fixedNow = new Date('2024-01-15T12:00:00.000Z').getTime();
        jest.spyOn(Date, 'now').mockReturnValue(fixedNow);

        // Add a stale event (10 days old)
        const tenDaysAgo = fixedNow - (10 * 24 * 60 * 60 * 1000);
        jest.spyOn(Date.prototype, 'toISOString').mockImplementation(function () {
          return originalToISOString.call(new Date(tenDaysAgo));
        });
        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'stale-outfit-1',
          wornDate: '2024-01-05',
        }));

        // Add a fresh event (1 day old)
        const oneDayAgo = fixedNow - (1 * 24 * 60 * 60 * 1000);
        jest.spyOn(Date.prototype, 'toISOString').mockImplementation(function () {
          return originalToISOString.call(new Date(oneDayAgo));
        });
        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'fresh-outfit-1',
          wornDate: '2024-01-14',
        }));

        // Add another stale event (8 days old)
        const eightDaysAgo = fixedNow - (8 * 24 * 60 * 60 * 1000);
        jest.spyOn(Date.prototype, 'toISOString').mockImplementation(function () {
          return originalToISOString.call(new Date(eightDaysAgo));
        });
        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'stale-outfit-2',
          wornDate: '2024-01-07',
        }));

        // Add another fresh event (3 days old)
        const threeDaysAgo = fixedNow - (3 * 24 * 60 * 60 * 1000);
        jest.spyOn(Date.prototype, 'toISOString').mockImplementation(function () {
          return originalToISOString.call(new Date(threeDaysAgo));
        });
        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'fresh-outfit-2',
          wornDate: '2024-01-12',
        }));

        // Restore toISOString but keep Date.now mocked
        jest.spyOn(Date.prototype, 'toISOString').mockRestore();

        expect(store.getState().pendingEvents).toHaveLength(4);

        // Prune stale events
        store.getState().pruneStaleEvents();

        // Only fresh events should remain
        expect(store.getState().pendingEvents).toHaveLength(2);

        const remainingOutfitIds = store.getState().pendingEvents.map(e => e.outfitId);
        expect(remainingOutfitIds).toContain('fresh-outfit-1');
        expect(remainingOutfitIds).toContain('fresh-outfit-2');
        expect(remainingOutfitIds).not.toContain('stale-outfit-1');
        expect(remainingOutfitIds).not.toContain('stale-outfit-2');

        jest.restoreAllMocks();
      });

      it('should handle empty queue gracefully', () => {
        const store = createTestStore();

        expect(store.getState().pendingEvents).toHaveLength(0);

        // Should not throw when pruning empty queue
        expect(() => store.getState().pruneStaleEvents()).not.toThrow();

        expect(store.getState().pendingEvents).toHaveLength(0);
      });

      it('should verify STALE_EVENT_AGE_MS constant value is 7 days', () => {
        // Document the expected staleness threshold
        const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
        expect(STALE_EVENT_AGE_MS).toBe(sevenDaysInMs);
        expect(STALE_EVENT_AGE_MS).toBe(604800000);
      });

      it('should preserve event data integrity for non-stale events after pruning', () => {
        const store = createTestStore();

        // Store original function before mocking
        const originalToISOString = Date.prototype.toISOString;

        // Set a fixed "now" time
        const fixedNow = new Date('2024-01-15T12:00:00.000Z').getTime();
        jest.spyOn(Date, 'now').mockReturnValue(fixedNow);

        // Add a stale event to ensure pruning runs
        const tenDaysAgo = fixedNow - (10 * 24 * 60 * 60 * 1000);
        jest.spyOn(Date.prototype, 'toISOString').mockImplementation(function () {
          return originalToISOString.call(new Date(tenDaysAgo));
        });
        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'stale-outfit',
          wornDate: '2024-01-05',
        }));

        // Add a fresh event with specific data
        const oneDayAgo = fixedNow - (1 * 24 * 60 * 60 * 1000);
        jest.spyOn(Date.prototype, 'toISOString').mockImplementation(function () {
          return originalToISOString.call(new Date(oneDayAgo));
        });
        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'fresh-outfit',
          wornDate: '2024-01-14',
          itemIds: ['item-a', 'item-b', 'item-c'],
          context: 'Special occasion',
          source: 'saved_outfit',
        }));

        // Restore toISOString but keep Date.now mocked
        jest.spyOn(Date.prototype, 'toISOString').mockRestore();

        // Mark the fresh event as syncing then failed to test all data preserved
        const freshEvent = store.getState().pendingEvents.find(
          e => e.outfitId === 'fresh-outfit'
        );
        if (freshEvent) {
          store.getState().markEventSyncing(freshEvent.localId);
          store.getState().markEventFailed(freshEvent.localId, 'Server error');
        }

        expect(store.getState().pendingEvents).toHaveLength(2);

        // Prune stale events
        store.getState().pruneStaleEvents();

        // Only fresh event should remain with all data intact
        expect(store.getState().pendingEvents).toHaveLength(1);

        const remainingEvent = store.getState().pendingEvents[0];
        expect(remainingEvent.outfitId).toBe('fresh-outfit');
        expect(remainingEvent.wornDate).toBe('2024-01-14');
        expect(remainingEvent.itemIds).toEqual(['item-a', 'item-b', 'item-c']);
        expect(remainingEvent.context).toBe('Special occasion');
        expect(remainingEvent.source).toBe('saved_outfit');
        expect(remainingEvent.status).toBe('failed');
        expect(remainingEvent.lastError).toBe('Server error');
        expect(remainingEvent.attemptCount).toBe(1);

        jest.restoreAllMocks();
      });

      it('should use createdAt timestamp for staleness calculation, not wornDate', () => {
        const store = createTestStore();

        // Store original function before mocking
        const originalToISOString = Date.prototype.toISOString;

        // Set a fixed "now" time
        const fixedNow = new Date('2024-01-15T12:00:00.000Z').getTime();
        jest.spyOn(Date, 'now').mockReturnValue(fixedNow);

        // Create an event with a recent createdAt but an old wornDate
        // This simulates marking an old date as worn recently
        const oneDayAgo = fixedNow - (1 * 24 * 60 * 60 * 1000);
        jest.spyOn(Date.prototype, 'toISOString').mockImplementation(function () {
          return originalToISOString.call(new Date(oneDayAgo));
        });
        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'recent-creation-old-worndate',
          wornDate: '2023-06-15', // Very old worn date, but created recently
        }));

        // Restore toISOString but keep Date.now mocked
        jest.spyOn(Date.prototype, 'toISOString').mockRestore();

        expect(store.getState().pendingEvents).toHaveLength(1);

        // Prune stale events
        store.getState().pruneStaleEvents();

        // Event should remain because createdAt is recent, regardless of wornDate
        expect(store.getState().pendingEvents).toHaveLength(1);
        expect(store.getState().pendingEvents[0].outfitId).toBe('recent-creation-old-worndate');

        jest.restoreAllMocks();
      });
    });
  });

  describe('State Rehydration and Migration', () => {
    describe('validatePersistedPendingEventsState Migration', () => {
      it('should preserve all valid event data through migration', () => {
        const originalEvent = createValidPendingEvent({
          localId: 'local-abc-123',
          outfitId: 'outfit-xyz',
          itemIds: ['item-a', 'item-b', 'item-c'],
          wornDate: '2024-03-15',
          source: 'saved_outfit',
          context: 'Business meeting',
          createdAt: '2024-03-15T09:30:00.000Z',
          attemptCount: 2,
          status: 'failed',
          lastAttemptAt: '2024-03-15T10:00:00.000Z',
          lastError: 'Network timeout',
        });

        const persistedState = {
          pendingEvents: [originalEvent],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        expect(result.pendingEvents).toHaveLength(1);
        const migratedEvent = result.pendingEvents[0];

        // Verify all fields are preserved
        expect(migratedEvent.localId).toBe('local-abc-123');
        expect(migratedEvent.outfitId).toBe('outfit-xyz');
        expect(migratedEvent.itemIds).toEqual(['item-a', 'item-b', 'item-c']);
        expect(migratedEvent.wornDate).toBe('2024-03-15');
        expect(migratedEvent.source).toBe('saved_outfit');
        expect(migratedEvent.context).toBe('Business meeting');
        expect(migratedEvent.createdAt).toBe('2024-03-15T09:30:00.000Z');
        expect(migratedEvent.attemptCount).toBe(2);
        expect(migratedEvent.status).toBe('failed');
        expect(migratedEvent.lastAttemptAt).toBe('2024-03-15T10:00:00.000Z');
        expect(migratedEvent.lastError).toBe('Network timeout');
      });

      it('should handle events with extra unknown fields gracefully', () => {
        // Simulate a future schema with additional fields
        const eventWithExtraFields = {
          ...createValidPendingEvent(),
          unknownField: 'some value',
          anotherNewField: 12345,
          nestedObject: { foo: 'bar' },
        };

        const persistedState = {
          pendingEvents: [eventWithExtraFields],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        // Event should still be valid and included
        expect(result.pendingEvents).toHaveLength(1);
        expect(result.pendingEvents[0].outfitId).toBe('outfit-1');
      });

      it('should preserve optional context field when present', () => {
        const eventWithContext = createValidPendingEvent({
          context: 'Special occasion dinner',
        });

        const persistedState = {
          pendingEvents: [eventWithContext],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        expect(result.pendingEvents).toHaveLength(1);
        expect(result.pendingEvents[0].context).toBe('Special occasion dinner');
      });

      it('should handle events without optional context field', () => {
        const eventWithoutContext = createValidPendingEvent();
        delete (eventWithoutContext as unknown as Record<string, unknown>).context;

        const persistedState = {
          pendingEvents: [eventWithoutContext],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        expect(result.pendingEvents).toHaveLength(1);
        expect(result.pendingEvents[0].context).toBeUndefined();
      });

      it('should preserve optional lastAttemptAt field when present', () => {
        const eventWithLastAttempt = createValidPendingEvent({
          lastAttemptAt: '2024-01-15T12:00:00.000Z',
        });

        const persistedState = {
          pendingEvents: [eventWithLastAttempt],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        expect(result.pendingEvents).toHaveLength(1);
        expect(result.pendingEvents[0].lastAttemptAt).toBe('2024-01-15T12:00:00.000Z');
      });

      it('should preserve optional lastError field when present', () => {
        const eventWithLastError = createValidPendingEvent({
          status: 'failed',
          lastError: 'Server returned 500',
        });

        const persistedState = {
          pendingEvents: [eventWithLastError],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        expect(result.pendingEvents).toHaveLength(1);
        expect(result.pendingEvents[0].lastError).toBe('Server returned 500');
      });

      it('should reset syncing status to pending on rehydration', () => {
        const syncingEvent = createValidPendingEvent({
          status: 'syncing',
          attemptCount: 1,
        });

        const persistedState = {
          pendingEvents: [syncingEvent],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        expect(result.pendingEvents).toHaveLength(1);
        expect(result.pendingEvents[0].status).toBe('pending');
        // attemptCount should be preserved
        expect(result.pendingEvents[0].attemptCount).toBe(1);
      });

      it('should preserve pending status on rehydration', () => {
        const pendingEvent = createValidPendingEvent({
          status: 'pending',
        });

        const persistedState = {
          pendingEvents: [pendingEvent],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        expect(result.pendingEvents).toHaveLength(1);
        expect(result.pendingEvents[0].status).toBe('pending');
      });

      it('should preserve failed status on rehydration', () => {
        const failedEvent = createValidPendingEvent({
          status: 'failed',
          attemptCount: 3,
          lastError: 'Max retries exceeded',
        });

        const persistedState = {
          pendingEvents: [failedEvent],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        expect(result.pendingEvents).toHaveLength(1);
        expect(result.pendingEvents[0].status).toBe('failed');
        expect(result.pendingEvents[0].attemptCount).toBe(3);
        expect(result.pendingEvents[0].lastError).toBe('Max retries exceeded');
      });

      it('should handle multiple events with mixed syncing/pending/failed statuses', () => {
        const persistedState = {
          pendingEvents: [
            createValidPendingEvent({ localId: 'event-1', status: 'pending' }),
            createValidPendingEvent({ localId: 'event-2', status: 'syncing' }),
            createValidPendingEvent({ localId: 'event-3', status: 'failed' }),
            createValidPendingEvent({ localId: 'event-4', status: 'syncing' }),
          ],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        expect(result.pendingEvents).toHaveLength(4);

        // Verify status transformations
        const event1 = result.pendingEvents.find(e => e.localId === 'event-1');
        const event2 = result.pendingEvents.find(e => e.localId === 'event-2');
        const event3 = result.pendingEvents.find(e => e.localId === 'event-3');
        const event4 = result.pendingEvents.find(e => e.localId === 'event-4');

        expect(event1?.status).toBe('pending'); // Preserved
        expect(event2?.status).toBe('pending'); // Reset from syncing
        expect(event3?.status).toBe('failed');  // Preserved
        expect(event4?.status).toBe('pending'); // Reset from syncing
      });
    });

    describe('Invalid Event Filtering During Migration', () => {
      it('should filter out events missing localId', () => {
        const invalidEvent = { ...createValidPendingEvent() };
        delete (invalidEvent as Record<string, unknown>).localId;

        const persistedState = {
          pendingEvents: [invalidEvent],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        expect(result.pendingEvents).toHaveLength(0);
      });

      it('should filter out events missing outfitId', () => {
        const invalidEvent = { ...createValidPendingEvent() };
        delete (invalidEvent as Record<string, unknown>).outfitId;

        const persistedState = {
          pendingEvents: [invalidEvent],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        expect(result.pendingEvents).toHaveLength(0);
      });

      it('should filter out events missing itemIds', () => {
        const invalidEvent = { ...createValidPendingEvent() };
        delete (invalidEvent as Record<string, unknown>).itemIds;

        const persistedState = {
          pendingEvents: [invalidEvent],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        expect(result.pendingEvents).toHaveLength(0);
      });

      it('should filter out events missing wornDate', () => {
        const invalidEvent = { ...createValidPendingEvent() };
        delete (invalidEvent as Record<string, unknown>).wornDate;

        const persistedState = {
          pendingEvents: [invalidEvent],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        expect(result.pendingEvents).toHaveLength(0);
      });

      it('should filter out events missing source', () => {
        const invalidEvent = { ...createValidPendingEvent() };
        delete (invalidEvent as Record<string, unknown>).source;

        const persistedState = {
          pendingEvents: [invalidEvent],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        expect(result.pendingEvents).toHaveLength(0);
      });

      it('should filter out events missing createdAt', () => {
        const invalidEvent = { ...createValidPendingEvent() };
        delete (invalidEvent as Record<string, unknown>).createdAt;

        const persistedState = {
          pendingEvents: [invalidEvent],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        expect(result.pendingEvents).toHaveLength(0);
      });

      it('should filter out events missing attemptCount', () => {
        const invalidEvent = { ...createValidPendingEvent() };
        delete (invalidEvent as Record<string, unknown>).attemptCount;

        const persistedState = {
          pendingEvents: [invalidEvent],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        expect(result.pendingEvents).toHaveLength(0);
      });

      it('should filter out events missing status', () => {
        const invalidEvent = { ...createValidPendingEvent() };
        delete (invalidEvent as Record<string, unknown>).status;

        const persistedState = {
          pendingEvents: [invalidEvent],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        expect(result.pendingEvents).toHaveLength(0);
      });

      it('should filter out events with invalid source value', () => {
        const invalidEvent = {
          ...createValidPendingEvent(),
          source: 'unknown_source',
        };

        const persistedState = {
          pendingEvents: [invalidEvent],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        expect(result.pendingEvents).toHaveLength(0);
      });

      it('should filter out events with invalid status value', () => {
        const invalidEvent = {
          ...createValidPendingEvent(),
          status: 'unknown_status',
        };

        const persistedState = {
          pendingEvents: [invalidEvent],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        expect(result.pendingEvents).toHaveLength(0);
      });

      it('should filter out events with non-array itemIds', () => {
        const invalidEvent = {
          ...createValidPendingEvent(),
          itemIds: 'not-an-array',
        };

        const persistedState = {
          pendingEvents: [invalidEvent],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        expect(result.pendingEvents).toHaveLength(0);
      });

      it('should filter out events with non-string items in itemIds array', () => {
        const invalidEvent = {
          ...createValidPendingEvent(),
          itemIds: ['valid-item', 123, 'another-valid'],
        };

        const persistedState = {
          pendingEvents: [invalidEvent],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        expect(result.pendingEvents).toHaveLength(0);
      });

      it('should filter out events with non-number attemptCount', () => {
        const invalidEvent = {
          ...createValidPendingEvent(),
          attemptCount: '3',
        };

        const persistedState = {
          pendingEvents: [invalidEvent],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        expect(result.pendingEvents).toHaveLength(0);
      });

      it('should keep valid events while filtering out invalid ones', () => {
        const validEvent1 = createValidPendingEvent({ localId: 'valid-1' });
        const invalidEvent = { ...createValidPendingEvent(), localId: undefined };
        const validEvent2 = createValidPendingEvent({ localId: 'valid-2' });
        const anotherInvalidEvent = { ...createValidPendingEvent(), source: 'bad_source' };
        const validEvent3 = createValidPendingEvent({ localId: 'valid-3' });

        const persistedState = {
          pendingEvents: [validEvent1, invalidEvent, validEvent2, anotherInvalidEvent, validEvent3],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        expect(result.pendingEvents).toHaveLength(3);
        expect(result.pendingEvents.map(e => e.localId)).toEqual(['valid-1', 'valid-2', 'valid-3']);
      });
    });

    describe('Corrupted State Handling', () => {
      it('should return initial state for null persisted state', () => {
        const result = validatePersistedPendingEventsState(null);

        expect(result).toEqual({
          pendingEvents: [],
          isHydrated: false,
        });
      });

      it('should return initial state for undefined persisted state', () => {
        const result = validatePersistedPendingEventsState(undefined);

        expect(result).toEqual({
          pendingEvents: [],
          isHydrated: false,
        });
      });

      it('should return initial state for string persisted state', () => {
        const result = validatePersistedPendingEventsState('corrupted-string');

        expect(result).toEqual({
          pendingEvents: [],
          isHydrated: false,
        });
      });

      it('should return initial state for number persisted state', () => {
        const result = validatePersistedPendingEventsState(42);

        expect(result).toEqual({
          pendingEvents: [],
          isHydrated: false,
        });
      });

      it('should return initial state for boolean persisted state', () => {
        const result = validatePersistedPendingEventsState(true);

        expect(result).toEqual({
          pendingEvents: [],
          isHydrated: false,
        });
      });

      it('should return initial state for array persisted state', () => {
        const result = validatePersistedPendingEventsState([1, 2, 3]);

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

      it('should return initial state when pendingEvents is not an array', () => {
        const result = validatePersistedPendingEventsState({
          pendingEvents: 'not-an-array',
        });

        expect(result).toEqual({
          pendingEvents: [],
          isHydrated: false,
        });
      });

      it('should return initial state when pendingEvents is null', () => {
        const result = validatePersistedPendingEventsState({
          pendingEvents: null,
        });

        expect(result).toEqual({
          pendingEvents: [],
          isHydrated: false,
        });
      });

      it('should return initial state when pendingEvents is an object', () => {
        const result = validatePersistedPendingEventsState({
          pendingEvents: { event1: createValidPendingEvent() },
        });

        expect(result).toEqual({
          pendingEvents: [],
          isHydrated: false,
        });
      });

      it('should handle pendingEvents containing null elements', () => {
        const persistedState = {
          pendingEvents: [
            createValidPendingEvent({ localId: 'valid-1' }),
            null,
            createValidPendingEvent({ localId: 'valid-2' }),
          ],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        // Only valid events should remain
        expect(result.pendingEvents).toHaveLength(2);
        expect(result.pendingEvents.map(e => e.localId)).toEqual(['valid-1', 'valid-2']);
      });

      it('should handle pendingEvents containing undefined elements', () => {
        const persistedState = {
          pendingEvents: [
            createValidPendingEvent({ localId: 'valid-1' }),
            undefined,
            createValidPendingEvent({ localId: 'valid-2' }),
          ],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        // Only valid events should remain
        expect(result.pendingEvents).toHaveLength(2);
        expect(result.pendingEvents.map(e => e.localId)).toEqual(['valid-1', 'valid-2']);
      });

      it('should handle pendingEvents containing primitive values', () => {
        const persistedState = {
          pendingEvents: [
            createValidPendingEvent({ localId: 'valid-1' }),
            'string-value',
            123,
            true,
            createValidPendingEvent({ localId: 'valid-2' }),
          ],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        // Only valid events should remain
        expect(result.pendingEvents).toHaveLength(2);
        expect(result.pendingEvents.map(e => e.localId)).toEqual(['valid-1', 'valid-2']);
      });
    });

    describe('Source Type Validation', () => {
      it('should accept ai_recommendation source', () => {
        const persistedState = {
          pendingEvents: [createValidPendingEvent({ source: 'ai_recommendation' })],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        expect(result.pendingEvents).toHaveLength(1);
        expect(result.pendingEvents[0].source).toBe('ai_recommendation');
      });

      it('should accept saved_outfit source', () => {
        const persistedState = {
          pendingEvents: [createValidPendingEvent({ source: 'saved_outfit' })],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        expect(result.pendingEvents).toHaveLength(1);
        expect(result.pendingEvents[0].source).toBe('saved_outfit');
      });

      it('should accept manual_outfit source', () => {
        const persistedState = {
          pendingEvents: [createValidPendingEvent({ source: 'manual_outfit' })],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        expect(result.pendingEvents).toHaveLength(1);
        expect(result.pendingEvents[0].source).toBe('manual_outfit');
      });

      it('should accept imported source', () => {
        const persistedState = {
          pendingEvents: [createValidPendingEvent({ source: 'imported' })],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        expect(result.pendingEvents).toHaveLength(1);
        expect(result.pendingEvents[0].source).toBe('imported');
      });

      it('should reject unknown source types', () => {
        const persistedState = {
          pendingEvents: [
            { ...createValidPendingEvent(), source: 'future_source' },
            { ...createValidPendingEvent(), source: 'SAVED_OUTFIT' }, // Wrong case
            { ...createValidPendingEvent(), source: '' }, // Empty string
          ],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        expect(result.pendingEvents).toHaveLength(0);
      });
    });

    describe('Status Type Validation', () => {
      it('should accept pending status', () => {
        const persistedState = {
          pendingEvents: [createValidPendingEvent({ status: 'pending' })],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        expect(result.pendingEvents).toHaveLength(1);
        expect(result.pendingEvents[0].status).toBe('pending');
      });

      it('should accept syncing status and reset to pending', () => {
        const persistedState = {
          pendingEvents: [createValidPendingEvent({ status: 'syncing' })],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        expect(result.pendingEvents).toHaveLength(1);
        expect(result.pendingEvents[0].status).toBe('pending');
      });

      it('should accept failed status', () => {
        const persistedState = {
          pendingEvents: [createValidPendingEvent({ status: 'failed' })],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        expect(result.pendingEvents).toHaveLength(1);
        expect(result.pendingEvents[0].status).toBe('failed');
      });

      it('should reject unknown status types', () => {
        const persistedState = {
          pendingEvents: [
            { ...createValidPendingEvent(), status: 'success' },
            { ...createValidPendingEvent(), status: 'PENDING' }, // Wrong case
            { ...createValidPendingEvent(), status: 'completed' },
          ],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        expect(result.pendingEvents).toHaveLength(0);
      });
    });

    describe('Empty State Handling', () => {
      it('should handle empty pendingEvents array', () => {
        const persistedState = {
          pendingEvents: [],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        expect(result.pendingEvents).toHaveLength(0);
        expect(result.isHydrated).toBe(false);
      });

      it('should set isHydrated to false after validation', () => {
        const persistedState = {
          pendingEvents: [createValidPendingEvent()],
          isHydrated: true, // Even if true in persisted state
        };

        const result = validatePersistedPendingEventsState(persistedState);

        // isHydrated should always be false from validation
        // (it gets set to true by onRehydrateStorage callback)
        expect(result.isHydrated).toBe(false);
      });
    });

    describe('Legacy State Shape Simulation', () => {
      it('should handle v0 state shape without version field', () => {
        // Simulating a hypothetical earlier version without explicit version
        const legacyState = {
          pendingEvents: [createValidPendingEvent()],
        };

        const result = validatePersistedPendingEventsState(legacyState);

        expect(result.pendingEvents).toHaveLength(1);
      });

      it('should preserve data when state has additional metadata fields', () => {
        // State might have been persisted with extra metadata
        const stateWithMetadata = {
          pendingEvents: [createValidPendingEvent({ localId: 'test-123' })],
          _persist: { version: 1, rehydrated: true },
          lastUpdated: '2024-01-15T10:00:00.000Z',
        };

        const result = validatePersistedPendingEventsState(stateWithMetadata);

        expect(result.pendingEvents).toHaveLength(1);
        expect(result.pendingEvents[0].localId).toBe('test-123');
      });

      it('should handle events with empty itemIds array', () => {
        const eventWithEmptyItems = createValidPendingEvent({
          itemIds: [],
        });

        const persistedState = {
          pendingEvents: [eventWithEmptyItems],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        expect(result.pendingEvents).toHaveLength(1);
        expect(result.pendingEvents[0].itemIds).toEqual([]);
      });

      it('should handle events with zero attemptCount', () => {
        const freshEvent = createValidPendingEvent({
          attemptCount: 0,
        });

        const persistedState = {
          pendingEvents: [freshEvent],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        expect(result.pendingEvents).toHaveLength(1);
        expect(result.pendingEvents[0].attemptCount).toBe(0);
      });

      it('should handle events with high attemptCount', () => {
        const retryExhaustedEvent = createValidPendingEvent({
          attemptCount: 100,
          status: 'failed',
        });

        const persistedState = {
          pendingEvents: [retryExhaustedEvent],
        };

        const result = validatePersistedPendingEventsState(persistedState);

        expect(result.pendingEvents).toHaveLength(1);
        expect(result.pendingEvents[0].attemptCount).toBe(100);
      });
    });
  });

  describe('Permanently Failed Event Handling', () => {
    describe('MAX_SYNC_ATTEMPTS constant', () => {
      it('should verify MAX_SYNC_ATTEMPTS constant value is 3', () => {
        expect(MAX_SYNC_ATTEMPTS).toBe(3);
      });
    });

    describe('getPermanentlyFailedEvents', () => {
      it('should return empty array when no events exist', () => {
        const store = createTestStore();

        const permanentlyFailed = store.getState().getPermanentlyFailedEvents();

        expect(permanentlyFailed).toEqual([]);
      });

      it('should return empty array when no events are permanently failed', () => {
        const store = createTestStore();

        // Add a pending event
        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-1',
          wornDate: '2024-01-01',
        }));

        // Add a failed event with attemptCount < MAX_SYNC_ATTEMPTS
        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-2',
          wornDate: '2024-01-02',
        }));
        const failedLocalId = store.getState().pendingEvents.find(
          e => e.outfitId === 'outfit-2'
        )?.localId;
        if (failedLocalId) {
          store.getState().markEventSyncing(failedLocalId);
          store.getState().markEventFailed(failedLocalId, 'Network error');
        }

        const permanentlyFailed = store.getState().getPermanentlyFailedEvents();

        expect(permanentlyFailed).toEqual([]);
      });

      it('should return events with status failed and attemptCount >= MAX_SYNC_ATTEMPTS', () => {
        const store = createTestStore();

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-perm-failed',
          wornDate: '2024-01-01',
        }));

        const localId = store.getState().pendingEvents[0].localId;

        // Simulate MAX_SYNC_ATTEMPTS failed sync attempts
        for (let i = 0; i < MAX_SYNC_ATTEMPTS; i++) {
          store.getState().markEventSyncing(localId);
          store.getState().markEventFailed(localId, `Attempt ${i + 1} failed`);
        }

        const permanentlyFailed = store.getState().getPermanentlyFailedEvents();

        expect(permanentlyFailed).toHaveLength(1);
        expect(permanentlyFailed[0].outfitId).toBe('outfit-perm-failed');
        expect(permanentlyFailed[0].attemptCount).toBe(MAX_SYNC_ATTEMPTS);
        expect(permanentlyFailed[0].status).toBe('failed');
      });

      it('should not include failed events with attemptCount < MAX_SYNC_ATTEMPTS', () => {
        const store = createTestStore();

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-retryable',
          wornDate: '2024-01-01',
        }));

        const localId = store.getState().pendingEvents[0].localId;

        // Only 2 attempts (less than MAX_SYNC_ATTEMPTS = 3)
        store.getState().markEventSyncing(localId);
        store.getState().markEventFailed(localId, 'First failure');
        store.getState().markEventSyncing(localId);
        store.getState().markEventFailed(localId, 'Second failure');

        expect(store.getState().pendingEvents[0].attemptCount).toBe(2);
        expect(store.getState().pendingEvents[0].status).toBe('failed');

        const permanentlyFailed = store.getState().getPermanentlyFailedEvents();

        expect(permanentlyFailed).toEqual([]);
      });

      it('should not include pending or syncing events regardless of attemptCount', () => {
        const store = createTestStore();

        // Add pending event
        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-pending',
          wornDate: '2024-01-01',
        }));

        // Add syncing event
        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-syncing',
          wornDate: '2024-01-02',
        }));
        const syncingLocalId = store.getState().pendingEvents.find(
          e => e.outfitId === 'outfit-syncing'
        )?.localId;
        if (syncingLocalId) {
          // Mark syncing 3 times to get attemptCount = 3
          for (let i = 0; i < MAX_SYNC_ATTEMPTS; i++) {
            store.getState().markEventSyncing(syncingLocalId);
          }
        }

        // Verify attemptCount is at MAX but status is syncing
        const syncingEvent = store.getState().pendingEvents.find(
          e => e.outfitId === 'outfit-syncing'
        );
        expect(syncingEvent?.attemptCount).toBe(MAX_SYNC_ATTEMPTS);
        expect(syncingEvent?.status).toBe('syncing');

        const permanentlyFailed = store.getState().getPermanentlyFailedEvents();

        expect(permanentlyFailed).toEqual([]);
      });

      it('should return multiple permanently failed events', () => {
        const store = createTestStore();

        // Create 3 permanently failed events
        for (let i = 1; i <= 3; i++) {
          store.getState().addPendingWearEvent(createEventInput({
            outfitId: `outfit-perm-failed-${i}`,
            wornDate: `2024-01-0${i}`,
          }));

          const localId = store.getState().pendingEvents.find(
            e => e.outfitId === `outfit-perm-failed-${i}`
          )?.localId;

          if (localId) {
            for (let j = 0; j < MAX_SYNC_ATTEMPTS; j++) {
              store.getState().markEventSyncing(localId);
              store.getState().markEventFailed(localId, `Failure ${j + 1}`);
            }
          }
        }

        const permanentlyFailed = store.getState().getPermanentlyFailedEvents();

        expect(permanentlyFailed).toHaveLength(3);
        expect(permanentlyFailed.map(e => e.outfitId)).toEqual([
          'outfit-perm-failed-1',
          'outfit-perm-failed-2',
          'outfit-perm-failed-3',
        ]);
      });

      it('should include events with attemptCount > MAX_SYNC_ATTEMPTS', () => {
        const store = createTestStore();

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-over-max',
          wornDate: '2024-01-01',
        }));

        const localId = store.getState().pendingEvents[0].localId;

        // Simulate 5 attempts (more than MAX_SYNC_ATTEMPTS = 3)
        for (let i = 0; i < 5; i++) {
          store.getState().markEventSyncing(localId);
          store.getState().markEventFailed(localId, `Attempt ${i + 1} failed`);
        }

        expect(store.getState().pendingEvents[0].attemptCount).toBe(5);

        const permanentlyFailed = store.getState().getPermanentlyFailedEvents();

        expect(permanentlyFailed).toHaveLength(1);
        expect(permanentlyFailed[0].attemptCount).toBe(5);
      });
    });

    describe('hasPermanentlyFailedEvents', () => {
      it('should return false when no events exist', () => {
        const store = createTestStore();

        expect(store.getState().hasPermanentlyFailedEvents()).toBe(false);
      });

      it('should return false when no events are permanently failed', () => {
        const store = createTestStore();

        // Add pending and retryable failed events
        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-1',
          wornDate: '2024-01-01',
        }));

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-2',
          wornDate: '2024-01-02',
        }));
        const localId = store.getState().pendingEvents.find(
          e => e.outfitId === 'outfit-2'
        )?.localId;
        if (localId) {
          store.getState().markEventSyncing(localId);
          store.getState().markEventFailed(localId, 'Retryable error');
        }

        expect(store.getState().hasPermanentlyFailedEvents()).toBe(false);
      });

      it('should return true when at least one event is permanently failed', () => {
        const store = createTestStore();

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-perm-failed',
          wornDate: '2024-01-01',
        }));

        const localId = store.getState().pendingEvents[0].localId;

        for (let i = 0; i < MAX_SYNC_ATTEMPTS; i++) {
          store.getState().markEventSyncing(localId);
          store.getState().markEventFailed(localId, `Attempt ${i + 1} failed`);
        }

        expect(store.getState().hasPermanentlyFailedEvents()).toBe(true);
      });

      it('should return false for failed events under MAX_SYNC_ATTEMPTS', () => {
        const store = createTestStore();

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-retryable',
          wornDate: '2024-01-01',
        }));

        const localId = store.getState().pendingEvents[0].localId;

        // Only 2 attempts
        store.getState().markEventSyncing(localId);
        store.getState().markEventFailed(localId, 'First failure');
        store.getState().markEventSyncing(localId);
        store.getState().markEventFailed(localId, 'Second failure');

        expect(store.getState().hasPermanentlyFailedEvents()).toBe(false);
      });
    });

    describe('retryPermanentlyFailedEvents', () => {
      it('should reset permanently failed events to pending with attemptCount 0', () => {
        const store = createTestStore();

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-perm-failed',
          wornDate: '2024-01-01',
        }));

        const localId = store.getState().pendingEvents[0].localId;

        // Make it permanently failed
        for (let i = 0; i < MAX_SYNC_ATTEMPTS; i++) {
          store.getState().markEventSyncing(localId);
          store.getState().markEventFailed(localId, `Attempt ${i + 1} failed`);
        }

        expect(store.getState().pendingEvents[0].status).toBe('failed');
        expect(store.getState().pendingEvents[0].attemptCount).toBe(MAX_SYNC_ATTEMPTS);

        // Retry permanently failed events
        store.getState().retryPermanentlyFailedEvents();

        const event = store.getState().pendingEvents[0];
        expect(event.status).toBe('pending');
        expect(event.attemptCount).toBe(0);
      });

      it('should clear lastError and lastAttemptAt on retry', () => {
        const store = createTestStore();

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-perm-failed',
          wornDate: '2024-01-01',
        }));

        const localId = store.getState().pendingEvents[0].localId;

        for (let i = 0; i < MAX_SYNC_ATTEMPTS; i++) {
          store.getState().markEventSyncing(localId);
          store.getState().markEventFailed(localId, `Attempt ${i + 1} failed`);
        }

        // Verify error fields are set before retry
        expect(store.getState().pendingEvents[0].lastError).toBe('Attempt 3 failed');
        expect(store.getState().pendingEvents[0].lastAttemptAt).toBeDefined();

        // Retry
        store.getState().retryPermanentlyFailedEvents();

        const event = store.getState().pendingEvents[0];
        expect(event.lastError).toBeUndefined();
        expect(event.lastAttemptAt).toBeUndefined();
      });

      it('should not affect non-permanently-failed events', () => {
        const store = createTestStore();

        // Add a pending event
        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-pending',
          wornDate: '2024-01-01',
        }));

        // Add a syncing event
        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-syncing',
          wornDate: '2024-01-02',
        }));
        const syncingLocalId = store.getState().pendingEvents.find(
          e => e.outfitId === 'outfit-syncing'
        )?.localId;
        if (syncingLocalId) {
          store.getState().markEventSyncing(syncingLocalId);
        }

        // Add a permanently failed event
        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-perm-failed',
          wornDate: '2024-01-03',
        }));
        const permFailedLocalId = store.getState().pendingEvents.find(
          e => e.outfitId === 'outfit-perm-failed'
        )?.localId;
        if (permFailedLocalId) {
          for (let i = 0; i < MAX_SYNC_ATTEMPTS; i++) {
            store.getState().markEventSyncing(permFailedLocalId);
            store.getState().markEventFailed(permFailedLocalId, `Attempt ${i + 1}`);
          }
        }

        // Get statuses before retry
        const pendingEvent = store.getState().pendingEvents.find(e => e.outfitId === 'outfit-pending');
        const syncingEvent = store.getState().pendingEvents.find(e => e.outfitId === 'outfit-syncing');

        expect(pendingEvent?.status).toBe('pending');
        expect(pendingEvent?.attemptCount).toBe(0);
        expect(syncingEvent?.status).toBe('syncing');
        expect(syncingEvent?.attemptCount).toBe(1);

        // Retry permanently failed events
        store.getState().retryPermanentlyFailedEvents();

        // Verify pending and syncing events are unchanged
        const pendingAfter = store.getState().pendingEvents.find(e => e.outfitId === 'outfit-pending');
        const syncingAfter = store.getState().pendingEvents.find(e => e.outfitId === 'outfit-syncing');

        expect(pendingAfter?.status).toBe('pending');
        expect(pendingAfter?.attemptCount).toBe(0);
        expect(syncingAfter?.status).toBe('syncing');
        expect(syncingAfter?.attemptCount).toBe(1);

        // Verify permanently failed event was reset
        const permFailedAfter = store.getState().pendingEvents.find(e => e.outfitId === 'outfit-perm-failed');
        expect(permFailedAfter?.status).toBe('pending');
        expect(permFailedAfter?.attemptCount).toBe(0);
      });

      it('should not affect failed events under MAX_SYNC_ATTEMPTS', () => {
        const store = createTestStore();

        // Add a retryable failed event (2 attempts)
        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-retryable',
          wornDate: '2024-01-01',
        }));
        const retryableLocalId = store.getState().pendingEvents[0].localId;
        store.getState().markEventSyncing(retryableLocalId);
        store.getState().markEventFailed(retryableLocalId, 'First failure');
        store.getState().markEventSyncing(retryableLocalId);
        store.getState().markEventFailed(retryableLocalId, 'Second failure');

        expect(store.getState().pendingEvents[0].attemptCount).toBe(2);
        expect(store.getState().pendingEvents[0].status).toBe('failed');

        // Retry permanently failed events (should not affect this one)
        store.getState().retryPermanentlyFailedEvents();

        const event = store.getState().pendingEvents[0];
        expect(event.status).toBe('failed');
        expect(event.attemptCount).toBe(2);
        expect(event.lastError).toBe('Second failure');
      });

      it('should reset all permanently failed events when multiple exist', () => {
        const store = createTestStore();

        // Create 3 permanently failed events
        for (let i = 1; i <= 3; i++) {
          store.getState().addPendingWearEvent(createEventInput({
            outfitId: `outfit-perm-failed-${i}`,
            wornDate: `2024-01-0${i}`,
          }));

          const localId = store.getState().pendingEvents.find(
            e => e.outfitId === `outfit-perm-failed-${i}`
          )?.localId;

          if (localId) {
            for (let j = 0; j < MAX_SYNC_ATTEMPTS; j++) {
              store.getState().markEventSyncing(localId);
              store.getState().markEventFailed(localId, `Failure ${j + 1}`);
            }
          }
        }

        expect(store.getState().getPermanentlyFailedEvents()).toHaveLength(3);

        // Retry all
        store.getState().retryPermanentlyFailedEvents();

        // All should be reset
        expect(store.getState().getPermanentlyFailedEvents()).toHaveLength(0);

        store.getState().pendingEvents.forEach(event => {
          expect(event.status).toBe('pending');
          expect(event.attemptCount).toBe(0);
          expect(event.lastError).toBeUndefined();
          expect(event.lastAttemptAt).toBeUndefined();
        });
      });

      it('should preserve other event data when retrying', () => {
        const store = createTestStore();

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-with-data',
          wornDate: '2024-01-15',
          itemIds: ['item-a', 'item-b', 'item-c'],
          context: 'Special occasion',
          source: 'saved_outfit',
        }));

        const localId = store.getState().pendingEvents[0].localId;
        const originalCreatedAt = store.getState().pendingEvents[0].createdAt;

        for (let i = 0; i < MAX_SYNC_ATTEMPTS; i++) {
          store.getState().markEventSyncing(localId);
          store.getState().markEventFailed(localId, `Attempt ${i + 1}`);
        }

        store.getState().retryPermanentlyFailedEvents();

        const event = store.getState().pendingEvents[0];
        expect(event.localId).toBe(localId);
        expect(event.outfitId).toBe('outfit-with-data');
        expect(event.wornDate).toBe('2024-01-15');
        expect(event.itemIds).toEqual(['item-a', 'item-b', 'item-c']);
        expect(event.context).toBe('Special occasion');
        expect(event.source).toBe('saved_outfit');
        expect(event.createdAt).toBe(originalCreatedAt);
      });
    });

    describe('getRetryableEvents integration with permanent failure', () => {
      it('should exclude permanently failed events from retryable events', () => {
        const store = createTestStore();

        // Add a permanently failed event
        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-perm-failed',
          wornDate: '2024-01-01',
        }));
        const localId = store.getState().pendingEvents[0].localId;
        for (let i = 0; i < MAX_SYNC_ATTEMPTS; i++) {
          store.getState().markEventSyncing(localId);
          store.getState().markEventFailed(localId, `Attempt ${i + 1}`);
        }

        const retryable = store.getState().getRetryableEvents();

        expect(retryable).toHaveLength(0);
      });

      it('should include failed events under MAX_SYNC_ATTEMPTS in retryable events', () => {
        const store = createTestStore();

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-retryable',
          wornDate: '2024-01-01',
        }));
        const localId = store.getState().pendingEvents[0].localId;
        store.getState().markEventSyncing(localId);
        store.getState().markEventFailed(localId, 'First failure');

        expect(store.getState().pendingEvents[0].attemptCount).toBe(1);

        const retryable = store.getState().getRetryableEvents();

        expect(retryable).toHaveLength(1);
        expect(retryable[0].outfitId).toBe('outfit-retryable');
      });

      it('should include pending events in retryable events', () => {
        const store = createTestStore();

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-pending',
          wornDate: '2024-01-01',
        }));

        const retryable = store.getState().getRetryableEvents();

        expect(retryable).toHaveLength(1);
        expect(retryable[0].status).toBe('pending');
      });

      it('should correctly filter mixed retryable and non-retryable events', () => {
        const store = createTestStore();

        // Add pending event (retryable)
        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-pending',
          wornDate: '2024-01-01',
        }));

        // Add retryable failed event (retryable)
        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-retryable-failed',
          wornDate: '2024-01-02',
        }));
        const retryableLocalId = store.getState().pendingEvents.find(
          e => e.outfitId === 'outfit-retryable-failed'
        )?.localId;
        if (retryableLocalId) {
          store.getState().markEventSyncing(retryableLocalId);
          store.getState().markEventFailed(retryableLocalId, 'Error');
        }

        // Add permanently failed event (not retryable)
        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-perm-failed',
          wornDate: '2024-01-03',
        }));
        const permFailedLocalId = store.getState().pendingEvents.find(
          e => e.outfitId === 'outfit-perm-failed'
        )?.localId;
        if (permFailedLocalId) {
          for (let i = 0; i < MAX_SYNC_ATTEMPTS; i++) {
            store.getState().markEventSyncing(permFailedLocalId);
            store.getState().markEventFailed(permFailedLocalId, `Attempt ${i + 1}`);
          }
        }

        // Add syncing event (not retryable - currently being synced)
        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-syncing',
          wornDate: '2024-01-04',
        }));
        const syncingLocalId = store.getState().pendingEvents.find(
          e => e.outfitId === 'outfit-syncing'
        )?.localId;
        if (syncingLocalId) {
          store.getState().markEventSyncing(syncingLocalId);
        }

        const retryable = store.getState().getRetryableEvents();

        expect(retryable).toHaveLength(2);
        const retryableOutfitIds = retryable.map(e => e.outfitId);
        expect(retryableOutfitIds).toContain('outfit-pending');
        expect(retryableOutfitIds).toContain('outfit-retryable-failed');
        expect(retryableOutfitIds).not.toContain('outfit-perm-failed');
        expect(retryableOutfitIds).not.toContain('outfit-syncing');
      });
    });

    describe('Event Lifecycle Simulation', () => {
      it('should transition event to permanently failed after MAX_SYNC_ATTEMPTS failures', () => {
        const store = createTestStore();

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-lifecycle',
          wornDate: '2024-01-01',
        }));

        const localId = store.getState().pendingEvents[0].localId;

        // Initial state
        expect(store.getState().pendingEvents[0].status).toBe('pending');
        expect(store.getState().pendingEvents[0].attemptCount).toBe(0);
        expect(store.getState().hasPermanentlyFailedEvents()).toBe(false);
        expect(store.getState().getRetryableEvents()).toHaveLength(1);

        // First attempt fails
        store.getState().markEventSyncing(localId);
        expect(store.getState().pendingEvents[0].status).toBe('syncing');
        expect(store.getState().pendingEvents[0].attemptCount).toBe(1);

        store.getState().markEventFailed(localId, 'Network timeout');
        expect(store.getState().pendingEvents[0].status).toBe('failed');
        expect(store.getState().hasPermanentlyFailedEvents()).toBe(false);
        expect(store.getState().getRetryableEvents()).toHaveLength(1); // Still retryable

        // Second attempt fails
        store.getState().markEventSyncing(localId);
        store.getState().markEventFailed(localId, 'Server error');
        expect(store.getState().pendingEvents[0].attemptCount).toBe(2);
        expect(store.getState().hasPermanentlyFailedEvents()).toBe(false);
        expect(store.getState().getRetryableEvents()).toHaveLength(1); // Still retryable

        // Third attempt fails - now permanently failed
        store.getState().markEventSyncing(localId);
        store.getState().markEventFailed(localId, 'Final failure');
        expect(store.getState().pendingEvents[0].attemptCount).toBe(3);
        expect(store.getState().hasPermanentlyFailedEvents()).toBe(true);
        expect(store.getState().getRetryableEvents()).toHaveLength(0); // No longer retryable
        expect(store.getState().getPermanentlyFailedEvents()).toHaveLength(1);
      });

      it('should allow permanently failed events to be retried and fail again', () => {
        const store = createTestStore();

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-retry-cycle',
          wornDate: '2024-01-01',
        }));

        const localId = store.getState().pendingEvents[0].localId;

        // First round: fail MAX_SYNC_ATTEMPTS times
        for (let i = 0; i < MAX_SYNC_ATTEMPTS; i++) {
          store.getState().markEventSyncing(localId);
          store.getState().markEventFailed(localId, `Round 1 Attempt ${i + 1}`);
        }

        expect(store.getState().hasPermanentlyFailedEvents()).toBe(true);

        // User triggers retry
        store.getState().retryPermanentlyFailedEvents();

        expect(store.getState().hasPermanentlyFailedEvents()).toBe(false);
        expect(store.getState().pendingEvents[0].status).toBe('pending');
        expect(store.getState().pendingEvents[0].attemptCount).toBe(0);
        expect(store.getState().getRetryableEvents()).toHaveLength(1);

        // Second round: fail again
        for (let i = 0; i < MAX_SYNC_ATTEMPTS; i++) {
          store.getState().markEventSyncing(localId);
          store.getState().markEventFailed(localId, `Round 2 Attempt ${i + 1}`);
        }

        expect(store.getState().hasPermanentlyFailedEvents()).toBe(true);
        expect(store.getState().pendingEvents[0].attemptCount).toBe(3);
        expect(store.getState().pendingEvents[0].lastError).toBe('Round 2 Attempt 3');
      });

      it('should allow event to succeed after retry', () => {
        const store = createTestStore();

        store.getState().addPendingWearEvent(createEventInput({
          outfitId: 'outfit-eventual-success',
          wornDate: '2024-01-01',
        }));

        const localId = store.getState().pendingEvents[0].localId;

        // First round: fail MAX_SYNC_ATTEMPTS times
        for (let i = 0; i < MAX_SYNC_ATTEMPTS; i++) {
          store.getState().markEventSyncing(localId);
          store.getState().markEventFailed(localId, `Attempt ${i + 1}`);
        }

        expect(store.getState().hasPermanentlyFailedEvents()).toBe(true);

        // User triggers retry
        store.getState().retryPermanentlyFailedEvents();

        // Simulate successful sync this time
        store.getState().markEventSyncing(localId);
        // On success, event would be removed from queue
        store.getState().removePendingEvent(localId);

        expect(store.getState().pendingEvents).toHaveLength(0);
        expect(store.getState().hasPermanentlyFailedEvents()).toBe(false);
      });
    });
  });
});
