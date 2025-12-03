/**
 * Tests for WearHistorySyncProvider component.
 *
 * This test suite validates the behavior of the sync provider,
 * including banner visibility management, retry behavior, and state tracking.
 *
 * @module features/wearHistory/components/WearHistorySyncProvider.test
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { Text, View, TouchableOpacity } from 'react-native';
import { WearHistorySyncProvider } from './WearHistorySyncProvider';

// Helper component for mocked banner - defined before mock to avoid hoisting issues
interface MockBannerProps {
  failedCount: number;
  onRetry: () => void;
  onDismiss: () => void;
  testID?: string;
}

function MockBannerComponent({
  failedCount,
  onRetry,
  onDismiss,
  testID,
}: MockBannerProps): React.JSX.Element {
  return (
    <View testID={testID}>
      <Text testID="banner-failed-count">{failedCount}</Text>
      <TouchableOpacity testID="banner-retry" onPress={onRetry}>
        <Text>Retry</Text>
      </TouchableOpacity>
      <TouchableOpacity testID="banner-dismiss" onPress={onDismiss}>
        <Text>Dismiss</Text>
      </TouchableOpacity>
    </View>
  );
}

// Mock the sync hook
const mockUsePendingWearEventsSync = jest.fn();
jest.mock('../hooks/usePendingWearEventsSync', () => ({
  usePendingWearEventsSync: () => mockUsePendingWearEventsSync(),
}));

// Mock SyncFailureBanner to simplify testing
jest.mock('./SyncFailureBanner', () => ({
  SyncFailureBanner: (props: {
    visible: boolean;
    failedCount: number;
    onRetry: () => void;
    onDismiss: () => void;
    testID?: string;
  }) =>
    props.visible ? (
      <MockBannerComponent
        failedCount={props.failedCount}
        onRetry={props.onRetry}
        onDismiss={props.onDismiss}
        testID={props.testID}
      />
    ) : null,
}))

describe('WearHistorySyncProvider', () => {
  const defaultSyncResult = {
    hasFailedEvents: false,
    failedCount: 0,
    retryFailedEvents: jest.fn(),
    isSyncing: false,
    pendingCount: 0,
    triggerSync: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePendingWearEventsSync.mockReturnValue(defaultSyncResult);
  });

  describe('Rendering', () => {
    it('should render children', () => {
      render(
        <WearHistorySyncProvider>
          <Text testID="child-content">Child Content</Text>
        </WearHistorySyncProvider>
      );

      expect(screen.getByTestId('child-content')).toBeTruthy();
      expect(screen.getByText('Child Content')).toBeTruthy();
    });

    it('should not show banner when there are no failed events', () => {
      mockUsePendingWearEventsSync.mockReturnValue({
        ...defaultSyncResult,
        hasFailedEvents: false,
        failedCount: 0,
      });

      render(
        <WearHistorySyncProvider>
          <Text>Content</Text>
        </WearHistorySyncProvider>
      );

      expect(screen.queryByTestId('sync-failure-banner')).toBeNull();
    });

    it('should show banner when there are failed events', () => {
      mockUsePendingWearEventsSync.mockReturnValue({
        ...defaultSyncResult,
        hasFailedEvents: true,
        failedCount: 2,
      });

      render(
        <WearHistorySyncProvider>
          <Text>Content</Text>
        </WearHistorySyncProvider>
      );

      expect(screen.getByTestId('sync-failure-banner')).toBeTruthy();
    });

    it('should pass correct failedCount to banner', () => {
      mockUsePendingWearEventsSync.mockReturnValue({
        ...defaultSyncResult,
        hasFailedEvents: true,
        failedCount: 5,
      });

      render(
        <WearHistorySyncProvider>
          <Text>Content</Text>
        </WearHistorySyncProvider>
      );

      expect(screen.getByTestId('banner-failed-count').props.children).toBe(5);
    });
  });

  describe('Banner dismissal', () => {
    it('should hide banner when dismissed', () => {
      mockUsePendingWearEventsSync.mockReturnValue({
        ...defaultSyncResult,
        hasFailedEvents: true,
        failedCount: 1,
      });

      render(
        <WearHistorySyncProvider>
          <Text>Content</Text>
        </WearHistorySyncProvider>
      );

      // Banner should be visible initially
      expect(screen.getByTestId('sync-failure-banner')).toBeTruthy();

      // Dismiss the banner
      act(() => {
        fireEvent.press(screen.getByTestId('banner-dismiss'));
      });

      // Banner should now be hidden
      expect(screen.queryByTestId('sync-failure-banner')).toBeNull();
    });

    it('should show banner again when new failures occur after dismissal', () => {
      const mockReturnValue = {
        ...defaultSyncResult,
        hasFailedEvents: true,
        failedCount: 1,
      };
      mockUsePendingWearEventsSync.mockReturnValue(mockReturnValue);

      const { rerender } = render(
        <WearHistorySyncProvider>
          <Text>Content</Text>
        </WearHistorySyncProvider>
      );

      // Dismiss the banner
      act(() => {
        fireEvent.press(screen.getByTestId('banner-dismiss'));
      });

      // Banner should be hidden
      expect(screen.queryByTestId('sync-failure-banner')).toBeNull();

      // Simulate new failures occurring (count increases)
      mockUsePendingWearEventsSync.mockReturnValue({
        ...mockReturnValue,
        failedCount: 3, // Increased from 1 to 3
      });

      // Re-render to trigger effect
      rerender(
        <WearHistorySyncProvider>
          <Text>Content</Text>
        </WearHistorySyncProvider>
      );

      // Banner should reappear due to new failures
      expect(screen.getByTestId('sync-failure-banner')).toBeTruthy();
    });

    it('should keep banner hidden if failure count does not increase', () => {
      mockUsePendingWearEventsSync.mockReturnValue({
        ...defaultSyncResult,
        hasFailedEvents: true,
        failedCount: 2,
      });

      const { rerender } = render(
        <WearHistorySyncProvider>
          <Text>Content</Text>
        </WearHistorySyncProvider>
      );

      // Dismiss the banner
      act(() => {
        fireEvent.press(screen.getByTestId('banner-dismiss'));
      });

      // Banner should be hidden
      expect(screen.queryByTestId('sync-failure-banner')).toBeNull();

      // Simulate same failure count (no new failures)
      // Re-render without changing failedCount
      rerender(
        <WearHistorySyncProvider>
          <Text>Content</Text>
        </WearHistorySyncProvider>
      );

      // Banner should stay hidden
      expect(screen.queryByTestId('sync-failure-banner')).toBeNull();
    });
  });

  describe('Retry functionality', () => {
    it('should call retryFailedEvents when retry button is pressed', () => {
      const retryFailedEvents = jest.fn();
      mockUsePendingWearEventsSync.mockReturnValue({
        ...defaultSyncResult,
        hasFailedEvents: true,
        failedCount: 1,
        retryFailedEvents,
      });

      render(
        <WearHistorySyncProvider>
          <Text>Content</Text>
        </WearHistorySyncProvider>
      );

      act(() => {
        fireEvent.press(screen.getByTestId('banner-retry'));
      });

      expect(retryFailedEvents).toHaveBeenCalledTimes(1);
    });

    it('should reset dismissal state when retry is pressed', () => {
      const retryFailedEvents = jest.fn();
      mockUsePendingWearEventsSync.mockReturnValue({
        ...defaultSyncResult,
        hasFailedEvents: true,
        failedCount: 1,
        retryFailedEvents,
      });

      const { rerender } = render(
        <WearHistorySyncProvider>
          <Text>Content</Text>
        </WearHistorySyncProvider>
      );

      // Banner should be visible
      expect(screen.getByTestId('sync-failure-banner')).toBeTruthy();

      // Press retry
      act(() => {
        fireEvent.press(screen.getByTestId('banner-retry'));
      });

      // Simulate failures remaining after retry
      rerender(
        <WearHistorySyncProvider>
          <Text>Content</Text>
        </WearHistorySyncProvider>
      );

      // Banner should still be visible (not dismissed)
      expect(screen.getByTestId('sync-failure-banner')).toBeTruthy();
    });
  });

  describe('State transitions', () => {
    it('should reset tracking state when all failures are resolved', () => {
      mockUsePendingWearEventsSync.mockReturnValue({
        ...defaultSyncResult,
        hasFailedEvents: true,
        failedCount: 2,
      });

      const { rerender } = render(
        <WearHistorySyncProvider>
          <Text>Content</Text>
        </WearHistorySyncProvider>
      );

      // Banner should be visible
      expect(screen.getByTestId('sync-failure-banner')).toBeTruthy();

      // Simulate all failures being resolved
      mockUsePendingWearEventsSync.mockReturnValue({
        ...defaultSyncResult,
        hasFailedEvents: false,
        failedCount: 0,
      });

      rerender(
        <WearHistorySyncProvider>
          <Text>Content</Text>
        </WearHistorySyncProvider>
      );

      // Banner should be hidden
      expect(screen.queryByTestId('sync-failure-banner')).toBeNull();

      // Simulate new failure occurring
      mockUsePendingWearEventsSync.mockReturnValue({
        ...defaultSyncResult,
        hasFailedEvents: true,
        failedCount: 1,
      });

      rerender(
        <WearHistorySyncProvider>
          <Text>Content</Text>
        </WearHistorySyncProvider>
      );

      // Banner should reappear for new failure
      expect(screen.getByTestId('sync-failure-banner')).toBeTruthy();
    });

    it('should handle transition from no failures to failures', () => {
      mockUsePendingWearEventsSync.mockReturnValue({
        ...defaultSyncResult,
        hasFailedEvents: false,
        failedCount: 0,
      });

      const { rerender } = render(
        <WearHistorySyncProvider>
          <Text>Content</Text>
        </WearHistorySyncProvider>
      );

      // Banner should be hidden initially
      expect(screen.queryByTestId('sync-failure-banner')).toBeNull();

      // Simulate failures occurring
      mockUsePendingWearEventsSync.mockReturnValue({
        ...defaultSyncResult,
        hasFailedEvents: true,
        failedCount: 1,
      });

      rerender(
        <WearHistorySyncProvider>
          <Text>Content</Text>
        </WearHistorySyncProvider>
      );

      // Banner should appear
      expect(screen.getByTestId('sync-failure-banner')).toBeTruthy();
    });
  });

  describe('Hook integration', () => {
    it('should call usePendingWearEventsSync hook', () => {
      render(
        <WearHistorySyncProvider>
          <Text>Content</Text>
        </WearHistorySyncProvider>
      );

      expect(mockUsePendingWearEventsSync).toHaveBeenCalled();
    });
  });

  describe('Multiple children', () => {
    it('should render multiple children correctly', () => {
      render(
        <WearHistorySyncProvider>
          <Text testID="child-1">First Child</Text>
          <Text testID="child-2">Second Child</Text>
          <Text testID="child-3">Third Child</Text>
        </WearHistorySyncProvider>
      );

      expect(screen.getByTestId('child-1')).toBeTruthy();
      expect(screen.getByTestId('child-2')).toBeTruthy();
      expect(screen.getByTestId('child-3')).toBeTruthy();
    });

    it('should render complex nested children', () => {
      render(
        <WearHistorySyncProvider>
          <View testID="nested-container">
            <Text testID="nested-child">Nested Content</Text>
          </View>
        </WearHistorySyncProvider>
      );

      expect(screen.getByTestId('nested-container')).toBeTruthy();
      expect(screen.getByTestId('nested-child')).toBeTruthy();
    });
  });
});
