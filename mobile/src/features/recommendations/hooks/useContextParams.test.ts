import { renderHook, act } from '@testing-library/react-native';
import { useContextParams } from './useContextParams';
import {
  DEFAULT_OCCASION,
  DEFAULT_TEMPERATURE_BAND,
  type OccasionKey,
  type TemperatureBandKey,
} from '../types';

// Mock store state
let mockStoreState = {
  occasion: DEFAULT_OCCASION as OccasionKey,
  temperatureBand: DEFAULT_TEMPERATURE_BAND as TemperatureBandKey,
  isHydrated: false,
  setOccasion: jest.fn(),
  setTemperatureBand: jest.fn(),
  resetContextToDefaults: jest.fn(),
};

// Mock useStore to allow dynamic state updates
jest.mock('../../../core/state/store', () => ({
  useStore: (selector: (state: typeof mockStoreState) => unknown) => selector(mockStoreState),
}));

describe('useContextParams', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock store state to defaults
    mockStoreState = {
      occasion: DEFAULT_OCCASION,
      temperatureBand: DEFAULT_TEMPERATURE_BAND,
      isHydrated: false,
      setOccasion: jest.fn(),
      setTemperatureBand: jest.fn(),
      resetContextToDefaults: jest.fn(),
    };
  });

  describe('State exposure', () => {
    it('should return current occasion from store', () => {
      mockStoreState.occasion = 'work_meeting';

      const { result } = renderHook(() => useContextParams());

      expect(result.current.occasion).toBe('work_meeting');
    });

    it('should return current temperature band from store', () => {
      mockStoreState.temperatureBand = 'warm';

      const { result } = renderHook(() => useContextParams());

      expect(result.current.temperatureBand).toBe('warm');
    });

    it('should return isHydrated status from store', () => {
      mockStoreState.isHydrated = true;

      const { result } = renderHook(() => useContextParams());

      expect(result.current.isHydrated).toBe(true);
    });

    it('should return default occasion when store has default', () => {
      const { result } = renderHook(() => useContextParams());

      expect(result.current.occasion).toBe(DEFAULT_OCCASION);
    });

    it('should return default temperature band when store has default', () => {
      const { result } = renderHook(() => useContextParams());

      expect(result.current.temperatureBand).toBe(DEFAULT_TEMPERATURE_BAND);
    });

    it('should return isHydrated as false initially', () => {
      const { result } = renderHook(() => useContextParams());

      expect(result.current.isHydrated).toBe(false);
    });
  });

  describe('setOccasion action', () => {
    it('should call store setOccasion with new occasion', () => {
      const { result } = renderHook(() => useContextParams());

      act(() => {
        result.current.setOccasion('date');
      });

      expect(mockStoreState.setOccasion).toHaveBeenCalledWith('date');
      expect(mockStoreState.setOccasion).toHaveBeenCalledTimes(1);
    });

    it.each<OccasionKey>(['everyday', 'work_meeting', 'date', 'weekend', 'event'])(
      'should pass %s occasion to store',
      (occasion) => {
        const { result } = renderHook(() => useContextParams());

        act(() => {
          result.current.setOccasion(occasion);
        });

        expect(mockStoreState.setOccasion).toHaveBeenCalledWith(occasion);
      }
    );

    it('should have stable setOccasion callback reference', () => {
      const { result, rerender } = renderHook(() => useContextParams());

      const firstCallback = result.current.setOccasion;

      rerender({});

      expect(result.current.setOccasion).toBe(firstCallback);
    });
  });

  describe('setTemperatureBand action', () => {
    it('should call store setTemperatureBand with new temperature band', () => {
      const { result } = renderHook(() => useContextParams());

      act(() => {
        result.current.setTemperatureBand('cool');
      });

      expect(mockStoreState.setTemperatureBand).toHaveBeenCalledWith('cool');
      expect(mockStoreState.setTemperatureBand).toHaveBeenCalledTimes(1);
    });

    it.each<TemperatureBandKey>(['cool', 'mild', 'warm', 'auto'])(
      'should pass %s temperature band to store',
      (temperatureBand) => {
        const { result } = renderHook(() => useContextParams());

        act(() => {
          result.current.setTemperatureBand(temperatureBand);
        });

        expect(mockStoreState.setTemperatureBand).toHaveBeenCalledWith(temperatureBand);
      }
    );

    it('should have stable setTemperatureBand callback reference', () => {
      const { result, rerender } = renderHook(() => useContextParams());

      const firstCallback = result.current.setTemperatureBand;

      rerender({});

      expect(result.current.setTemperatureBand).toBe(firstCallback);
    });
  });

  describe('resetToDefaults action', () => {
    it('should call store resetContextToDefaults', () => {
      const { result } = renderHook(() => useContextParams());

      act(() => {
        result.current.resetToDefaults();
      });

      expect(mockStoreState.resetContextToDefaults).toHaveBeenCalledTimes(1);
    });

    it('should have stable resetToDefaults callback reference', () => {
      const { result, rerender } = renderHook(() => useContextParams());

      const firstCallback = result.current.resetToDefaults;

      rerender({});

      expect(result.current.resetToDefaults).toBe(firstCallback);
    });
  });

  describe('Return type structure', () => {
    it('should return object with all expected properties', () => {
      const { result } = renderHook(() => useContextParams());

      expect(result.current).toHaveProperty('occasion');
      expect(result.current).toHaveProperty('temperatureBand');
      expect(result.current).toHaveProperty('isHydrated');
      expect(result.current).toHaveProperty('setOccasion');
      expect(result.current).toHaveProperty('setTemperatureBand');
      expect(result.current).toHaveProperty('resetToDefaults');
    });

    it('should return occasion as OccasionKey type', () => {
      mockStoreState.occasion = 'event';

      const { result } = renderHook(() => useContextParams());

      // Type check: OccasionKey should be one of the valid values
      const validOccasions: OccasionKey[] = [
        'everyday',
        'work_meeting',
        'date',
        'weekend',
        'event',
      ];
      expect(validOccasions).toContain(result.current.occasion);
    });

    it('should return temperatureBand as TemperatureBandKey type', () => {
      mockStoreState.temperatureBand = 'mild';

      const { result } = renderHook(() => useContextParams());

      // Type check: TemperatureBandKey should be one of the valid values
      const validTemperatureBands: TemperatureBandKey[] = ['cool', 'mild', 'warm', 'auto'];
      expect(validTemperatureBands).toContain(result.current.temperatureBand);
    });

    it('should return isHydrated as boolean', () => {
      const { result } = renderHook(() => useContextParams());

      expect(typeof result.current.isHydrated).toBe('boolean');
    });

    it('should return setOccasion as function', () => {
      const { result } = renderHook(() => useContextParams());

      expect(typeof result.current.setOccasion).toBe('function');
    });

    it('should return setTemperatureBand as function', () => {
      const { result } = renderHook(() => useContextParams());

      expect(typeof result.current.setTemperatureBand).toBe('function');
    });

    it('should return resetToDefaults as function', () => {
      const { result } = renderHook(() => useContextParams());

      expect(typeof result.current.resetToDefaults).toBe('function');
    });
  });

  describe('Hydration state transitions', () => {
    it('should reflect isHydrated false before hydration', () => {
      mockStoreState.isHydrated = false;

      const { result } = renderHook(() => useContextParams());

      expect(result.current.isHydrated).toBe(false);
    });

    it('should reflect isHydrated true after hydration', () => {
      mockStoreState.isHydrated = true;

      const { result } = renderHook(() => useContextParams());

      expect(result.current.isHydrated).toBe(true);
    });
  });

  describe('Multiple calls to actions', () => {
    it('should allow multiple setOccasion calls', () => {
      const { result } = renderHook(() => useContextParams());

      act(() => {
        result.current.setOccasion('work_meeting');
        result.current.setOccasion('date');
        result.current.setOccasion('event');
      });

      expect(mockStoreState.setOccasion).toHaveBeenCalledTimes(3);
      expect(mockStoreState.setOccasion).toHaveBeenNthCalledWith(1, 'work_meeting');
      expect(mockStoreState.setOccasion).toHaveBeenNthCalledWith(2, 'date');
      expect(mockStoreState.setOccasion).toHaveBeenNthCalledWith(3, 'event');
    });

    it('should allow multiple setTemperatureBand calls', () => {
      const { result } = renderHook(() => useContextParams());

      act(() => {
        result.current.setTemperatureBand('cool');
        result.current.setTemperatureBand('warm');
        result.current.setTemperatureBand('auto');
      });

      expect(mockStoreState.setTemperatureBand).toHaveBeenCalledTimes(3);
      expect(mockStoreState.setTemperatureBand).toHaveBeenNthCalledWith(1, 'cool');
      expect(mockStoreState.setTemperatureBand).toHaveBeenNthCalledWith(2, 'warm');
      expect(mockStoreState.setTemperatureBand).toHaveBeenNthCalledWith(3, 'auto');
    });

    it('should allow interleaved calls to different actions', () => {
      const { result } = renderHook(() => useContextParams());

      act(() => {
        result.current.setOccasion('date');
        result.current.setTemperatureBand('warm');
        result.current.setOccasion('event');
        result.current.resetToDefaults();
      });

      expect(mockStoreState.setOccasion).toHaveBeenCalledTimes(2);
      expect(mockStoreState.setTemperatureBand).toHaveBeenCalledTimes(1);
      expect(mockStoreState.resetContextToDefaults).toHaveBeenCalledTimes(1);
    });
  });

  describe('Store selector usage', () => {
    it('should select occasion from store state', () => {
      mockStoreState.occasion = 'weekend';

      const { result } = renderHook(() => useContextParams());

      expect(result.current.occasion).toBe('weekend');
    });

    it('should select temperatureBand from store state', () => {
      mockStoreState.temperatureBand = 'cool';

      const { result } = renderHook(() => useContextParams());

      expect(result.current.temperatureBand).toBe('cool');
    });

    it('should select isHydrated from store state', () => {
      mockStoreState.isHydrated = true;

      const { result } = renderHook(() => useContextParams());

      expect(result.current.isHydrated).toBe(true);
    });
  });
});
