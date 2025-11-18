import {
  trackStepViewed,
  trackStepSkipped,
  trackOnboardingCompleted,
  trackOnboardingSkippedAll,
  trackStateReset,
  trackStateResumed,
  trackWelcomeViewed,
  trackWelcomeGetStartedClicked,
  trackWelcomeSkipped,
  trackOnboardingCompletedAllSteps,
  trackOnboardingCompletedWithSkips,
  trackOnboardingExitToHome,
} from './onboardingAnalytics';
import type { OnboardingStep } from '../store/onboardingSlice';
import { logSuccess } from '../../../core/telemetry';

// Mock telemetry module
jest.mock('../../../core/telemetry', () => ({
  logSuccess: jest.fn(),
}));

describe('onboardingAnalytics', () => {
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe('trackStepViewed', () => {
    it('should call logSuccess with correct event name and payload for fresh session', () => {
      const step: OnboardingStep = 'welcome';
      const isResume = false;

      trackStepViewed(step, isResume);

      expect(logSuccess).toHaveBeenCalledTimes(1);
      expect(logSuccess).toHaveBeenCalledWith('onboarding', 'step_viewed', {
        data: {
          step: 'welcome',
          isResume: false,
          timestamp: expect.any(String),
        },
      });
    });

    it('should call logSuccess with correct payload for resumed session', () => {
      const step: OnboardingStep = 'prefs';
      const isResume = true;

      trackStepViewed(step, isResume);

      expect(logSuccess).toHaveBeenCalledWith('onboarding', 'step_viewed', {
        data: {
          step: 'prefs',
          isResume: true,
          timestamp: expect.any(String),
        },
      });
    });

    it('should include valid ISO timestamp', () => {
      trackStepViewed('welcome', false);

      const call = (logSuccess as jest.Mock).mock.calls[0];
      const timestamp = call[2].data.timestamp;
      expect(() => new Date(timestamp)).not.toThrow();
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should catch errors and log warning without throwing', () => {
      (logSuccess as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Telemetry failure');
      });

      expect(() => trackStepViewed('welcome', false)).not.toThrow();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Onboarding Analytics] Failed to track step_viewed:',
        expect.any(Error)
      );
    });

    it('should not block execution when logSuccess throws', () => {
      (logSuccess as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Network error');
      });

      const result = trackStepViewed('firstItem', true);
      expect(result).toBeUndefined();
    });
  });

  describe('trackStepSkipped', () => {
    it('should call logSuccess with correct event name and payload', () => {
      const step: OnboardingStep = 'prefs';

      trackStepSkipped(step);

      expect(logSuccess).toHaveBeenCalledTimes(1);
      expect(logSuccess).toHaveBeenCalledWith('onboarding', 'step_skipped', {
        data: {
          step: 'prefs',
          timestamp: expect.any(String),
        },
      });
    });

    it('should work for all step types', () => {
      const steps: OnboardingStep[] = ['welcome', 'prefs', 'firstItem', 'success'];

      steps.forEach((step) => {
        jest.clearAllMocks();
        trackStepSkipped(step);

        expect(logSuccess).toHaveBeenCalledWith('onboarding', 'step_skipped', {
          data: {
            step,
            timestamp: expect.any(String),
          },
        });
      });
    });

    it('should catch errors and log warning without throwing', () => {
      (logSuccess as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Telemetry failure');
      });

      expect(() => trackStepSkipped('prefs')).not.toThrow();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Onboarding Analytics] Failed to track step_skipped:',
        expect.any(Error)
      );
    });
  });

  describe('trackOnboardingCompleted', () => {
    it('should call logSuccess with correct event name and payload', () => {
      const completedSteps: OnboardingStep[] = ['welcome', 'prefs', 'firstItem'];
      const skippedSteps: OnboardingStep[] = [];
      const durationMs = 120000;

      trackOnboardingCompleted(completedSteps, skippedSteps, durationMs);

      expect(logSuccess).toHaveBeenCalledTimes(1);
      expect(logSuccess).toHaveBeenCalledWith('onboarding', 'completed', {
        latency: 120000,
        data: {
          completedSteps: ['welcome', 'prefs', 'firstItem'],
          skippedSteps: [],
          totalSteps: 3,
          timestamp: expect.any(String),
        },
      });
    });

    it('should work without optional durationMs parameter', () => {
      const completedSteps: OnboardingStep[] = ['welcome', 'success'];
      const skippedSteps: OnboardingStep[] = ['prefs', 'firstItem'];

      trackOnboardingCompleted(completedSteps, skippedSteps);

      expect(logSuccess).toHaveBeenCalledWith('onboarding', 'completed', {
        latency: undefined,
        data: {
          completedSteps: ['welcome', 'success'],
          skippedSteps: ['prefs', 'firstItem'],
          totalSteps: 4,
          timestamp: expect.any(String),
        },
      });
    });

    it('should calculate totalSteps correctly', () => {
      trackOnboardingCompleted(['welcome', 'prefs'], ['firstItem'], 60000);

      const call = (logSuccess as jest.Mock).mock.calls[0];
      expect(call[2].data.totalSteps).toBe(3);
    });

    it('should handle empty arrays', () => {
      trackOnboardingCompleted([], [], undefined);

      expect(logSuccess).toHaveBeenCalledWith('onboarding', 'completed', {
        latency: undefined,
        data: {
          completedSteps: [],
          skippedSteps: [],
          totalSteps: 0,
          timestamp: expect.any(String),
        },
      });
    });

    it('should catch errors and log warning without throwing', () => {
      (logSuccess as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Telemetry failure');
      });

      expect(() => trackOnboardingCompleted(['welcome'], [], 1000)).not.toThrow();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Onboarding Analytics] Failed to track completed:',
        expect.any(Error)
      );
    });
  });

  describe('trackOnboardingSkippedAll', () => {
    it('should call logSuccess with correct event name and payload', () => {
      const atStep: OnboardingStep = 'welcome';
      const completedSteps: OnboardingStep[] = [];
      const skippedSteps: OnboardingStep[] = [];

      trackOnboardingSkippedAll(atStep, completedSteps, skippedSteps);

      expect(logSuccess).toHaveBeenCalledTimes(1);
      expect(logSuccess).toHaveBeenCalledWith('onboarding', 'skipped_all', {
        data: {
          atStep: 'welcome',
          completedSteps: [],
          skippedSteps: [],
          timestamp: expect.any(String),
        },
      });
    });

    it('should track partial completion before skip', () => {
      trackOnboardingSkippedAll('firstItem', ['welcome', 'prefs'], []);

      expect(logSuccess).toHaveBeenCalledWith('onboarding', 'skipped_all', {
        data: {
          atStep: 'firstItem',
          completedSteps: ['welcome', 'prefs'],
          skippedSteps: [],
          timestamp: expect.any(String),
        },
      });
    });

    it('should catch errors and log warning without throwing', () => {
      (logSuccess as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Telemetry failure');
      });

      expect(() => trackOnboardingSkippedAll('prefs', [], [])).not.toThrow();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Onboarding Analytics] Failed to track skipped_all:',
        expect.any(Error)
      );
    });
  });

  describe('trackStateReset', () => {
    it('should call logSuccess with correct event name and payload', () => {
      const reason = 'corrupted';
      const corruptedState = { invalid: 'data' };

      trackStateReset(reason, corruptedState);

      expect(logSuccess).toHaveBeenCalledTimes(1);
      expect(logSuccess).toHaveBeenCalledWith('onboarding', 'state_reset', {
        data: {
          reason: 'corrupted',
          hadState: true,
          timestamp: expect.any(String),
        },
      });
    });

    it('should set hadState to false when corruptedState is undefined', () => {
      trackStateReset('invalid_version', undefined);

      const call = (logSuccess as jest.Mock).mock.calls[0];
      expect(call[2].data.hadState).toBe(false);
    });

    it('should set hadState to false when corruptedState is null', () => {
      trackStateReset('invalid_version', null);

      const call = (logSuccess as jest.Mock).mock.calls[0];
      expect(call[2].data.hadState).toBe(false);
    });

    it('should set hadState to true when corruptedState exists', () => {
      trackStateReset('corrupted', { some: 'data' });

      const call = (logSuccess as jest.Mock).mock.calls[0];
      expect(call[2].data.hadState).toBe(true);
    });

    it('should catch errors and log warning without throwing', () => {
      (logSuccess as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Telemetry failure');
      });

      expect(() => trackStateReset('corrupted', {})).not.toThrow();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Onboarding Analytics] Failed to track state_reset:',
        expect.any(Error)
      );
    });
  });

  describe('trackStateResumed', () => {
    it('should call logSuccess with correct event name and payload', () => {
      const currentStep: OnboardingStep = 'prefs';
      const completedSteps: OnboardingStep[] = ['welcome'];
      const skippedSteps: OnboardingStep[] = [];

      trackStateResumed(currentStep, completedSteps, skippedSteps);

      expect(logSuccess).toHaveBeenCalledTimes(1);
      expect(logSuccess).toHaveBeenCalledWith('onboarding', 'state_resumed', {
        data: {
          currentStep: 'prefs',
          completedSteps: ['welcome'],
          skippedSteps: [],
          totalProgress: 1,
          timestamp: expect.any(String),
        },
      });
    });

    it('should calculate totalProgress correctly', () => {
      trackStateResumed('success', ['welcome', 'prefs'], ['firstItem']);

      const call = (logSuccess as jest.Mock).mock.calls[0];
      expect(call[2].data.totalProgress).toBe(3);
    });

    it('should handle empty progress arrays', () => {
      trackStateResumed('welcome', [], []);

      const call = (logSuccess as jest.Mock).mock.calls[0];
      expect(call[2].data.totalProgress).toBe(0);
    });

    it('should catch errors and log warning without throwing', () => {
      (logSuccess as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Telemetry failure');
      });

      expect(() => trackStateResumed('prefs', ['welcome'], [])).not.toThrow();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Onboarding Analytics] Failed to track state_resumed:',
        expect.any(Error)
      );
    });
  });

  describe('trackWelcomeViewed', () => {
    it('should call logSuccess with correct event name and payload for fresh session', () => {
      const isResume = false;

      trackWelcomeViewed(isResume);

      expect(logSuccess).toHaveBeenCalledTimes(1);
      expect(logSuccess).toHaveBeenCalledWith('onboarding', 'welcome_viewed', {
        data: {
          step: 'welcome',
          isResume: false,
          timestamp: expect.any(String),
        },
      });
    });

    it('should call logSuccess with correct payload for resumed session', () => {
      const isResume = true;

      trackWelcomeViewed(isResume);

      expect(logSuccess).toHaveBeenCalledWith('onboarding', 'welcome_viewed', {
        data: {
          step: 'welcome',
          isResume: true,
          timestamp: expect.any(String),
        },
      });
    });

    it('should always include step as welcome', () => {
      trackWelcomeViewed(false);

      const call = (logSuccess as jest.Mock).mock.calls[0];
      expect(call[2].data.step).toBe('welcome');
    });

    it('should catch errors and log warning without throwing', () => {
      (logSuccess as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Telemetry failure');
      });

      expect(() => trackWelcomeViewed(false)).not.toThrow();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Onboarding Analytics] Failed to track welcome_viewed:',
        expect.any(Error)
      );
    });
  });

  describe('trackWelcomeGetStartedClicked', () => {
    it('should call logSuccess with correct event name and payload', () => {
      trackWelcomeGetStartedClicked();

      expect(logSuccess).toHaveBeenCalledTimes(1);
      expect(logSuccess).toHaveBeenCalledWith('onboarding', 'welcome_get_started_clicked', {
        data: {
          step: 'welcome',
          timestamp: expect.any(String),
        },
      });
    });

    it('should always include step as welcome', () => {
      trackWelcomeGetStartedClicked();

      const call = (logSuccess as jest.Mock).mock.calls[0];
      expect(call[2].data.step).toBe('welcome');
    });

    it('should catch errors and log warning without throwing', () => {
      (logSuccess as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Telemetry failure');
      });

      expect(() => trackWelcomeGetStartedClicked()).not.toThrow();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Onboarding Analytics] Failed to track welcome_get_started_clicked:',
        expect.any(Error)
      );
    });

    it('should not block execution when called multiple times', () => {
      trackWelcomeGetStartedClicked();
      trackWelcomeGetStartedClicked();
      trackWelcomeGetStartedClicked();

      expect(logSuccess).toHaveBeenCalledTimes(3);
    });
  });

  describe('trackWelcomeSkipped', () => {
    it('should call logSuccess with correct event name and payload', () => {
      trackWelcomeSkipped();

      expect(logSuccess).toHaveBeenCalledTimes(1);
      expect(logSuccess).toHaveBeenCalledWith('onboarding', 'welcome_skipped', {
        data: {
          step: 'welcome',
          timestamp: expect.any(String),
        },
      });
    });

    it('should always include step as welcome', () => {
      trackWelcomeSkipped();

      const call = (logSuccess as jest.Mock).mock.calls[0];
      expect(call[2].data.step).toBe('welcome');
    });

    it('should catch errors and log warning without throwing', () => {
      (logSuccess as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Telemetry failure');
      });

      expect(() => trackWelcomeSkipped()).not.toThrow();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Onboarding Analytics] Failed to track welcome_skipped:',
        expect.any(Error)
      );
    });
  });

  describe('trackOnboardingCompletedAllSteps', () => {
    it('should call logSuccess with correct event name and payload', () => {
      const completedSteps: OnboardingStep[] = ['welcome', 'prefs', 'firstItem', 'success'];
      const durationMs = 180000;
      const hasItems = true;

      trackOnboardingCompletedAllSteps(completedSteps, durationMs, hasItems);

      expect(logSuccess).toHaveBeenCalledTimes(1);
      expect(logSuccess).toHaveBeenCalledWith('onboarding', 'completed_all_steps', {
        latency: 180000,
        data: {
          completedSteps: ['welcome', 'prefs', 'firstItem', 'success'],
          totalSteps: 4,
          hasItems: true,
          timestamp: expect.any(String),
        },
      });
    });

    it('should work without optional parameters', () => {
      const completedSteps: OnboardingStep[] = ['welcome', 'success'];

      trackOnboardingCompletedAllSteps(completedSteps);

      expect(logSuccess).toHaveBeenCalledWith('onboarding', 'completed_all_steps', {
        latency: undefined,
        data: {
          completedSteps: ['welcome', 'success'],
          totalSteps: 2,
          hasItems: false,
          timestamp: expect.any(String),
        },
      });
    });

    it('should default hasItems to false when not provided', () => {
      trackOnboardingCompletedAllSteps(['welcome', 'prefs'], 60000);

      const call = (logSuccess as jest.Mock).mock.calls[0];
      expect(call[2].data.hasItems).toBe(false);
    });

    it('should handle hasItems explicitly set to false', () => {
      trackOnboardingCompletedAllSteps(['welcome'], undefined, false);

      const call = (logSuccess as jest.Mock).mock.calls[0];
      expect(call[2].data.hasItems).toBe(false);
    });

    it('should handle hasItems set to true', () => {
      trackOnboardingCompletedAllSteps(['welcome', 'prefs'], 90000, true);

      const call = (logSuccess as jest.Mock).mock.calls[0];
      expect(call[2].data.hasItems).toBe(true);
    });

    it('should calculate totalSteps correctly', () => {
      trackOnboardingCompletedAllSteps(['welcome', 'prefs', 'firstItem'], 120000);

      const call = (logSuccess as jest.Mock).mock.calls[0];
      expect(call[2].data.totalSteps).toBe(3);
    });

    it('should handle empty completedSteps array', () => {
      trackOnboardingCompletedAllSteps([]);

      expect(logSuccess).toHaveBeenCalledWith('onboarding', 'completed_all_steps', {
        latency: undefined,
        data: {
          completedSteps: [],
          totalSteps: 0,
          hasItems: false,
          timestamp: expect.any(String),
        },
      });
    });

    it('should include valid ISO timestamp', () => {
      trackOnboardingCompletedAllSteps(['welcome']);

      const call = (logSuccess as jest.Mock).mock.calls[0];
      const timestamp = call[2].data.timestamp;
      expect(() => new Date(timestamp)).not.toThrow();
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should catch errors and log warning without throwing', () => {
      (logSuccess as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Telemetry failure');
      });

      expect(() => trackOnboardingCompletedAllSteps(['welcome'], 1000, true)).not.toThrow();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Onboarding Analytics] Failed to track completed_all_steps:',
        expect.any(Error)
      );
    });
  });

  describe('trackOnboardingCompletedWithSkips', () => {
    it('should call logSuccess with correct event name and payload', () => {
      const completedSteps: OnboardingStep[] = ['welcome', 'success'];
      const skippedSteps: OnboardingStep[] = ['prefs', 'firstItem'];
      const durationMs = 90000;
      const hasItems = false;

      trackOnboardingCompletedWithSkips(completedSteps, skippedSteps, durationMs, hasItems);

      expect(logSuccess).toHaveBeenCalledTimes(1);
      expect(logSuccess).toHaveBeenCalledWith('onboarding', 'completed_with_skips', {
        latency: 90000,
        data: {
          completedSteps: ['welcome', 'success'],
          skippedSteps: ['prefs', 'firstItem'],
          totalSteps: 4,
          hasItems: false,
          timestamp: expect.any(String),
        },
      });
    });

    it('should work without optional parameters', () => {
      const completedSteps: OnboardingStep[] = ['welcome', 'prefs'];
      const skippedSteps: OnboardingStep[] = ['firstItem'];

      trackOnboardingCompletedWithSkips(completedSteps, skippedSteps);

      expect(logSuccess).toHaveBeenCalledWith('onboarding', 'completed_with_skips', {
        latency: undefined,
        data: {
          completedSteps: ['welcome', 'prefs'],
          skippedSteps: ['firstItem'],
          totalSteps: 3,
          hasItems: false,
          timestamp: expect.any(String),
        },
      });
    });

    it('should default hasItems to false when not provided', () => {
      trackOnboardingCompletedWithSkips(['welcome'], ['prefs'], 60000);

      const call = (logSuccess as jest.Mock).mock.calls[0];
      expect(call[2].data.hasItems).toBe(false);
    });

    it('should handle hasItems set to true', () => {
      trackOnboardingCompletedWithSkips(['welcome'], ['prefs'], 60000, true);

      const call = (logSuccess as jest.Mock).mock.calls[0];
      expect(call[2].data.hasItems).toBe(true);
    });

    it('should calculate totalSteps correctly with both arrays', () => {
      trackOnboardingCompletedWithSkips(['welcome', 'prefs'], ['firstItem'], 90000);

      const call = (logSuccess as jest.Mock).mock.calls[0];
      expect(call[2].data.totalSteps).toBe(3);
    });

    it('should handle empty skippedSteps array', () => {
      trackOnboardingCompletedWithSkips(['welcome', 'prefs'], []);

      const call = (logSuccess as jest.Mock).mock.calls[0];
      expect(call[2].data.totalSteps).toBe(2);
      expect(call[2].data.skippedSteps).toEqual([]);
    });

    it('should handle empty completedSteps array', () => {
      trackOnboardingCompletedWithSkips([], ['welcome', 'prefs']);

      const call = (logSuccess as jest.Mock).mock.calls[0];
      expect(call[2].data.totalSteps).toBe(2);
      expect(call[2].data.completedSteps).toEqual([]);
    });

    it('should handle both arrays empty', () => {
      trackOnboardingCompletedWithSkips([], []);

      expect(logSuccess).toHaveBeenCalledWith('onboarding', 'completed_with_skips', {
        latency: undefined,
        data: {
          completedSteps: [],
          skippedSteps: [],
          totalSteps: 0,
          hasItems: false,
          timestamp: expect.any(String),
        },
      });
    });

    it('should include valid ISO timestamp', () => {
      trackOnboardingCompletedWithSkips(['welcome'], ['prefs']);

      const call = (logSuccess as jest.Mock).mock.calls[0];
      const timestamp = call[2].data.timestamp;
      expect(() => new Date(timestamp)).not.toThrow();
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should catch errors and log warning without throwing', () => {
      (logSuccess as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Telemetry failure');
      });

      expect(() =>
        trackOnboardingCompletedWithSkips(['welcome'], ['prefs'], 1000, true)
      ).not.toThrow();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Onboarding Analytics] Failed to track completed_with_skips:',
        expect.any(Error)
      );
    });
  });

  describe('trackOnboardingExitToHome', () => {
    it('should call logSuccess with correct event name and method completed_all_steps', () => {
      trackOnboardingExitToHome('completed_all_steps');

      expect(logSuccess).toHaveBeenCalledTimes(1);
      expect(logSuccess).toHaveBeenCalledWith('onboarding', 'exit_to_home', {
        data: {
          method: 'completed_all_steps',
          hasItems: false,
          originStep: null,
          timestamp: expect.any(String),
        },
      });
    });

    it('should call logSuccess with method completed_with_skips and hasItems', () => {
      trackOnboardingExitToHome('completed_with_skips', true);

      expect(logSuccess).toHaveBeenCalledWith('onboarding', 'exit_to_home', {
        data: {
          method: 'completed_with_skips',
          hasItems: true,
          originStep: null,
          timestamp: expect.any(String),
        },
      });
    });

    it('should call logSuccess with method skipped_entire_flow and all params', () => {
      trackOnboardingExitToHome('skipped_entire_flow', false, 'prefs');

      expect(logSuccess).toHaveBeenCalledWith('onboarding', 'exit_to_home', {
        data: {
          method: 'skipped_entire_flow',
          hasItems: false,
          originStep: 'prefs',
          timestamp: expect.any(String),
        },
      });
    });

    it('should default hasItems to false when not provided', () => {
      trackOnboardingExitToHome('completed_all_steps');

      const call = (logSuccess as jest.Mock).mock.calls[0];
      expect(call[2].data.hasItems).toBe(false);
    });

    it('should default originStep to null when not provided', () => {
      trackOnboardingExitToHome('completed_all_steps', true);

      const call = (logSuccess as jest.Mock).mock.calls[0];
      expect(call[2].data.originStep).toBe(null);
    });

    it('should handle all three method values correctly', () => {
      const methods: ('completed_all_steps' | 'completed_with_skips' | 'skipped_entire_flow')[] = [
        'completed_all_steps',
        'completed_with_skips',
        'skipped_entire_flow',
      ];

      methods.forEach((method) => {
        jest.clearAllMocks();
        trackOnboardingExitToHome(method, true, 'welcome');

        expect(logSuccess).toHaveBeenCalledWith('onboarding', 'exit_to_home', {
          data: {
            method,
            hasItems: true,
            originStep: 'welcome',
            timestamp: expect.any(String),
          },
        });
      });
    });

    it('should include valid ISO timestamp', () => {
      trackOnboardingExitToHome('completed_all_steps');

      const call = (logSuccess as jest.Mock).mock.calls[0];
      const timestamp = call[2].data.timestamp;
      expect(() => new Date(timestamp)).not.toThrow();
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should catch errors and log warning without throwing', () => {
      (logSuccess as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Telemetry failure');
      });

      expect(() => trackOnboardingExitToHome('skipped_entire_flow', true, 'prefs')).not.toThrow();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Onboarding Analytics] Failed to track exit_to_home:',
        expect.any(Error)
      );
    });
  });

  describe('Fire-and-forget pattern', () => {
    it('should return void for all tracking functions', () => {
      expect(trackStepViewed('welcome', false)).toBeUndefined();
      expect(trackStepSkipped('prefs')).toBeUndefined();
      expect(trackOnboardingCompleted([], [])).toBeUndefined();
      expect(trackOnboardingSkippedAll('welcome', [], [])).toBeUndefined();
      expect(trackStateReset('corrupted')).toBeUndefined();
      expect(trackStateResumed('prefs', [], [])).toBeUndefined();
      expect(trackWelcomeViewed(false)).toBeUndefined();
      expect(trackWelcomeGetStartedClicked()).toBeUndefined();
      expect(trackWelcomeSkipped()).toBeUndefined();
      expect(trackOnboardingCompletedAllSteps([])).toBeUndefined();
      expect(trackOnboardingCompletedWithSkips([], [])).toBeUndefined();
      expect(trackOnboardingExitToHome('completed_all_steps')).toBeUndefined();
    });

    it('should not throw errors even when logSuccess fails', () => {
      (logSuccess as jest.Mock).mockImplementation(() => {
        throw new Error('Complete telemetry failure');
      });

      expect(() => {
        trackStepViewed('welcome', false);
        trackStepSkipped('prefs');
        trackOnboardingCompleted(['welcome'], []);
        trackOnboardingSkippedAll('prefs', [], []);
        trackStateReset('corrupted');
        trackStateResumed('prefs', [], []);
        trackWelcomeViewed(false);
        trackWelcomeGetStartedClicked();
        trackWelcomeSkipped();
        trackOnboardingCompletedAllSteps([]);
        trackOnboardingCompletedWithSkips([], []);
        trackOnboardingExitToHome('completed_all_steps');
      }).not.toThrow();
    });

    it('should log warnings for all failures but not block execution', () => {
      (logSuccess as jest.Mock).mockImplementation(() => {
        throw new Error('Telemetry service down');
      });

      trackStepViewed('welcome', false);
      trackStepSkipped('prefs');
      trackOnboardingCompleted([], []);
      trackOnboardingSkippedAll('welcome', [], []);
      trackStateReset('corrupted');
      trackStateResumed('prefs', [], []);
      trackWelcomeViewed(false);
      trackWelcomeGetStartedClicked();
      trackWelcomeSkipped();
      trackOnboardingCompletedAllSteps([]);
      trackOnboardingCompletedWithSkips([], []);
      trackOnboardingExitToHome('completed_all_steps');

      expect(consoleWarnSpy).toHaveBeenCalledTimes(12);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Onboarding Analytics] Failed to track'),
        expect.any(Error)
      );
    });
  });

  describe('Timestamp validation', () => {
    it('should include valid ISO timestamps in all events', () => {
      const functions = [
        () => trackStepViewed('welcome', false),
        () => trackStepSkipped('prefs'),
        () => trackOnboardingCompleted([], []),
        () => trackOnboardingSkippedAll('welcome', [], []),
        () => trackStateReset('corrupted'),
        () => trackStateResumed('prefs', [], []),
        () => trackWelcomeViewed(false),
        () => trackWelcomeGetStartedClicked(),
        () => trackWelcomeSkipped(),
        () => trackOnboardingCompletedAllSteps([]),
        () => trackOnboardingCompletedWithSkips([], []),
        () => trackOnboardingExitToHome('completed_all_steps'),
      ];

      functions.forEach((fn) => {
        jest.clearAllMocks();
        fn();

        const call = (logSuccess as jest.Mock).mock.calls[0];
        const timestamp = call[2].data.timestamp;
        expect(timestamp).toBeTruthy();
        expect(typeof timestamp).toBe('string');
        expect(() => new Date(timestamp)).not.toThrow();
        expect(new Date(timestamp).toISOString()).toBe(timestamp);
      });
    });
  });
});
