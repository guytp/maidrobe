import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Animated } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import { Toast } from '../../src/core/components/Toast';
import { ThemeProvider } from '../../src/core/theme';

// Mock Animated API for predictable testing
const mockSpringStart = jest.fn();
const mockTimingStart = jest.fn();

jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');

describe('Toast', () => {
  const mockOnDismiss = jest.fn();

  const TestWrapper = ({ children }: { children: React.ReactNode }) => (
    <ThemeProvider colorScheme="light">{children}</ThemeProvider>
  );

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Mock Animated.spring
    jest.spyOn(Animated, 'spring').mockImplementation((value, config) => ({
      start: (callback?: (result: { finished: boolean }) => void) => {
        mockSpringStart(config);
        if (callback) callback({ finished: true });
      },
      stop: jest.fn(),
      reset: jest.fn(),
    }));

    // Mock Animated.timing
    jest.spyOn(Animated, 'timing').mockImplementation((value, config) => ({
      start: (callback?: (result: { finished: boolean }) => void) => {
        mockTimingStart(config);
        if (callback) callback({ finished: true });
      },
      stop: jest.fn(),
      reset: jest.fn(),
    }));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllTimers();
    jest.restoreAllMocks();
  });

  describe('Visibility Toggling', () => {
    it('should render when visible is true', () => {
      const { getByText } = render(
        <Toast visible={true} message="Test message" onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      expect(getByText('Test message')).toBeTruthy();
    });

    it('should return null when visible is false', () => {
      const { queryByText } = render(
        <Toast visible={false} message="Test message" onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      expect(queryByText('Test message')).toBeNull();
    });

    it('should display message when visible', () => {
      const { getByText } = render(
        <Toast visible={true} message="Success message" onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      expect(getByText('Success message')).toBeTruthy();
    });

    it('should hide toast initially when visible is false', () => {
      const { queryByText } = render(
        <Toast visible={false} message="Hidden message" onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      expect(queryByText('Hidden message')).toBeNull();
    });

    it('should re-render when visibility changes from false to true', () => {
      const { rerender, getByText, queryByText } = render(
        <Toast visible={false} message="Test message" onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      expect(queryByText('Test message')).toBeNull();

      rerender(<Toast visible={true} message="Test message" onDismiss={mockOnDismiss} />);

      expect(getByText('Test message')).toBeTruthy();
    });
  });

  describe('Auto-Dismiss Timing', () => {
    it('should auto-dismiss after default duration (4000ms)', () => {
      render(<Toast visible={true} message="Test message" onDismiss={mockOnDismiss} />, {
        wrapper: TestWrapper,
      });

      expect(mockOnDismiss).not.toHaveBeenCalled();

      // Fast-forward time by 4000ms
      jest.advanceTimersByTime(4000);

      // onDismiss should be called after animation completes
      expect(mockOnDismiss).toHaveBeenCalled();
    });

    it('should auto-dismiss after custom duration', () => {
      render(
        <Toast visible={true} message="Test message" duration={2000} onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      expect(mockOnDismiss).not.toHaveBeenCalled();

      // Fast-forward time by 2000ms
      jest.advanceTimersByTime(2000);

      expect(mockOnDismiss).toHaveBeenCalled();
    });

    it('should call onDismiss after duration expires', () => {
      render(<Toast visible={true} message="Test message" onDismiss={mockOnDismiss} />, {
        wrapper: TestWrapper,
      });

      jest.advanceTimersByTime(4000);

      expect(mockOnDismiss).toHaveBeenCalledTimes(1);
    });

    it('should clear timeout on unmount', () => {
      const { unmount } = render(
        <Toast visible={true} message="Test message" onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      // Unmount before timeout expires
      unmount();

      // Advance time past the duration
      jest.advanceTimersByTime(5000);

      // onDismiss should not be called because timeout was cleared
      expect(mockOnDismiss).not.toHaveBeenCalled();
    });

    it('should reset timeout when visibility changes', () => {
      const { rerender } = render(
        <Toast visible={true} message="Test message" duration={4000} onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      // Advance time partially
      jest.advanceTimersByTime(2000);

      // Toggle visibility
      rerender(
        <Toast visible={false} message="Test message" duration={4000} onDismiss={mockOnDismiss} />
      );
      rerender(
        <Toast visible={true} message="Test message" duration={4000} onDismiss={mockOnDismiss} />
      );

      // Previous timeout should be cleared, new one started
      // Advance another 2000ms (total would be 4000 if timeout wasn't reset)
      jest.advanceTimersByTime(2000);

      // Should not have dismissed yet (only 2000ms into new timeout)
      expect(mockOnDismiss).not.toHaveBeenCalled();

      // Advance remaining 2000ms
      jest.advanceTimersByTime(2000);

      expect(mockOnDismiss).toHaveBeenCalled();
    });

    it('should not auto-dismiss when visible is false', () => {
      render(<Toast visible={false} message="Test message" onDismiss={mockOnDismiss} />, {
        wrapper: TestWrapper,
      });

      jest.advanceTimersByTime(5000);

      expect(mockOnDismiss).not.toHaveBeenCalled();
    });
  });

  describe('Manual Dismissal', () => {
    it('should call onDismiss when tapped', () => {
      const { getByText } = render(
        <Toast visible={true} message="Test message" onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      const toast = getByText('Test message');
      fireEvent.press(toast.parent?.parent as unknown as ReactTestInstance);

      expect(mockOnDismiss).toHaveBeenCalledTimes(1);
    });

    it('should trigger slide-out animation on manual dismiss', () => {
      const { getByText } = render(
        <Toast visible={true} message="Test message" onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      mockTimingStart.mockClear();

      const toast = getByText('Test message');
      fireEvent.press(toast.parent?.parent as unknown as ReactTestInstance);

      expect(mockTimingStart).toHaveBeenCalledWith(
        expect.objectContaining({
          toValue: -100,
          duration: 200,
        })
      );
    });

    it('should clear auto-dismiss timeout on manual dismiss', () => {
      const { getByText } = render(
        <Toast visible={true} message="Test message" duration={4000} onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      // Manually dismiss before auto-dismiss
      jest.advanceTimersByTime(2000);
      const toast = getByText('Test message');
      fireEvent.press(toast.parent?.parent as unknown as ReactTestInstance);

      expect(mockOnDismiss).toHaveBeenCalledTimes(1);

      // Advance past original auto-dismiss time
      jest.advanceTimersByTime(3000);

      // Should still only be called once
      expect(mockOnDismiss).toHaveBeenCalledTimes(1);
    });

    it('should remain responsive to tap throughout lifecycle', () => {
      const { getByText } = render(
        <Toast visible={true} message="Test message" onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      // Tap immediately
      const toast = getByText('Test message');
      fireEvent.press(toast.parent?.parent as unknown as ReactTestInstance);

      expect(mockOnDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe('Animations', () => {
    it('should trigger slide-in animation when visible becomes true', () => {
      mockSpringStart.mockClear();

      render(<Toast visible={true} message="Test message" onDismiss={mockOnDismiss} />, {
        wrapper: TestWrapper,
      });

      expect(mockSpringStart).toHaveBeenCalledWith(
        expect.objectContaining({
          toValue: 0,
          tension: 50,
          friction: 8,
        })
      );
    });

    it('should use Animated.spring for slide-in animation', () => {
      render(<Toast visible={true} message="Test message" onDismiss={mockOnDismiss} />, {
        wrapper: TestWrapper,
      });

      expect(Animated.spring).toHaveBeenCalled();
    });

    it('should trigger slide-out animation when visible becomes false', () => {
      mockTimingStart.mockClear();

      const { rerender } = render(
        <Toast visible={true} message="Test message" onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      rerender(<Toast visible={false} message="Test message" onDismiss={mockOnDismiss} />);

      expect(mockTimingStart).toHaveBeenCalledWith(
        expect.objectContaining({
          toValue: -100,
          duration: 200,
        })
      );
    });

    it('should use native driver for animations', () => {
      mockSpringStart.mockClear();

      render(<Toast visible={true} message="Test message" onDismiss={mockOnDismiss} />, {
        wrapper: TestWrapper,
      });

      expect(mockSpringStart).toHaveBeenCalledWith(
        expect.objectContaining({
          useNativeDriver: true,
        })
      );
    });

    it('should initialize slide animation with -100 value', () => {
      const { rerender } = render(
        <Toast visible={false} message="Test message" onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      mockSpringStart.mockClear();

      rerender(<Toast visible={true} message="Test message" onDismiss={mockOnDismiss} />);

      expect(mockSpringStart).toHaveBeenCalledWith(
        expect.objectContaining({
          toValue: 0,
        })
      );
    });
  });

  describe('Toast Types', () => {
    it('should render success type with green background', () => {
      const { getByText } = render(
        <Toast visible={true} message="Success" type="success" onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      const toast = getByText('Success').parent?.parent;
      expect(toast?.props.style).toEqual(
        expect.objectContaining({
          backgroundColor: '#10B981',
        })
      );
    });

    it('should render error type with error color', () => {
      const { getByText } = render(
        <Toast visible={true} message="Error" type="error" onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      const toast = getByText('Error').parent?.parent;
      expect(toast?.props.style.backgroundColor).toBeDefined();
    });

    it('should render info type with blue background', () => {
      const { getByText } = render(
        <Toast visible={true} message="Info" type="info" onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      const toast = getByText('Info').parent?.parent;
      expect(toast?.props.style).toEqual(
        expect.objectContaining({
          backgroundColor: '#3B82F6',
        })
      );
    });

    it('should default to info type when type not specified', () => {
      const { getByText } = render(
        <Toast visible={true} message="Default" onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      const toast = getByText('Default').parent?.parent;
      expect(toast?.props.style).toEqual(
        expect.objectContaining({
          backgroundColor: '#3B82F6',
        })
      );
    });

    it('should change background color when type prop changes', () => {
      const { getByText, rerender } = render(
        <Toast visible={true} message="Test" type="success" onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      let toast = getByText('Test').parent?.parent;
      expect(toast?.props.style).toEqual(
        expect.objectContaining({
          backgroundColor: '#10B981',
        })
      );

      rerender(<Toast visible={true} message="Test" type="error" onDismiss={mockOnDismiss} />);

      toast = getByText('Test').parent?.parent;
      expect(toast?.props.style.backgroundColor).toBeDefined();
      expect(toast?.props.style.backgroundColor).not.toBe('#10B981');
    });
  });

  describe('Accessibility', () => {
    it('should have alert accessibility role', () => {
      const { getByLabelText } = render(
        <Toast visible={true} message="Test message" onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      const toast = getByLabelText('Test message');
      expect(toast.props.accessibilityRole).toBe('alert');
    });

    it('should have polite live region', () => {
      const { getByLabelText } = render(
        <Toast visible={true} message="Test message" onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      const toast = getByLabelText('Test message');
      expect(toast.props.accessibilityLiveRegion).toBe('polite');
    });

    it('should set accessibility label to message', () => {
      const { getByLabelText } = render(
        <Toast visible={true} message="Important notification" onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      expect(getByLabelText('Important notification')).toBeTruthy();
    });

    it('should enable font scaling', () => {
      const { getByText } = render(
        <Toast visible={true} message="Test message" onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      const messageText = getByText('Test message');
      expect(messageText.props.allowFontScaling).toBe(true);
    });

    it('should set max font size multiplier to 2', () => {
      const { getByText } = render(
        <Toast visible={true} message="Test message" onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      const messageText = getByText('Test message');
      expect(messageText.props.maxFontSizeMultiplier).toBe(2);
    });

    it('should have minimum touch target of 44px', () => {
      const { getByText } = render(
        <Toast visible={true} message="Test message" onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      const toast = getByText('Test message').parent?.parent;
      expect(toast?.props.style).toEqual(
        expect.objectContaining({
          minHeight: 44,
        })
      );
    });
  });

  describe('Props and Rendering', () => {
    it('should render the message prop correctly', () => {
      const { getByText } = render(
        <Toast visible={true} message="Custom message text" onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      expect(getByText('Custom message text')).toBeTruthy();
    });

    it('should handle long messages with line limit', () => {
      const longMessage =
        'This is a very long message that should be limited to three lines maximum to prevent the toast from becoming too tall';

      const { getByText } = render(
        <Toast visible={true} message={longMessage} onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      const messageText = getByText(longMessage);
      expect(messageText.props.numberOfLines).toBe(3);
    });

    it('should handle empty message', () => {
      const { getByText } = render(
        <Toast visible={true} message="" onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      // Component should still render even with empty message
      const messageText = getByText('');
      expect(messageText).toBeTruthy();
    });

    it('should accept custom duration prop', () => {
      render(
        <Toast visible={true} message="Test" duration={1000} onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      jest.advanceTimersByTime(1000);

      expect(mockOnDismiss).toHaveBeenCalled();
    });

    it('should call onDismiss callback when provided', () => {
      const customOnDismiss = jest.fn();

      render(<Toast visible={true} message="Test" onDismiss={customOnDismiss} />, {
        wrapper: TestWrapper,
      });

      jest.advanceTimersByTime(4000);

      expect(customOnDismiss).toHaveBeenCalledTimes(1);
    });

    it('should update message when prop changes', () => {
      const { getByText, rerender } = render(
        <Toast visible={true} message="First message" onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      expect(getByText('First message')).toBeTruthy();

      rerender(<Toast visible={true} message="Second message" onDismiss={mockOnDismiss} />);

      expect(getByText('Second message')).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid visibility toggles', () => {
      const { rerender } = render(
        <Toast visible={true} message="Test" onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      // Rapid toggles
      rerender(<Toast visible={false} message="Test" onDismiss={mockOnDismiss} />);
      rerender(<Toast visible={true} message="Test" onDismiss={mockOnDismiss} />);
      rerender(<Toast visible={false} message="Test" onDismiss={mockOnDismiss} />);
      rerender(<Toast visible={true} message="Test" onDismiss={mockOnDismiss} />);

      // Should not crash and should be in visible state
      expect(mockOnDismiss).not.toHaveBeenCalled();
    });

    it('should have high z-index for overlay positioning', () => {
      const { getByText } = render(
        <Toast visible={true} message="Test" onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      const container = getByText('Test').parent?.parent?.parent?.parent;
      expect(container?.props.style[0]).toEqual(
        expect.objectContaining({
          zIndex: 9999,
        })
      );
    });

    it('should handle very long messages', () => {
      const veryLongMessage = 'A'.repeat(500);

      const { getByText } = render(
        <Toast visible={true} message={veryLongMessage} onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      const messageText = getByText(veryLongMessage);
      expect(messageText.props.numberOfLines).toBe(3);
    });

    it('should handle very short duration', () => {
      render(<Toast visible={true} message="Test" duration={100} onDismiss={mockOnDismiss} />, {
        wrapper: TestWrapper,
      });

      jest.advanceTimersByTime(100);

      expect(mockOnDismiss).toHaveBeenCalled();
    });

    it('should handle unmount during animation', () => {
      const { unmount } = render(
        <Toast visible={true} message="Test" onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      // Unmount immediately during slide-in animation
      unmount();

      // Should not crash
      expect(mockOnDismiss).not.toHaveBeenCalled();
    });

    it('should position at top of screen', () => {
      const { getByText } = render(
        <Toast visible={true} message="Test" onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      const container = getByText('Test').parent?.parent?.parent?.parent;
      expect(container?.props.style[0]).toEqual(
        expect.objectContaining({
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
        })
      );
    });
  });

  describe('Design and Layout', () => {
    it('should render with white text color', () => {
      const { getByText } = render(
        <Toast visible={true} message="Test" onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      const messageText = getByText('Test');
      expect(messageText.props.style).toEqual(
        expect.objectContaining({
          color: '#FFFFFF',
        })
      );
    });

    it('should center-align message text', () => {
      const { getByText } = render(
        <Toast visible={true} message="Test" onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      const messageText = getByText('Test');
      expect(messageText.props.style).toEqual(
        expect.objectContaining({
          textAlign: 'center',
        })
      );
    });

    it('should have shadow for depth effect', () => {
      const { getByText } = render(
        <Toast visible={true} message="Test" onDismiss={mockOnDismiss} />,
        { wrapper: TestWrapper }
      );

      const toast = getByText('Test').parent?.parent;
      expect(toast?.props.style).toEqual(
        expect.objectContaining({
          shadowColor: '#000',
          elevation: 5,
        })
      );
    });
  });
});
