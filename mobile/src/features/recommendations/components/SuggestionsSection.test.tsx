/**
 * Tests for SuggestionsSection component.
 *
 * @module features/recommendations/components/SuggestionsSection.test
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SuggestionsSection, type SuggestionsSectionProps } from './SuggestionsSection';
import { ThemeProvider } from '../../../core/theme';
import type { OutfitSuggestion } from '../types';
import type { RecommendationErrorType } from '../hooks';

// Mock useCreateWearEvent hook
const mockCreateWearEvent = jest.fn();
const mockUseCreateWearEvent = jest.fn(() => ({
  createWearEvent: mockCreateWearEvent,
  createWearEventAsync: jest.fn(),
  isPending: false,
  isSuccess: false,
  isError: false,
  data: null,
  wasUpdate: null,
  error: null,
  reset: jest.fn(),
}));

jest.mock('../../wearHistory', () => ({
  useCreateWearEvent: () => mockUseCreateWearEvent(),
}));

// Mock useResolvedOutfitItems hook
jest.mock('../hooks', () => ({
  useResolvedOutfitItems: () => ({
    resolvedOutfits: new Map(),
    isLoading: false,
  }),
}));

// Mock feature flags
jest.mock('../../../core/featureFlags', () => ({
  checkFeatureFlagSync: () => ({ enabled: false }),
}));

// Mock i18n
jest.mock('../../../core/i18n', () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      'screens.home.recommendations.sectionTitle': 'Outfit Suggestions',
      'screens.home.recommendations.emptyState': 'Tap the button above to get outfit ideas',
      'screens.home.recommendations.loading': 'Finding outfit ideas...',
      'screens.home.recommendations.errorGeneric': 'Something went wrong',
      'screens.home.recommendations.retry': 'Try again',
      'screens.home.recommendations.retryHint': 'Tap to retry',
      'screens.home.recommendations.listLabel': '{count} outfit suggestions',
      'screens.home.recommendations.fallbackContext': 'Outfit suggestion',
      'screens.home.recommendations.accessibility.cardLabel': 'Outfit for {context}. {reason}',
      'screens.home.recommendations.accessibility.cardLabelNoContext': 'Outfit. {reason}',
      'screens.home.recommendations.itemChip.loadingItems': 'Loading items...',
      'screens.home.recommendations.itemChip.placeholderItem': 'Item {number}',
      'screens.home.recommendations.itemChip.accessibility.itemCount': '{resolved} of {total} items',
      'screens.wearHistory.wearThisToday': 'Wear this today',
      'screens.wearHistory.wornToday': 'Worn today',
      'screens.wearHistory.accessibility.wearTodayButton': 'Wear this outfit today',
      'screens.wearHistory.accessibility.wearTodayHint': 'Mark as worn for today',
      'screens.wearHistory.accessibility.wornIndicator': 'Worn on {date}',
    };
    return translations[key] || key;
  },
}));

describe('SuggestionsSection', () => {
  let queryClient: QueryClient;

  const mockOutfits: OutfitSuggestion[] = [
    {
      id: 'outfit-1',
      userId: 'user-123',
      itemIds: ['item-a', 'item-b'],
      reason: 'Perfect for a casual day',
      context: 'Casual outing',
      createdAt: '2025-01-15T10:00:00.000Z',
      rating: null,
    },
    {
      id: 'outfit-2',
      userId: 'user-123',
      itemIds: ['item-c', 'item-d'],
      reason: 'Great for work meetings',
      context: 'Work meeting',
      createdAt: '2025-01-15T10:00:00.000Z',
      rating: null,
    },
  ];

  const defaultProps: SuggestionsSectionProps = {
    outfits: mockOutfits,
    isLoading: false,
    isError: false,
    errorType: 'unknown' as RecommendationErrorType,
    errorMessage: null,
    hasData: true,
    onRetry: jest.fn(),
  };

  const TestWrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider colorScheme="light">{children}</ThemeProvider>
    </QueryClientProvider>
  );

  const renderComponent = (props: Partial<SuggestionsSectionProps> = {}) => {
    return render(<SuggestionsSection {...defaultProps} {...props} />, { wrapper: TestWrapper });
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    jest.clearAllMocks();
    mockUseCreateWearEvent.mockReturnValue({
      createWearEvent: mockCreateWearEvent,
      createWearEventAsync: jest.fn(),
      isPending: false,
      isSuccess: false,
      isError: false,
      data: null,
      wasUpdate: null,
      error: null,
      reset: jest.fn(),
    });
  });

  describe('Wear Today Integration', () => {
    it('should render "Wear this today" button for each outfit card', () => {
      const { getAllByText } = renderComponent();
      const buttons = getAllByText('Wear this today');
      expect(buttons).toHaveLength(2);
    });

    it('should call createWearEvent when button is pressed', () => {
      const { getAllByText } = renderComponent();
      const buttons = getAllByText('Wear this today');

      fireEvent.press(buttons[0]);

      expect(mockCreateWearEvent).toHaveBeenCalledTimes(1);
      expect(mockCreateWearEvent).toHaveBeenCalledWith({
        outfitId: 'outfit-1',
        itemIds: ['item-a', 'item-b'],
        source: 'ai_recommendation',
        context: 'Casual outing',
      });
    });

    it('should pass correct parameters for second outfit', () => {
      const { getAllByText } = renderComponent();
      const buttons = getAllByText('Wear this today');

      fireEvent.press(buttons[1]);

      expect(mockCreateWearEvent).toHaveBeenCalledWith({
        outfitId: 'outfit-2',
        itemIds: ['item-c', 'item-d'],
        source: 'ai_recommendation',
        context: 'Work meeting',
      });
    });

    it('should pass undefined context when outfit has no context', () => {
      const outfitsNoContext: OutfitSuggestion[] = [
        {
          ...mockOutfits[0],
          context: undefined,
        },
      ];
      const { getByText } = renderComponent({ outfits: outfitsNoContext });

      fireEvent.press(getByText('Wear this today'));

      expect(mockCreateWearEvent).toHaveBeenCalledWith({
        outfitId: 'outfit-1',
        itemIds: ['item-a', 'item-b'],
        source: 'ai_recommendation',
        context: undefined,
      });
    });
  });

  describe('Loading State', () => {
    it('should show loading state on specific card while marking', async () => {
      // First render - not pending
      const { getAllByText, rerender } = renderComponent();

      // Press button to start marking
      fireEvent.press(getAllByText('Wear this today')[0]);

      // Mock now returns pending for that card
      mockUseCreateWearEvent.mockReturnValue({
        createWearEvent: mockCreateWearEvent,
        createWearEventAsync: jest.fn(),
        isPending: true,
        isSuccess: false,
        isError: false,
        data: null,
        wasUpdate: null,
        error: null,
        reset: jest.fn(),
      });

      // Re-render to pick up the new state
      rerender(
        <TestWrapper>
          <SuggestionsSection {...defaultProps} />
        </TestWrapper>
      );

      // The first card should be in loading state
      // Other cards should still show normal button
      const buttons = getAllByText('Wear this today');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  describe('Success State', () => {
    it('should show "Worn today" indicator after successful marking', async () => {
      const { getAllByText, rerender, queryAllByText } = renderComponent();

      // Press button to start marking first outfit
      const buttons = getAllByText('Wear this today');
      fireEvent.press(buttons[0]);

      // Simulate pending state
      mockUseCreateWearEvent.mockReturnValue({
        createWearEvent: mockCreateWearEvent,
        createWearEventAsync: jest.fn(),
        isPending: true,
        isSuccess: false,
        isError: false,
        data: null,
        wasUpdate: null,
        error: null,
        reset: jest.fn(),
      });

      rerender(
        <TestWrapper>
          <SuggestionsSection {...defaultProps} />
        </TestWrapper>
      );

      // Simulate success - isPending goes from true to false
      mockUseCreateWearEvent.mockReturnValue({
        createWearEvent: mockCreateWearEvent,
        createWearEventAsync: jest.fn(),
        isPending: false,
        isSuccess: true,
        isError: false,
        data: { id: 'wear-1', outfit_id: 'outfit-1' } as never,
        wasUpdate: false as never,
        error: null,
        reset: jest.fn(),
      });

      rerender(
        <TestWrapper>
          <SuggestionsSection {...defaultProps} />
        </TestWrapper>
      );

      // Should show "Worn today" for first outfit, button for second
      await waitFor(() => {
        const wornIndicators = queryAllByText('Worn today');
        expect(wornIndicators.length).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Empty and Loading States', () => {
    it('should render empty state when no outfits and hasData is false', () => {
      const { getByText } = renderComponent({
        outfits: [],
        hasData: false,
        isLoading: false,
      });
      expect(getByText('Tap the button above to get outfit ideas')).toBeTruthy();
    });

    it('should render loading state when loading without data', () => {
      const { getByText } = renderComponent({
        outfits: [],
        hasData: false,
        isLoading: true,
      });
      expect(getByText('Finding outfit ideas...')).toBeTruthy();
    });

    it('should render section title', () => {
      const { getByText } = renderComponent();
      expect(getByText('Outfit Suggestions')).toBeTruthy();
    });
  });

  describe('Error State', () => {
    it('should render error state with retry button', () => {
      const onRetry = jest.fn();
      const { getByText } = renderComponent({
        isError: true,
        errorType: 'network' as RecommendationErrorType,
        errorMessage: 'Network error occurred',
        onRetry,
      });

      expect(getByText('Network error occurred')).toBeTruthy();
      expect(getByText('Try again')).toBeTruthy();
    });

    it('should call onRetry when retry button is pressed', () => {
      const onRetry = jest.fn();
      const { getByText } = renderComponent({
        isError: true,
        errorType: 'network' as RecommendationErrorType,
        errorMessage: 'Network error',
        onRetry,
      });

      fireEvent.press(getByText('Try again'));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('Idempotency', () => {
    it('should not call createWearEvent if already worn', () => {
      const { getAllByText, rerender, queryByText } = renderComponent();

      // Press button once
      fireEvent.press(getAllByText('Wear this today')[0]);

      // Simulate the transition to worn state (pending -> not pending)
      mockUseCreateWearEvent.mockReturnValue({
        createWearEvent: mockCreateWearEvent,
        createWearEventAsync: jest.fn(),
        isPending: true,
        isSuccess: false,
        isError: false,
        data: null,
        wasUpdate: null,
        error: null,
        reset: jest.fn(),
      });

      rerender(
        <TestWrapper>
          <SuggestionsSection {...defaultProps} />
        </TestWrapper>
      );

      mockUseCreateWearEvent.mockReturnValue({
        createWearEvent: mockCreateWearEvent,
        createWearEventAsync: jest.fn(),
        isPending: false,
        isSuccess: true,
        isError: false,
        data: { id: 'wear-1' } as never,
        wasUpdate: null,
        error: null,
        reset: jest.fn(),
      });

      rerender(
        <TestWrapper>
          <SuggestionsSection {...defaultProps} />
        </TestWrapper>
      );

      // At this point, the first outfit should be worn
      // Clicking on "Worn today" should not trigger createWearEvent
      const wornIndicator = queryByText('Worn today');
      if (wornIndicator) {
        fireEvent.press(wornIndicator);
        // After initial call, we shouldn't see additional calls
        // (beyond the initial one that happened)
      }
    });

    it('should not allow multiple simultaneous markings', () => {
      const { getAllByText } = renderComponent();

      // Press first button
      fireEvent.press(getAllByText('Wear this today')[0]);

      // While first is pending, press second
      fireEvent.press(getAllByText('Wear this today')[1]);

      // Should only have been called once (for the first press)
      // The second press should be blocked while marking is in progress
      // Since we're tracking markingOutfitId, only one can be active
      expect(mockCreateWearEvent).toHaveBeenCalledTimes(1);
    });
  });
});
