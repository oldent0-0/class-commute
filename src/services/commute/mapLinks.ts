import { fetchText, HttpFailure } from './http';
import { findEmbeddedCoordinates, toValidCoordinates } from './coordinates';
import { LinkResolutionError } from './errors';
import type { CommuteConfig, Coordinates, FetchLike } from './types';

/*
 * NOTE: React Native's URL/URLSearchParams are incomplete (searchParams throws "not implemented"),
 * so links are parsed with plain string/regex code here.
 */

export type CoordinateKind = 'place-data' | 'pin-param' | 'path' | 'map-center';

export interface ExtractedCoordinates {
  coordinates: Coordinates;
  kind: CoordinateKind;
}

const TIER: Record<CoordinateKind, number> = {
  'place-data': 1, // !3dLAT!4dLON : the place itself
  'pin-param': 2, // q=, query=, destination=, daddr=
  path: 2, // /maps/search/LAT,LON or /maps/dir//LAT,LON
  'map-center': 3, // @LAT,LON and ll=/center= : only where the map is centred
};

const COORD = '[-+]?\\d{1,3}(?:\\.\\d+)?';

export function decodeSafe(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    // Malformed or non-UTF-8 escapes: decode only plain ASCII escapes.
    return text.replace(/%([2-7][0-9A-Fa-f])/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
  }
}

function decodeQueryValue(value: string): string {
  return decodeSafe(value.replace(/\+/g, ' '));
}

export interface ParsedUrl {
  host: string;
  path: string;
  query: string;
}

