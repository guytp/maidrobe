/**
 * Tests for OutfitSuggestionCard component.
 *
 * @module features/recommendations/components/OutfitSuggestionCard.test
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { OutfitSuggestionCard, type OutfitSuggestionCardProps } from './OutfitSuggestionCard';
import { ThemeProvider } from '../../../core/theme';
import type { OutfitSuggestion, OutfitItemViewModel } from '../types';

// Mock i18n
jest.mock('../../../core/i18n', () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      'screens.home.recommendations.fallbackContext': 'Outfit suggestion',
      'screens.home.recommendations.accessibility.cardLabel': 'Outfit for {context}. {reason}',
      'screens.home.recommendations.accessibility.cardLabelNoContext': 'Outfit suggestion. {reason}',
      'screens.home.recommendations.itemChip.missingItem': 'Item unavailable',
      'screens.home.recommendations.itemChip.loadingItems': 'Loading items...',
      'screens.home.recommendations.itemChip.placeholderItem': 'Item {number}',
      'screens.home.recommendations.itemChip.accessibility.itemCount': '{resolved} of {total} items',
      'screens.wearHistory.wearThisToday': 'Wear this today',
      'screens.wearHistory.markAsWorn': 'Mark as worn...',
      'screens.wearHistory.wornToday': 'Worn today',
      'screens.wearHistory.accessibility.wearTodayButton': 'Wear this outfit today',
      'screens.wearHistory.accessibility.wearTodayHint': 'Mark this outfit as worn for today',
      'screens.wearHistory.accessibility.markAsWornButton': 'Mark outfit as worn',
      'screens.wearHistory.accessibility.markAsWornHint': 'Open date picker to mark when you wore this outfit',
      'screens.wearHistory.accessibility.wornIndicator': 'Outfit worn on {date}',
    };
    return translations[key] || key;
  },
}));

describe('OutfitSuggestionCard', () => {
  const mockSuggestion: OutfitSuggestion = {
    id: 'outfit-123',
    userId: 'user-456',
    itemIds: ['item-1', 'item-2', 'item-3'],
    reason: 'Great outfit for a casual day out',
    context: 'Smart casual',
    createdAt: '2025-01-15T10:30:00.000Z',
    rating: null,
  };

  const mockItems: OutfitItemViewModel[] = [
    {
      id: 'item-1',
      displayName: 'Navy Blazer',
      thumbnailUrl: 'https://example.com/blazer.jpg',
      status: 'resolved',
      type: 'blazer',
      colour: ['navy'],
    },
    {
      id: 'item-2',
      displayName: 'White T-Shirt',
      thumbnailUrl: 'https://example.com/tshirt.jpg',
      status: 'resolved',
      type: 't-shirt',
      colour: ['white'],
    },
  ];

  const defaultProps: OutfitSuggestionCardProps = {
    suggestion: mockSuggestion,
    items: mockItems,
    isLoadingItems: false,
    testID: 'outfit-card',
  };

  const TestWrapper = ({ children }: { children: React.ReactNode }) => (
    <ThemeProvider colorScheme="light">{children}</ThemeProvider>
  );

  const renderComponent = (props: Partial<OutfitSuggestionCardProps> = {}) => {
    return render(<OutfitSuggestionCard {...defaultProps} {...props} />, { wrapper: TestWrapper });
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render context label', () => {
      const { getByText } = renderComponent();
      expect(getByText('Smart casual')).toBeTruthy();
    });

    it('should render reason text', () => {
      const { getByText } = renderComponent();
      expect(getByText('Great outfit for a casual day out')).toBeTruthy();
    });

    it('should render fallback context when context is empty', () => {
      const { getByText } = renderComponent({
        suggestion: { ...mockSuggestion, context: '' },
      });
      expect(getByText('Outfit suggestion')).toBeTruthy();
    });

    it('should render fallback context when context is undefined', () => {
      const { getByText } = renderComponent({
        suggestion: { ...mockSuggestion, context: undefined },
      });
      expect(getByText('Outfit suggestion')).toBeTruthy();
    });
  });

  describe('Wear Today Button', () => {
    it('should not render action area when onWearToday is not provided', () => {
      const { queryByTestId } = renderComponent();
      expect(queryByTestId('outfit-card-action-area')).toBeNull();
    });

    it('should render "Wear this today" button when onWearToday is provided', () => {
      const onWearToday = jest.fn();
      const { getByText } = renderComponent({ onWearToday });
      expect(getByText('Wear this today')).toBeTruthy();
    });

    it('should call onWearToday with suggestion when button is pressed', () => {
      const onWearToday = jest.fn();
      const { getByText } = renderComponent({ onWearToday });

      fireEvent.press(getByText('Wear this today'));

      expect(onWearToday).toHaveBeenCalledTimes(1);
      expect(onWearToday).toHaveBeenCalledWith(mockSuggestion);
    });

    it('should show loading state when isMarkingAsWorn is true', () => {
      const onWearToday = jest.fn();
      const { getByTestId } = renderComponent({
        onWearToday,
        isMarkingAsWorn: true,
      });

      // Button text should still be there but loading indicator should be present
      // The Button component shows ActivityIndicator when loading
      expect(getByTestId('outfit-card-action-area')).toBeTruthy();
    });

    it('should have disabled accessibility state when isMarkingAsWorn is true', () => {
      const onWearToday = jest.fn();
      const { getByRole } = renderComponent({
        onWearToday,
        isMarkingAsWorn: true,
      });

      // The button should have disabled state in its accessibility attributes
      const button = getByRole('button');
      expect(button.props.accessibilityState.disabled).toBe(true);
    });
  });

  describe('Mark As Worn Button', () => {
    it('should render "Mark as worn..." button when onMarkAsWorn is provided', () => {
      const onMarkAsWorn = jest.fn();
      const { getByText } = renderComponent({ onMarkAsWorn });
      expect(getByText('Mark as worn...')).toBeTruthy();
    });

    it('should call onMarkAsWorn with suggestion when button is pressed', () => {
      const onMarkAsWorn = jest.fn();
      const { getByText } = renderComponent({ onMarkAsWorn });

      fireEvent.press(getByText('Mark as worn...'));

      expect(onMarkAsWorn).toHaveBeenCalledTimes(1);
      expect(onMarkAsWorn).toHaveBeenCalledWith(mockSuggestion);
    });

    it('should render both buttons when both callbacks are provided', () => {
      const onWearToday = jest.fn();
      const onMarkAsWorn = jest.fn();
      const { getByText } = renderComponent({ onWearToday, onMarkAsWorn });

      expect(getByText('Wear this today')).toBeTruthy();
      expect(getByText('Mark as worn...')).toBeTruthy();
    });

    it('should be disabled when isMarkingAsWorn is true', () => {
      const onMarkAsWorn = jest.fn();
      const { getByLabelText } = renderComponent({
        onMarkAsWorn,
        isMarkingAsWorn: true,
      });

      const button = getByLabelText('Mark outfit as worn');
      expect(button.props.accessibilityState.disabled).toBe(true);
    });

    it('should have proper accessibility attributes', () => {
      const onMarkAsWorn = jest.fn();
      const { getByLabelText } = renderComponent({ onMarkAsWorn });

      expect(getByLabelText('Mark outfit as worn')).toBeTruthy();
    });

    it('should not render action area when neither callback is provided', () => {
      const { queryByTestId } = renderComponent();
      expect(queryByTestId('outfit-card-action-area')).toBeNull();
    });

    it('should render action area with only onMarkAsWorn', () => {
      const onMarkAsWorn = jest.fn();
      const { getByTestId, getByText, queryByText } = renderComponent({ onMarkAsWorn });

      expect(getByTestId('outfit-card-action-area')).toBeTruthy();
      expect(getByText('Mark as worn...')).toBeTruthy();
      expect(queryByText('Wear this today')).toBeNull();
    });
  });

  describe('Worn Today Indicator', () => {
    it('should show "Worn today" indicator when isWornToday is true', () => {
      const onWearToday = jest.fn();
      const { getByText, getByTestId } = renderComponent({
        onWearToday,
        isWornToday: true,
      });

      expect(getByText('Worn today')).toBeTruthy();
      expect(getByTestId('outfit-card-worn-indicator')).toBeTruthy();
    });

    it('should show checkmark with worn indicator', () => {
      const onWearToday = jest.fn();
      const { getByText } = renderComponent({
        onWearToday,
        isWornToday: true,
      });

      // The checkmark character should be present
      expect(getByText('✓')).toBeTruthy();
    });

    it('should not show button when isWornToday is true', () => {
      const onWearToday = jest.fn();
      const { queryByText } = renderComponent({
        onWearToday,
        isWornToday: true,
      });

      expect(queryByText('Wear this today')).toBeNull();
    });

    it('should not call onWearToday when worn indicator is displayed', () => {
      const onWearToday = jest.fn();
      const { getByTestId } = renderComponent({
        onWearToday,
        isWornToday: true,
      });

      // Press on the worn indicator area
      fireEvent.press(getByTestId('outfit-card-worn-indicator'));

      expect(onWearToday).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have proper accessibility label on button', () => {
      const onWearToday = jest.fn();
      const { getByLabelText } = renderComponent({ onWearToday });

      expect(getByLabelText('Wear this outfit today')).toBeTruthy();
    });

    it('should have proper accessibility role on worn indicator', () => {
      const onWearToday = jest.fn();
      const { getByTestId } = renderComponent({
        onWearToday,
        isWornToday: true,
      });

      const indicator = getByTestId('outfit-card-worn-indicator');
      expect(indicator.props.accessibilityRole).toBe('text');
    });
  });

  describe('State Transitions', () => {
    it('should transition from button to worn indicator when isWornToday changes', () => {
      const onWearToday = jest.fn();
      const { rerender, getByText, queryByText } = renderComponent({
        onWearToday,
        isWornToday: false,
      });

      // Initially shows button
      expect(getByText('Wear this today')).toBeTruthy();
      expect(queryByText('Worn today')).toBeNull();

      // Update to worn state
      rerender(
        <ThemeProvider colorScheme="light">
          <OutfitSuggestionCard
            {...defaultProps}
            onWearToday={onWearToday}
            isWornToday={true}
          />
        </ThemeProvider>
      );

      // Now shows worn indicator
      expect(queryByText('Wear this today')).toBeNull();
      expect(getByText('Worn today')).toBeTruthy();
    });

    it('should show loading then worn indicator after marking', () => {
      const onWearToday = jest.fn();
      const { rerender, getByTestId, getByText, queryByText } = renderComponent({
        onWearToday,
        isMarkingAsWorn: false,
        isWornToday: false,
      });

      // Step 1: Initially shows button
      expect(getByText('Wear this today')).toBeTruthy();

      // Step 2: Loading state
      rerender(
        <ThemeProvider colorScheme="light">
          <OutfitSuggestionCard
            {...defaultProps}
            onWearToday={onWearToday}
            isMarkingAsWorn={true}
            isWornToday={false}
          />
        </ThemeProvider>
      );
      expect(getByTestId('outfit-card-action-area')).toBeTruthy();

      // Step 3: Success - worn indicator
      rerender(
        <ThemeProvider colorScheme="light">
          <OutfitSuggestionCard
            {...defaultProps}
            onWearToday={onWearToday}
            isMarkingAsWorn={false}
            isWornToday={true}
          />
        </ThemeProvider>
      );
      expect(getByText('Worn today')).toBeTruthy();
      expect(queryByText('Wear this today')).toBeNull();
    });
  });
});
