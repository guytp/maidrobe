/**
 * Tests for WearEventCard component.
 *
 * Tests cover:
 * - Card rendering with event data
 * - Context chip display
 * - Source label display
 * - Time display
 * - Overflow badge for 4+ items
 * - Press handler invocation
 * - Accessibility
 *
 * @module features/wearHistory/components/WearEventCard.test
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { WearEventCard, type WearEventCardProps } from './WearEventCard';
import { ThemeProvider } from '../../../core/theme';
import type { WearHistoryRow } from '../types';

// Mock i18n
jest.mock('../../../core/i18n', () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      'screens.history.event.aiPick': 'AI pick',
      'screens.history.event.yourOutfit': 'Your outfit',
      'screens.history.event.itemCount': '{count} items',
      'screens.history.event.at': 'at {time}',
      'screens.history.event.moreItems': '{count} more items',
      'screens.history.accessibility.eventCardHint': 'Tap to view outfit details',
    };
    return translations[key] || key;
  },
}));

// Mock useBatchWardrobeItems hook
const mockBatchItems = new Map();
jest.mock('../../wardrobe/api', () => ({
  useBatchWardrobeItems: () => ({
    items: mockBatchItems,
    isLoading: false,
  }),
}));

// Mock getItemImageUrl
jest.mock('../../wardrobe/utils/getItemImageUrl', () => ({
  getItemImageUrl: () => 'https://example.com/image.jpg',
}));

// Sample test data
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

describe('WearEventCard', () => {
  const TestWrapper = ({ children }: { children: React.ReactNode }) => (
    <ThemeProvider colorScheme="light">{children}</ThemeProvider>
  );

  const defaultProps: WearEventCardProps = {
    event: createMockWearEvent(),
    onPress: jest.fn(),
    testID: 'wear-event-card',
  };

  const renderComponent = (props: Partial<WearEventCardProps> = {}) => {
    return render(<WearEventCard {...defaultProps} {...props} />, { wrapper: TestWrapper });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockBatchItems.clear();
  });

  describe('Card rendering', () => {
    it('should render card with testID', () => {
      const { getByTestId } = renderComponent();

      expect(getByTestId('wear-event-card')).toBeTruthy();
    });

    it('should render card without crashing', () => {
      const { getByRole } = renderComponent();

      expect(getByRole('button')).toBeTruthy();
    });
  });

  describe('Context chip', () => {
    it('should display context text when present', () => {
      const event = createMockWearEvent({ context: 'Work meeting' });

      const { getByText } = renderComponent({ event });

      expect(getByText('Work meeting')).toBeTruthy();
    });

    it('should not display context chip when context is null', () => {
      const event = createMockWearEvent({ context: null });

      const { queryByText } = renderComponent({ event });

      expect(queryByText('Work meeting')).toBeNull();
    });

    it('should not display context chip when context is empty string', () => {
      const event = createMockWearEvent({ context: '' });

      const { queryByText } = renderComponent({ event });

      // Should not find any context text since it's empty
      expect(queryByText('')).toBeNull();
    });

    it('should trim whitespace from context', () => {
      const event = createMockWearEvent({ context: '  Trimmed context  ' });

      const { getByText } = renderComponent({ event });

      expect(getByText('Trimmed context')).toBeTruthy();
    });
  });

  describe('Source label', () => {
    it('should display "AI pick" for ai_recommendation source', () => {
      const event = createMockWearEvent({ source: 'ai_recommendation' });

      const { getByText } = renderComponent({ event });

      expect(getByText('AI pick')).toBeTruthy();
    });

    it('should display "Your outfit" for manual_outfit source', () => {
      const event = createMockWearEvent({ source: 'manual_outfit' });

      const { getByText } = renderComponent({ event });

      expect(getByText('Your outfit')).toBeTruthy();
    });

    it('should display "Your outfit" for saved_outfit source', () => {
      const event = createMockWearEvent({ source: 'saved_outfit' });

      const { getByText } = renderComponent({ event });

      expect(getByText('Your outfit')).toBeTruthy();
    });
  });

  describe('Time display', () => {
    it('should display formatted time', () => {
      const event = createMockWearEvent({ worn_at: '2024-12-01T14:30:00Z' });

      const { getByText } = renderComponent({ event });

      // Time formatting depends on locale, just check the component renders
      expect(getByText(/\d{1,2}:\d{2}/)).toBeTruthy();
    });
  });

  describe('Overflow badge', () => {
    it('should not display overflow badge when 3 or fewer items', () => {
      const event = createMockWearEvent({ item_ids: ['item-1', 'item-2', 'item-3'] });

      const { queryByText } = renderComponent({ event });

      expect(queryByText(/\+\d+/)).toBeNull();
    });

    it('should display overflow badge when more than 3 items', () => {
      const event = createMockWearEvent({
        item_ids: ['item-1', 'item-2', 'item-3', 'item-4', 'item-5'],
      });

      const { getByText } = renderComponent({ event });

      expect(getByText('+2')).toBeTruthy();
    });

    it('should display correct overflow count for many items', () => {
      const event = createMockWearEvent({
        item_ids: ['item-1', 'item-2', 'item-3', 'item-4', 'item-5', 'item-6', 'item-7'],
      });

      const { getByText } = renderComponent({ event });

      expect(getByText('+4')).toBeTruthy();
    });
  });

  describe('Press handler', () => {
    it('should call onPress with event when pressed', () => {
      const onPress = jest.fn();
      const event = createMockWearEvent();

      const { getByRole } = renderComponent({ event, onPress });
      const button = getByRole('button');

      fireEvent.press(button);

      expect(onPress).toHaveBeenCalledTimes(1);
      expect(onPress).toHaveBeenCalledWith(event);
    });

    it('should not crash when onPress is undefined', () => {
      const event = createMockWearEvent();

      const { getByRole } = renderComponent({ event, onPress: undefined });
      const button = getByRole('button');

      // Should not throw
      fireEvent.press(button);
    });
  });

  describe('Accessibility', () => {
    it('should have button role', () => {
      const { getByRole } = renderComponent();

      expect(getByRole('button')).toBeTruthy();
    });

    it('should have accessibility hint', () => {
      const { getByRole } = renderComponent();
      const button = getByRole('button');

      expect(button.props.accessibilityHint).toBe('Tap to view outfit details');
    });

    it('should have accessibility label with context', () => {
      const event = createMockWearEvent({ context: 'Work meeting' });

      const { getByRole } = renderComponent({ event });
      const button = getByRole('button');

      expect(button.props.accessibilityLabel).toContain('Work meeting');
    });
  });

  describe('Empty items', () => {
    it('should render card even with empty item_ids', () => {
      const event = createMockWearEvent({ item_ids: [] });

      const { getByTestId } = renderComponent({ event });

      expect(getByTestId('wear-event-card')).toBeTruthy();
    });
  });
});
