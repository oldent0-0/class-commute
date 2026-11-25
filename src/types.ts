export type DayOfWeek =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export type TransportMode = 'walk' | 'bus' | 'car' | 'taxi';
export type Language = 'mn' | 'en';
export type ThemeMode = 'dark' | 'light';
export type HomeBackgroundId =
  | 'route'
  | 'city-skyline'
  | 'city-street'
  | 'campus'
  | 'bus'
  | 'winter';

export interface Class {
  id: string;
  name: string;
  building: string;
  room: string;
  dayOfWeek: DayOfWeek;
  /** 24-hour local time, for example "09:30". */
  startTime: string;
  transportMode: TransportMode;
}

export interface Settings {
  bufferMinutes: number;
  defaultTransportMode: TransportMode;
  language: Language;
  themeMode: ThemeMode;
  homeBackgroundId: HomeBackgroundId;
  schoolAddress: string;
}
