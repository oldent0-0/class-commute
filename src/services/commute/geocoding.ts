import { toValidCoordinates } from './coordinates';
import { GeocodingNotFoundError, GeocodingProviderError, type ProviderFailure } from './errors';
import { fetchText, HttpFailure } from './http';
import type { CommuteConfig, Coordinates, FetchLike } from './types';

export interface GeocodeProvider {
  name: string;
  buildUrl(query: string): string;
  /** Returns coordinates, null for "no results", or throws Error for a malformed response. */
  parse(json: unknown): Coordinates | null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}

export const nominatim: GeocodeProvider = {
  name: 'nominatim',
  buildUrl: (q) =>
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`,
  parse(json) {
    if (!Array.isArray(json)) throw new Error('expected a JSON array');
    if (json.length === 0) return null;
    const first = asRecord(json[0]);
    const c = first && toValidCoordinates(Number(first.lat), Number(first.lon));
    if (!c) throw new Error('first result has invalid lat/lon');
    return c;
  },
};

export const photon: GeocodeProvider = {
  name: 'photon',
  buildUrl: (q) => `https://photon.komoot.io/api/?limit=1&q=${encodeURIComponent(q)}`,
  parse(json) {
    const root = asRecord(json);
    const features = root?.features;
    if (!Array.isArray(features)) throw new Error('expected a "features" array');
    if (features.length === 0) return null;
    const geometry = asRecord(asRecord(features[0])?.geometry);
    const coords = geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) throw new Error('first result has no coordinates');
    // GeoJSON order is [longitude, latitude].
    const c = toValidCoordinates(Number(coords[1]), Number(coords[0]));
    if (!c) throw new Error('first result has invalid coordinates');
    return c;
  },
};

export const DEFAULT_GEOCODERS: GeocodeProvider[] = [nominatim, photon];

type ProviderOutcome =
  | { found: Coordinates }
  | { failure: ProviderFailure };

async function askProvider(
  provider: GeocodeProvider,
  query: string,
  deps: { fetch: FetchLike; config: CommuteConfig },
): Promise<ProviderOutcome> {
  let res;
  try {
    res = await fetchText(
      deps.fetch,
      provider.buildUrl(query),
      { 'User-Agent': deps.config.userAgent, Accept: 'application/json' },
      deps.config.geocodeTimeoutMs,
    );
  } catch (e) {
    if (e instanceof HttpFailure) return { failure: { provider: provider.name, kind: e.kind, message: e.message } };
    throw e;
  }
  if (!res.ok) {
    return {
      failure: { provider: provider.name, kind: 'http', message: `HTTP ${res.status}`, status: res.status },
    };
  }
  let json: unknown;
  try {
    json = JSON.parse(res.text);
  } catch {
    return { failure: { provider: provider.name, kind: 'invalid_response', message: 'response was not valid JSON' } };
  }
  try {
    const c = provider.parse(json);
    if (c) return { found: c };
    return { failure: { provider: provider.name, kind: 'no_result', message: 'no results' } };
  } catch (e) {
    return {
      failure: {
        provider: provider.name,
        kind: 'invalid_response',
        message: e instanceof Error ? e.message : 'malformed response',
      },
    };
  }
}

/**
 * Geocode an address with a free provider chain (Nominatim, then Photon).
 *  - first provider that finds a result wins;
 *  - GeocodingNotFoundError: at least one provider answered and none knows the address
 *    (providers that failed are listed on `failures`);
 *  - GeocodingProviderError: no provider could answer at all.
 */
export async function geocodeAddress(
  query: string,
  deps: { fetch: FetchLike; config: CommuteConfig; providers?: GeocodeProvider[] },
): Promise<Coordinates> {
  const providers = deps.providers ?? DEFAULT_GEOCODERS;
  const failures: ProviderFailure[] = [];
  for (const provider of providers) {
    const outcome = await askProvider(provider, query, deps);
    if ('found' in outcome) return outcome.found;
    failures.push(outcome.failure);
  }
  const answered = failures.some((f) => f.kind === 'no_result');
  if (answered) {
    throw new GeocodingNotFoundError(
      query,
      failures.filter((f) => f.kind !== 'no_result'),
    );
  }
  throw new GeocodingProviderError(failures);
}
