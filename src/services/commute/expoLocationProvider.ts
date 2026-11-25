import * as Location from 'expo-location';
import type { LocationProvider } from './location';

export const expoLocationProvider: LocationProvider = {
  async requestForegroundPermission() {
    const r = await Location.requestForegroundPermissionsAsync();
    return { granted: r.granted, canAskAgain: r.canAskAgain };
  },
  hasServicesEnabled: () => Location.hasServicesEnabledAsync(),
  async getCurrentPosition() {
    const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { latitude: p.coords.latitude, longitude: p.coords.longitude };
  },
};
