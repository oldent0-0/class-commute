import type { ImageSourcePropType } from 'react-native';
import type { Translation } from '../i18n';
import type { HomeBackgroundId } from '../types';

export interface HomeBackgroundOption {
  id: HomeBackgroundId;
  label: keyof Translation;
  source: ImageSourcePropType | null;
  tone: 'dark' | 'light' | null;
}

export const homeBackgrounds: Record<
  HomeBackgroundId,
  HomeBackgroundOption
> = {
  route: {
    id: 'route',
    label: 'backgroundRoute',
    source: null,
    tone: null,
  },
  'city-skyline': {
    id: 'city-skyline',
    label: 'backgroundCitySkyline',
    source: require('../assets/backgrounds/city-skyline.jpg'),
    tone: 'dark',
  },
  'city-street': {
    id: 'city-street',
    label: 'backgroundCityStreet',
    source: require('../assets/backgrounds/city-street.jpg'),
    tone: 'light',
  },
  campus: {
    id: 'campus',
    label: 'backgroundCampus',
    source: require('../assets/backgrounds/campus.jpg'),
    tone: 'light',
  },
  bus: {
    id: 'bus',
    label: 'backgroundBus',
    source: require('../assets/backgrounds/bus.jpg'),
    tone: 'dark',
  },
  winter: {
    id: 'winter',
    label: 'backgroundWinter',
    source: require('../assets/backgrounds/winter.jpg'),
    tone: 'light',
  },
};

export const homeBackgroundOptions: HomeBackgroundOption[] = [
  homeBackgrounds.route,
  homeBackgrounds['city-skyline'],
  homeBackgrounds['city-street'],
  homeBackgrounds.campus,
  homeBackgrounds.bus,
  homeBackgrounds.winter,
];
