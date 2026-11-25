import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveDestination } from '../destination';
import {
  GeocodingNotFoundError,
  InvalidCoordinatesError,
  InvalidDestinationError,
  LinkParseError,
  LinkResolutionError,
} from '../errors';
import type { Coordinates } from '../types';
import { FULL_LINK, MAP_CENTER, SCHOOL_PLACE, SHORT_LINK, TEST_CONFIG, fakeResponse, hangingFetch, mockFetch } from './helpers';

function geocoderSpy(result: Coordinates | Error) {
  const queries: string[] = [];
  return {
    queries,
    geocode: async (q: string) => {
      queries.push(q);
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

const neverFetch = mockFetch(() => {
  throw new Error('fetch must not be called');
});

describe('resolveDestination: coordinates and full links never geocode', () => {
  it('coordinate pair', async () => {
    const g = geocoderSpy(MAP_CENTER);
    const r = await resolveDestination('47.9206526, 106.9662756', { fetch: neverFetch.fetch, geocode: g.geocode, config: TEST_CONFIG });
    assert.deepEqual(r.coordinates, SCHOOL_PLACE);
    assert.equal(r.source, 'coordinates');
    assert.equal(g.queries.length, 0);
  });

  it('coordinate object is validated', async () => {
    const g = geocoderSpy(MAP_CENTER);
    await assert.rejects(
      resolveDestination({ latitude: 200, longitude: 5 }, { fetch: neverFetch.fetch, geocode: g.geocode, config: TEST_CONFIG }),
      InvalidCoordinatesError,
    );
  });

  it('swapped pair is an error, not a geocode query', async () => {
    const g = geocoderSpy(MAP_CENTER);
    await assert.rejects(
      resolveDestination('106.9662756, 47.9206526', { fetch: neverFetch.fetch, geocode: g.geocode, config: TEST_CONFIG }),
      InvalidCoordinatesError,
    );
    assert.equal(g.queries.length, 0);
  });

  it('full Google Maps link: place coordinates, no network, no geocoding', async () => {
    const g = geocoderSpy(MAP_CENTER);
    const r = await resolveDestination(FULL_LINK, { fetch: neverFetch.fetch, geocode: g.geocode, config: TEST_CONFIG });
    assert.deepEqual(r.coordinates, SCHOOL_PLACE);
    assert.equal(r.source, 'map-link');
    assert.equal(neverFetch.calls.length, 0);
    assert.equal(g.queries.length, 0);
  });

  it('empty input', async () => {
    const g = geocoderSpy(MAP_CENTER);
    await assert.rejects(
      resolveDestination('   ', { fetch: neverFetch.fetch, geocode: g.geocode, config: TEST_CONFIG }),
      InvalidDestinationError,
    );
  });
});

describe('resolveDestination: the supplied short link', () => {
  it('follows the redirect and uses the place coordinates from the final URL (not the map centre)', async () => {
    const m = mockFetch(() => fakeResponse('<html>maps</html>', { url: FULL_LINK }));
    const g = geocoderSpy(MAP_CENTER);
    const r = await resolveDestination(SHORT_LINK, { fetch: m.fetch, geocode: g.geocode, config: TEST_CONFIG });
    assert.deepEqual(m.calls, [SHORT_LINK]);
    assert.deepEqual(r.coordinates, SCHOOL_PLACE);
    assert.equal(r.source, 'short-link');
    assert.match(r.detail, /final URL place-data/);
    assert.equal(g.queries.length, 0);
  });

  it('inspects the response page when the final URL has no coordinates', async () => {
    const page = `<html><link rel="canonical" href="${FULL_LINK}"></html>`;
    const m = mockFetch(() => fakeResponse(page, { url: 'https://www.google.com/maps?cid=123' }));
    const g = geocoderSpy(MAP_CENTER);
    const r = await resolveDestination(SHORT_LINK, { fetch: m.fetch, geocode: g.geocode, config: TEST_CONFIG });
    assert.deepEqual(r.coordinates, SCHOOL_PLACE);
    assert.match(r.detail, /response page/);
  });

  it('prefers place data in the page over a map-centre in the final URL', async () => {
    const m = mockFetch(() =>
      fakeResponse(`<script>var u="${FULL_LINK}"</script>`, {
        url: 'https://www.google.com/maps/@47.9232031,106.9622216,15z',
      }),
    );
    const r = await resolveDestination(SHORT_LINK, { fetch: m.fetch, geocode: geocoderSpy(MAP_CENTER).geocode, config: TEST_CONFIG });
    assert.deepEqual(r.coordinates, SCHOOL_PLACE);
  });

  it('works from a scheme-less pasted link and caches the result', async () => {
    const m = mockFetch(() => fakeResponse('', { url: FULL_LINK }));
    const cache = new Map();
    const deps = { fetch: m.fetch, geocode: geocoderSpy(MAP_CENTER).geocode, config: TEST_CONFIG, cache };
    const a = await resolveDestination('maps.app.goo.gl/RNDPC49VB4Z1bVFp8', deps);
    const b = await resolveDestination('maps.app.goo.gl/RNDPC49VB4Z1bVFp8', deps);
    assert.deepEqual(a.coordinates, SCHOOL_PLACE);
    assert.deepEqual(b, a);
    assert.equal(m.calls.length, 1);
  });

  it('network failure -> LinkResolutionError(network), never a silent default', async () => {
    const m = mockFetch(() => {
      throw new TypeError('Network request failed');
    });
    await assert.rejects(
      resolveDestination(SHORT_LINK, { fetch: m.fetch, geocode: geocoderSpy(MAP_CENTER).geocode, config: TEST_CONFIG }),
      (e: unknown) => e instanceof LinkResolutionError && e.reason === 'network',
    );
  });

  it('timeout -> LinkResolutionError(timeout)', async () => {
    await assert.rejects(
      resolveDestination(SHORT_LINK, {
        fetch: hangingFetch,
        geocode: geocoderSpy(MAP_CENTER).geocode,
        config: { ...TEST_CONFIG, linkTimeoutMs: 20 },
      }),
      (e: unknown) => e instanceof LinkResolutionError && e.reason === 'timeout',
    );
  });

  it('HTTP 404 with nothing usable -> LinkResolutionError(http)', async () => {
    const m = mockFetch(() => fakeResponse('Not found', { status: 404, url: SHORT_LINK }));
    await assert.rejects(
      resolveDestination(SHORT_LINK, { fetch: m.fetch, geocode: geocoderSpy(MAP_CENTER).geocode, config: TEST_CONFIG }),
      (e: unknown) => e instanceof LinkResolutionError && e.reason === 'http' && e.status === 404,
    );
  });

  it('redirects to a page with neither coordinates nor a place name -> LinkParseError', async () => {
    const m = mockFetch(() => fakeResponse('<html></html>', { url: 'https://www.google.com/maps' }));
    await assert.rejects(
      resolveDestination(SHORT_LINK, { fetch: m.fetch, geocode: geocoderSpy(MAP_CENTER).geocode, config: TEST_CONFIG }),
      LinkParseError,
    );
  });

  it('geocodes the place name only when the redirect has a name but no coordinates', async () => {
    const m = mockFetch(() =>
      fakeResponse('<html></html>', { url: 'https://www.google.com/maps/place/School+No.+5,+Ulaanbaatar/' }),
    );
    const g = geocoderSpy(SCHOOL_PLACE);
    const r = await resolveDestination(SHORT_LINK, { fetch: m.fetch, geocode: g.geocode, config: TEST_CONFIG });
    assert.deepEqual(g.queries, ['School No. 5, Ulaanbaatar']);
    assert.equal(r.source, 'geocoded-link-text');
  });
});

describe('resolveDestination: plain addresses', () => {
  it('geocodes an address with no coordinates', async () => {
    const g = geocoderSpy(SCHOOL_PLACE);
    const r = await resolveDestination('  Peace Avenue 12, Ulaanbaatar ', { fetch: neverFetch.fetch, geocode: g.geocode, config: TEST_CONFIG });
    assert.deepEqual(g.queries, ['Peace Avenue 12, Ulaanbaatar']);
    assert.equal(r.source, 'geocoded-address');
  });

  it('does not geocode text that already contains coordinates', async () => {
    const g = geocoderSpy(MAP_CENTER);
    const r = await resolveDestination('School (47.9206526, 106.9662756)', { fetch: neverFetch.fetch, geocode: g.geocode, config: TEST_CONFIG });
    assert.deepEqual(r.coordinates, SCHOOL_PLACE);
    assert.equal(g.queries.length, 0);
  });

  it('propagates "address not found" unchanged', async () => {
    const g = geocoderSpy(new GeocodingNotFoundError('Nowhere', []));
    await assert.rejects(
      resolveDestination('Nowhere', { fetch: neverFetch.fetch, geocode: g.geocode, config: TEST_CONFIG }),
      GeocodingNotFoundError,
    );
  });
});
