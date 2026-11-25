import AsyncStorage from '@react-native-async-storage/async-storage';
import { Class, DayOfWeek, TransportMode } from '../types';

const STORAGE_KEY = 'class-commute.classes.v1';

const days: DayOfWeek[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

const transportModes: TransportMode[] = ['walk', 'bus', 'car', 'taxi'];

function isClass(value: unknown): value is Class {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.building === 'string' &&
    typeof item.room === 'string' &&
    typeof item.startTime === 'string' &&
    days.includes(item.dayOfWeek as DayOfWeek) &&
    transportModes.includes(item.transportMode as TransportMode)
  );
}

export async function loadClasses(): Promise<Class[]> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (stored === null) {
    return [];
  }

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed) || !parsed.every(isClass)) {
    throw new Error('Saved class data is invalid.');
  }
  return parsed;
}

export async function saveClasses(classes: Class[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(classes));
}
