import React from 'react';
import { render, screen } from '@testing-library/react-native';
import App from '../App';

describe('App', () => {
  it('renders without crashing', () => {
    render(<App />);
  });

  it('displays the app title', () => {
    render(<App />);
    expect(screen.getByText('Maidrobe')).toBeTruthy();
  });

  it('displays the subtitle', () => {
    render(<App />);
    expect(screen.getByText('Digital Closet Management')).toBeTruthy();
  });

  it('displays the description', () => {
    render(<App />);
    expect(screen.getByText('Your AI-powered wardrobe assistant')).toBeTruthy();
  });
});
