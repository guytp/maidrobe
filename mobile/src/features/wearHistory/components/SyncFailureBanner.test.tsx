/**
 * Tests for SyncFailureBanner component.
 *
 * This test suite validates the behavior of the sync failure banner,
 * including visibility, messaging, accessibility, and user interactions.
 *
 * @module features/wearHistory/components/SyncFailureBanner.test
 */

import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import { SyncFailureBanner, SyncFailureBannerProps } from './SyncFailureBanner';

// Mock i18n
jest.mock('../../../core/i18n', () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      'screens.wearHistory.syncFailure.message': "Some items couldn't sync",
      'screens.wearHistory.syncFailure.itemCount.one': '1 item failed to sync',
      'screens.wearHistory.syncFailure.itemCount.other': '{count} items failed to sync',
      'screens.wearHistory.syncFailure.retry': 'Try again',
      'screens.wearHistory.syncFailure.accessibility.retryButton': 'Retry syncing failed items',
      'screens.wearHistory.syncFailure.accessibility.retryHint':
        'Attempt to sync the failed wear records again',
      'screens.wearHistory.syncFailure.accessibility.dismissButton':
        'Dismiss sync failure notification',
      'screens.wearHistory.syncFailure.accessibility.dismissHint':
        'Hide this notification without retrying',
    };
    return translations[key] ?? key;
  },
}));

// Mock theme
jest.mock('../../../core/theme', () => ({
  useTheme: () => ({
    colors: {
      error: '#FF0000',
      errorText: '#FFFFFF',
      textPrimary: '#000000',
      textSecondary: '#666666',
    },
    spacing: {
      xs: 4,
      sm: 8,
      md: 16,
    },
    fontSize: {
      xs: 12,
      sm: 14,
      lg: 18,
    },
    radius: {
      sm: 4,
      md: 8,
    },
  }),
}));

