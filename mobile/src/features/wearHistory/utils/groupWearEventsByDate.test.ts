/**
 * Tests for groupWearEventsByDate utility functions.
 *
 * Tests cover:
 * - groupWearEventsByDate function
 * - formatDateLabel function
 * - Edge cases and empty arrays
 *
 * @module features/wearHistory/utils/groupWearEventsByDate.test
 */

import {
  groupWearEventsByDate,
  formatDateLabel,
  type WearHistorySection,
} from './groupWearEventsByDate';
import type { WearHistoryRow } from '../types';

// Mock i18n
jest.mock('../../../core/i18n', () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      'screens.history.dateLabels.today': 'Today',
      'screens.history.dateLabels.yesterday': 'Yesterday',
    };
    return translations[key] || key;
  },
}));

// Helper to get today's date string
const getTodayDateString = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper to get yesterday's date string
const getYesterdayDateString = (): string => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const year = yesterday.getFullYear();
  const month = String(yesterday.getMonth() + 1).padStart(2, '0');
  const day = String(yesterday.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Sample test data factory
const createMockWearEvent = (overrides: Partial<WearHistoryRow> = {}): WearHistoryRow => ({
  id: 'event-1',
  user_id: 'test-user-123',
  outfit_id: 'outfit-1',
  item_ids: ['item-1', 'item-2'],
  worn_date: '2024-12-01',
  worn_at: '2024-12-01T14:30:00Z',
  source: 'manual_outfit',
  context: 'Work meeting',
  notes: null,
  created_at: '2024-12-01T14:30:00Z',
  updated_at: '2024-12-01T14:30:00Z',
  ...overrides,
});

describe('formatDateLabel', () => {
  describe('Today and Yesterday', () => {
    it('should return "Today" for today\'s date', () => {
      const today = getTodayDateString();

      const result = formatDateLabel(today);

      expect(result).toBe('Today');
    });

    it('should return "Yesterday" for yesterday\'s date', () => {
      const yesterday = getYesterdayDateString();

      const result = formatDateLabel(yesterday);

      expect(result).toBe('Yesterday');
    });
  });

  describe('Older dates', () => {
    it('should return locale-formatted date for dates before yesterday', () => {
      const oldDate = '2024-01-15';

      const result = formatDateLabel(oldDate);

      // Should be formatted with weekday, month, day
      expect(result).toMatch(/\w+/); // At least contains some word characters
      expect(result).not.toBe('Today');
      expect(result).not.toBe('Yesterday');
    });

    it('should include year for dates in different year', () => {
      const lastYear = '2020-06-15';

      const result = formatDateLabel(lastYear);

      // Should contain the year 2020
      expect(result).toContain('2020');
    });

    it('should not include year for dates in current year', () => {
      const currentYear = new Date().getFullYear();
      const sameYearDate = `${currentYear}-01-01`;

      // Skip if January 1st is today or yesterday
      const today = getTodayDateString();
      const yesterday = getYesterdayDateString();
      if (sameYearDate === today || sameYearDate === yesterday) {
        return; // Skip test
      }

      const result = formatDateLabel(sameYearDate);

      // Should not contain the current year
      expect(result).not.toContain(String(currentYear));
    });
  });
});

describe('groupWearEventsByDate', () => {
  describe('Empty array', () => {
    it('should return empty array for empty input', () => {
      const result = groupWearEventsByDate([]);

      expect(result).toEqual([]);
    });
  });

  describe('Single event', () => {
    it('should create single section for one event', () => {
      const event = createMockWearEvent({ id: 'event-1', worn_date: '2024-12-01' });

      const result = groupWearEventsByDate([event]);

      expect(result).toHaveLength(1);
      expect(result[0].dateKey).toBe('2024-12-01');
      expect(result[0].data).toHaveLength(1);
      expect(result[0].data[0]).toBe(event);
    });

    it('should set title based on formatDateLabel', () => {
      const today = getTodayDateString();
      const event = createMockWearEvent({ worn_date: today });

      const result = groupWearEventsByDate([event]);

      expect(result[0].title).toBe('Today');
    });
  });

  describe('Multiple events same date', () => {
    it('should group events with same worn_date into single section', () => {
      const event1 = createMockWearEvent({
        id: 'event-1',
        worn_date: '2024-12-01',
        worn_at: '2024-12-01T10:00:00Z',
      });
      const event2 = createMockWearEvent({
        id: 'event-2',
        worn_date: '2024-12-01',
        worn_at: '2024-12-01T14:00:00Z',
      });
      const event3 = createMockWearEvent({
        id: 'event-3',
        worn_date: '2024-12-01',
        worn_at: '2024-12-01T18:00:00Z',
      });

      const result = groupWearEventsByDate([event1, event2, event3]);

      expect(result).toHaveLength(1);
      expect(result[0].data).toHaveLength(3);
    });

    it('should preserve order of events within section', () => {
      const event1 = createMockWearEvent({ id: 'event-1', worn_date: '2024-12-01' });
      const event2 = createMockWearEvent({ id: 'event-2', worn_date: '2024-12-01' });
      const event3 = createMockWearEvent({ id: 'event-3', worn_date: '2024-12-01' });

      const result = groupWearEventsByDate([event1, event2, event3]);

      expect(result[0].data[0].id).toBe('event-1');
      expect(result[0].data[1].id).toBe('event-2');
      expect(result[0].data[2].id).toBe('event-3');
    });
  });

  describe('Multiple dates', () => {
    it('should create separate sections for different dates', () => {
      const event1 = createMockWearEvent({ id: 'event-1', worn_date: '2024-12-01' });
      const event2 = createMockWearEvent({ id: 'event-2', worn_date: '2024-12-02' });
      const event3 = createMockWearEvent({ id: 'event-3', worn_date: '2024-12-03' });

      const result = groupWearEventsByDate([event1, event2, event3]);

      expect(result).toHaveLength(3);
      expect(result[0].dateKey).toBe('2024-12-01');
      expect(result[1].dateKey).toBe('2024-12-02');
      expect(result[2].dateKey).toBe('2024-12-03');
    });

    it('should preserve order of sections based on input order', () => {
      // Server returns DESC order: newest first
      const event1 = createMockWearEvent({ id: 'event-1', worn_date: '2024-12-03' }); // Newest
      const event2 = createMockWearEvent({ id: 'event-2', worn_date: '2024-12-02' });
      const event3 = createMockWearEvent({ id: 'event-3', worn_date: '2024-12-01' }); // Oldest

      const result = groupWearEventsByDate([event1, event2, event3]);

      expect(result[0].dateKey).toBe('2024-12-03');
      expect(result[1].dateKey).toBe('2024-12-02');
      expect(result[2].dateKey).toBe('2024-12-01');
    });
  });

  describe('Mixed dates and events', () => {
    it('should correctly group mixed events', () => {
      const events = [
        createMockWearEvent({ id: 'event-1', worn_date: '2024-12-03' }),
        createMockWearEvent({ id: 'event-2', worn_date: '2024-12-03' }),
        createMockWearEvent({ id: 'event-3', worn_date: '2024-12-02' }),
        createMockWearEvent({ id: 'event-4', worn_date: '2024-12-01' }),
        createMockWearEvent({ id: 'event-5', worn_date: '2024-12-01' }),
        createMockWearEvent({ id: 'event-6', worn_date: '2024-12-01' }),
      ];

      const result = groupWearEventsByDate(events);

      expect(result).toHaveLength(3);
      expect(result[0].data).toHaveLength(2); // Dec 3
      expect(result[1].data).toHaveLength(1); // Dec 2
      expect(result[2].data).toHaveLength(3); // Dec 1
    });
  });

  describe('Section structure', () => {
    it('should return sections with correct properties', () => {
      const event = createMockWearEvent({ worn_date: '2024-12-01' });

      const result = groupWearEventsByDate([event]);

      expect(result[0]).toHaveProperty('title');
      expect(result[0]).toHaveProperty('dateKey');
      expect(result[0]).toHaveProperty('data');
      expect(typeof result[0].title).toBe('string');
      expect(typeof result[0].dateKey).toBe('string');
      expect(Array.isArray(result[0].data)).toBe(true);
    });

    it('should have dateKey matching worn_date', () => {
      const event = createMockWearEvent({ worn_date: '2024-12-01' });

      const result = groupWearEventsByDate([event]);

      expect(result[0].dateKey).toBe('2024-12-01');
    });
  });

  describe('Type safety', () => {
    it('should return WearHistorySection array', () => {
      const event = createMockWearEvent();

      const result: WearHistorySection[] = groupWearEventsByDate([event]);

      expect(result).toBeDefined();
      expect(result[0].data[0]).toBe(event);
    });
  });
});
