import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  HomeBackgroundId,
  Language,
  Settings,
  ThemeMode,
  TransportMode,
} from '../types';
import { homeBackgroundOptions } from '../theme/homeBackgrounds';

const STORAGE_KEY = 'class-commute.settings.v1';

export const defaultSettings: Settings = {
  bufferMinutes: 10,
  defaultTransportMode: 'bus',
  language: 'mn',
  themeMode: 'dark',
  homeBackgroundId: 'route',
  schoolAddress: '',
};

const languages: Language[] = ['mn', 'en'];
const themeModes: ThemeMode[] = ['dark', 'light'];
const transportModes: TransportMode[] = ['walk', 'bus', 'car', 'taxi'];
const homeBackgroundIds: HomeBackgroundId[] = homeBackgroundOptions.map(
  ({ id }) => id,
);

function isSettings(value: unknown): value is Settings {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const item = value as Record<string, unknown>;
  return (
    Number.isInteger(item.bufferMinutes) &&
    (item.bufferMinutes as number) >= 0 &&
    transportModes.includes(item.defaultTransportMode as TransportMode) &&
    languages.includes(item.language as Language) &&
    themeModes.includes(item.themeMode as ThemeMode) &&
    homeBackgroundIds.includes(item.homeBackgroundId as HomeBackgroundId) &&
    typeof item.schoolAddress === 'string'
  );
}

export async function loadSettings(): Promise<Settings> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (stored === null) {
    return defaultSettings;
  }

  const parsed: unknown = JSON.parse(stored);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Saved settings are invalid.');
  }
  const storedSettings = parsed as Record<string, unknown>;
  let migrated = storedSettings;
  if (!('themeMode' in migrated)) {
    migrated = { ...migrated, themeMode: 'dark' };
  }
  if (!('homeBackgroundId' in migrated)) {
    migrated = { ...migrated, homeBackgroundId: 'route' };
  }
  if (!('schoolAddress' in migrated)) {
    migrated = { ...migrated, schoolAddress: '' };
  }

  if (!isSettings(migrated)) {
    throw new Error('Saved settings are invalid.');
  }
  return migrated;
}

export async function saveSettings(settings: Settings): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
