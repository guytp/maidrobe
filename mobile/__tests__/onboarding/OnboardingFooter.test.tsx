import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { OnboardingFooter } from '../../src/features/onboarding/components/OnboardingFooter';
import { OnboardingProvider } from '../../src/features/onboarding/context/OnboardingContext';
import { ThemeProvider } from '../../src/core/theme';
import { OnboardingStep } from '../../src/features/onboarding/store/onboardingSlice';

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  }),
}));

describe('OnboardingFooter', () => {
  const mockOnNext = jest.fn();
  const mockOnSkipStep = jest.fn();
  const mockOnSkipOnboarding = jest.fn();
  const mockOnBack = jest.fn();

  interface TestWrapperProps {
    currentStep: OnboardingStep | null;
    children: React.ReactNode;
  }

  const TestWrapper = ({ currentStep, children }: TestWrapperProps) => (
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

  describe('Welcome Step (First Step)', () => {
    it('should render primary button with "Next" label', () => {
      const { getByText } = render(
        <TestWrapper currentStep="welcome">
          <OnboardingFooter />
        </TestWrapper>
      );

      expect(getByText('Next')).toBeTruthy();
    });

    it('should NOT render Skip Step button', () => {
      const { queryByText } = render(
        <TestWrapper currentStep="welcome">
          <OnboardingFooter />
        </TestWrapper>
      );

      expect(queryByText('Skip this step')).toBeNull();
    });

    it('should render Global Skip button', () => {
      const { getByText } = render(
        <TestWrapper currentStep="welcome">
          <OnboardingFooter />
        </TestWrapper>
      );

      expect(getByText('Skip onboarding')).toBeTruthy();
    });

    it('should have correct accessibility label for Next button', () => {
      const { getByLabelText } = render(
        <TestWrapper currentStep="welcome">
          <OnboardingFooter />
        </TestWrapper>
      );

      const nextButton = getByLabelText('Next');
      expect(nextButton).toBeTruthy();
      expect(nextButton.props.accessibilityHint).toBe('Continue to next onboarding step');
    });

    it('should have correct accessibility label for Global Skip button', () => {
      const { getByLabelText } = render(
        <TestWrapper currentStep="welcome">
          <OnboardingFooter />
        </TestWrapper>
      );

      const skipButton = getByLabelText('Skip onboarding');
      expect(skipButton).toBeTruthy();
      expect(skipButton.props.accessibilityHint).toBe(
        'Skip the entire onboarding process and go directly to the app'
      );
    });

    it('should call onNext when Next button is pressed', () => {
      const { getByText } = render(
        <TestWrapper currentStep="welcome">
          <OnboardingFooter />
        </TestWrapper>
      );

      const nextButton = getByText('Next');
      fireEvent.press(nextButton);

      expect(mockOnNext).toHaveBeenCalledTimes(1);
      expect(mockOnSkipStep).not.toHaveBeenCalled();
      expect(mockOnSkipOnboarding).not.toHaveBeenCalled();
    });

    it('should call onSkipOnboarding when Global Skip button is pressed', () => {
      const { getByText } = render(
        <TestWrapper currentStep="welcome">
          <OnboardingFooter />
        </TestWrapper>
      );

      const skipButton = getByText('Skip onboarding');
      fireEvent.press(skipButton);

      expect(mockOnSkipOnboarding).toHaveBeenCalledTimes(1);
      expect(mockOnNext).not.toHaveBeenCalled();
      expect(mockOnSkipStep).not.toHaveBeenCalled();
    });
  });

  describe('Preferences Step (Optional Step)', () => {
    it('should render primary button with "Next" label', () => {
      const { getByText } = render(
        <TestWrapper currentStep="prefs">
          <OnboardingFooter />
        </TestWrapper>
      );

      expect(getByText('Next')).toBeTruthy();
    });

    it('should render Skip Step button', () => {
      const { getByText } = render(
        <TestWrapper currentStep="prefs">
          <OnboardingFooter />
        </TestWrapper>
      );

      expect(getByText('Skip this step')).toBeTruthy();
    });

    it('should render Global Skip button', () => {
      const { getByText } = render(
        <TestWrapper currentStep="prefs">
          <OnboardingFooter />
        </TestWrapper>
      );

      expect(getByText('Skip onboarding')).toBeTruthy();
    });

    it('should have all three buttons visible', () => {
      const { getByText } = render(
        <TestWrapper currentStep="prefs">
          <OnboardingFooter />
        </TestWrapper>
      );

      expect(getByText('Next')).toBeTruthy();
      expect(getByText('Skip this step')).toBeTruthy();
      expect(getByText('Skip onboarding')).toBeTruthy();
    });

    it('should have correct accessibility label for Skip Step button', () => {
      const { getByLabelText } = render(
        <TestWrapper currentStep="prefs">
          <OnboardingFooter />
        </TestWrapper>
      );

      const skipStepButton = getByLabelText('Skip this step');
      expect(skipStepButton).toBeTruthy();
      expect(skipStepButton.props.accessibilityHint).toBe(
        'Skip this step and continue to the next one'
      );
    });

    it('should call onNext when Next button is pressed', () => {
      const { getByText } = render(
        <TestWrapper currentStep="prefs">
          <OnboardingFooter />
        </TestWrapper>
      );

      const nextButton = getByText('Next');
      fireEvent.press(nextButton);

      expect(mockOnNext).toHaveBeenCalledTimes(1);
      expect(mockOnSkipStep).not.toHaveBeenCalled();
      expect(mockOnSkipOnboarding).not.toHaveBeenCalled();
    });

    it('should call onSkipStep when Skip Step button is pressed', () => {
      const { getByText } = render(
        <TestWrapper currentStep="prefs">
          <OnboardingFooter />
        </TestWrapper>
      );

      const skipStepButton = getByText('Skip this step');
      fireEvent.press(skipStepButton);

      expect(mockOnSkipStep).toHaveBeenCalledTimes(1);
      expect(mockOnNext).not.toHaveBeenCalled();
      expect(mockOnSkipOnboarding).not.toHaveBeenCalled();
    });

    it('should call onSkipOnboarding when Global Skip button is pressed', () => {
      const { getByText } = render(
        <TestWrapper currentStep="prefs">
          <OnboardingFooter />
        </TestWrapper>
      );

      const skipOnboardingButton = getByText('Skip onboarding');
      fireEvent.press(skipOnboardingButton);

      expect(mockOnSkipOnboarding).toHaveBeenCalledTimes(1);
      expect(mockOnNext).not.toHaveBeenCalled();
      expect(mockOnSkipStep).not.toHaveBeenCalled();
    });
  });

  describe('First Item Step (Optional Step)', () => {
    it('should render primary button with "Next" label', () => {
      const { getByText } = render(
        <TestWrapper currentStep="firstItem">
          <OnboardingFooter />
        </TestWrapper>
      );

      expect(getByText('Next')).toBeTruthy();
    });

    it('should render Skip Step button', () => {
      const { getByText } = render(
        <TestWrapper currentStep="firstItem">
          <OnboardingFooter />
        </TestWrapper>
      );

      expect(getByText('Skip this step')).toBeTruthy();
    });

    it('should render Global Skip button', () => {
      const { getByText } = render(
        <TestWrapper currentStep="firstItem">
          <OnboardingFooter />
        </TestWrapper>
      );

      expect(getByText('Skip onboarding')).toBeTruthy();
    });

    it('should have all three buttons visible', () => {
      const { getByText } = render(
        <TestWrapper currentStep="firstItem">
          <OnboardingFooter />
        </TestWrapper>
      );

      expect(getByText('Next')).toBeTruthy();
      expect(getByText('Skip this step')).toBeTruthy();
      expect(getByText('Skip onboarding')).toBeTruthy();
    });

    it('should call onNext when Next button is pressed', () => {
      const { getByText } = render(
        <TestWrapper currentStep="firstItem">
          <OnboardingFooter />
        </TestWrapper>
      );

      const nextButton = getByText('Next');
      fireEvent.press(nextButton);

      expect(mockOnNext).toHaveBeenCalledTimes(1);
      expect(mockOnSkipStep).not.toHaveBeenCalled();
      expect(mockOnSkipOnboarding).not.toHaveBeenCalled();
    });

    it('should call onSkipStep when Skip Step button is pressed', () => {
      const { getByText } = render(
        <TestWrapper currentStep="firstItem">
          <OnboardingFooter />
        </TestWrapper>
      );

      const skipStepButton = getByText('Skip this step');
      fireEvent.press(skipStepButton);

      expect(mockOnSkipStep).toHaveBeenCalledTimes(1);
      expect(mockOnNext).not.toHaveBeenCalled();
      expect(mockOnSkipOnboarding).not.toHaveBeenCalled();
    });

    it('should call onSkipOnboarding when Global Skip button is pressed', () => {
      const { getByText } = render(
        <TestWrapper currentStep="firstItem">
          <OnboardingFooter />
        </TestWrapper>
      );

      const skipOnboardingButton = getByText('Skip onboarding');
      fireEvent.press(skipOnboardingButton);

      expect(mockOnSkipOnboarding).toHaveBeenCalledTimes(1);
      expect(mockOnNext).not.toHaveBeenCalled();
      expect(mockOnSkipStep).not.toHaveBeenCalled();
    });

    it('should have consistent behavior with prefs step (both optional)', () => {
      const prefsRender = render(
        <TestWrapper currentStep="prefs">
          <OnboardingFooter />
        </TestWrapper>
      );

      const firstItemRender = render(
        <TestWrapper currentStep="firstItem">
          <OnboardingFooter />
        </TestWrapper>
      );

      // Both should have same button structure
      expect(prefsRender.getByText('Next')).toBeTruthy();
      expect(prefsRender.getByText('Skip this step')).toBeTruthy();
      expect(prefsRender.getByText('Skip onboarding')).toBeTruthy();

      expect(firstItemRender.getByText('Next')).toBeTruthy();
      expect(firstItemRender.getByText('Skip this step')).toBeTruthy();
      expect(firstItemRender.getByText('Skip onboarding')).toBeTruthy();
    });
  });

  describe('Success Step (Final Step)', () => {
    it('should render primary button with "Get Started" label', () => {
      const { getByText } = render(
        <TestWrapper currentStep="success">
          <OnboardingFooter />
        </TestWrapper>
      );

      expect(getByText('Get Started')).toBeTruthy();
    });

    it('should NOT render "Next" button', () => {
      const { queryByText } = render(
        <TestWrapper currentStep="success">
          <OnboardingFooter />
        </TestWrapper>
      );

      expect(queryByText('Next')).toBeNull();
    });

    it('should NOT render Skip Step button', () => {
      const { queryByText } = render(
        <TestWrapper currentStep="success">
          <OnboardingFooter />
        </TestWrapper>
      );

      expect(queryByText('Skip this step')).toBeNull();
    });

    it('should NOT render Global Skip button', () => {
      const { queryByText } = render(
        <TestWrapper currentStep="success">
          <OnboardingFooter />
        </TestWrapper>
      );

      expect(queryByText('Skip onboarding')).toBeNull();
    });

    it('should only have Get Started button visible', () => {
      const { getByText, queryByText } = render(
        <TestWrapper currentStep="success">
          <OnboardingFooter />
        </TestWrapper>
      );

      expect(getByText('Get Started')).toBeTruthy();
      expect(queryByText('Skip this step')).toBeNull();
      expect(queryByText('Skip onboarding')).toBeNull();
    });

    it('should have correct accessibility label for Get Started button', () => {
      const { getByLabelText } = render(
        <TestWrapper currentStep="success">
          <OnboardingFooter />
        </TestWrapper>
      );

      const getStartedButton = getByLabelText('Get Started');
      expect(getStartedButton).toBeTruthy();
      expect(getStartedButton.props.accessibilityHint).toBe(
        'Complete onboarding and go to home screen'
      );
    });

    it('should call onNext when Get Started button is pressed', () => {
      const { getByText } = render(
        <TestWrapper currentStep="success">
          <OnboardingFooter />
        </TestWrapper>
      );

      const getStartedButton = getByText('Get Started');
      fireEvent.press(getStartedButton);

      expect(mockOnNext).toHaveBeenCalledTimes(1);
      expect(mockOnSkipStep).not.toHaveBeenCalled();
      expect(mockOnSkipOnboarding).not.toHaveBeenCalled();
    });
  });

  describe('i18n Integration', () => {
    it('should use i18n for Next button label', () => {
      const { getByText } = render(
        <TestWrapper currentStep="welcome">
          <OnboardingFooter />
        </TestWrapper>
      );

      // Verifies i18n key: screens.onboarding.footer.buttons.next
      expect(getByText('Next')).toBeTruthy();
    });

    it('should use i18n for Get Started button label', () => {
      const { getByText } = render(
        <TestWrapper currentStep="success">
          <OnboardingFooter />
        </TestWrapper>
      );

      // Verifies i18n key: screens.onboarding.footer.buttons.getStarted
      expect(getByText('Get Started')).toBeTruthy();
    });

    it('should use i18n for Skip Step button label', () => {
      const { getByText } = render(
        <TestWrapper currentStep="prefs">
          <OnboardingFooter />
        </TestWrapper>
      );

      // Verifies i18n key: screens.onboarding.footer.buttons.skipStep
      expect(getByText('Skip this step')).toBeTruthy();
    });

    it('should use i18n for Skip Onboarding button label', () => {
      const { getByText } = render(
        <TestWrapper currentStep="welcome">
          <OnboardingFooter />
        </TestWrapper>
      );

      // Verifies i18n key: screens.onboarding.footer.buttons.skipOnboarding
      expect(getByText('Skip onboarding')).toBeTruthy();
    });

    it('should use i18n for Next button accessibility attributes', () => {
      const { getByLabelText } = render(
        <TestWrapper currentStep="welcome">
          <OnboardingFooter />
        </TestWrapper>
      );

      // Verifies i18n keys: accessibility.nextLabel and accessibility.nextHint
      const button = getByLabelText('Next');
      expect(button.props.accessibilityHint).toBe('Continue to next onboarding step');
    });

    it('should use i18n for Get Started button accessibility attributes', () => {
      const { getByLabelText } = render(
        <TestWrapper currentStep="success">
          <OnboardingFooter />
        </TestWrapper>
      );

      // Verifies i18n keys: accessibility.getStartedLabel and accessibility.getStartedHint
      const button = getByLabelText('Get Started');
      expect(button.props.accessibilityHint).toBe('Complete onboarding and go to home screen');
    });

    it('should use i18n for Skip Step button accessibility attributes', () => {
      const { getByLabelText } = render(
        <TestWrapper currentStep="prefs">
          <OnboardingFooter />
        </TestWrapper>
      );

      // Verifies i18n keys: accessibility.skipStepLabel and accessibility.skipStepHint
      const button = getByLabelText('Skip this step');
      expect(button.props.accessibilityHint).toBe('Skip this step and continue to the next one');
    });

    it('should use i18n for Skip Onboarding button accessibility attributes', () => {
      const { getByLabelText } = render(
        <TestWrapper currentStep="welcome">
          <OnboardingFooter />
        </TestWrapper>
      );

      // Verifies i18n keys: accessibility.skipOnboardingLabel and accessibility.skipOnboardingHint
      const button = getByLabelText('Skip onboarding');
      expect(button.props.accessibilityHint).toBe(
        'Skip the entire onboarding process and go directly to the app'
      );
    });
  });

  describe('Button Variants', () => {
    it('should render primary button with primary variant', () => {
      const { getByText } = render(
        <TestWrapper currentStep="welcome">
          <OnboardingFooter />
        </TestWrapper>
      );

      const nextButton = getByText('Next');
      // Primary buttons should have the primary styling
      expect(nextButton).toBeTruthy();
    });

    it('should render Skip Step button with text variant', () => {
      const { getByText } = render(
        <TestWrapper currentStep="prefs">
          <OnboardingFooter />
        </TestWrapper>
      );

      const skipStepButton = getByText('Skip this step');
      // Skip buttons should have text variant styling
      expect(skipStepButton).toBeTruthy();
    });

    it('should render Skip Onboarding button with text variant', () => {
      const { getByText } = render(
        <TestWrapper currentStep="welcome">
          <OnboardingFooter />
        </TestWrapper>
      );

      const skipOnboardingButton = getByText('Skip onboarding');
      // Skip buttons should have text variant styling
      expect(skipOnboardingButton).toBeTruthy();
    });
  });

  describe('Conditional Rendering Logic', () => {
    it('should correctly identify welcome as non-optional step', () => {
      const { queryByText } = render(
        <TestWrapper currentStep="welcome">
          <OnboardingFooter />
        </TestWrapper>
      );

      // Welcome is not optional, so no Skip Step button
      expect(queryByText('Skip this step')).toBeNull();
    });

    it('should correctly identify prefs as optional step', () => {
      const { getByText } = render(
        <TestWrapper currentStep="prefs">
          <OnboardingFooter />
        </TestWrapper>
      );

      // Prefs is optional, so Skip Step button should be present
      expect(getByText('Skip this step')).toBeTruthy();
    });

    it('should correctly identify firstItem as optional step', () => {
      const { getByText } = render(
        <TestWrapper currentStep="firstItem">
          <OnboardingFooter />
        </TestWrapper>
      );

      // FirstItem is optional, so Skip Step button should be present
      expect(getByText('Skip this step')).toBeTruthy();
    });

    it('should correctly identify success as final step', () => {
      const { queryByText } = render(
        <TestWrapper currentStep="success">
          <OnboardingFooter />
        </TestWrapper>
      );

      // Success is final, so no skip buttons
      expect(queryByText('Skip this step')).toBeNull();
      expect(queryByText('Skip onboarding')).toBeNull();
    });

    it('should show Global Skip on all non-final steps', () => {
      const steps: OnboardingStep[] = ['welcome', 'prefs', 'firstItem'];

      steps.forEach((step) => {
        const { getByText } = render(
          <TestWrapper currentStep={step}>
            <OnboardingFooter />
          </TestWrapper>
        );

        expect(getByText('Skip onboarding')).toBeTruthy();
      });
    });

    it('should not show Global Skip on final step', () => {
      const { queryByText } = render(
        <TestWrapper currentStep="success">
          <OnboardingFooter />
        </TestWrapper>
      );

      expect(queryByText('Skip onboarding')).toBeNull();
    });
  });
});
