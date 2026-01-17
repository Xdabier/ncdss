import { getApi } from './api';
import { SyncRequest, SyncResponse, SyncChange } from '@ncdss/shared';
import { Preferences } from '@capacitor/preferences';

const LAST_SYNC_KEY = 'ncdss_last_sync';
const CLIENT_ID_KEY = 'ncdss_client_id';

export async function getClientId(): Promise<string> {
  let { value } = await Preferences.get({ key: CLIENT_ID_KEY });

  if (!value) {
    value = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await Preferences.set({ key: CLIENT_ID_KEY, value });
  }

  return value;
}

export async function getLastSyncTime(): Promise<string> {
  const { value } = await Preferences.get({ key: LAST_SYNC_KEY });
  return value || '1970-01-01T00:00:00Z';
}

export async function setLastSyncTime(time: string): Promise<void> {
  await Preferences.set({ key: LAST_SYNC_KEY, value: time });
}

export async function performSync(localChanges: SyncChange[]): Promise<SyncResponse> {
  const api = await getApi();
  const clientId = await getClientId();
  const lastSyncAt = await getLastSyncTime();

  const request: SyncRequest = {
    clientId,
    lastSyncAt,
    changes: localChanges,
  };

  const response = await api.post('/sync', request);
  const data = response.data as SyncResponse;

  // Update last sync time
  await setLastSyncTime(data.syncedAt);

  return data;
}
