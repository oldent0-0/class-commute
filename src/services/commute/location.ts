import { toValidCoordinates } from './coordinates';
import { LocationPermissionError, LocationUnavailableError } from './errors';
import type { CommuteConfig, Coordinates } from './types';

/** Thin seam over expo-location so the logic is testable without a device. */
export interface LocationProvider {
  requestForegroundPermission(): Promise<{ granted: boolean; canAskAgain: boolean }>;
  hasServicesEnabled(): Promise<boolean>;
  getCurrentPosition(): Promise<{ latitude: number; longitude: number }>;
}

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Ask for foreground permission, then read one GPS fix.
 * No silent fallback to a last-known or default position: every failure is a typed error.
 */
export async function getCurrentCoordinates(provider: LocationProvider, config: CommuteConfig): Promise<Coordinates> {
  let permission;
  try {
    permission = await provider.requestForegroundPermission();
  } catch (e) {
    throw new LocationUnavailableError('provider_error', `Could not request location permission: ${describe(e)}`, e);
  }
  if (!permission.granted) throw new LocationPermissionError(permission.canAskAgain);

  let enabled: boolean;
  try {
    enabled = await provider.hasServicesEnabled();
  } catch (e) {
    throw new LocationUnavailableError('provider_error', `Could not check location services: ${describe(e)}`, e);
  }
  if (!enabled) {
    throw new LocationUnavailableError('services_disabled', 'Location services are turned off on this phone.');
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const fix = provider.getCurrentPosition();
  fix.catch(() => undefined); // avoid an unhandled rejection if the timeout wins the race
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new LocationUnavailableError(
            'timeout',
            `Could not get a GPS fix within ${Math.round(config.locationTimeoutMs / 1000)} seconds.`,
          ),
        ),
      config.locationTimeoutMs,
    );
  });
  let position;
  try {
    position = await Promise.race([fix, timeout]);
  } catch (e) {
    if (e instanceof LocationUnavailableError) throw e;
    throw new LocationUnavailableError('provider_error', `Could not read the GPS position: ${describe(e)}`, e);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }

  const valid = toValidCoordinates(position.latitude, position.longitude);
  if (!valid) {
    throw new LocationUnavailableError(
      'invalid_fix',
      `The phone returned an invalid GPS position (${position.latitude}, ${position.longitude}).`,
    );
  }
  return valid;
}
