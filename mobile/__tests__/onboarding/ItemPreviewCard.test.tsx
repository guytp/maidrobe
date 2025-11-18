import React from 'react';
import { render } from '@testing-library/react-native';
import { ItemPreviewCard } from '../../src/features/onboarding/components/ItemPreviewCard';
import { ThemeProvider } from '../../src/core/theme';
import { ItemType } from '../../src/features/onboarding/types/itemMetadata';
import { WardrobeItem } from '../../src/features/onboarding/types/wardrobeItem';
import { WARDROBE_COLOUR_PALETTE } from '../../src/features/onboarding/types/itemMetadata';

describe('ItemPreviewCard', () => {
  const TestWrapper = ({ children }: { children: React.ReactNode }) => (
    <ThemeProvider colorScheme="light">{children}</ThemeProvider>
  );

  const mockItem: WardrobeItem = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    userId: '987fcdeb-51a2-43f1-9876-543210fedcba',
    photos: ['user123/items/item456/1234567890.jpg'],
    type: ItemType.Top,
    colour: ['black'],
    name: 'My Favorite Shirt',
    createdAt: '2025-01-15T10:30:00Z',
  };

  describe('Initial Render', () => {
    it('should render item preview card container', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <ItemPreviewCard item={mockItem} />
        </TestWrapper>
      );

      const container = getByLabelText('Top item preview');
      expect(container).toBeTruthy();
    });

    it('should render title text', () => {
      const { getByText } = render(
        <TestWrapper>
          <ItemPreviewCard item={mockItem} />
        </TestWrapper>
      );

      expect(getByText('Your First Item')).toBeTruthy();
    });

    it('should render image container', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <ItemPreviewCard item={mockItem} />
        </TestWrapper>
      );

      const swatch = getByLabelText('Black colour swatch');
      expect(swatch).toBeTruthy();
    });

    it('should render colour swatch', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <ItemPreviewCard item={mockItem} />
        </TestWrapper>
      );

      const swatch = getByLabelText('Black colour swatch');
      expect(swatch).toBeTruthy();
    });

    it('should render type label', () => {
      const { getByText } = render(
        <TestWrapper>
          <ItemPreviewCard item={mockItem} />
        </TestWrapper>
      );

      expect(getByText('Top')).toBeTruthy();
    });

    it('should render colour name', () => {
      const { getByText } = render(
        <TestWrapper>
          <ItemPreviewCard item={mockItem} />
        </TestWrapper>
      );

      expect(getByText('Black')).toBeTruthy();
    });
  });

  describe('Metadata Rendering', () => {
    it('should display correct type label for Top', () => {
      const item = { ...mockItem, type: ItemType.Top };
      const { getByText } = render(
        <TestWrapper>
          <ItemPreviewCard item={item} />
        </TestWrapper>
      );

      expect(getByText('Top')).toBeTruthy();
    });

    it('should display correct type label for Bottom', () => {
      const item = { ...mockItem, type: ItemType.Bottom };
      const { getByText } = render(
        <TestWrapper>
          <ItemPreviewCard item={item} />
        </TestWrapper>
      );

      expect(getByText('Bottom')).toBeTruthy();
    });

    it('should display correct type label for Dress', () => {
      const item = { ...mockItem, type: ItemType.Dress };
      const { getByText } = render(
        <TestWrapper>
          <ItemPreviewCard item={item} />
        </TestWrapper>
      );

      expect(getByText('Dress')).toBeTruthy();
    });

    it('should display correct type label for all item types', () => {
      const types = [
        { type: ItemType.Top, label: 'Top' },
        { type: ItemType.Bottom, label: 'Bottom' },
        { type: ItemType.Dress, label: 'Dress' },
        { type: ItemType.Outerwear, label: 'Outerwear' },
        { type: ItemType.Shoes, label: 'Shoes' },
        { type: ItemType.Accessories, label: 'Accessories' },
        { type: ItemType.Other, label: 'Other' },
      ];

      types.forEach(({ type, label }) => {
        const item = { ...mockItem, type };
        const { getByText } = render(
          <TestWrapper>
            <ItemPreviewCard item={item} />
          </TestWrapper>
        );
        expect(getByText(label)).toBeTruthy();
      });
    });

    it('should display correct colour name for black', () => {
      const item = { ...mockItem, colour: ['black'] };
      const { getByText } = render(
        <TestWrapper>
          <ItemPreviewCard item={item} />
        </TestWrapper>
      );

      expect(getByText('Black')).toBeTruthy();
    });

    it('should display correct colour name for blue', () => {
      const item = { ...mockItem, colour: ['blue'] };
      const { getByText } = render(
        <TestWrapper>
          <ItemPreviewCard item={item} />
        </TestWrapper>
      );

      expect(getByText('Blue')).toBeTruthy();
    });

    it('should display correct colour name for all palette colours', () => {
      WARDROBE_COLOUR_PALETTE.forEach((colour) => {
        const item = { ...mockItem, colour: [colour.id] };
        const { getByText } = render(
          <TestWrapper>
            <ItemPreviewCard item={item} />
          </TestWrapper>
        );
        const colourName = colour.name.split('.').pop();
        const expectedName = colourName!.charAt(0).toUpperCase() + colourName!.slice(1);
        expect(getByText(expectedName)).toBeTruthy();
      });
    });
  });

  describe('Colour Swatch', () => {
    it('should display colour swatch with correct background color', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <ItemPreviewCard item={mockItem} />
        </TestWrapper>
      );

      const swatch = getByLabelText('Black colour swatch');
      expect(swatch).toBeTruthy();
    });

    it('should display colour swatch for black with hex #000000', () => {
      const item = { ...mockItem, colour: ['black'] };
      render(
        <TestWrapper>
          <ItemPreviewCard item={item} />
        </TestWrapper>
      );

      const blackColour = WARDROBE_COLOUR_PALETTE.find((c) => c.id === 'black');
      expect(blackColour?.hex).toBe('#000000');
    });

    it('should display colour swatch for white with hex #FFFFFF', () => {
      const item = { ...mockItem, colour: ['white'] };
      render(
        <TestWrapper>
          <ItemPreviewCard item={item} />
        </TestWrapper>
      );

      const whiteColour = WARDROBE_COLOUR_PALETTE.find((c) => c.id === 'white');
      expect(whiteColour?.hex).toBe('#FFFFFF');
    });

    it('should display colour swatch for red', () => {
      const item = { ...mockItem, colour: ['red'] };
      const { getByLabelText } = render(
        <TestWrapper>
          <ItemPreviewCard item={item} />
        </TestWrapper>
      );

      const swatch = getByLabelText('Red colour swatch');
      expect(swatch).toBeTruthy();
    });

    it('should have correct accessibility label on colour swatch', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <ItemPreviewCard item={mockItem} />
        </TestWrapper>
      );

      const swatch = getByLabelText('Black colour swatch');
      expect(swatch).toBeTruthy();
      expect(swatch.props.accessibilityLabel).toBe('Black colour swatch');
    });
  });

  describe('Optional Name Handling', () => {
    it('should display name when provided', () => {
      const { getByText } = render(
        <TestWrapper>
          <ItemPreviewCard item={mockItem} />
        </TestWrapper>
      );

      expect(getByText('"My Favorite Shirt"')).toBeTruthy();
    });

    it('should display name in quotes with italic styling', () => {
      const { getByText } = render(
        <TestWrapper>
          <ItemPreviewCard item={mockItem} />
        </TestWrapper>
      );

      const nameText = getByText('"My Favorite Shirt"');
      expect(nameText).toBeTruthy();
      expect(nameText.props.style.fontStyle).toBe('italic');
    });

    it('should not display name when null', () => {
      const item = { ...mockItem, name: null };
      const { queryByText } = render(
        <TestWrapper>
          <ItemPreviewCard item={item} />
        </TestWrapper>
      );

      expect(queryByText(/My Favorite Shirt/)).toBeNull();
    });

    it('should not display name section when name is null', () => {
      const item = { ...mockItem, name: null };
      const { getByText } = render(
        <TestWrapper>
          <ItemPreviewCard item={item} />
        </TestWrapper>
      );

      expect(getByText('Top')).toBeTruthy();
      expect(getByText('Black')).toBeTruthy();
    });

    it('should handle long names gracefully', () => {
      const item = {
        ...mockItem,
        name: 'This is a very long name for a wardrobe item that should still display correctly',
      };
      const { getByText } = render(
        <TestWrapper>
          <ItemPreviewCard item={item} />
        </TestWrapper>
      );

      expect(
        getByText(
          '"This is a very long name for a wardrobe item that should still display correctly"'
        )
      ).toBeTruthy();
    });
  });

  describe('Graceful Degradation', () => {
    it('should handle unknown colour ID gracefully', () => {
      const item = { ...mockItem, colour: ['invalid-colour-id'] };
      const { getByText } = render(
        <TestWrapper>
          <ItemPreviewCard item={item} />
        </TestWrapper>
      );

      expect(getByText('Unknown')).toBeTruthy();
    });

    it('should display Unknown for invalid colour', () => {
      const item = { ...mockItem, colour: ['not-a-real-colour'] };
      const { getByText } = render(
        <TestWrapper>
          <ItemPreviewCard item={item} />
        </TestWrapper>
      );

      expect(getByText('Unknown')).toBeTruthy();
    });

    it('should use fallback hex color for unknown colour', () => {
      const item = { ...mockItem, colour: ['invalid-colour'] };
      const { getByLabelText } = render(
        <TestWrapper>
          <ItemPreviewCard item={item} />
        </TestWrapper>
      );

      const swatch = getByLabelText('Unknown colour swatch');
      expect(swatch).toBeTruthy();
    });

    it('should handle missing colour array element', () => {
      const item = { ...mockItem, colour: [] };
      const { getByText } = render(
        <TestWrapper>
          <ItemPreviewCard item={item} />
        </TestWrapper>
      );

      expect(getByText('Unknown')).toBeTruthy();
    });
  });

  describe('Accessibility', () => {
    it('should have correct accessibilityLabel on container', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <ItemPreviewCard item={mockItem} />
        </TestWrapper>
      );

      const container = getByLabelText('Top item preview');
      expect(container).toBeTruthy();
    });

    it('should include type in container accessibilityLabel', () => {
      const item = { ...mockItem, type: ItemType.Dress };
      const { getByLabelText } = render(
        <TestWrapper>
          <ItemPreviewCard item={item} />
        </TestWrapper>
      );

      const container = getByLabelText('Dress item preview');
      expect(container).toBeTruthy();
    });

    it('should have correct accessibilityHint on container', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <ItemPreviewCard item={mockItem} />
        </TestWrapper>
      );

      const container = getByLabelText('Top item preview');
      expect(container.props.accessibilityHint).toBe('Preview of your newly created wardrobe item');
    });

    it('should have accessibilityRole header on title', () => {
      const { getByRole } = render(
        <TestWrapper>
          <ItemPreviewCard item={mockItem} />
        </TestWrapper>
      );

      const header = getByRole('header');
      expect(header).toBeTruthy();
    });

    it('should have correct accessibilityLabel on colour swatch', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <ItemPreviewCard item={mockItem} />
        </TestWrapper>
      );

      const swatch = getByLabelText('Black colour swatch');
      expect(swatch.props.accessibilityLabel).toBe('Black colour swatch');
    });

    it('should include colour name in swatch accessibilityLabel', () => {
      const item = { ...mockItem, colour: ['blue'] };
      const { getByLabelText } = render(
        <TestWrapper>
          <ItemPreviewCard item={item} />
        </TestWrapper>
      );

      const swatch = getByLabelText('Blue colour swatch');
      expect(swatch.props.accessibilityLabel).toContain('Blue');
    });

    it('should support font scaling on title', () => {
      const { getByRole } = render(
        <TestWrapper>
          <ItemPreviewCard item={mockItem} />
        </TestWrapper>
      );

      const title = getByRole('header');
      expect(title.props.allowFontScaling).toBe(true);
      expect(title.props.maxFontSizeMultiplier).toBe(2);
    });

    it('should support font scaling on type text', () => {
      const { getByText } = render(
        <TestWrapper>
          <ItemPreviewCard item={mockItem} />
        </TestWrapper>
      );

      const typeText = getByText('Top');
      expect(typeText.props.allowFontScaling).toBe(true);
      expect(typeText.props.maxFontSizeMultiplier).toBe(2);
    });

    it('should support font scaling on colour text', () => {
      const { getByText } = render(
        <TestWrapper>
          <ItemPreviewCard item={mockItem} />
        </TestWrapper>
      );

      const colourText = getByText('Black');
      expect(colourText.props.allowFontScaling).toBe(true);
      expect(colourText.props.maxFontSizeMultiplier).toBe(2);
    });

    it('should support font scaling on name text', () => {
      const { getByText } = render(
        <TestWrapper>
          <ItemPreviewCard item={mockItem} />
        </TestWrapper>
      );

      const nameText = getByText('"My Favorite Shirt"');
      expect(nameText.props.allowFontScaling).toBe(true);
      expect(nameText.props.maxFontSizeMultiplier).toBe(2);
    });
  });

  describe('i18n Integration', () => {
    it('should use i18n for title text', () => {
      const { getByText } = render(
        <TestWrapper>
          <ItemPreviewCard item={mockItem} />
        </TestWrapper>
      );

      // Verifies i18n key: screens.onboarding.firstItem.success.previewTitle
      expect(getByText('Your First Item')).toBeTruthy();
    });

    it('should use i18n for type labels', () => {
      const { getByText } = render(
        <TestWrapper>
          <ItemPreviewCard item={mockItem} />
        </TestWrapper>
      );

      // Verifies i18n key: screens.auth.itemTypes.top
      expect(getByText('Top')).toBeTruthy();
    });

    it('should use i18n for colour names', () => {
      const { getByText } = render(
        <TestWrapper>
          <ItemPreviewCard item={mockItem} />
        </TestWrapper>
      );

      // Verifies i18n key from WARDROBE_COLOUR_PALETTE: screens.auth.colours.black
      expect(getByText('Black')).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    it('should handle item with all fields populated', () => {
      const { getByText, getByLabelText } = render(
        <TestWrapper>
          <ItemPreviewCard item={mockItem} />
        </TestWrapper>
      );

      expect(getByText('Your First Item')).toBeTruthy();
      expect(getByText('Top')).toBeTruthy();
      expect(getByText('Black')).toBeTruthy();
      expect(getByText('"My Favorite Shirt"')).toBeTruthy();
      expect(getByLabelText('Black colour swatch')).toBeTruthy();
    });

    it('should handle item with minimal required fields', () => {
      const minimalItem: WardrobeItem = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        userId: '987fcdeb-51a2-43f1-9876-543210fedcba',
        photos: [],
        type: ItemType.Other,
        colour: ['grey'],
        name: null,
        createdAt: '2025-01-15T10:30:00Z',
      };

      const { getByText, queryByText } = render(
        <TestWrapper>
          <ItemPreviewCard item={minimalItem} />
        </TestWrapper>
      );

      expect(getByText('Your First Item')).toBeTruthy();
      expect(getByText('Other')).toBeTruthy();
      expect(getByText('Grey')).toBeTruthy();
      expect(queryByText(/"/)).toBeNull();
    });

    it('should handle re-render with same item', () => {
      const { getByText, rerender } = render(
        <TestWrapper>
          <ItemPreviewCard item={mockItem} />
        </TestWrapper>
      );

      expect(getByText('Top')).toBeTruthy();

      rerender(
        <TestWrapper>
          <ItemPreviewCard item={mockItem} />
        </TestWrapper>
      );

      expect(getByText('Top')).toBeTruthy();
      expect(getByText('Black')).toBeTruthy();
    });

    it('should handle re-render with different item', () => {
      const { getByText, rerender } = render(
        <TestWrapper>
          <ItemPreviewCard item={mockItem} />
        </TestWrapper>
      );

      expect(getByText('Top')).toBeTruthy();
      expect(getByText('Black')).toBeTruthy();

      const newItem = {
        ...mockItem,
        type: ItemType.Dress,
        colour: ['red'],
        name: 'Summer Dress',
      };

      rerender(
        <TestWrapper>
          <ItemPreviewCard item={newItem} />
        </TestWrapper>
      );

      expect(getByText('Dress')).toBeTruthy();
      expect(getByText('Red')).toBeTruthy();
      expect(getByText('"Summer Dress"')).toBeTruthy();
    });
  });
});
