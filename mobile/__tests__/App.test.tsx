import React from 'react';
import { render, screen } from '@testing-library/react-native';
import HomeScreen from '../app/home/index';
import { ThemeProvider } from '../src/core/theme';

/**
 * Test wrapper that provides theme context to components.
 */
function TestWrapper({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <ThemeProvider colorScheme="light">{children}</ThemeProvider>;
}

describe('HomeScreen', () => {
  it('renders without crashing', () => {
    render(<HomeScreen />, { wrapper: TestWrapper });
  });

  it('displays the app title', () => {
    render(<HomeScreen />, { wrapper: TestWrapper });
    expect(screen.getByText('Maidrobe')).toBeTruthy();
  });

  it('displays the subtitle', () => {
    render(<HomeScreen />, { wrapper: TestWrapper });
    expect(screen.getByText('Digital Closet Management')).toBeTruthy();
  });

  it('displays the description', () => {
    render(<HomeScreen />, { wrapper: TestWrapper });
    expect(screen.getByText('Your AI-powered wardrobe assistant')).toBeTruthy();
  });

  it('has proper accessibility attributes', () => {
    const { getByText, getByLabelText } = render(<HomeScreen />, { wrapper: TestWrapper });

    // Verify screen-level accessibility
    const mainView = getByLabelText('Home screen');
    expect(mainView).toBeTruthy();
    expect(mainView.props.accessibilityHint).toBe('Main screen showing app introduction');

    // Verify title has header role
    const title = getByText('Maidrobe');
    expect(title.props.accessibilityRole).toBe('header');
  });

  it('supports dynamic text scaling', () => {
    const { getByText } = render(<HomeScreen />, { wrapper: TestWrapper });

    const title = getByText('Maidrobe');
    const subtitle = getByText('Digital Closet Management');
    const description = getByText('Your AI-powered wardrobe assistant');

    // Verify allowFontScaling is enabled
    expect(title.props.allowFontScaling).toBe(true);
    expect(subtitle.props.allowFontScaling).toBe(true);
    expect(description.props.allowFontScaling).toBe(true);

    // Verify maxFontSizeMultiplier is set
    expect(title.props.maxFontSizeMultiplier).toBe(3);
    expect(subtitle.props.maxFontSizeMultiplier).toBe(3);
    expect(description.props.maxFontSizeMultiplier).toBe(3);
  });
});