export function parseUrlLoose(url: string): ParsedUrl | null {
  const m = /^(?:https?:)?\/\/([^/?#]+)([^?#]*)(?:\?([^#]*))?/i.exec(url.trim());
  if (!m) return null;
  const host = (m[1] ?? '').replace(/^.*@/, '').replace(/:\d+$/, '').toLowerCase();
  return { host, path: m[2] ?? '', query: m[3] ?? '' };
}

/** maps.app.goo.gl/<code> and goo.gl/maps/<code>. */
export function isShortMapLink(url: string): boolean {
  const p = parseUrlLoose(url);
  if (!p) return false;
  return p.host === 'maps.app.goo.gl' || (p.host === 'goo.gl' && p.path.startsWith('/maps'));
}

const BARE_MAP_HOST =
  /^(?:www\.)?(?:maps\.app\.goo\.gl|goo\.gl\/maps|google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)/i;

/** Finds a URL in free text, or a scheme-less Google Maps link. Returns null for plain addresses. */
export function findUrlInText(text: string): string | null {
  const t = text.trim();
  const m = /https?:\/\/[^\s<>"']+/i.exec(t);
  if (m) return m[0];
  if (BARE_MAP_HOST.test(t) && !/\s/.test(t)) return `https://${t}`;
  return null;
}

function pick<T>(items: T[], which: 'first' | 'last'): T | undefined {
  return which === 'first' ? items[0] : items[items.length - 1];
}

function collect(re: RegExp, text: string, toCoords: (m: RegExpExecArray) => Coordinates | null): Coordinates[] {
  const out: Coordinates[] = [];
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  let m: RegExpExecArray | null;
  while ((m = g.exec(text)) !== null) {
    const c = toCoords(m);
    if (c) out.push(c);
    if (m[0] === '') g.lastIndex++;
  }
  return out;
}

/**
 * Pull destination coordinates out of a URL or a block of text, best source first:
 *   1. !3dLAT!4dLON      place coordinates (preferred)
 *   2. q= / query= / destination= / daddr= pairs, or a coordinate path segment
 *   3. @LAT,LON, ll=, center=   map-centre coordinates (only as a last resort)
 * `pick` chooses between several matches of the same tier ('last' = destination in /dir/ links).
 */
export function extractCoordinates(
  text: string,
  opts: { isUrl: boolean; pick: 'first' | 'last' },
): ExtractedCoordinates | null {
  const decoded = decodeSafe(text);

  const place = collect(new RegExp(`!3d(${COORD})!4d(${COORD})`), decoded, (m) =>
    toValidCoordinates(Number(m[1]), Number(m[2])),
  );
  const placeHit = pick(place, opts.pick);
  if (placeHit) return { coordinates: placeHit, kind: 'place-data' };

  const pins: Coordinates[] = [];
  const pinRe = /(?:^|[?&;\s"'(])(?:destination|daddr|q|query)=([^&#\s"'<>]*)/gi;
  let pm: RegExpExecArray | null;
  while ((pm = pinRe.exec(decoded)) !== null) {
    const c = findEmbeddedCoordinates(decodeQueryValue(pm[1] ?? ''));
    if (c) pins.push(c);
  }
  const pinHit = pick(pins, opts.pick);
  if (pinHit) return { coordinates: pinHit, kind: 'pin-param' };

  if (opts.isUrl) {
    const parsed = parseUrlLoose(text);
    if (parsed) {
      const segs = parsed.path.split('/').map(decodeQueryValue);
      const pathHits: Coordinates[] = [];
      for (const seg of segs) {
        const c = /^\s*[-+]?\d{1,3}\.\d+\s*,\s*[-+]?\d{1,3}\.\d+\s*$/.test(seg) ? findEmbeddedCoordinates(seg) : null;
        if (c) pathHits.push(c);
      }
      const pathHit = pick(pathHits, opts.pick);
      if (pathHit) return { coordinates: pathHit, kind: 'path' };
    }
  }

  const centers: Coordinates[] = collect(new RegExp(`@(${COORD}),(${COORD})`), decoded, (m) =>
    toValidCoordinates(Number(m[1]), Number(m[2])),
  );
  const centerRe = /(?:^|[?&;\s"'(])(?:ll|center)=([^&#\s"'<>]*)/gi;
  while ((pm = centerRe.exec(decoded)) !== null) {
    const c = findEmbeddedCoordinates(decodeQueryValue(pm[1] ?? ''));
    if (c) centers.push(c);
  }
  const centerHit = pick(centers, opts.pick);
  if (centerHit) return { coordinates: centerHit, kind: 'map-center' };

  return null;
}

/** Search text carried by a link that has no coordinates (place name or address), or null. */
export function extractPlaceQuery(url: string): string | null {
  const parsed = parseUrlLoose(url);
  if (!parsed) return null;
  const isCoordLike = (s: string) => findEmbeddedCoordinates(s) !== null;

  const paramRe = /(?:^|&)(?:q|query|destination|daddr)=([^&]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = paramRe.exec(parsed.query)) !== null) {
    const v = decodeQueryValue(m[1] ?? '').trim();
    if (v && !isCoordLike(v)) return v;
  }
  const pathMatch = /\/maps\/(?:place|search)\/([^/]+)/i.exec(parsed.path);
  if (pathMatch) {
    const v = decodeQueryValue(pathMatch[1] ?? '').trim();
    if (v && !v.startsWith('@') && !isCoordLike(v)) return v;
  }
  return null;
}

const MAX_BODY_CHARS = 2_000_000;

function unescapeBody(body: string): string {
  return body
    .slice(0, MAX_BODY_CHARS)
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
    .replace(/\\\//g, '/');
}

/**
 * Inspect an HTML/JS response page. Google Maps URLs embedded in it (canonical/og:url, meta
 * refresh, script redirects) are parsed first, then the raw text itself. Place coordinates win
 * over map-centre coordinates regardless of where they were found.
 */
export function extractCoordinatesFromBody(body: string): ExtractedCoordinates | null {
  const text = unescapeBody(body);
  const found: ExtractedCoordinates[] = [];

  const urlRe = /https?:\/\/(?:www\.|maps\.)?google\.[a-z.]+\/maps[^\s"'<>\\]*/gi;
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(text)) !== null) {
    const hit = extractCoordinates(m[0], { isUrl: true, pick: 'last' });
    if (hit) found.push(hit);
  }
  const raw = extractCoordinates(text, { isUrl: false, pick: 'first' });
  if (raw) found.push(raw);

  let best: ExtractedCoordinates | null = null;
  for (const hit of found) {
    if (!best || TIER[hit.kind] < TIER[best.kind]) best = hit;
  }
  return best;
}

/** consent.google.com wraps the real destination in ?continue=<url>. */
export function unwrapConsentUrl(url: string): string {
  const p = parseUrlLoose(url);
  if (!p || !/^consent\.google\./.test(p.host)) return url;
  const m = /(?:^|&)continue=([^&]+)/.exec(p.query);
  return m ? decodeSafe(m[1] ?? '') : url;
}

export interface FollowedLink {
  finalUrl: string;
  body: string;
  status: number;
  ok: boolean;
}

/** GET a short link, letting the runtime follow redirects, and return the final URL and page. */
export async function followShortLink(
  url: string,
  deps: { fetch: FetchLike; config: CommuteConfig },
): Promise<FollowedLink> {
  try {
    const res = await fetchText(
      deps.fetch,
      url,
      { 'User-Agent': deps.config.userAgent, Accept: 'text/html,application/xhtml+xml' },
      deps.config.linkTimeoutMs,
    );
    return { finalUrl: unwrapConsentUrl(res.url), body: res.text, status: res.status, ok: res.ok };
  } catch (e) {
    if (e instanceof HttpFailure) {
      throw new LinkResolutionError(
        url,
        e.kind,
        e.kind === 'timeout'
          ? `Could not open the map link: the request ${e.message}.`
          : `Could not open the map link (network error: ${e.message}).`,
        undefined,
        e,
      );
    }
    throw e;
  }
}
