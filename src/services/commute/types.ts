export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** Input accepted for the school location: raw text (coords, address, link) or coordinates. */
export type LocationInput = string | Coordinates;

export type TransportMode = 'Walk' | 'Car' | 'Taxi' | 'Bus';

export type RouteProfile = 'walk' | 'drive';

export type DestinationSource =
  | 'coordinates'
  | 'map-link'
  | 'short-link'
  | 'geocoded-link-text'
  | 'geocoded-address';

export interface ResolvedDestination {
  coordinates: Coordinates;
  source: DestinationSource;
  /** Which part of the input supplied the coordinates, for diagnostics. */
  detail: string;
}

export interface RouteResult {
  durationSeconds: number;
  distanceMeters?: number;
  provider: string;
}

export interface TravelEstimate {
  durationSeconds: number;
  distanceMeters?: number;
  mode: TransportMode;
  origin: Coordinates;
  destination: ResolvedDestination;
  routeProvider: string;
  /** Free OSM routers use typical road speeds: no live traffic, no taxi pickup wait. */
  includesLiveTraffic: false;
}

export interface CommuteConfig {
  /** Stable application identifier for geocoding providers. */
  userAgent: string;
  locationTimeoutMs: number;
  linkTimeoutMs: number;
  geocodeTimeoutMs: number;
  routeTimeoutMs: number;
}

export const DEFAULT_CONFIG: CommuteConfig = {
  userAgent: 'ClassCommute/1.0',
  locationTimeoutMs: 15_000,
  linkTimeoutMs: 10_000,
  geocodeTimeoutMs: 10_000,
  routeTimeoutMs: 10_000,
};

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