describe('SyncFailureBanner', () => {
  const defaultProps: SyncFailureBannerProps = {
    failedCount: 1,
    visible: true,
    onRetry: jest.fn(),
    testID: 'sync-failure-banner',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Visibility', () => {
    it('should render when visible is true', () => {
      render(<SyncFailureBanner {...defaultProps} />);

      expect(screen.getByTestId('sync-failure-banner')).toBeTruthy();
    });

    it('should not render when visible is false', () => {
      render(<SyncFailureBanner {...defaultProps} visible={false} />);

      expect(screen.queryByTestId('sync-failure-banner')).toBeNull();
    });

    it('should render retry button when visible', () => {
      render(<SyncFailureBanner {...defaultProps} />);

      expect(screen.getByTestId('sync-failure-banner-retry')).toBeTruthy();
    });
  });

  describe('Messaging', () => {
    it('should display the main error message', () => {
      render(<SyncFailureBanner {...defaultProps} />);

      expect(screen.getByText("Some items couldn't sync")).toBeTruthy();
    });

    it('should display singular item count message for failedCount of 1', () => {
      render(<SyncFailureBanner {...defaultProps} failedCount={1} />);

      expect(screen.getByText('1 item failed to sync')).toBeTruthy();
    });

    it('should display plural item count message for failedCount greater than 1', () => {
      render(<SyncFailureBanner {...defaultProps} failedCount={3} />);

      expect(screen.getByText('3 items failed to sync')).toBeTruthy();
    });

    it('should display plural item count message for failedCount of 0', () => {
      render(<SyncFailureBanner {...defaultProps} failedCount={0} />);

      expect(screen.getByText('0 items failed to sync')).toBeTruthy();
    });

    it('should display retry button text', () => {
      render(<SyncFailureBanner {...defaultProps} />);

      expect(screen.getByText('Try again')).toBeTruthy();
    });
  });

  describe('Interactions', () => {
    it('should call onRetry when retry button is pressed', () => {
      const onRetry = jest.fn();
      render(<SyncFailureBanner {...defaultProps} onRetry={onRetry} />);

      fireEvent.press(screen.getByTestId('sync-failure-banner-retry'));

      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('should call onDismiss when dismiss button is pressed', () => {
      const onDismiss = jest.fn();
      render(<SyncFailureBanner {...defaultProps} onDismiss={onDismiss} />);

      fireEvent.press(screen.getByTestId('sync-failure-banner-dismiss'));

      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('should not render dismiss button when onDismiss is not provided', () => {
      render(<SyncFailureBanner {...defaultProps} onDismiss={undefined} />);

      expect(screen.queryByTestId('sync-failure-banner-dismiss')).toBeNull();
    });

    it('should render dismiss button when onDismiss is provided', () => {
      render(<SyncFailureBanner {...defaultProps} onDismiss={jest.fn()} />);

      expect(screen.getByTestId('sync-failure-banner-dismiss')).toBeTruthy();
    });
  });

  describe('Accessibility', () => {
    it('should have alert role on container', () => {
      render(<SyncFailureBanner {...defaultProps} />);

      const container = screen.getByTestId('sync-failure-banner');
      expect(container.props.accessibilityRole).toBe('alert');
    });

    it('should have button role on retry button', () => {
      render(<SyncFailureBanner {...defaultProps} />);

      const retryButton = screen.getByTestId('sync-failure-banner-retry');
      expect(retryButton.props.accessibilityRole).toBe('button');
    });

    it('should have proper accessibility label on retry button', () => {
      render(<SyncFailureBanner {...defaultProps} />);

      const retryButton = screen.getByTestId('sync-failure-banner-retry');
      expect(retryButton.props.accessibilityLabel).toBe('Retry syncing failed items');
    });

    it('should have proper accessibility hint on retry button', () => {
      render(<SyncFailureBanner {...defaultProps} />);

      const retryButton = screen.getByTestId('sync-failure-banner-retry');
      expect(retryButton.props.accessibilityHint).toBe(
        'Attempt to sync the failed wear records again'
      );
    });

    it('should have button role on dismiss button', () => {
      render(<SyncFailureBanner {...defaultProps} onDismiss={jest.fn()} />);

      const dismissButton = screen.getByTestId('sync-failure-banner-dismiss');
      expect(dismissButton.props.accessibilityRole).toBe('button');
    });

    it('should have proper accessibility label on dismiss button', () => {
      render(<SyncFailureBanner {...defaultProps} onDismiss={jest.fn()} />);

      const dismissButton = screen.getByTestId('sync-failure-banner-dismiss');
      expect(dismissButton.props.accessibilityLabel).toBe('Dismiss sync failure notification');
    });

    it('should have proper accessibility hint on dismiss button', () => {
      render(<SyncFailureBanner {...defaultProps} onDismiss={jest.fn()} />);

      const dismissButton = screen.getByTestId('sync-failure-banner-dismiss');
      expect(dismissButton.props.accessibilityHint).toBe('Hide this notification without retrying');
    });
  });

  describe('Touch targets', () => {
    it('should have minimum touch target size for retry button', () => {
      render(<SyncFailureBanner {...defaultProps} />);

      const retryButton = screen.getByTestId('sync-failure-banner-retry');
      const style = retryButton.props.style;

      // Check that the button has minimum 44px touch target
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
      expect(style.minWidth).toBeGreaterThanOrEqual(44);
    });

    it('should have minimum touch target size for dismiss button', () => {
      render(<SyncFailureBanner {...defaultProps} onDismiss={jest.fn()} />);

      const dismissButton = screen.getByTestId('sync-failure-banner-dismiss');
      const style = dismissButton.props.style;

      // Check that the button has minimum 44px touch target
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
      expect(style.minWidth).toBeGreaterThanOrEqual(44);
    });
  });

  describe('TestID propagation', () => {
    it('should apply testID to container', () => {
      render(<SyncFailureBanner {...defaultProps} testID="custom-test-id" />);

      expect(screen.getByTestId('custom-test-id')).toBeTruthy();
    });

    it('should apply testID suffix to retry button', () => {
      render(<SyncFailureBanner {...defaultProps} testID="custom-test-id" />);

      expect(screen.getByTestId('custom-test-id-retry')).toBeTruthy();
    });

    it('should apply testID suffix to dismiss button', () => {
      render(<SyncFailureBanner {...defaultProps} testID="custom-test-id" onDismiss={jest.fn()} />);

      expect(screen.getByTestId('custom-test-id-dismiss')).toBeTruthy();
    });

    it('should not add testID to buttons when testID is not provided', () => {
      render(
        <SyncFailureBanner
          failedCount={1}
          visible={true}
          onRetry={jest.fn()}
          onDismiss={jest.fn()}
        />
      );

      // Buttons should still render but without testIDs
      expect(screen.getByText('Try again')).toBeTruthy();
      expect(screen.getByText('×')).toBeTruthy();
    });
  });

  describe('Edge cases', () => {
    it('should handle large failedCount values', () => {
      render(<SyncFailureBanner {...defaultProps} failedCount={999} />);

      expect(screen.getByText('999 items failed to sync')).toBeTruthy();
    });

    it('should handle rapid retry button presses', () => {
      const onRetry = jest.fn();
      render(<SyncFailureBanner {...defaultProps} onRetry={onRetry} />);

      const retryButton = screen.getByTestId('sync-failure-banner-retry');

      // Simulate rapid presses
      fireEvent.press(retryButton);
      fireEvent.press(retryButton);
      fireEvent.press(retryButton);

      expect(onRetry).toHaveBeenCalledTimes(3);
    });

    it('should handle rapid dismiss button presses', () => {
      const onDismiss = jest.fn();
      render(<SyncFailureBanner {...defaultProps} onDismiss={onDismiss} />);

      const dismissButton = screen.getByTestId('sync-failure-banner-dismiss');

      // Simulate rapid presses
      fireEvent.press(dismissButton);
      fireEvent.press(dismissButton);
      fireEvent.press(dismissButton);

      expect(onDismiss).toHaveBeenCalledTimes(3);
    });
  });
});
