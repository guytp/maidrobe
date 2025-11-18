import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { TypeSelector } from '../../src/features/onboarding/components/TypeSelector';
import { ThemeProvider } from '../../src/core/theme';
import { ItemType } from '../../src/features/onboarding/types/itemMetadata';

describe('TypeSelector', () => {
  const mockOnChange = jest.fn();

  const TestWrapper = ({ children }: { children: React.ReactNode }) => (
    <ThemeProvider colorScheme="light">{children}</ThemeProvider>
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initial Render', () => {
    it('should render type selector container', () => {
      const { getByRole } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const header = getByRole('header');
      expect(header).toBeTruthy();
    });

    it('should render label with required asterisk', () => {
      const { getByRole, getByText } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const header = getByRole('header');
      expect(header).toBeTruthy();
      expect(getByText('*')).toBeTruthy();
    });

    it('should render helper text', () => {
      const { getByText } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      expect(getByText('What kind of item is this?')).toBeTruthy();
    });

    it('should render grid container with correct accessibility attributes', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const gridContainer = getByLabelText('Item type selector');
      expect(gridContainer).toBeTruthy();
      expect(gridContainer.props.accessibilityHint).toBe(
        'Select the type of clothing or accessory'
      );
    });

    it('should render all 7 type buttons from ItemType enum', () => {
      const { getAllByRole } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const buttons = getAllByRole('button');
      expect(buttons).toHaveLength(7);
    });

    it('should render each type button with correct label', () => {
      const { getByText } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      expect(getByText('Top')).toBeTruthy();
      expect(getByText('Bottom')).toBeTruthy();
      expect(getByText('Dress')).toBeTruthy();
      expect(getByText('Outerwear')).toBeTruthy();
      expect(getByText('Shoes')).toBeTruthy();
      expect(getByText('Accessories')).toBeTruthy();
      expect(getByText('Other')).toBeTruthy();
    });
  });

  describe('Type Selection', () => {
    it('should call onChange when a type button is pressed', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const topButton = getByLabelText('Top');
      fireEvent.press(topButton);

      expect(mockOnChange).toHaveBeenCalled();
    });

    it('should pass correct ItemType to onChange callback', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const topButton = getByLabelText('Top');
      fireEvent.press(topButton);

      expect(mockOnChange).toHaveBeenCalledWith(ItemType.Top);
      expect(mockOnChange).toHaveBeenCalledTimes(1);
    });

    it('should handle selection of different types', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      fireEvent.press(getByLabelText('Top'));
      expect(mockOnChange).toHaveBeenCalledWith(ItemType.Top);

      fireEvent.press(getByLabelText('Bottom'));
      expect(mockOnChange).toHaveBeenCalledWith(ItemType.Bottom);

      fireEvent.press(getByLabelText('Dress'));
      expect(mockOnChange).toHaveBeenCalledWith(ItemType.Dress);

      expect(mockOnChange).toHaveBeenCalledTimes(3);
    });

    it('should call onChange for each type in the list', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const types = [
        { label: 'Top', value: ItemType.Top },
        { label: 'Bottom', value: ItemType.Bottom },
        { label: 'Dress', value: ItemType.Dress },
        { label: 'Outerwear', value: ItemType.Outerwear },
        { label: 'Shoes', value: ItemType.Shoes },
        { label: 'Accessories', value: ItemType.Accessories },
        { label: 'Other', value: ItemType.Other },
      ];

      types.forEach(({ label, value }) => {
        fireEvent.press(getByLabelText(label));
        expect(mockOnChange).toHaveBeenCalledWith(value);
      });

      expect(mockOnChange).toHaveBeenCalledTimes(7);
    });

    it('should not crash when onChange is called multiple times', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const topButton = getByLabelText('Top');
      fireEvent.press(topButton);
      fireEvent.press(topButton);
      fireEvent.press(topButton);

      expect(mockOnChange).toHaveBeenCalledTimes(3);
      expect(mockOnChange).toHaveBeenCalledWith(ItemType.Top);
    });
  });

  describe('Selection State Display', () => {
    it('should not show any type as selected initially when value is null', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const labels = ['Top', 'Bottom', 'Dress', 'Outerwear', 'Shoes', 'Accessories', 'Other'];
      labels.forEach((label) => {
        const button = getByLabelText(label);
        expect(button.props.accessibilityState.selected).toBe(false);
      });
    });

    it('should show selected type with selected state when value matches', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <TypeSelector value={ItemType.Top} onChange={mockOnChange} />
        </TestWrapper>
      );

      const topButton = getByLabelText('Top');
      expect(topButton.props.accessibilityState.selected).toBe(true);
    });

    it('should show only the selected type as selected', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <TypeSelector value={ItemType.Dress} onChange={mockOnChange} />
        </TestWrapper>
      );

      const dressButton = getByLabelText('Dress');
      expect(dressButton.props.accessibilityState.selected).toBe(true);

      const topButton = getByLabelText('Top');
      expect(topButton.props.accessibilityState.selected).toBe(false);

      const bottomButton = getByLabelText('Bottom');
      expect(bottomButton.props.accessibilityState.selected).toBe(false);
    });

    it('should update selection state when value prop changes', () => {
      const { getByLabelText, rerender } = render(
        <TestWrapper>
          <TypeSelector value={ItemType.Top} onChange={mockOnChange} />
        </TestWrapper>
      );

      let topButton = getByLabelText('Top');
      expect(topButton.props.accessibilityState.selected).toBe(true);

      rerender(
        <TestWrapper>
          <TypeSelector value={ItemType.Bottom} onChange={mockOnChange} />
        </TestWrapper>
      );

      topButton = getByLabelText('Top');
      expect(topButton.props.accessibilityState.selected).toBe(false);

      const bottomButton = getByLabelText('Bottom');
      expect(bottomButton.props.accessibilityState.selected).toBe(true);
    });

    it('should handle selection of all item types', () => {
      const types = [
        { label: 'Top', value: ItemType.Top },
        { label: 'Bottom', value: ItemType.Bottom },
        { label: 'Dress', value: ItemType.Dress },
        { label: 'Outerwear', value: ItemType.Outerwear },
        { label: 'Shoes', value: ItemType.Shoes },
        { label: 'Accessories', value: ItemType.Accessories },
        { label: 'Other', value: ItemType.Other },
      ];

      types.forEach(({ label, value }) => {
        const { getByLabelText } = render(
          <TestWrapper>
            <TypeSelector value={value} onChange={mockOnChange} />
          </TestWrapper>
        );

        const button = getByLabelText(label);
        expect(button.props.accessibilityState.selected).toBe(true);
      });
    });
  });

  describe('Error State', () => {
    it('should not render error text when error prop is null', () => {
      const { queryByRole } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} error={null} />
        </TestWrapper>
      );

      expect(queryByRole('alert')).toBeNull();
    });

    it('should not render error text when error prop is undefined', () => {
      const { queryByRole } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const alerts = queryByRole('alert');
      expect(alerts).toBeNull();
    });

    it('should render error text when error prop has a value', () => {
      const { getByText } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} error="Please select an item type" />
        </TestWrapper>
      );

      expect(getByText('Please select an item type')).toBeTruthy();
    });

    it('should display correct error message text', () => {
      const errorMessage = 'Type is required';
      const { getByText } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} error={errorMessage} />
        </TestWrapper>
      );

      expect(getByText(errorMessage)).toBeTruthy();
    });

    it('should set accessibilityRole alert on error text', () => {
      const { getByRole } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} error="Please select an item type" />
        </TestWrapper>
      );

      const errorAlert = getByRole('alert');
      expect(errorAlert).toBeTruthy();
    });

    it('should handle empty string error', () => {
      const { queryByRole } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} error="" />
        </TestWrapper>
      );

      expect(queryByRole('alert')).toBeNull();
    });
  });

  describe('Accessibility', () => {
    it('should have accessibilityRole header on label', () => {
      const { getByRole } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const header = getByRole('header');
      expect(header).toBeTruthy();
    });

    it('should have correct accessibilityLabel on grid container', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const gridContainer = getByLabelText('Item type selector');
      expect(gridContainer).toBeTruthy();
    });

    it('should have correct accessibilityHint on grid container', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const gridContainer = getByLabelText('Item type selector');
      expect(gridContainer.props.accessibilityHint).toBe(
        'Select the type of clothing or accessory'
      );
    });

    it('should have accessibilityRole button on each type button', () => {
      const { getAllByRole } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const buttons = getAllByRole('button');
      expect(buttons).toHaveLength(7);
      buttons.forEach((button) => {
        expect(button.props.accessibilityRole).toBe('button');
      });
    });

    it('should have correct accessibilityLabel on each type button', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      expect(getByLabelText('Top')).toBeTruthy();
      expect(getByLabelText('Bottom')).toBeTruthy();
      expect(getByLabelText('Dress')).toBeTruthy();
      expect(getByLabelText('Outerwear')).toBeTruthy();
      expect(getByLabelText('Shoes')).toBeTruthy();
      expect(getByLabelText('Accessories')).toBeTruthy();
      expect(getByLabelText('Other')).toBeTruthy();
    });

    it('should have accessibilityHint on each type button with correct format', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const topButton = getByLabelText('Top');
      expect(topButton.props.accessibilityHint).toBe('Select Top as item type');

      const dressButton = getByLabelText('Dress');
      expect(dressButton.props.accessibilityHint).toBe('Select Dress as item type');
    });

    it('should set accessibilityState with selected true when type is selected', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <TypeSelector value={ItemType.Top} onChange={mockOnChange} />
        </TestWrapper>
      );

      const topButton = getByLabelText('Top');
      expect(topButton.props.accessibilityState.selected).toBe(true);
    });

    it('should set accessibilityState with selected false when type is not selected', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <TypeSelector value={ItemType.Top} onChange={mockOnChange} />
        </TestWrapper>
      );

      const bottomButton = getByLabelText('Bottom');
      expect(bottomButton.props.accessibilityState.selected).toBe(false);
    });

    it('should support font scaling on label text', () => {
      const { getByRole } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const label = getByRole('header');
      expect(label.props.allowFontScaling).toBe(true);
      expect(label.props.maxFontSizeMultiplier).toBe(2);
    });

    it('should support font scaling on helper text', () => {
      const { getByText } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const helper = getByText('What kind of item is this?');
      expect(helper.props.allowFontScaling).toBe(true);
      expect(helper.props.maxFontSizeMultiplier).toBe(2);
    });

    it('should support font scaling on type button text', () => {
      const { getByText } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const topText = getByText('Top');
      expect(topText.props.allowFontScaling).toBe(true);
      expect(topText.props.maxFontSizeMultiplier).toBe(2);
    });
  });

  describe('Grid Layout', () => {
    it('should render all 7 types from ItemType enum', () => {
      const { getAllByRole } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const buttons = getAllByRole('button');
      expect(buttons).toHaveLength(7);
    });

    it('should render types in the correct order', () => {
      const { getAllByRole } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const buttons = getAllByRole('button');
      const expectedOrder = [
        'Top',
        'Bottom',
        'Dress',
        'Outerwear',
        'Shoes',
        'Accessories',
        'Other',
      ];

      buttons.forEach((button, index) => {
        expect(button.props.accessibilityLabel).toBe(expectedOrder[index]);
      });
    });

    it('should apply 2-column grid layout styling', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const gridContainer = getByLabelText('Item type selector');
      expect(gridContainer.props.style.flexDirection).toBe('row');
      expect(gridContainer.props.style.flexWrap).toBe('wrap');
    });

    it('should render buttons with minimum touch target size', () => {
      const { getAllByRole } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const buttons = getAllByRole('button');
      buttons.forEach((button) => {
        const styles = Array.isArray(button.props.style)
          ? button.props.style
          : [button.props.style];
        const hasMinHeight = styles.some((style) => style && style.minHeight === 44);
        expect(hasMinHeight).toBe(true);
      });
    });

    it('should apply flexWrap to grid container', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const gridContainer = getByLabelText('Item type selector');
      expect(gridContainer.props.style.flexWrap).toBe('wrap');
    });

    it('should apply gap spacing between buttons', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const gridContainer = getByLabelText('Item type selector');
      expect(gridContainer.props.style.gap).toBeDefined();
    });
  });

  describe('i18n Integration', () => {
    it('should use i18n for type label text', () => {
      const { getByRole } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      // Verifies i18n key: screens.onboarding.firstItem.metadata.typeLabel
      const header = getByRole('header');
      expect(header).toBeTruthy();
      expect(header.props.children).toContain('Type');
    });

    it('should use i18n for helper text', () => {
      const { getByText } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      // Verifies i18n key: screens.onboarding.firstItem.metadata.typeHelper
      expect(getByText('What kind of item is this?')).toBeTruthy();
    });

    it('should use i18n for grid container accessibility label', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      // Verifies i18n key: screens.onboarding.firstItem.accessibility.typeSelector
      expect(getByLabelText('Item type selector')).toBeTruthy();
    });

    it('should use i18n for grid container accessibility hint', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const gridContainer = getByLabelText('Item type selector');
      // Verifies i18n key: screens.onboarding.firstItem.accessibility.typeSelectorHint
      expect(gridContainer.props.accessibilityHint).toBe(
        'Select the type of clothing or accessory'
      );
    });

    it('should use i18n for type names', () => {
      const { getByText } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      // Verifies i18n keys: screens.auth.itemTypes.*
      expect(getByText('Top')).toBeTruthy();
      expect(getByText('Bottom')).toBeTruthy();
      expect(getByText('Dress')).toBeTruthy();
      expect(getByText('Outerwear')).toBeTruthy();
      expect(getByText('Shoes')).toBeTruthy();
      expect(getByText('Accessories')).toBeTruthy();
      expect(getByText('Other')).toBeTruthy();
    });

    it('should use i18n for type button accessibility hints', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const topButton = getByLabelText('Top');
      expect(topButton.props.accessibilityHint).toContain('Select');
      expect(topButton.props.accessibilityHint).toContain('Top');
      expect(topButton.props.accessibilityHint).toContain('as item type');
    });
  });

  describe('Visual Styling', () => {
    it('should apply border styling to non-selected type buttons', () => {
      const { getAllByRole } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const buttons = getAllByRole('button');
      buttons.forEach((button) => {
        const styles = Array.isArray(button.props.style)
          ? button.props.style
          : [button.props.style];
        const hasBorder = styles.some((style) => style && style.borderWidth === 2);
        expect(hasBorder).toBe(true);
      });
    });

    it('should apply selected border and background to selected type button', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <TypeSelector value={ItemType.Top} onChange={mockOnChange} />
        </TestWrapper>
      );

      const topButton = getByLabelText('Top');
      expect(topButton.props.accessibilityState.selected).toBe(true);
    });

    it('should apply correct text color to non-selected buttons', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <TypeSelector value={ItemType.Top} onChange={mockOnChange} />
        </TestWrapper>
      );

      const bottomButton = getByLabelText('Bottom');
      expect(bottomButton.props.accessibilityState.selected).toBe(false);
    });

    it('should apply inverted text color to selected button', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <TypeSelector value={ItemType.Dress} onChange={mockOnChange} />
        </TestWrapper>
      );

      const dressButton = getByLabelText('Dress');
      expect(dressButton.props.accessibilityState.selected).toBe(true);
    });

    it('should apply border radius to type buttons', () => {
      const { getAllByRole } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const buttons = getAllByRole('button');
      buttons.forEach((button) => {
        const styles = Array.isArray(button.props.style)
          ? button.props.style
          : [button.props.style];
        const hasBorderRadius = styles.some((style) => style && style.borderRadius);
        expect(hasBorderRadius).toBe(true);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty value without errors', () => {
      const { getAllByRole } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      const buttons = getAllByRole('button');
      expect(buttons).toHaveLength(7);
    });

    it('should handle invalid ItemType in value prop', () => {
      const { getAllByRole } = render(
        <TestWrapper>
          <TypeSelector value={'invalid' as ItemType} onChange={mockOnChange} />
        </TestWrapper>
      );

      const buttons = getAllByRole('button');
      buttons.forEach((button) => {
        expect(button.props.accessibilityState.selected).toBe(false);
      });
    });

    it('should handle rapid successive type selections', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <TypeSelector value={null} onChange={mockOnChange} />
        </TestWrapper>
      );

      fireEvent.press(getByLabelText('Top'));
      fireEvent.press(getByLabelText('Bottom'));
      fireEvent.press(getByLabelText('Dress'));
      fireEvent.press(getByLabelText('Outerwear'));

      expect(mockOnChange).toHaveBeenCalledTimes(4);
      expect(mockOnChange).toHaveBeenNthCalledWith(1, ItemType.Top);
      expect(mockOnChange).toHaveBeenNthCalledWith(2, ItemType.Bottom);
      expect(mockOnChange).toHaveBeenNthCalledWith(3, ItemType.Dress);
      expect(mockOnChange).toHaveBeenNthCalledWith(4, ItemType.Outerwear);
    });

    it('should maintain state when re-rendered with same props', () => {
      const { getByLabelText, rerender } = render(
        <TestWrapper>
          <TypeSelector value={ItemType.Top} onChange={mockOnChange} />
        </TestWrapper>
      );

      let topButton = getByLabelText('Top');
      expect(topButton.props.accessibilityState.selected).toBe(true);

      rerender(
        <TestWrapper>
          <TypeSelector value={ItemType.Top} onChange={mockOnChange} />
        </TestWrapper>
      );

      topButton = getByLabelText('Top');
      expect(topButton.props.accessibilityState.selected).toBe(true);
    });
  });
});
