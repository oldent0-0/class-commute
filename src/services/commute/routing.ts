import { UnsupportedTransportModeError, NoRouteError, RoutingProviderError, type ProviderFailure } from './errors';
import { fetchText, HttpFailure } from './http';
import type { CommuteConfig, Coordinates, FetchLike, RouteProfile, RouteResult, TransportMode } from './types';

export interface RouterConfig {
  name: string;
  /** OSRM-compatible base URL, without trailing slash. */
  baseUrl: string;
  /** Profile segment of /route/v1/<profile>/ (FOSSGIS picks the real profile from the base path). */
  profile: string;
}

/**
 * Free, keyless, OpenStreetMap-based OSRM servers. They are shared public services with fair-use
 * limits and no SLA. Durations come from typical road/foot speeds: NO live traffic.
 */
export const DEFAULT_ROUTERS: Record<RouteProfile, RouterConfig[]> = {
  walk: [{ name: 'osrm-fossgis-foot', baseUrl: 'https://routing.openstreetmap.de/routed-foot', profile: 'foot' }],
  drive: [
    { name: 'osrm-fossgis-car', baseUrl: 'https://routing.openstreetmap.de/routed-car', profile: 'driving' },
    // Fallback driving router.
    { name: 'osrm-project-demo', baseUrl: 'https://router.project-osrm.org', profile: 'driving' },
  ],
};

/** Walk -> walking route; Car/Taxi -> driving route; Bus (or anything else) -> typed error. */
export function profileForMode(mode: TransportMode | string): RouteProfile {
  switch (String(mode).trim().toLowerCase()) {
    case 'walk':
      return 'walk';
    case 'car':
    case 'taxi':
      return 'drive';
    case 'bus':
      throw new UnsupportedTransportModeError(
        String(mode),
        'Bus travel time is not supported: free OpenStreetMap routing has no bus schedules or transit data.',
      );
    default:
      throw new UnsupportedTransportModeError(String(mode), `Unknown transport mode "${String(mode)}".`);
  }
}

// OSRM wants longitude,latitude order.
const lonLat = (c: Coordinates) => `${c.longitude.toFixed(6)},${c.latitude.toFixed(6)}`;

export function buildRouteUrl(router: RouterConfig, origin: Coordinates, destination: Coordinates): string {
  return `${router.baseUrl}/route/v1/${router.profile}/${lonLat(origin)};${lonLat(destination)}?overview=false&alternatives=false&steps=false`;
}

type RouterOutcome = { route: RouteResult } | { failure: ProviderFailure };

async function askRouter(
  router: RouterConfig,
  origin: Coordinates,
  destination: Coordinates,
  deps: { fetch: FetchLike; config: CommuteConfig },
): Promise<RouterOutcome> {
  const fail = (kind: ProviderFailure['kind'], message: string, status?: number): RouterOutcome => ({
    failure: { provider: router.name, kind, message, status },
  });

  let res;
  try {
    res = await fetchText(
      deps.fetch,
      buildRouteUrl(router, origin, destination),
      { 'User-Agent': deps.config.userAgent, Accept: 'application/json' },
      deps.config.routeTimeoutMs,
    );
  } catch (e) {
    if (e instanceof HttpFailure) return fail(e.kind, e.message);
    throw e;
  }

  let json: unknown;
  try {
    json = JSON.parse(res.text);
  } catch {
    return res.ok
      ? fail('invalid_response', 'response was not valid JSON')
      : fail('http', `HTTP ${res.status}`, res.status);
  }
  const body = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {};
  const code = typeof body.code === 'string' ? body.code : undefined;
  const serverMessage = typeof body.message === 'string' ? body.message : undefined;

  if (code === 'NoRoute' || code === 'NoSegment') {
    return fail('no_route', serverMessage ?? code);
  }
  if (!res.ok) return fail('http', serverMessage ?? `HTTP ${res.status}`, res.status);
  if (code !== 'Ok') return fail('invalid_response', `unexpected response code "${String(code)}"`);

  const routes = body.routes;
  const first = Array.isArray(routes) && routes.length > 0 ? (routes[0] as Record<string, unknown> | null) : null;
  const duration = first ? first.duration : undefined;
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0) {
    return fail('invalid_response', 'route has no valid duration');
  }
  const distance = first ? first.distance : undefined;
  const distanceMeters =
    typeof distance === 'number' && Number.isFinite(distance) && distance >= 0 ? distance : undefined;
  return { route: { durationSeconds: duration, distanceMeters, provider: router.name } };
}

/**
 * Route with the first router that answers. Failures are collected, never swallowed:
 *  - NoRouteError: a router answered "no route" and none found one;
 *  - RoutingProviderError: no router could answer.
 */
export async function fetchRoute(
  profile: RouteProfile,
  origin: Coordinates,
  destination: Coordinates,
  deps: { fetch: FetchLike; config: CommuteConfig; routers?: Record<RouteProfile, RouterConfig[]> },
): Promise<RouteResult> {
  const routers = (deps.routers ?? DEFAULT_ROUTERS)[profile];
  const failures: ProviderFailure[] = [];
  for (const router of routers) {
    const outcome = await askRouter(router, origin, destination, deps);
    if ('route' in outcome) return outcome.route;
    failures.push(outcome.failure);
  }
  if (failures.some((f) => f.kind === 'no_route')) throw new NoRouteError(failures);
  throw new RoutingProviderError(failures);
}
