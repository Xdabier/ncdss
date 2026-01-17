import { create } from 'zustand';

interface SyncState {
  isSyncing: boolean;
  lastSyncAt: Date | null;
  startSync: () => void;
  stopSync: () => void;
  setLastSyncAt: (date: Date) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  isSyncing: false,
  lastSyncAt: null,

  startSync: () => set({ isSyncing: true }),

  stopSync: () => set({ isSyncing: false, lastSyncAt: new Date() }),

  setLastSyncAt: (date: Date) => set({ lastSyncAt: date }),
}));
