import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ContextSelector, type ContextSelectorProps } from './ContextSelector';
import { ThemeProvider } from '../../../core/theme';
import {
  OCCASION_OPTIONS,
  TEMPERATURE_BAND_OPTIONS,
  DEFAULT_OCCASION,
  DEFAULT_TEMPERATURE_BAND,
  type OccasionKey,
  type TemperatureBandKey,
} from '../types';

// Mock i18n
jest.mock('../../../core/i18n', () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      // Occasion labels
      'screens.home.contextSelector.occasions.everyday': 'Everyday',
      'screens.home.contextSelector.occasions.work_meeting': 'Work Meeting',
      'screens.home.contextSelector.occasions.date': 'Date',
      'screens.home.contextSelector.occasions.weekend': 'Weekend',
      'screens.home.contextSelector.occasions.event': 'Event',
      // Temperature labels
      'screens.home.contextSelector.temperatures.cool': 'Cool',
      'screens.home.contextSelector.temperatures.mild': 'Mild',
      'screens.home.contextSelector.temperatures.warm': 'Warm',
      'screens.home.contextSelector.temperatures.auto': 'Auto',
      // Section labels
      'screens.home.contextSelector.occasionLabel': 'Occasion',
      'screens.home.contextSelector.temperatureLabel': 'Temperature',
      // Accessibility
      'screens.home.contextSelector.accessibility.occasionSelector': 'Occasion selector',
      'screens.home.contextSelector.accessibility.occasionSelectorHint':
        'Select an occasion for your outfit',
      'screens.home.contextSelector.accessibility.temperatureSelector': 'Temperature selector',
      'screens.home.contextSelector.accessibility.temperatureSelectorHint':
        'Select a temperature band',
      'screens.home.contextSelector.accessibility.selectOccasion': 'Select {label} occasion',
      'screens.home.contextSelector.accessibility.selectTemperature':
        'Select {label} temperature band',
    };
    return translations[key] || key;
  },
}));

