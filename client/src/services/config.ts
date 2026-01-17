import { Preferences } from '@capacitor/preferences';

const SERVER_URL_KEY = 'ncdss_server_url';

export async function getServerUrl(): Promise<string | null> {
  const { value } = await Preferences.get({ key: SERVER_URL_KEY });
  return value;
}

export async function setServerUrl(url: string): Promise<void> {
  await Preferences.set({ key: SERVER_URL_KEY, value: url });
}

export async function clearServerUrl(): Promise<void> {
  await Preferences.remove({ key: SERVER_URL_KEY });
}
