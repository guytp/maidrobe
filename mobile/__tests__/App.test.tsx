import React from 'react';
import { render, screen } from '@testing-library/react-native';
import App from '../app/index';
import { ThemeProvider } from '../src/core/theme';

/**
 * Test wrapper that provides theme context to components.
 */
function TestWrapper({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <ThemeProvider colorScheme="light">{children}</ThemeProvider>;
}

describe('App', () => {
  it('renders without crashing', () => {
    render(<App />, { wrapper: TestWrapper });
  });

  it('displays the app title', () => {
    render(<App />, { wrapper: TestWrapper });
    expect(screen.getByText('Maidrobe')).toBeTruthy();
  });

  it('displays the subtitle', () => {
    render(<App />, { wrapper: TestWrapper });
    expect(screen.getByText('Digital Closet Management')).toBeTruthy();
  });

  it('displays the description', () => {
    render(<App />, { wrapper: TestWrapper });
    expect(screen.getByText('Your AI-powered wardrobe assistant')).toBeTruthy();
  });
});
