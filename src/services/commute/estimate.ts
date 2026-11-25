import { resolveDestination } from './destination';
import { geocodeAddress, type GeocodeProvider } from './geocoding';
import { getCurrentCoordinates, type LocationProvider } from './location';
import { fetchRoute, profileForMode, type RouterConfig } from './routing';
import {
  DEFAULT_CONFIG,
  type CommuteConfig,
  type FetchLike,
  type LocationInput,
  type ResolvedDestination,
  type RouteProfile,
  type TransportMode,
  type TravelEstimate,
} from './types';

export interface EstimateDeps {
  location: LocationProvider;
  fetch: FetchLike;
  config?: Partial<CommuteConfig>;
  /** Cache of resolved school locations so links/addresses are not re-resolved on every refresh. */
  cache?: Map<string, ResolvedDestination>;
  /** Overrides, mainly for tests. */
  routers?: Record<RouteProfile, RouterConfig[]>;
  geocoders?: GeocodeProvider[];
}

/**
 * Full estimate: validate mode -> resolve destination -> phone GPS -> route.
 * Bus is rejected first, before any permission prompt or network request.
 */
export async function getTravelEstimate(
  schoolLocation: LocationInput,
  transportMode: TransportMode,
  deps: EstimateDeps,
): Promise<TravelEstimate> {
  const config: CommuteConfig = { ...DEFAULT_CONFIG, ...deps.config };
  const profile = profileForMode(transportMode);

  const destination = await resolveDestination(schoolLocation, {
    fetch: deps.fetch,
    config,
    cache: deps.cache,
    geocode: (query) => geocodeAddress(query, { fetch: deps.fetch, config, providers: deps.geocoders }),
  });

  const origin = await getCurrentCoordinates(deps.location, config);
  const route = await fetchRoute(profile, origin, destination.coordinates, {
    fetch: deps.fetch,
    config,
    routers: deps.routers,
  });

  return {
    durationSeconds: Math.round(route.durationSeconds),
    distanceMeters: route.distanceMeters,
    mode: transportMode,
    origin,
    destination,
    routeProvider: route.provider,
    includesLiveTraffic: false,
  };
}
