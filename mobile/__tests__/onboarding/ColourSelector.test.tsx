import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ColourSelector } from '../../src/features/onboarding/components/ColourSelector';
import { ThemeProvider } from '../../src/core/theme';
import { WARDROBE_COLOUR_PALETTE } from '../../src/features/onboarding/types/itemMetadata';

describe('ColourSelector', () => {
  const mockOnChange = jest.fn();

  const TestWrapper = ({ children }: { children: React.ReactNode }) => (
    <ThemeProvider colorScheme="light">{children}</ThemeProvider>
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initial Render', () => {
    it('should render colour selector container', () => {
      const { getByRole } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const header = getByRole('header');
      expect(header).toBeTruthy();
    });

    it('should render label with required asterisk', () => {
      const { getByRole, getByText } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const header = getByRole('header');
      expect(header).toBeTruthy();
      expect(getByText('*')).toBeTruthy();
    });

    it('should render helper text', () => {
      const { getByText } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      expect(getByText('What is the main colour?')).toBeTruthy();
    });

    it('should render ScrollView with correct accessibility attributes', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const scrollView = getByLabelText('Colour selector');
      expect(scrollView).toBeTruthy();
      expect(scrollView.props.accessibilityHint).toBe('Select the main colour of the item');
    });

    it('should render all 16 colour swatches from palette', () => {
      const { getAllByRole } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const buttons = getAllByRole('button');
      expect(buttons).toHaveLength(16);
    });

    it('should render each colour swatch with correct colour name label', () => {
      const { getByText } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      expect(getByText('Black')).toBeTruthy();
      expect(getByText('White')).toBeTruthy();
      expect(getByText('Grey')).toBeTruthy();
      expect(getByText('Beige')).toBeTruthy();
      expect(getByText('Brown')).toBeTruthy();
      expect(getByText('Red')).toBeTruthy();
      expect(getByText('Blue')).toBeTruthy();
      expect(getByText('Green')).toBeTruthy();
      expect(getByText('Yellow')).toBeTruthy();
      expect(getByText('Orange')).toBeTruthy();
      expect(getByText('Purple')).toBeTruthy();
      expect(getByText('Pink')).toBeTruthy();
      expect(getByText('Navy')).toBeTruthy();
      expect(getByText('Burgundy')).toBeTruthy();
      expect(getByText('Olive')).toBeTruthy();
      expect(getByText('Cream')).toBeTruthy();
    });
  });

  describe('Colour Selection', () => {
    it('should call onChange when a colour swatch is pressed', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const blackSwatch = getByLabelText('Black colour swatch');
      fireEvent.press(blackSwatch);

      expect(mockOnChange).toHaveBeenCalled();
    });

    it('should pass correct colour ID to onChange callback', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const blackSwatch = getByLabelText('Black colour swatch');
      fireEvent.press(blackSwatch);

      expect(mockOnChange).toHaveBeenCalledWith('black');
      expect(mockOnChange).toHaveBeenCalledTimes(1);
    });

    it('should handle selection of different colours', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      fireEvent.press(getByLabelText('Blue colour swatch'));
      expect(mockOnChange).toHaveBeenCalledWith('blue');

      fireEvent.press(getByLabelText('Red colour swatch'));
      expect(mockOnChange).toHaveBeenCalledWith('red');

      fireEvent.press(getByLabelText('Green colour swatch'));
      expect(mockOnChange).toHaveBeenCalledWith('green');

      expect(mockOnChange).toHaveBeenCalledTimes(3);
    });

    it('should call onChange for each colour in the palette', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      WARDROBE_COLOUR_PALETTE.forEach((colour) => {
        const swatchLabel = `${colour.name.split('.').pop()} colour swatch`;
        const capitalizedLabel = swatchLabel.charAt(0).toUpperCase() + swatchLabel.slice(1);
        fireEvent.press(getByLabelText(capitalizedLabel));
      });

      expect(mockOnChange).toHaveBeenCalledTimes(16);
    });

    it('should not crash when onChange is called multiple times', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const blackSwatch = getByLabelText('Black colour swatch');
      fireEvent.press(blackSwatch);
      fireEvent.press(blackSwatch);
      fireEvent.press(blackSwatch);

      expect(mockOnChange).toHaveBeenCalledTimes(3);
      expect(mockOnChange).toHaveBeenCalledWith('black');
    });
  });

  describe('Selection State Display', () => {
    it('should not show any colour as selected initially when value is null', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      WARDROBE_COLOUR_PALETTE.forEach((colour) => {
        const swatchLabel = `${colour.name.split('.').pop()} colour swatch`;
        const capitalizedLabel = swatchLabel.charAt(0).toUpperCase() + swatchLabel.slice(1);
        const swatch = getByLabelText(capitalizedLabel);
        expect(swatch.props.accessibilityState.selected).toBe(false);
      });
    });

    it('should show selected colour with selected state when value matches', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <ColourSelector value="blue" onChange={mockOnChange} />
        </TestWrapper>
      );

      const blueSwatch = getByLabelText('Blue colour swatch');
      expect(blueSwatch.props.accessibilityState.selected).toBe(true);
    });

    it('should show only the selected colour as selected', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <ColourSelector value="red" onChange={mockOnChange} />
        </TestWrapper>
      );

      const redSwatch = getByLabelText('Red colour swatch');
      expect(redSwatch.props.accessibilityState.selected).toBe(true);

      const blueSwatch = getByLabelText('Blue colour swatch');
      expect(blueSwatch.props.accessibilityState.selected).toBe(false);

      const blackSwatch = getByLabelText('Black colour swatch');
      expect(blackSwatch.props.accessibilityState.selected).toBe(false);
    });

    it('should update selection state when value prop changes', () => {
      const { getByLabelText, rerender } = render(
        <TestWrapper>
          <ColourSelector value="blue" onChange={mockOnChange} />
        </TestWrapper>
      );

      let blueSwatch = getByLabelText('Blue colour swatch');
      expect(blueSwatch.props.accessibilityState.selected).toBe(true);

      rerender(
        <TestWrapper>
          <ColourSelector value="red" onChange={mockOnChange} />
        </TestWrapper>
      );

      blueSwatch = getByLabelText('Blue colour swatch');
      expect(blueSwatch.props.accessibilityState.selected).toBe(false);

      const redSwatch = getByLabelText('Red colour swatch');
      expect(redSwatch.props.accessibilityState.selected).toBe(true);
    });

    it('should handle selection of white colour', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <ColourSelector value="white" onChange={mockOnChange} />
        </TestWrapper>
      );

      const whiteSwatch = getByLabelText('White colour swatch');
      expect(whiteSwatch.props.accessibilityState.selected).toBe(true);
    });

    it('should handle selection of all colours in palette', () => {
      WARDROBE_COLOUR_PALETTE.forEach((colour) => {
        const { getByLabelText } = render(
          <TestWrapper>
            <ColourSelector value={colour.id} onChange={mockOnChange} />
          </TestWrapper>
        );

        const swatchLabel = `${colour.name.split('.').pop()} colour swatch`;
        const capitalizedLabel = swatchLabel.charAt(0).toUpperCase() + swatchLabel.slice(1);
        const swatch = getByLabelText(capitalizedLabel);
        expect(swatch.props.accessibilityState.selected).toBe(true);
      });
    });
  });

  describe('Error State', () => {
    it('should not render error text when error prop is null', () => {
      const { queryByText } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} error={null} />
        </TestWrapper>
      );

      expect(queryByText(/error/i)).toBeNull();
    });

    it('should not render error text when error prop is undefined', () => {
      const { queryByRole } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const alerts = queryByRole('alert');
      expect(alerts).toBeNull();
    });

    it('should render error text when error prop has a value', () => {
      const { getByText } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} error="Please select a colour" />
        </TestWrapper>
      );

      expect(getByText('Please select a colour')).toBeTruthy();
    });

    it('should display correct error message text', () => {
      const errorMessage = 'Colour is required';
      const { getByText } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} error={errorMessage} />
        </TestWrapper>
      );

      expect(getByText(errorMessage)).toBeTruthy();
    });

    it('should set accessibilityRole alert on error text', () => {
      const { getByRole } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} error="Please select a colour" />
        </TestWrapper>
      );

      const errorAlert = getByRole('alert');
      expect(errorAlert).toBeTruthy();
    });

    it('should handle empty string error', () => {
      const { queryByRole } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} error="" />
        </TestWrapper>
      );

      expect(queryByRole('alert')).toBeNull();
    });
  });

  describe('Accessibility', () => {
    it('should have accessibilityRole header on label', () => {
      const { getByRole } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const header = getByRole('header');
      expect(header).toBeTruthy();
    });

    it('should have correct accessibilityLabel on ScrollView', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const scrollView = getByLabelText('Colour selector');
      expect(scrollView).toBeTruthy();
    });

    it('should have correct accessibilityHint on ScrollView', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const scrollView = getByLabelText('Colour selector');
      expect(scrollView.props.accessibilityHint).toBe('Select the main colour of the item');
    });

    it('should have accessibilityRole button on each swatch', () => {
      const { getAllByRole } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const buttons = getAllByRole('button');
      expect(buttons).toHaveLength(16);
      buttons.forEach((button) => {
        expect(button.props.accessibilityRole).toBe('button');
      });
    });

    it('should have correct accessibilityLabel format on each swatch', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      expect(getByLabelText('Black colour swatch')).toBeTruthy();
      expect(getByLabelText('White colour swatch')).toBeTruthy();
      expect(getByLabelText('Blue colour swatch')).toBeTruthy();
      expect(getByLabelText('Red colour swatch')).toBeTruthy();
      expect(getByLabelText('Green colour swatch')).toBeTruthy();
    });

    it('should have accessibilityHint on each swatch', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const blackSwatch = getByLabelText('Black colour swatch');
      expect(blackSwatch.props.accessibilityHint).toBe('Tap to select this colour');
    });

    it('should set accessibilityState with selected true when colour is selected', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <ColourSelector value="blue" onChange={mockOnChange} />
        </TestWrapper>
      );

      const blueSwatch = getByLabelText('Blue colour swatch');
      expect(blueSwatch.props.accessibilityState.selected).toBe(true);
    });

    it('should set accessibilityState with selected false when colour is not selected', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <ColourSelector value="blue" onChange={mockOnChange} />
        </TestWrapper>
      );

      const redSwatch = getByLabelText('Red colour swatch');
      expect(redSwatch.props.accessibilityState.selected).toBe(false);
    });

    it('should support font scaling on label text', () => {
      const { getByRole } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const label = getByRole('header');
      expect(label.props.allowFontScaling).toBe(true);
      expect(label.props.maxFontSizeMultiplier).toBe(2);
    });

    it('should support font scaling on helper text', () => {
      const { getByText } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const helper = getByText('What is the main colour?');
      expect(helper.props.allowFontScaling).toBe(true);
      expect(helper.props.maxFontSizeMultiplier).toBe(2);
    });
  });

  describe('Grid Layout', () => {
    it('should render all 16 colours from WARDROBE_COLOUR_PALETTE', () => {
      const { getAllByRole } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const buttons = getAllByRole('button');
      expect(buttons).toHaveLength(WARDROBE_COLOUR_PALETTE.length);
      expect(buttons).toHaveLength(16);
    });

    it('should render colours in the correct order', () => {
      const { getAllByRole } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const buttons = getAllByRole('button');
      const expectedOrder = [
        'Black colour swatch',
        'White colour swatch',
        'Grey colour swatch',
        'Beige colour swatch',
        'Brown colour swatch',
        'Red colour swatch',
        'Blue colour swatch',
        'Green colour swatch',
        'Yellow colour swatch',
        'Orange colour swatch',
        'Purple colour swatch',
        'Pink colour swatch',
        'Navy colour swatch',
        'Burgundy colour swatch',
        'Olive colour swatch',
        'Cream colour swatch',
      ];

      buttons.forEach((button, index) => {
        expect(button.props.accessibilityLabel).toBe(expectedOrder[index]);
      });
    });

    it('should render each colour with its correct ID from palette', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      WARDROBE_COLOUR_PALETTE.forEach((colour) => {
        const swatchLabel = `${colour.name.split('.').pop()} colour swatch`;
        const capitalizedLabel = swatchLabel.charAt(0).toUpperCase() + swatchLabel.slice(1);
        fireEvent.press(getByLabelText(capitalizedLabel));
        expect(mockOnChange).toHaveBeenCalledWith(colour.id);
      });
    });

    it('should render neutrals first', () => {
      const { getAllByRole } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const buttons = getAllByRole('button');
      expect(buttons[0].props.accessibilityLabel).toBe('Black colour swatch');
      expect(buttons[1].props.accessibilityLabel).toBe('White colour swatch');
      expect(buttons[2].props.accessibilityLabel).toBe('Grey colour swatch');
      expect(buttons[3].props.accessibilityLabel).toBe('Beige colour swatch');
      expect(buttons[4].props.accessibilityLabel).toBe('Brown colour swatch');
    });

    it('should render primary colours after neutrals', () => {
      const { getAllByRole } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const buttons = getAllByRole('button');
      expect(buttons[5].props.accessibilityLabel).toBe('Red colour swatch');
      expect(buttons[6].props.accessibilityLabel).toBe('Blue colour swatch');
      expect(buttons[7].props.accessibilityLabel).toBe('Green colour swatch');
      expect(buttons[8].props.accessibilityLabel).toBe('Yellow colour swatch');
    });

    it('should render secondary colours after primary colours', () => {
      const { getAllByRole } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const buttons = getAllByRole('button');
      expect(buttons[9].props.accessibilityLabel).toBe('Orange colour swatch');
      expect(buttons[10].props.accessibilityLabel).toBe('Purple colour swatch');
      expect(buttons[11].props.accessibilityLabel).toBe('Pink colour swatch');
    });
  });

  describe('i18n Integration', () => {
    it('should use i18n for colour label text', () => {
      const { getByRole } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      // Verifies i18n key: screens.onboarding.firstItem.metadata.colourLabel
      const header = getByRole('header');
      expect(header).toBeTruthy();
      expect(header.props.children).toContain('Colour');
    });

    it('should use i18n for helper text', () => {
      const { getByText } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      // Verifies i18n key: screens.onboarding.firstItem.metadata.colourHelper
      expect(getByText('What is the main colour?')).toBeTruthy();
    });

    it('should use i18n for ScrollView accessibility label', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      // Verifies i18n key: screens.onboarding.firstItem.accessibility.colourSelector
      expect(getByLabelText('Colour selector')).toBeTruthy();
    });

    it('should use i18n for ScrollView accessibility hint', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const scrollView = getByLabelText('Colour selector');
      // Verifies i18n key: screens.onboarding.firstItem.accessibility.colourSelectorHint
      expect(scrollView.props.accessibilityHint).toBe('Select the main colour of the item');
    });

    it('should use i18n for colour names from palette', () => {
      const { getByText } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      // Verifies i18n keys: screens.auth.colours.*
      expect(getByText('Black')).toBeTruthy();
      expect(getByText('White')).toBeTruthy();
      expect(getByText('Red')).toBeTruthy();
      expect(getByText('Blue')).toBeTruthy();
    });

    it('should use i18n for swatch accessibility hint', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const swatch = getByLabelText('Black colour swatch');
      // Verifies i18n key: screens.onboarding.firstItem.accessibility.colourSwatchHint
      expect(swatch.props.accessibilityHint).toBe('Tap to select this colour');
    });
  });

  describe('Visual Styling', () => {
    it('should apply correct background color to black swatch', () => {
      render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const blackColour = WARDROBE_COLOUR_PALETTE.find((c) => c.id === 'black');
      expect(blackColour?.hex).toBe('#000000');
    });

    it('should apply correct background color to white swatch', () => {
      render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const whiteColour = WARDROBE_COLOUR_PALETTE.find((c) => c.id === 'white');
      expect(whiteColour?.hex).toBe('#FFFFFF');
    });

    it('should have all palette colours with correct hex values', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      WARDROBE_COLOUR_PALETTE.forEach((colour) => {
        const swatchLabel = `${colour.name.split('.').pop()} colour swatch`;
        const capitalizedLabel = swatchLabel.charAt(0).toUpperCase() + swatchLabel.slice(1);
        const swatch = getByLabelText(capitalizedLabel);
        expect(swatch).toBeTruthy();
        expect(colour.hex).toMatch(/^#[0-9A-F]{6}$/i);
      });
    });

    it('should apply correct color values from palette', () => {
      expect(WARDROBE_COLOUR_PALETTE[0].hex).toBe('#000000'); // black
      expect(WARDROBE_COLOUR_PALETTE[1].hex).toBe('#FFFFFF'); // white
      expect(WARDROBE_COLOUR_PALETTE[5].hex).toBe('#DC143C'); // red
      expect(WARDROBE_COLOUR_PALETTE[6].hex).toBe('#1E90FF'); // blue
    });

    it('should have unique hex values for each colour', () => {
      const hexValues = WARDROBE_COLOUR_PALETTE.map((c) => c.hex);
      const uniqueHexValues = new Set(hexValues);
      expect(uniqueHexValues.size).toBe(hexValues.length);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty value without errors', () => {
      const { getAllByRole } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const buttons = getAllByRole('button');
      expect(buttons).toHaveLength(16);
    });

    it('should handle invalid colour ID in value prop', () => {
      const { getAllByRole } = render(
        <TestWrapper>
          <ColourSelector value="invalid-colour" onChange={mockOnChange} />
        </TestWrapper>
      );

      const buttons = getAllByRole('button');
      buttons.forEach((button) => {
        expect(button.props.accessibilityState.selected).toBe(false);
      });
    });

    it('should handle rapid successive colour selections', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <ColourSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      fireEvent.press(getByLabelText('Black colour swatch'));
      fireEvent.press(getByLabelText('White colour swatch'));
      fireEvent.press(getByLabelText('Blue colour swatch'));
      fireEvent.press(getByLabelText('Red colour swatch'));

      expect(mockOnChange).toHaveBeenCalledTimes(4);
      expect(mockOnChange).toHaveBeenNthCalledWith(1, 'black');
      expect(mockOnChange).toHaveBeenNthCalledWith(2, 'white');
      expect(mockOnChange).toHaveBeenNthCalledWith(3, 'blue');
      expect(mockOnChange).toHaveBeenNthCalledWith(4, 'red');
    });

    it('should maintain state when re-rendered with same props', () => {
      const { getByLabelText, rerender } = render(
        <TestWrapper>
          <ColourSelector value="blue" onChange={mockOnChange} />
        </TestWrapper>
      );

      let blueSwatch = getByLabelText('Blue colour swatch');
      expect(blueSwatch.props.accessibilityState.selected).toBe(true);

      rerender(
        <TestWrapper>
          <ColourSelector value="blue" onChange={mockOnChange} />
        </TestWrapper>
      );

      blueSwatch = getByLabelText('Blue colour swatch');
      expect(blueSwatch.props.accessibilityState.selected).toBe(true);
    });
  });
});
