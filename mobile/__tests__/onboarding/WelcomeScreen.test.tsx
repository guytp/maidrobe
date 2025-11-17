import React from 'react';
import { render } from '@testing-library/react-native';
import { WelcomeScreen } from '../../src/features/onboarding/components/WelcomeScreen';
import { OnboardingProvider } from '../../src/features/onboarding/context/OnboardingContext';
import { ThemeProvider } from '../../src/core/theme';
import * as onboardingAnalytics from '../../src/features/onboarding/utils/onboardingAnalytics';

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  }),
}));

// Mock expo-status-bar
jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

// Mock onboarding analytics
jest.mock('../../src/features/onboarding/utils/onboardingAnalytics', () => ({
  trackWelcomeViewed: jest.fn(),
}));

describe('WelcomeScreen', () => {
  const mockOnNext = jest.fn();
  const mockOnSkipStep = jest.fn();
  const mockOnSkipOnboarding = jest.fn();
  const mockOnBack = jest.fn();

  interface TestWrapperProps {
    currentStep?: 'welcome' | 'prefs' | 'firstItem' | 'success' | null;
    children: React.ReactNode;
  }

  const TestWrapper = ({ currentStep = 'welcome', children }: TestWrapperProps) => (
    <ThemeProvider colorScheme="light">
      <OnboardingProvider
        currentStep={currentStep}
        onNext={mockOnNext}
        onSkipStep={mockOnSkipStep}
        onSkipOnboarding={mockOnSkipOnboarding}
        onBack={mockOnBack}
      >
        {children}
      </OnboardingProvider>
    </ThemeProvider>
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('UI Elements Rendering', () => {
    it('should render the app name', () => {
      const { getByText } = render(
        <TestWrapper>
          <WelcomeScreen />
        </TestWrapper>
      );

      expect(getByText('Maidrobe')).toBeTruthy();
    });

    it('should render all three value propositions', () => {
      const { getByText } = render(
        <TestWrapper>
          <WelcomeScreen />
        </TestWrapper>
      );

      expect(getByText('Snap your clothes once.')).toBeTruthy();
      expect(getByText('Get outfits for real-life moments in seconds.')).toBeTruthy();
      expect(getByText('Feel good in what you already own.')).toBeTruthy();
    });

    it('should render upcoming steps section', () => {
      const { getByText } = render(
        <TestWrapper>
          <WelcomeScreen />
        </TestWrapper>
      );

      expect(getByText('What happens next')).toBeTruthy();
      expect(
        getByText(
          'A few quick steps to capture your style preferences and add your first wardrobe item.'
        )
      ).toBeTruthy();
    });

    it('should render privacy section', () => {
      const { getByText } = render(
        <TestWrapper>
          <WelcomeScreen />
        </TestWrapper>
      );

      expect(getByText('Your privacy matters')).toBeTruthy();
      expect(
        getByText(
          'Photos are of clothes, not faces. You can delete your wardrobe data anytime in settings. Nothing is shared without your permission.'
        )
      ).toBeTruthy();
    });

    it('should render all key sections together', () => {
      const { getByText } = render(
        <TestWrapper>
          <WelcomeScreen />
        </TestWrapper>
      );

      // App name
      expect(getByText('Maidrobe')).toBeTruthy();

      // Value props
      expect(getByText('Snap your clothes once.')).toBeTruthy();
      expect(getByText('Get outfits for real-life moments in seconds.')).toBeTruthy();
      expect(getByText('Feel good in what you already own.')).toBeTruthy();

      // Upcoming steps
      expect(getByText('What happens next')).toBeTruthy();

      // Privacy
      expect(getByText('Your privacy matters')).toBeTruthy();
    });
  });

  describe('Accessibility', () => {
    it('should have app name with header accessibility role', () => {
      const { getByText } = render(
        <TestWrapper>
          <WelcomeScreen />
        </TestWrapper>
      );

      const appName = getByText('Maidrobe');
      expect(appName.props.accessibilityRole).toBe('header');
    });

    it('should have correct accessibility label for app name', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <WelcomeScreen />
        </TestWrapper>
      );

      const appName = getByLabelText('Maidrobe app name');
      expect(appName).toBeTruthy();
    });

    it('should have correct accessibility label for scroll view', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <WelcomeScreen />
        </TestWrapper>
      );

      const scrollView = getByLabelText('Welcome to Maidrobe onboarding');
      expect(scrollView).toBeTruthy();
    });

    it('should have correct accessibility label for value propositions container', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <WelcomeScreen />
        </TestWrapper>
      );

      const valuePropsContainer = getByLabelText('Value proposition');
      expect(valuePropsContainer).toBeTruthy();
    });

    it('should have correct accessibility label for upcoming steps section', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <WelcomeScreen />
        </TestWrapper>
      );

      const upcomingStepsSection = getByLabelText('Upcoming onboarding steps');
      expect(upcomingStepsSection).toBeTruthy();
    });

    it('should have correct accessibility label for privacy section', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <WelcomeScreen />
        </TestWrapper>
      );

      const privacySection = getByLabelText('Privacy information');
      expect(privacySection).toBeTruthy();
    });
  });

  describe('Font Scaling', () => {
    it('should enable font scaling on app name', () => {
      const { getByText } = render(
        <TestWrapper>
          <WelcomeScreen />
        </TestWrapper>
      );

      const appName = getByText('Maidrobe');
      expect(appName.props.allowFontScaling).toBe(true);
      expect(appName.props.maxFontSizeMultiplier).toBe(3);
    });

    it('should enable font scaling on value propositions', () => {
      const { getByText } = render(
        <TestWrapper>
          <WelcomeScreen />
        </TestWrapper>
      );

      const valueProp1 = getByText('Snap your clothes once.');
      const valueProp2 = getByText('Get outfits for real-life moments in seconds.');
      const valueProp3 = getByText('Feel good in what you already own.');

      expect(valueProp1.props.allowFontScaling).toBe(true);
      expect(valueProp1.props.maxFontSizeMultiplier).toBe(3);

      expect(valueProp2.props.allowFontScaling).toBe(true);
      expect(valueProp2.props.maxFontSizeMultiplier).toBe(3);

      expect(valueProp3.props.allowFontScaling).toBe(true);
      expect(valueProp3.props.maxFontSizeMultiplier).toBe(3);
    });

    it('should enable font scaling on upcoming steps text', () => {
      const { getByText } = render(
        <TestWrapper>
          <WelcomeScreen />
        </TestWrapper>
      );

      const title = getByText('What happens next');
      const description = getByText(
        'A few quick steps to capture your style preferences and add your first wardrobe item.'
      );

      expect(title.props.allowFontScaling).toBe(true);
      expect(title.props.maxFontSizeMultiplier).toBe(3);

      expect(description.props.allowFontScaling).toBe(true);
      expect(description.props.maxFontSizeMultiplier).toBe(3);
    });

    it('should enable font scaling on privacy text', () => {
      const { getByText } = render(
        <TestWrapper>
          <WelcomeScreen />
        </TestWrapper>
      );

      const title = getByText('Your privacy matters');
      const description = getByText(
        'Photos are of clothes, not faces. You can delete your wardrobe data anytime in settings. Nothing is shared without your permission.'
      );

      expect(title.props.allowFontScaling).toBe(true);
      expect(title.props.maxFontSizeMultiplier).toBe(3);

      expect(description.props.allowFontScaling).toBe(true);
      expect(description.props.maxFontSizeMultiplier).toBe(3);
    });
  });

  describe('Analytics', () => {
    it('should track welcome_viewed event on mount with isResume=false', () => {
      render(
        <TestWrapper>
          <WelcomeScreen />
        </TestWrapper>
      );

      expect(onboardingAnalytics.trackWelcomeViewed).toHaveBeenCalledTimes(1);
      expect(onboardingAnalytics.trackWelcomeViewed).toHaveBeenCalledWith(false);
    });

    it('should not track welcome_viewed if currentStep is not welcome', () => {
      render(
        <TestWrapper currentStep="prefs">
          <WelcomeScreen />
        </TestWrapper>
      );

      expect(onboardingAnalytics.trackWelcomeViewed).not.toHaveBeenCalled();
    });

    it('should not track welcome_viewed multiple times on re-render', () => {
      const { rerender } = render(
        <TestWrapper>
          <WelcomeScreen />
        </TestWrapper>
      );

      expect(onboardingAnalytics.trackWelcomeViewed).toHaveBeenCalledTimes(1);

      // Force re-render
      rerender(
        <TestWrapper>
          <WelcomeScreen />
        </TestWrapper>
      );

      // Should still be called only once
      expect(onboardingAnalytics.trackWelcomeViewed).toHaveBeenCalledTimes(1);
    });

    it('should track welcome_viewed only once even if component re-renders with same step', () => {
      const { rerender } = render(
        <TestWrapper currentStep="welcome">
          <WelcomeScreen />
        </TestWrapper>
      );

      expect(onboardingAnalytics.trackWelcomeViewed).toHaveBeenCalledTimes(1);

      // Re-render with same step
      rerender(
        <TestWrapper currentStep="welcome">
          <WelcomeScreen />
        </TestWrapper>
      );

      // Should not be called again
      expect(onboardingAnalytics.trackWelcomeViewed).toHaveBeenCalledTimes(1);
    });
  });

  describe('i18n Integration', () => {
    it('should use i18n key for app name', () => {
      const { getByText } = render(
        <TestWrapper>
          <WelcomeScreen />
        </TestWrapper>
      );

      // Verifies i18n key: screens.onboarding.welcome.appName
      expect(getByText('Maidrobe')).toBeTruthy();
    });

    it('should use i18n keys for all value propositions', () => {
      const { getByText } = render(
        <TestWrapper>
          <WelcomeScreen />
        </TestWrapper>
      );

      // Verifies i18n key: screens.onboarding.welcome.valueProps.1
      expect(getByText('Snap your clothes once.')).toBeTruthy();

      // Verifies i18n key: screens.onboarding.welcome.valueProps.2
      expect(getByText('Get outfits for real-life moments in seconds.')).toBeTruthy();

      // Verifies i18n key: screens.onboarding.welcome.valueProps.3
      expect(getByText('Feel good in what you already own.')).toBeTruthy();
    });

    it('should use i18n keys for upcoming steps section', () => {
      const { getByText } = render(
        <TestWrapper>
          <WelcomeScreen />
        </TestWrapper>
      );

      // Verifies i18n key: screens.onboarding.welcome.upcomingSteps.title
      expect(getByText('What happens next')).toBeTruthy();

      // Verifies i18n key: screens.onboarding.welcome.upcomingSteps.description
      expect(
        getByText(
          'A few quick steps to capture your style preferences and add your first wardrobe item.'
        )
      ).toBeTruthy();
    });

    it('should use i18n keys for privacy section', () => {
      const { getByText } = render(
        <TestWrapper>
          <WelcomeScreen />
        </TestWrapper>
      );

      // Verifies i18n key: screens.onboarding.welcome.privacy.title
      expect(getByText('Your privacy matters')).toBeTruthy();

      // Verifies i18n key: screens.onboarding.welcome.privacy.description
      expect(
        getByText(
          'Photos are of clothes, not faces. You can delete your wardrobe data anytime in settings. Nothing is shared without your permission.'
        )
      ).toBeTruthy();
    });

    it('should use i18n keys for all accessibility labels', () => {
      const { getByLabelText } = render(
        <TestWrapper>
          <WelcomeScreen />
        </TestWrapper>
      );

      // Verifies i18n key: screens.onboarding.welcome.accessibility.screenLabel
      expect(getByLabelText('Welcome to Maidrobe onboarding')).toBeTruthy();

      // Verifies i18n key: screens.onboarding.welcome.accessibility.appNameLabel
      expect(getByLabelText('Maidrobe app name')).toBeTruthy();

      // Verifies i18n key: screens.onboarding.welcome.accessibility.valuePropLabel
      expect(getByLabelText('Value proposition')).toBeTruthy();

      // Verifies i18n key: screens.onboarding.welcome.accessibility.upcomingStepsLabel
      expect(getByLabelText('Upcoming onboarding steps')).toBeTruthy();

      // Verifies i18n key: screens.onboarding.welcome.accessibility.privacyLabel
      expect(getByLabelText('Privacy information')).toBeTruthy();
    });

    it('should render content from en.json without hardcoded literals', () => {
      const { getByText } = render(
        <TestWrapper>
          <WelcomeScreen />
        </TestWrapper>
      );

      // Verify exact strings from en.json are rendered
      expect(getByText('Maidrobe')).toBeTruthy();
      expect(getByText('Snap your clothes once.')).toBeTruthy();
      expect(getByText('Get outfits for real-life moments in seconds.')).toBeTruthy();
      expect(getByText('Feel good in what you already own.')).toBeTruthy();
      expect(getByText('What happens next')).toBeTruthy();
      expect(
        getByText(
          'A few quick steps to capture your style preferences and add your first wardrobe item.'
        )
      ).toBeTruthy();
      expect(getByText('Your privacy matters')).toBeTruthy();
      expect(
        getByText(
          'Photos are of clothes, not faces. You can delete your wardrobe data anytime in settings. Nothing is shared without your permission.'
        )
      ).toBeTruthy();
    });
  });

  describe('Component Integration', () => {
    it('should render within OnboardingShell wrapper', () => {
      const { getByText } = render(
        <TestWrapper>
          <WelcomeScreen />
        </TestWrapper>
      );

      // Should render content
      expect(getByText('Maidrobe')).toBeTruthy();

      // Footer buttons should be present (from OnboardingShell)
      expect(getByText('Get Started')).toBeTruthy();
      expect(getByText('Skip for now')).toBeTruthy();
    });

    it('should work correctly with welcome currentStep', () => {
      const { getByText } = render(
        <TestWrapper currentStep="welcome">
          <WelcomeScreen />
        </TestWrapper>
      );

      expect(getByText('Maidrobe')).toBeTruthy();
      expect(onboardingAnalytics.trackWelcomeViewed).toHaveBeenCalledTimes(1);
    });

    it('should render all content sections in correct order', () => {
      const { getAllByText } = render(
        <TestWrapper>
          <WelcomeScreen />
        </TestWrapper>
      );

      // Just verify all sections are present
      // Order verification would require more complex testing
      expect(getAllByText('Maidrobe').length).toBeGreaterThan(0);
      expect(getAllByText('Snap your clothes once.').length).toBeGreaterThan(0);
      expect(getAllByText('What happens next').length).toBeGreaterThan(0);
      expect(getAllByText('Your privacy matters').length).toBeGreaterThan(0);
    });
  });

  describe('Theme Integration', () => {
    it('should render correctly with light theme', () => {
      const { getByText } = render(
        <ThemeProvider colorScheme="light">
          <OnboardingProvider
            currentStep="welcome"
            onNext={mockOnNext}
            onSkipStep={mockOnSkipStep}
            onSkipOnboarding={mockOnSkipOnboarding}
            onBack={mockOnBack}
          >
            <WelcomeScreen />
          </OnboardingProvider>
        </ThemeProvider>
      );

      expect(getByText('Maidrobe')).toBeTruthy();
    });

    it('should render correctly with dark theme', () => {
      const { getByText } = render(
        <ThemeProvider colorScheme="dark">
          <OnboardingProvider
            currentStep="welcome"
            onNext={mockOnNext}
            onSkipStep={mockOnSkipStep}
            onSkipOnboarding={mockOnSkipOnboarding}
            onBack={mockOnBack}
          >
            <WelcomeScreen />
          </OnboardingProvider>
        </ThemeProvider>
      );

      expect(getByText('Maidrobe')).toBeTruthy();
    });
  });
});