describe('ContextSelector', () => {
  const defaultProps: ContextSelectorProps = {
    occasion: DEFAULT_OCCASION,
    temperatureBand: DEFAULT_TEMPERATURE_BAND,
    onOccasionChange: jest.fn(),
    onTemperatureBandChange: jest.fn(),
    disabled: false,
  };

  const TestWrapper = ({ children }: { children: React.ReactNode }) => (
    <ThemeProvider colorScheme="light">{children}</ThemeProvider>
  );

  const renderComponent = (props: Partial<ContextSelectorProps> = {}) => {
    return render(<ContextSelector {...defaultProps} {...props} />, { wrapper: TestWrapper });
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render section labels', () => {
      const { getByText } = renderComponent();

      expect(getByText('Occasion')).toBeTruthy();
      expect(getByText('Temperature')).toBeTruthy();
    });

    it('should render all occasion options', () => {
      const { getByText } = renderComponent();

      expect(getByText('Everyday')).toBeTruthy();
      expect(getByText('Work Meeting')).toBeTruthy();
      expect(getByText('Date')).toBeTruthy();
      expect(getByText('Weekend')).toBeTruthy();
      expect(getByText('Event')).toBeTruthy();
    });

    it('should render all temperature band options', () => {
      const { getByText } = renderComponent();

      expect(getByText('Cool')).toBeTruthy();
      expect(getByText('Mild')).toBeTruthy();
      expect(getByText('Warm')).toBeTruthy();
      expect(getByText('Auto')).toBeTruthy();
    });

    it('should render correct number of occasion pills', () => {
      const { getAllByRole } = renderComponent();

      // Filter to just occasion pills (first row)
      const buttons = getAllByRole('button');
      // OCCASION_OPTIONS.length + TEMPERATURE_BAND_OPTIONS.length
      expect(buttons).toHaveLength(OCCASION_OPTIONS.length + TEMPERATURE_BAND_OPTIONS.length);
    });
  });

  describe('Selection state', () => {
    it('should visually indicate selected occasion', () => {
      const { getByText } = renderComponent({ occasion: 'work_meeting' });

      const workMeetingButton = getByText('Work Meeting').parent;
      expect(workMeetingButton).toBeTruthy();
    });

    it('should visually indicate selected temperature band', () => {
      const { getByText } = renderComponent({ temperatureBand: 'warm' });

      const warmButton = getByText('Warm').parent;
      expect(warmButton).toBeTruthy();
    });

    it.each(OCCASION_OPTIONS)('should render occasion %s as selectable', (occasion) => {
      const { getByText } = renderComponent({ occasion });

      const button = getByText(
        {
          everyday: 'Everyday',
          work_meeting: 'Work Meeting',
          date: 'Date',
          weekend: 'Weekend',
          event: 'Event',
        }[occasion]
      );
      expect(button).toBeTruthy();
    });

    it.each(TEMPERATURE_BAND_OPTIONS)(
      'should render temperature band %s as selectable',
      (temperatureBand) => {
        const { getByText } = renderComponent({ temperatureBand });

        const button = getByText(
          {
            cool: 'Cool',
            mild: 'Mild',
            warm: 'Warm',
            auto: 'Auto',
          }[temperatureBand]
        );
        expect(button).toBeTruthy();
      }
    );
  });

  describe('Interaction', () => {
    it('should call onOccasionChange when occasion pill is pressed', () => {
      const onOccasionChange = jest.fn();
      const { getByText } = renderComponent({ onOccasionChange });

      fireEvent.press(getByText('Work Meeting'));

      expect(onOccasionChange).toHaveBeenCalledWith('work_meeting');
      expect(onOccasionChange).toHaveBeenCalledTimes(1);
    });

    it('should call onTemperatureBandChange when temperature pill is pressed', () => {
      const onTemperatureBandChange = jest.fn();
      const { getByText } = renderComponent({ onTemperatureBandChange });

      fireEvent.press(getByText('Warm'));

      expect(onTemperatureBandChange).toHaveBeenCalledWith('warm');
      expect(onTemperatureBandChange).toHaveBeenCalledTimes(1);
    });

    it('should call onOccasionChange when pressing currently selected occasion', () => {
      const onOccasionChange = jest.fn();
      const { getByText } = renderComponent({ occasion: 'everyday', onOccasionChange });

      fireEvent.press(getByText('Everyday'));

      expect(onOccasionChange).toHaveBeenCalledWith('everyday');
    });

    it.each(OCCASION_OPTIONS)('should pass correct key when %s occasion is pressed', (occasion) => {
      const onOccasionChange = jest.fn();
      const { getByText } = renderComponent({ onOccasionChange });

      const labels: Record<OccasionKey, string> = {
        everyday: 'Everyday',
        work_meeting: 'Work Meeting',
        date: 'Date',
        weekend: 'Weekend',
        event: 'Event',
      };

      fireEvent.press(getByText(labels[occasion]));

      expect(onOccasionChange).toHaveBeenCalledWith(occasion);
    });

    it.each(TEMPERATURE_BAND_OPTIONS)(
      'should pass correct key when %s temperature is pressed',
      (temperatureBand) => {
        const onTemperatureBandChange = jest.fn();
        const { getByText } = renderComponent({ onTemperatureBandChange });

        const labels: Record<TemperatureBandKey, string> = {
          cool: 'Cool',
          mild: 'Mild',
          warm: 'Warm',
          auto: 'Auto',
        };

        fireEvent.press(getByText(labels[temperatureBand]));

        expect(onTemperatureBandChange).toHaveBeenCalledWith(temperatureBand);
      }
    );
  });

  describe('Disabled state', () => {
    it('should not call onOccasionChange when disabled', () => {
      const onOccasionChange = jest.fn();
      const { getByText } = renderComponent({ disabled: true, onOccasionChange });

      fireEvent.press(getByText('Work Meeting'));

      expect(onOccasionChange).not.toHaveBeenCalled();
    });

    it('should not call onTemperatureBandChange when disabled', () => {
      const onTemperatureBandChange = jest.fn();
      const { getByText } = renderComponent({ disabled: true, onTemperatureBandChange });

      fireEvent.press(getByText('Warm'));

      expect(onTemperatureBandChange).not.toHaveBeenCalled();
    });

    it('should render all pills when disabled', () => {
      const { getByText } = renderComponent({ disabled: true });

      // All options should still be visible
      expect(getByText('Everyday')).toBeTruthy();
      expect(getByText('Auto')).toBeTruthy();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible occasion selector region', () => {
      const { getByLabelText } = renderComponent();

      expect(getByLabelText('Occasion selector')).toBeTruthy();
    });

    it('should have accessible temperature selector region', () => {
      const { getByLabelText } = renderComponent();

      expect(getByLabelText('Temperature selector')).toBeTruthy();
    });

    it('should have accessible occasion buttons', () => {
      const { getByLabelText } = renderComponent();

      expect(getByLabelText('Everyday')).toBeTruthy();
      expect(getByLabelText('Work Meeting')).toBeTruthy();
    });

    it('should have accessible temperature buttons', () => {
      const { getByLabelText } = renderComponent();

      expect(getByLabelText('Cool')).toBeTruthy();
      expect(getByLabelText('Warm')).toBeTruthy();
    });

    it('should indicate selected state in accessibility for occasion', () => {
      const { getByLabelText } = renderComponent({ occasion: 'work_meeting' });

      const button = getByLabelText('Work Meeting');
      expect(button.props.accessibilityState?.selected).toBe(true);
    });

    it('should indicate selected state in accessibility for temperature', () => {
      const { getByLabelText } = renderComponent({ temperatureBand: 'warm' });

      const button = getByLabelText('Warm');
      expect(button.props.accessibilityState?.selected).toBe(true);
    });

    it('should indicate disabled state in accessibility', () => {
      const { getByLabelText } = renderComponent({ disabled: true });

      const button = getByLabelText('Everyday');
      expect(button.props.accessibilityState?.disabled).toBe(true);
    });

    it('should have button role on all pills', () => {
      const { getAllByRole } = renderComponent();

      const buttons = getAllByRole('button');
      expect(buttons.length).toBe(OCCASION_OPTIONS.length + TEMPERATURE_BAND_OPTIONS.length);
    });
  });

  describe('Dark mode', () => {
    const DarkWrapper = ({ children }: { children: React.ReactNode }) => (
      <ThemeProvider colorScheme="dark">{children}</ThemeProvider>
    );

    it('should render correctly in dark mode', () => {
      const { getByText } = render(<ContextSelector {...defaultProps} />, {
        wrapper: DarkWrapper,
      });

      expect(getByText('Occasion')).toBeTruthy();
      expect(getByText('Temperature')).toBeTruthy();
      expect(getByText('Everyday')).toBeTruthy();
    });
  });

  describe('Edge cases', () => {
    it('should handle rapid successive presses', () => {
      const onOccasionChange = jest.fn();
      const { getByText } = renderComponent({ onOccasionChange });

      fireEvent.press(getByText('Work Meeting'));
      fireEvent.press(getByText('Date'));
      fireEvent.press(getByText('Weekend'));

      expect(onOccasionChange).toHaveBeenCalledTimes(3);
      expect(onOccasionChange).toHaveBeenNthCalledWith(1, 'work_meeting');
      expect(onOccasionChange).toHaveBeenNthCalledWith(2, 'date');
      expect(onOccasionChange).toHaveBeenNthCalledWith(3, 'weekend');
    });

    it('should handle switching between occasion and temperature selections', () => {
      const onOccasionChange = jest.fn();
      const onTemperatureBandChange = jest.fn();
      const { getByText } = renderComponent({ onOccasionChange, onTemperatureBandChange });

      fireEvent.press(getByText('Date'));
      fireEvent.press(getByText('Warm'));
      fireEvent.press(getByText('Event'));
      fireEvent.press(getByText('Cool'));

      expect(onOccasionChange).toHaveBeenCalledTimes(2);
      expect(onTemperatureBandChange).toHaveBeenCalledTimes(2);
    });
  });
});
