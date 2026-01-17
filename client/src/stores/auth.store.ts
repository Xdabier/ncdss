import { create } from 'zustand';
import { User, NurseAssignment } from '@ncdss/shared';
import { Preferences } from '@capacitor/preferences';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  todayAssignment: NurseAssignment | null;
  isAuthenticated: boolean;

  setAuth: (user: User, accessToken: string, refreshToken: string, assignment?: NurseAssignment) => Promise<void>;
  setAccessToken: (accessToken: string) => Promise<void>;
  clearAuth: () => Promise<void>;
  loadAuth: () => Promise<void>;
  getRefreshToken: () => Promise<string | null>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  todayAssignment: null,
  isAuthenticated: false,

  setAuth: async (user, accessToken, refreshToken, assignment) => {
    await Preferences.set({ key: 'ncdss_access_token', value: accessToken });
    await Preferences.set({ key: 'ncdss_refresh_token', value: refreshToken });
    await Preferences.set({ key: 'ncdss_user', value: JSON.stringify(user) });
    if (assignment) {
      await Preferences.set({ key: 'ncdss_assignment', value: assignment });
    }

    set({
      user,
      accessToken,
      refreshToken,
      todayAssignment: assignment || null,
      isAuthenticated: true
    });
  },

  setAccessToken: async (accessToken) => {
    await Preferences.set({ key: 'ncdss_access_token', value: accessToken });
    set({ accessToken });
  },

  clearAuth: async () => {
    await Preferences.remove({ key: 'ncdss_access_token' });
    await Preferences.remove({ key: 'ncdss_refresh_token' });
    await Preferences.remove({ key: 'ncdss_user' });
    await Preferences.remove({ key: 'ncdss_assignment' });

    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      todayAssignment: null,
      isAuthenticated: false
    });
  },

  loadAuth: async () => {
    const { value: accessToken } = await Preferences.get({ key: 'ncdss_access_token' });
    const { value: refreshToken } = await Preferences.get({ key: 'ncdss_refresh_token' });
    const { value: userStr } = await Preferences.get({ key: 'ncdss_user' });
    const { value: assignment } = await Preferences.get({ key: 'ncdss_assignment' });

    if (accessToken && refreshToken && userStr) {
      set({
        accessToken,
        refreshToken,
        user: JSON.parse(userStr),
        todayAssignment: (assignment as NurseAssignment) || null,
        isAuthenticated: true
      });
    }
  },

  getRefreshToken: async () => {
    const state = get();
    if (state.refreshToken) {
      return state.refreshToken;
    }
    const { value } = await Preferences.get({ key: 'ncdss_refresh_token' });
    return value;
  }
}));
