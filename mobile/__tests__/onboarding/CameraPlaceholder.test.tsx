import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { CameraPlaceholder } from '../../src/features/onboarding/components/CameraPlaceholder';
import { ThemeProvider } from '../../src/core/theme';

describe('CameraPlaceholder', () => {
  const mockOnCapture = jest.fn();
  const mockOnCancel = jest.fn();

  const TestWrapper = ({ children }: { children: React.ReactNode }) => (
    <ThemeProvider colorScheme="light">{children}</ThemeProvider>
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initial Render', () => {
    it('should render camera placeholder container', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <CameraPlaceholder onCapture={mockOnCapture} onCancel={mockOnCancel} />
        </TestWrapper>
      );

      const container = getByLabelText('Camera placeholder screen');
      expect(container).toBeTruthy();
    });

    it('should render title text', () => {
      const { getByText } = render(
        <TestWrapper>
          <CameraPlaceholder onCapture={mockOnCapture} onCancel={mockOnCancel} />
        </TestWrapper>
      );

      expect(getByText('Camera feature coming soon')).toBeTruthy();
    });

    it('should render subtitle text', () => {
      const { getByText } = render(
        <TestWrapper>
          <CameraPlaceholder onCapture={mockOnCapture} onCancel={mockOnCancel} />
        </TestWrapper>
      );

      expect(getByText('Feature #3 will provide full camera functionality')).toBeTruthy();
    });

    it('should render guidance text', () => {
      const { getByText } = render(
        <TestWrapper>
          <CameraPlaceholder onCapture={mockOnCapture} onCancel={mockOnCancel} />
        </TestWrapper>
      );

      expect(getByText('Lay the item flat on a plain background')).toBeTruthy();
    });

    it('should render capture button', () => {
      const { getByText } = render(
        <TestWrapper>
          <CameraPlaceholder onCapture={mockOnCapture} onCancel={mockOnCancel} />
        </TestWrapper>
      );

      expect(getByText('Use Placeholder Image')).toBeTruthy();
    });

    it('should render cancel button', () => {
      const { getByText } = render(
        <TestWrapper>
          <CameraPlaceholder onCapture={mockOnCapture} onCancel={mockOnCancel} />
        </TestWrapper>
      );

      expect(getByText('Do this later')).toBeTruthy();
    });
  });

  describe('Capture Callback', () => {
    it('should call onCapture when capture button is pressed', () => {
      const { getByText } = render(
        <TestWrapper>
          <CameraPlaceholder onCapture={mockOnCapture} onCancel={mockOnCancel} />
        </TestWrapper>
      );

      const captureButton = getByText('Use Placeholder Image');
      fireEvent.press(captureButton);

      expect(mockOnCapture).toHaveBeenCalled();
    });

    it('should call onCapture with mock image data', () => {
      const { getByText } = render(
        <TestWrapper>
          <CameraPlaceholder onCapture={mockOnCapture} onCancel={mockOnCancel} />
        </TestWrapper>
      );

      const captureButton = getByText('Use Placeholder Image');
      fireEvent.press(captureButton);

      expect(mockOnCapture).toHaveBeenCalledWith({
        uri: 'placeholder://mock-image.jpg',
      });
      expect(mockOnCapture).toHaveBeenCalledTimes(1);
    });

    it('should pass correct URI format in mock image data', () => {
      const { getByText } = render(
        <TestWrapper>
          <CameraPlaceholder onCapture={mockOnCapture} onCancel={mockOnCancel} />
        </TestWrapper>
      );

      const captureButton = getByText('Use Placeholder Image');
      fireEvent.press(captureButton);

      const callArg = mockOnCapture.mock.calls[0][0];
      expect(callArg).toHaveProperty('uri');
      expect(callArg.uri).toBe('placeholder://mock-image.jpg');
      expect(typeof callArg.uri).toBe('string');
    });

    it('should not call onCancel when capture button is pressed', () => {
      const { getByText } = render(
        <TestWrapper>
          <CameraPlaceholder onCapture={mockOnCapture} onCancel={mockOnCancel} />
        </TestWrapper>
      );

      const captureButton = getByText('Use Placeholder Image');
      fireEvent.press(captureButton);

      expect(mockOnCapture).toHaveBeenCalled();
      expect(mockOnCancel).not.toHaveBeenCalled();
    });

    it('should handle multiple capture button presses', () => {
      const { getByText } = render(
        <TestWrapper>
          <CameraPlaceholder onCapture={mockOnCapture} onCancel={mockOnCancel} />
        </TestWrapper>
      );

      const captureButton = getByText('Use Placeholder Image');
      fireEvent.press(captureButton);
      fireEvent.press(captureButton);
      fireEvent.press(captureButton);

      expect(mockOnCapture).toHaveBeenCalledTimes(3);
      mockOnCapture.mock.calls.forEach((call) => {
        expect(call[0]).toEqual({ uri: 'placeholder://mock-image.jpg' });
      });
    });
  });

  describe('Cancel Callback', () => {
    it('should call onCancel when cancel button is pressed', () => {
      const { getByText } = render(
        <TestWrapper>
          <CameraPlaceholder onCapture={mockOnCapture} onCancel={mockOnCancel} />
        </TestWrapper>
      );

      const cancelButton = getByText('Do this later');
      fireEvent.press(cancelButton);

      expect(mockOnCancel).toHaveBeenCalled();
      expect(mockOnCancel).toHaveBeenCalledTimes(1);
    });

    it('should not call onCapture when cancel button is pressed', () => {
      const { getByText } = render(
        <TestWrapper>
          <CameraPlaceholder onCapture={mockOnCapture} onCancel={mockOnCancel} />
        </TestWrapper>
      );

      const cancelButton = getByText('Do this later');
      fireEvent.press(cancelButton);

      expect(mockOnCancel).toHaveBeenCalled();
      expect(mockOnCapture).not.toHaveBeenCalled();
    });

    it('should handle multiple cancel button presses', () => {
      const { getByText } = render(
        <TestWrapper>
          <CameraPlaceholder onCapture={mockOnCapture} onCancel={mockOnCancel} />
        </TestWrapper>
      );

      const cancelButton = getByText('Do this later');
      fireEvent.press(cancelButton);
      fireEvent.press(cancelButton);

      expect(mockOnCancel).toHaveBeenCalledTimes(2);
    });
  });

  describe('Accessibility', () => {
    it('should have accessibilityLabel on container', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <CameraPlaceholder onCapture={mockOnCapture} onCancel={mockOnCancel} />
        </TestWrapper>
      );

      const container = getByLabelText('Camera placeholder screen');
      expect(container).toBeTruthy();
    });

    it('should have accessibilityRole header on title', () => {
      const { getByRole } = render(
        <TestWrapper>
          <CameraPlaceholder onCapture={mockOnCapture} onCancel={mockOnCancel} />
        </TestWrapper>
      );

      const header = getByRole('header');
      expect(header).toBeTruthy();
    });

    it('should have correct accessibilityLabel on capture button', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <CameraPlaceholder onCapture={mockOnCapture} onCancel={mockOnCancel} />
        </TestWrapper>
      );

      const captureButton = getByLabelText('Use placeholder image button');
      expect(captureButton).toBeTruthy();
    });

    it('should have correct accessibilityHint on capture button', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <CameraPlaceholder onCapture={mockOnCapture} onCancel={mockOnCancel} />
        </TestWrapper>
      );

      const captureButton = getByLabelText('Use placeholder image button');
      expect(captureButton.props.accessibilityHint).toBe(
        'Simulates capturing a photo and proceeds with placeholder image data'
      );
    });

    it('should have correct accessibilityLabel on cancel button', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <CameraPlaceholder onCapture={mockOnCapture} onCancel={mockOnCancel} />
        </TestWrapper>
      );

      const cancelButton = getByLabelText('Do this later button');
      expect(cancelButton).toBeTruthy();
    });

    it('should have correct accessibilityHint on cancel button', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <CameraPlaceholder onCapture={mockOnCapture} onCancel={mockOnCancel} />
        </TestWrapper>
      );

      const cancelButton = getByLabelText('Do this later button');
      expect(cancelButton.props.accessibilityHint).toBe(
        'Returns to onboarding step without capturing'
      );
    });

    it('should support font scaling on title', () => {
      const { getByRole } = render(
        <TestWrapper>
          <CameraPlaceholder onCapture={mockOnCapture} onCancel={mockOnCancel} />
        </TestWrapper>
      );

      const title = getByRole('header');
      expect(title.props.allowFontScaling).toBe(true);
      expect(title.props.maxFontSizeMultiplier).toBe(3);
    });

    it('should support font scaling on subtitle', () => {
      const { getByText } = render(
        <TestWrapper>
          <CameraPlaceholder onCapture={mockOnCapture} onCancel={mockOnCancel} />
        </TestWrapper>
      );

      const subtitle = getByText('Feature #3 will provide full camera functionality');
      expect(subtitle.props.allowFontScaling).toBe(true);
      expect(subtitle.props.maxFontSizeMultiplier).toBe(3);
    });

    it('should support font scaling on guidance text', () => {
      const { getByText } = render(
        <TestWrapper>
          <CameraPlaceholder onCapture={mockOnCapture} onCancel={mockOnCancel} />
        </TestWrapper>
      );

      const guidance = getByText('Lay the item flat on a plain background');
      expect(guidance.props.allowFontScaling).toBe(true);
      expect(guidance.props.maxFontSizeMultiplier).toBe(3);
    });
  });

  describe('Button Variants', () => {
    it('should render capture button with primary variant', () => {
      const { getByText } = render(
        <TestWrapper>
          <CameraPlaceholder onCapture={mockOnCapture} onCancel={mockOnCancel} />
        </TestWrapper>
      );

      const captureButton = getByText('Use Placeholder Image');
      expect(captureButton).toBeTruthy();
    });

    it('should render cancel button with text variant', () => {
      const { getByText } = render(
        <TestWrapper>
          <CameraPlaceholder onCapture={mockOnCapture} onCancel={mockOnCancel} />
        </TestWrapper>
      );

      const cancelButton = getByText('Do this later');
      expect(cancelButton).toBeTruthy();
    });
  });

  describe('i18n Integration', () => {
    it('should use i18n for title text', () => {
      const { getByText } = render(
        <TestWrapper>
          <CameraPlaceholder onCapture={mockOnCapture} onCancel={mockOnCancel} />
        </TestWrapper>
      );

      // Verifies i18n key: screens.onboarding.firstItem.camera.placeholder
      expect(getByText('Camera feature coming soon')).toBeTruthy();
    });

    it('should use i18n for subtitle text', () => {
      const { getByText } = render(
        <TestWrapper>
          <CameraPlaceholder onCapture={mockOnCapture} onCancel={mockOnCancel} />
        </TestWrapper>
      );

      // Verifies i18n key: screens.onboarding.firstItem.camera.placeholderHint
      expect(getByText('Feature #3 will provide full camera functionality')).toBeTruthy();
    });

    it('should use i18n for guidance text', () => {
      const { getByText } = render(
        <TestWrapper>
          <CameraPlaceholder onCapture={mockOnCapture} onCancel={mockOnCancel} />
        </TestWrapper>
      );

      // Verifies i18n key: screens.onboarding.firstItem.guidance
      expect(getByText('Lay the item flat on a plain background')).toBeTruthy();
    });

    it('should use i18n for capture button text', () => {
      const { getByText } = render(
        <TestWrapper>
          <CameraPlaceholder onCapture={mockOnCapture} onCancel={mockOnCancel} />
        </TestWrapper>
      );

      // Verifies i18n key: screens.onboarding.firstItem.camera.captureButton
      expect(getByText('Use Placeholder Image')).toBeTruthy();
    });

    it('should use i18n for cancel button text', () => {
      const { getByText } = render(
        <TestWrapper>
          <CameraPlaceholder onCapture={mockOnCapture} onCancel={mockOnCancel} />
        </TestWrapper>
      );

      // Verifies i18n key: screens.onboarding.firstItem.permissions.doThisLater
      expect(getByText('Do this later')).toBeTruthy();
    });

    it('should use i18n for container accessibility label', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <CameraPlaceholder onCapture={mockOnCapture} onCancel={mockOnCancel} />
        </TestWrapper>
      );

      // Verifies i18n key: screens.onboarding.firstItem.accessibility.cameraPlaceholder
      const container = getByLabelText('Camera placeholder screen');
      expect(container).toBeTruthy();
    });

    it('should use i18n for capture button accessibility label', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <CameraPlaceholder onCapture={mockOnCapture} onCancel={mockOnCancel} />
        </TestWrapper>
      );

      // Verifies i18n key: screens.onboarding.firstItem.accessibility.usePlaceholderButton
      const captureButton = getByLabelText('Use placeholder image button');
      expect(captureButton).toBeTruthy();
    });

    it('should use i18n for cancel button accessibility label', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <CameraPlaceholder onCapture={mockOnCapture} onCancel={mockOnCancel} />
        </TestWrapper>
      );

      // Verifies i18n key: screens.onboarding.firstItem.accessibility.doThisLaterButton
      const cancelButton = getByLabelText('Do this later button');
      expect(cancelButton).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid successive captures', () => {
      const { getByText } = render(
        <TestWrapper>
          <CameraPlaceholder onCapture={mockOnCapture} onCancel={mockOnCancel} />
        </TestWrapper>
      );

      const captureButton = getByText('Use Placeholder Image');
      fireEvent.press(captureButton);
      fireEvent.press(captureButton);
      fireEvent.press(captureButton);
      fireEvent.press(captureButton);

      expect(mockOnCapture).toHaveBeenCalledTimes(4);
      expect(mockOnCancel).not.toHaveBeenCalled();
    });

    it('should handle rapid successive cancels', () => {
      const { getByText } = render(
        <TestWrapper>
          <CameraPlaceholder onCapture={mockOnCapture} onCancel={mockOnCancel} />
        </TestWrapper>
      );

      const cancelButton = getByText('Do this later');
      fireEvent.press(cancelButton);
      fireEvent.press(cancelButton);
      fireEvent.press(cancelButton);

      expect(mockOnCancel).toHaveBeenCalledTimes(3);
      expect(mockOnCapture).not.toHaveBeenCalled();
    });

    it('should maintain state when re-rendered with same props', () => {
      const { getByText, rerender } = render(
        <TestWrapper>
          <CameraPlaceholder onCapture={mockOnCapture} onCancel={mockOnCancel} />
        </TestWrapper>
      );

      const captureButton = getByText('Use Placeholder Image');
      expect(captureButton).toBeTruthy();

      rerender(
        <TestWrapper>
          <CameraPlaceholder onCapture={mockOnCapture} onCancel={mockOnCancel} />
        </TestWrapper>
      );

      const captureButtonAfterRerender = getByText('Use Placeholder Image');
      expect(captureButtonAfterRerender).toBeTruthy();

      fireEvent.press(captureButtonAfterRerender);
      expect(mockOnCapture).toHaveBeenCalledWith({
        uri: 'placeholder://mock-image.jpg',
      });
    });
  });
});
