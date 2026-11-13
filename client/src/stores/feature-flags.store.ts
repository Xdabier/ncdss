import { create } from 'zustand';
import { Preferences } from '@capacitor/preferences';

const FEATURE_FLAG_KEY = 'ncdss_feature_flags';

interface FeatureFlags {
  useUnifiedAnalysis: boolean;
}

interface FeatureFlagsState {
  useUnifiedAnalysis: boolean;
  setUseUnifiedAnalysis: (value: boolean) => Promise<void>;
  loadFlags: () => Promise<void>;
}

const DEFAULT_FLAGS: FeatureFlags = {
  useUnifiedAnalysis: true,
};

export const useFeatureFlagsStore = create<FeatureFlagsState>((set) => ({
  useUnifiedAnalysis: true,

  setUseUnifiedAnalysis: async (value: boolean) => {
    const flags: FeatureFlags = {
      useUnifiedAnalysis: value,
    };
    await Preferences.set({ key: FEATURE_FLAG_KEY, value: JSON.stringify(flags) });
    set({ useUnifiedAnalysis: value });
  },

  loadFlags: async () => {
    try {
      const { value } = await Preferences.get({ key: FEATURE_FLAG_KEY });
      if (value) {
        const flags: FeatureFlags = { ...DEFAULT_FLAGS, ...JSON.parse(value) };
        set({ useUnifiedAnalysis: flags.useUnifiedAnalysis });
      }
    } catch {
      // Use defaults on parse error
      set({ useUnifiedAnalysis: DEFAULT_FLAGS.useUnifiedAnalysis });
    }
  },
}));
