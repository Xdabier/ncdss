import { create } from 'zustand';
import { User, NurseAssignment } from '@ncdss/shared';
import { Preferences } from '@capacitor/preferences';

export interface NurseShiftInfo {
  shiftPreset: string | null;
  shiftStart: string | null;
  shiftEnd: string | null;
}

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
  nurseShiftInfo: NurseShiftInfo | null;
  doctorBoxAssignment: DoctorBoxAssignment | null;
  isAuthenticated: boolean;
  isLocked: boolean;

  setAuth: (
    user: User,
    accessToken: string,
    refreshToken: string,
    assignment?: NurseAssignment,
    shiftInfo?: NurseShiftInfo
  ) => Promise<void>;
  setAccessToken: (accessToken: string) => Promise<void>;
  clearAuth: () => Promise<void>;
  loadAuth: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  getRefreshToken: () => Promise<string | null>;
  setTodayAssignment: (assignment: NurseAssignment, shiftInfo?: NurseShiftInfo) => Promise<void>;
  setDoctorBoxAssignment: (assignment: DoctorBoxAssignment | null) => Promise<void>;
  updateUser: (user: User) => Promise<void>;
  setLocked: (locked: boolean) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  todayAssignment: null,
  nurseShiftInfo: null,
  doctorBoxAssignment: null,
  isAuthenticated: false,
  isLocked: false,

  setAuth: async (user, accessToken, refreshToken, assignment, shiftInfo) => {
    await Preferences.set({ key: 'ncdss_access_token', value: accessToken });
    await Preferences.set({ key: 'ncdss_refresh_token', value: refreshToken });
    await Preferences.set({ key: 'ncdss_user', value: JSON.stringify(user) });
    await Preferences.remove({ key: 'ncdss_locked' });
    if (assignment) {
      await Preferences.set({ key: 'ncdss_assignment', value: assignment });
    }
    if (shiftInfo) {
      await Preferences.set({ key: 'ncdss_nurse_shift_info', value: JSON.stringify(shiftInfo) });
    }

    set({
      user,
      accessToken,
      refreshToken,
      todayAssignment: assignment || null,
      nurseShiftInfo: shiftInfo || null,
      isAuthenticated: true,
      isLocked: false,
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
    await Preferences.remove({ key: 'ncdss_nurse_shift_info' });
    await Preferences.remove({ key: 'ncdss_doctor_assignment' });
    await Preferences.remove({ key: 'ncdss_locked' });

    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      todayAssignment: null,
      nurseShiftInfo: null,
      doctorBoxAssignment: null,
      isAuthenticated: false,
      isLocked: false,
    });
  },

  loadAuth: async () => {
    const { value: accessToken } = await Preferences.get({ key: 'ncdss_access_token' });
    const { value: refreshToken } = await Preferences.get({ key: 'ncdss_refresh_token' });
    const { value: userStr } = await Preferences.get({ key: 'ncdss_user' });
    const { value: assignment } = await Preferences.get({ key: 'ncdss_assignment' });
    const { value: nurseShiftInfoStr } = await Preferences.get({ key: 'ncdss_nurse_shift_info' });
    const { value: doctorAssignmentStr } = await Preferences.get({ key: 'ncdss_doctor_assignment' });

    if (accessToken && refreshToken && userStr) {
      let nurseShiftInfo: NurseShiftInfo | null = null;
      if (nurseShiftInfoStr) {
        try {
          nurseShiftInfo = JSON.parse(nurseShiftInfoStr);
        } catch {
          nurseShiftInfo = null;
        }
      }

      let doctorBoxAssignment: DoctorBoxAssignment | null = null;
      if (doctorAssignmentStr) {
        try {
          doctorBoxAssignment = JSON.parse(doctorAssignmentStr);
        } catch {
          doctorBoxAssignment = null;
        }
      }

      const parsedUser = JSON.parse(userStr) as User;
      const wasAuthenticated = get().isAuthenticated;

      set({
        accessToken,
        refreshToken,
        user: parsedUser,
        todayAssignment: (assignment as NurseAssignment) || null,
        nurseShiftInfo,
        doctorBoxAssignment,
        isAuthenticated: true,
        // Only auto-lock on cold start (restoring session from storage).
        // If already authenticated (after login or unlock), preserve current lock state.
        isLocked: wasAuthenticated ? get().isLocked : !!parsedUser.hasPin,
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

  setTodayAssignment: async (assignment, shiftInfo) => {
    await Preferences.set({ key: 'ncdss_assignment', value: assignment });
    if (shiftInfo) {
      await Preferences.set({ key: 'ncdss_nurse_shift_info', value: JSON.stringify(shiftInfo) });
    }
    set({ todayAssignment: assignment, nurseShiftInfo: shiftInfo || get().nurseShiftInfo });
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

  updateUser: async (user) => {
    await Preferences.set({ key: 'ncdss_user', value: JSON.stringify(user) });
    set({ user });
  },

  setLocked: async (locked) => {
    if (locked) {
      await Preferences.set({ key: 'ncdss_locked', value: 'true' });
    } else {
      await Preferences.remove({ key: 'ncdss_locked' });
    }
    set({ isLocked: locked });
  },
}));
