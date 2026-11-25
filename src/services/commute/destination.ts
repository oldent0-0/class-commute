import { assertValidCoordinates, findEmbeddedCoordinates, parseWholeCoordinateInput } from './coordinates';
import { InvalidDestinationError, LinkParseError, LinkResolutionError } from './errors';
import {
  extractCoordinates,
  extractCoordinatesFromBody,
  extractPlaceQuery,
  findUrlInText,
  followShortLink,
  isShortMapLink,
} from './mapLinks';
import type { CommuteConfig, Coordinates, FetchLike, LocationInput, ResolvedDestination } from './types';

export interface ResolveDeps {
  fetch: FetchLike;
  /** Throws GeocodingNotFoundError / GeocodingProviderError. Only called for text with no coordinates. */
  geocode: (query: string) => Promise<Coordinates>;
  config: CommuteConfig;
  /** Optional cache of successful resolutions, keyed by the trimmed input text. */
  cache?: Map<string, ResolvedDestination>;
}

/**
 * Turn the saved school location into coordinates. Order of attempts:
 *   1. coordinate object / "lat, lon" text
 *   2. map link: coordinates in the URL; short link -> follow redirect, inspect final URL then page
 *   3. coordinates embedded in free text
 *   4. geocoding, only when there is address text and no coordinates
 */
export async function resolveDestination(input: LocationInput, deps: ResolveDeps): Promise<ResolvedDestination> {
  if (typeof input !== 'string') {
    const c = assertValidCoordinates(input.latitude, input.longitude, `${input.latitude}, ${input.longitude}`);
    return { coordinates: c, source: 'coordinates', detail: 'coordinate object' };
  }

  const text = input.trim();
  if (!text) throw new InvalidDestinationError('The school location is empty.');

  const cached = deps.cache?.get(text);
  if (cached) return cached;
  const result = await resolveText(text, deps);
  deps.cache?.set(text, result);
  return result;
}

async function resolveText(text: string, deps: ResolveDeps): Promise<ResolvedDestination> {
  // 1. Plain coordinate pair (throws InvalidCoordinatesError if pair-shaped but out of range).
  const pair = parseWholeCoordinateInput(text);
  if (pair) return { coordinates: pair, source: 'coordinates', detail: 'coordinate pair' };

  // 2. Map link.
  const url = findUrlInText(text);
  if (url) return resolveLink(url, deps);

  // 3. Coordinates written inside other text, e.g. "School No. 5 (47.9206, 106.9662)".
  const embedded = findEmbeddedCoordinates(text);
  if (embedded) return { coordinates: embedded, source: 'coordinates', detail: 'coordinates found in text' };

  // 4. Address with no coordinates: geocode.
  const coordinates = await deps.geocode(text);
  return { coordinates, source: 'geocoded-address', detail: 'geocoded address text' };
}

async function resolveLink(url: string, deps: ResolveDeps): Promise<ResolvedDestination> {
  // Coordinates directly in the link (full Google Maps links and similar).
  const direct = extractCoordinates(url, { isUrl: true, pick: 'last' });
  if (direct) return { coordinates: direct.coordinates, source: 'map-link', detail: `link ${direct.kind}` };

  let queryText = extractPlaceQuery(url);

  if (isShortMapLink(url)) {
    const followed = await followShortLink(url, deps);

    const fromFinal = extractCoordinates(followed.finalUrl, { isUrl: true, pick: 'last' });
    const fromBody = followed.body ? extractCoordinatesFromBody(followed.body) : null;
    // Place coordinates beat map-centre coordinates, wherever they were found.
    const best = pickBest(fromFinal, fromBody);
    if (best) {
      return {
        coordinates: best.hit.coordinates,
        source: 'short-link',
        detail: `${best.where} ${best.hit.kind}`,
      };
    }
    if (!followed.ok) {
      throw new LinkResolutionError(
        url,
        'http',
        `The map link could not be opened (HTTP ${followed.status}).`,
        followed.status,
      );
    }
    queryText = extractPlaceQuery(followed.finalUrl) ?? queryText;
  }

  if (queryText) {
    const coordinates = await deps.geocode(queryText);
    return { coordinates, source: 'geocoded-link-text', detail: 'geocoded place name from link' };
  }
  throw new LinkParseError(url, 'This map link has no coordinates or place name that can be used.');
}

const RANK = { 'place-data': 1, 'pin-param': 2, path: 2, 'map-center': 3 } as const;

function pickBest(
  fromFinal: ReturnType<typeof extractCoordinates>,
  fromBody: ReturnType<typeof extractCoordinatesFromBody>,
): { hit: NonNullable<typeof fromFinal>; where: 'final URL' | 'response page' } | null {
  if (fromFinal && (!fromBody || RANK[fromFinal.kind] <= RANK[fromBody.kind])) {
    return { hit: fromFinal, where: 'final URL' };
  }
  if (fromBody) return { hit: fromBody, where: 'response page' };
  return null;
}
