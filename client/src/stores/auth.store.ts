import { create } from 'zustand';
import { User, NurseAssignment } from '@ncdss/shared';
import { Preferences } from '@capacitor/preferences';

export interface DoctorBoxAssignment {
  id: string;
  boxId: string;
  boxName: string;
  boxType: string;
  startDateTime: string;
  endDateTime: string;
  presetType: string | null;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  todayAssignment: NurseAssignment | null;
  doctorBoxAssignment: DoctorBoxAssignment | null;
  isAuthenticated: boolean;

  setAuth: (
    user: User,
    accessToken: string,
    refreshToken: string,
    assignment?: NurseAssignment
  ) => Promise<void>;
  setAccessToken: (accessToken: string) => Promise<void>;
  clearAuth: () => Promise<void>;
  loadAuth: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  getRefreshToken: () => Promise<string | null>;
  setTodayAssignment: (assignment: NurseAssignment) => Promise<void>;
  setDoctorBoxAssignment: (assignment: DoctorBoxAssignment | null) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  todayAssignment: null,
  doctorBoxAssignment: null,
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
      isAuthenticated: true,
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
    await Preferences.remove({ key: 'ncdss_doctor_assignment' });

    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      todayAssignment: null,
      doctorBoxAssignment: null,
      isAuthenticated: false,
    });
  },

  loadAuth: async () => {
    const { value: accessToken } = await Preferences.get({ key: 'ncdss_access_token' });
    const { value: refreshToken } = await Preferences.get({ key: 'ncdss_refresh_token' });
    const { value: userStr } = await Preferences.get({ key: 'ncdss_user' });
    const { value: assignment } = await Preferences.get({ key: 'ncdss_assignment' });
    const { value: doctorAssignmentStr } = await Preferences.get({ key: 'ncdss_doctor_assignment' });

    if (accessToken && refreshToken && userStr) {
      let doctorBoxAssignment: DoctorBoxAssignment | null = null;
      if (doctorAssignmentStr) {
        try {
          doctorBoxAssignment = JSON.parse(doctorAssignmentStr);
        } catch {
          doctorBoxAssignment = null;
        }
      }

      set({
        accessToken,
        refreshToken,
        user: JSON.parse(userStr),
        todayAssignment: (assignment as NurseAssignment) || null,
        doctorBoxAssignment,
        isAuthenticated: true,
      });
    }
  },

  getAccessToken: async () => {
    const state = get();
    if (state.accessToken) {
      return state.accessToken;
    }
    const { value } = await Preferences.get({ key: 'ncdss_access_token' });
    return value;
  },

  getRefreshToken: async () => {
    const state = get();
    if (state.refreshToken) {
      return state.refreshToken;
    }
    const { value } = await Preferences.get({ key: 'ncdss_refresh_token' });
    return value;
  },

  setTodayAssignment: async (assignment) => {
    await Preferences.set({ key: 'ncdss_assignment', value: assignment });
    set({ todayAssignment: assignment });
  },

  setDoctorBoxAssignment: async (assignment) => {
    if (assignment) {
      await Preferences.set({
        key: 'ncdss_doctor_assignment',
        value: JSON.stringify(assignment),
      });
    } else {
      await Preferences.remove({ key: 'ncdss_doctor_assignment' });
    }
    set({ doctorBoxAssignment: assignment });
  },
}));
