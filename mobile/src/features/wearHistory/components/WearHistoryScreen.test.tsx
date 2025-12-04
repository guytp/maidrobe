/**
 * Tests for WearHistoryScreen component.
 *
 * Tests cover:
 * - Loading state display
 * - Empty state display with icon component (not emoji)
 * - Error state display and retry
 * - Event list rendering
 * - Section headers for date grouping
 * - Navigation back button and outfit detail navigation
 * - Telemetry tracking on event tap
 * - Accessibility
 *
 * @module features/wearHistory/components/WearHistoryScreen.test
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { WearHistoryScreen } from './WearHistoryScreen';
import { ThemeProvider } from '../../../core/theme';
import { trackCaptureEvent } from '../../../core/telemetry';
import type { WearHistoryRow } from '../types';

// Mock expo-router
const mockRouter = {
  back: jest.fn(),
  push: jest.fn(),
  replace: jest.fn(),
  canGoBack: jest.fn(() => true),
};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

// Mock useStore for user state
const mockUser = { id: 'test-user-123' };
jest.mock('../../../core/state/store', () => ({
  useStore: (selector: (state: { user: typeof mockUser }) => unknown) =>
    selector({ user: mockUser }),
}));

// Mock telemetry
jest.mock('../../../core/telemetry', () => ({
  trackCaptureEvent: jest.fn(),
}));

// Mock @expo/vector-icons - capture props for verification
const mockMaterialIconsComponent = jest.fn();
jest.mock('@expo/vector-icons', () => ({
  MaterialIcons: (props: { name: string; size: number; color: string }) => {
    mockMaterialIconsComponent(props);
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const { View } = require('react-native');
    return <View testID="material-icon" {...props} />;
  },
}));

// Mock i18n
jest.mock('../../../core/i18n', () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      'screens.history.title': 'Wear History',
      'screens.history.loading': 'Loading wear history...',
      'screens.history.empty.title': 'No wear history yet',
      'screens.history.empty.subtitle': 'Start logging your outfits',
      'screens.history.empty.iconLabel': 'Calendar icon',
      'screens.history.empty.ctaButton': 'Get outfit ideas',
      'screens.history.empty.ctaButtonHint': 'Go to home screen',
      'screens.history.error.loadFailed': 'Could not load wear history',
      'screens.history.error.retry': 'Retry',
      'screens.history.dateLabels.today': 'Today',
      'screens.history.dateLabels.yesterday': 'Yesterday',
      'screens.history.accessibility.screenLabel': 'Wear history screen',
      'screens.history.accessibility.screenHint': 'View what you worn',
      'screens.history.accessibility.backButton': 'Go back',
      'screens.history.accessibility.backButtonHint': 'Return to home',
      'screens.history.accessibility.listLabel': '{count} wear events',
      'screens.history.accessibility.retryHint': 'Tap to retry',
      'screens.history.event.itemCount': '{count} items',
      'screens.history.event.at': 'at {time}',
      'screens.history.event.aiPick': 'AI pick',
      'screens.history.event.yourOutfit': 'Your outfit',
      'screens.history.event.moreItems': '{count} more items',
    };
    return translations[key] || key;
  },
}));

// Mock hook result
interface MockHookResult {
  events: WearHistoryRow[];
  totalCount: number;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetching: boolean;
  fetchNextPage: jest.Mock;
  refetch: jest.Mock;
}

let mockHookResult: MockHookResult = {
  events: [],
  totalCount: 0,
  isLoading: false,
  isError: false,
  error: null,
  hasNextPage: false,
  isFetchingNextPage: false,
  isFetching: false,
  fetchNextPage: jest.fn(),
  refetch: jest.fn(),
};

jest.mock('../hooks/useWearHistoryInfiniteQuery', () => ({
  useWearHistoryInfiniteQuery: () => mockHookResult,
}));

// Mock WearEventCard to simplify testing
jest.mock('./WearEventCard', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const { Text: MockText, Pressable: MockPressable } = require('react-native');
  return {
    WearEventCard: ({ event, onPress }: { event: { id: string; context: string | null; worn_date: string }; onPress?: (e: unknown) => void }) => (
      <MockPressable onPress={() => onPress?.(event)} testID={`wear-event-${event.id}`}>
        <MockText>{event.context || 'No context'}</MockText>
        <MockText>{event.worn_date}</MockText>
      </MockPressable>
    ),
  };
});

// Sample test data
const createMockWearEvent = (overrides: Partial<WearHistoryRow> = {}): WearHistoryRow => ({
  id: 'event-1',
  user_id: 'test-user-123',
  outfit_id: 'outfit-1',
  item_ids: ['item-1', 'item-2'],
  worn_date: new Date().toISOString().split('T')[0], // Today
  worn_at: new Date().toISOString(),
  source: 'manual_outfit',
  context: 'Work meeting',
  notes: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

describe('WearHistoryScreen', () => {
  const TestWrapper = ({ children }: { children: React.ReactNode }) => (
    <ThemeProvider colorScheme="light">{children}</ThemeProvider>
  );

  const renderComponent = () => {
    return render(<WearHistoryScreen />, { wrapper: TestWrapper });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockHookResult = {
      events: [],
      totalCount: 0,
      isLoading: false,
      isError: false,
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
      isFetching: false,
      fetchNextPage: jest.fn(),
      refetch: jest.fn(),
    };
  });

  describe('Loading state', () => {
    it('should display loading indicator when isLoading is true', () => {
      mockHookResult.isLoading = true;

      const { getByLabelText } = renderComponent();

      expect(getByLabelText('Loading wear history...')).toBeTruthy();
    });
  });

  describe('Empty state', () => {
    it('should display empty state when no events and not loading', () => {
      mockHookResult.events = [];
      mockHookResult.isLoading = false;

      const { getByText } = renderComponent();

      expect(getByText('No wear history yet')).toBeTruthy();
      expect(getByText('Start logging your outfits')).toBeTruthy();
    });

    it('should display CTA button in empty state', () => {
      mockHookResult.events = [];
      mockHookResult.isLoading = false;

      const { getByText } = renderComponent();

      expect(getByText('Get outfit ideas')).toBeTruthy();
    });

    it('should navigate to home when CTA button pressed', () => {
      mockHookResult.events = [];
      mockHookResult.isLoading = false;

      const { getByText } = renderComponent();
      const ctaButton = getByText('Get outfit ideas');

      fireEvent.press(ctaButton);

      expect(mockRouter.replace).toHaveBeenCalledWith('/home');
    });

    it('should use MaterialIcons component for empty state icon (not emoji)', () => {
      mockHookResult.events = [];
      mockHookResult.isLoading = false;
      mockMaterialIconsComponent.mockClear();

      const { getByTestId } = renderComponent();

      // Verify MaterialIcons is rendered with correct props
      expect(getByTestId('material-icon')).toBeTruthy();
      expect(mockMaterialIconsComponent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'event',
          size: 48,
        })
      );
    });

    it('should have accessible icon label in empty state', () => {
      mockHookResult.events = [];
      mockHookResult.isLoading = false;

      const { getByLabelText } = renderComponent();

      expect(getByLabelText('Calendar icon')).toBeTruthy();
    });
  });

  describe('Error state', () => {
    it('should display error message when isError is true', () => {
      mockHookResult.isError = true;
      mockHookResult.error = new Error('Network error');

      const { getByText } = renderComponent();

      expect(getByText('Could not load wear history')).toBeTruthy();
    });

    it('should display retry button in error state', () => {
      mockHookResult.isError = true;
      mockHookResult.error = new Error('Network error');

      const { getByText } = renderComponent();

      expect(getByText('Retry')).toBeTruthy();
    });

    it('should call refetch when retry button pressed', () => {
      mockHookResult.isError = true;
      mockHookResult.error = new Error('Network error');

      const { getByText } = renderComponent();
      const retryButton = getByText('Retry');

      fireEvent.press(retryButton);

      expect(mockHookResult.refetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Event list', () => {
    it('should render events when data is loaded', () => {
      mockHookResult.events = [
        createMockWearEvent({ id: 'event-1', context: 'Work meeting' }),
        createMockWearEvent({ id: 'event-2', context: 'Date night' }),
      ];
      mockHookResult.totalCount = 2;

      const { getByTestId } = renderComponent();

      expect(getByTestId('wear-event-event-1')).toBeTruthy();
      expect(getByTestId('wear-event-event-2')).toBeTruthy();
    });

    it('should render section headers for date groups', () => {
      mockHookResult.events = [
        createMockWearEvent({ id: 'event-1', worn_date: new Date().toISOString().split('T')[0] }),
      ];
      mockHookResult.totalCount = 1;

      const { getByText } = renderComponent();

      expect(getByText('Today')).toBeTruthy();
    });
  });

  describe('Navigation', () => {
    it('should navigate back when back button pressed', () => {
      mockHookResult.events = [createMockWearEvent()];

      const { getByLabelText } = renderComponent();
      const backButton = getByLabelText('Go back');

      fireEvent.press(backButton);

      expect(mockRouter.back).toHaveBeenCalledTimes(1);
    });

    it('should navigate to outfit detail when event card pressed', () => {
      const mockEvent = createMockWearEvent({ id: 'event-1', outfit_id: 'outfit-123' });
      mockHookResult.events = [mockEvent];

      const { getByTestId } = renderComponent();
      const eventCard = getByTestId('wear-event-event-1');

      fireEvent.press(eventCard);

      expect(mockRouter.push).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/outfit/[id]',
          params: expect.objectContaining({
            id: 'outfit-123',
            wearHistoryId: 'event-1',
          }),
        })
      );
    });

    it('should track telemetry when event card pressed', () => {
      const mockEvent = createMockWearEvent({
        id: 'event-1',
        outfit_id: 'outfit-123',
        source: 'ai_recommendation',
      });
      mockHookResult.events = [mockEvent];

      const { getByTestId } = renderComponent();
      const eventCard = getByTestId('wear-event-event-1');

      fireEvent.press(eventCard);

      expect(trackCaptureEvent).toHaveBeenCalledWith(
        'wear_history_event_tapped',
        expect.objectContaining({
          userId: 'test-user-123',
          metadata: expect.objectContaining({
            eventId: 'event-1',
            outfitId: 'outfit-123',
            source: 'ai_recommendation',
          }),
        })
      );
    });
  });

  describe('Screen title', () => {
    it('should display wear history title', () => {
      mockHookResult.events = [createMockWearEvent()];

      const { getByText } = renderComponent();

      expect(getByText('Wear History')).toBeTruthy();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible back button', () => {
      mockHookResult.events = [createMockWearEvent()];

      const { getByLabelText } = renderComponent();

      const backButton = getByLabelText('Go back');
      expect(backButton).toBeTruthy();
    });
  });
});
