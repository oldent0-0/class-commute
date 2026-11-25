import { getTravelEstimate } from './estimate';
import { expoLocationProvider } from './expoLocationProvider';
import type { LocationInput, ResolvedDestination, TransportMode, TravelEstimate } from './types';

const resolvedDestinationCache = new Map<string, ResolvedDestination>();

/** Estimate with details (provider, distance, how the destination was resolved). */
export function estimateTravel(schoolLocation: LocationInput, transportMode: TransportMode): Promise<TravelEstimate> {
  return getTravelEstimate(schoolLocation, transportMode, {
    location: expoLocationProvider,
    fetch: (url, init) => fetch(url, init),
    cache: resolvedDestinationCache,
  });
}

/**
 * Travel time in seconds from the phone's current GPS position to the school.
 * Typical (non-live-traffic) duration from free OpenStreetMap routing. Throws CommuteError subclasses.
 */
export async function getTravelDurationSeconds(
  schoolLocation: LocationInput,
  transportMode: TransportMode,
): Promise<number> {
  return (await estimateTravel(schoolLocation, transportMode)).durationSeconds;
}

export { computeLeaveBy, formatTravelDuration } from './leaveBy';
export * from './errors';
export type {
  Coordinates,
  LocationInput,
  ResolvedDestination,
  TransportMode,
  TravelEstimate,
} from './types';
