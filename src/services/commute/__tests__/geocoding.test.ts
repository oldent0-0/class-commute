import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GeocodingNotFoundError, GeocodingProviderError } from '../errors';
import { geocodeAddress } from '../geocoding';
import { SCHOOL_PLACE, TEST_CONFIG, fakeResponse, hangingFetch, jsonResponse, mockFetch } from './helpers';

const nominatimHit = [{ lat: '47.9206526', lon: '106.9662756', display_name: 'School' }];
const photonHit = { features: [{ geometry: { type: 'Point', coordinates: [106.9662756, 47.9206526] } }] };
const isNominatim = (u: string) => u.startsWith('https://nominatim.openstreetmap.org/');

describe('geocodeAddress', () => {
  it('uses Nominatim first and encodes the query', async () => {
    const m = mockFetch(() => jsonResponse(nominatimHit));
    const c = await geocodeAddress('Peace Ave 12 & 3, UB', { fetch: m.fetch, config: TEST_CONFIG });
    assert.deepEqual(c, SCHOOL_PLACE);
    assert.equal(m.calls.length, 1);
    assert.match(m.calls[0]!, /q=Peace%20Ave%2012%20%26%203%2C%20UB/);
  });

  it('falls back to Photon when Nominatim fails (HTTP error)', async () => {
    const m = mockFetch((u) => (isNominatim(u) ? fakeResponse('busy', { status: 503 }) : jsonResponse(photonHit)));
    const c = await geocodeAddress('Somewhere', { fetch: m.fetch, config: TEST_CONFIG });
    assert.deepEqual(c, SCHOOL_PLACE); // Photon GeoJSON is [lon, lat]
    assert.equal(m.calls.length, 2);
  });

  it('falls back to Photon on network failure and on timeout', async () => {
    const netFail = mockFetch((u) => {
      if (isNominatim(u)) throw new TypeError('Network request failed');
      return jsonResponse(photonHit);
    });
    assert.deepEqual(await geocodeAddress('X', { fetch: netFail.fetch, config: TEST_CONFIG }), SCHOOL_PLACE);

    const slow = (async (u: string, init?: RequestInit) =>
      isNominatim(u) ? hangingFetch(u, init) : jsonResponse(photonHit)) as typeof hangingFetch;
    const c = await geocodeAddress('X', { fetch: slow, config: { ...TEST_CONFIG, geocodeTimeoutMs: 20 } });
    assert.deepEqual(c, SCHOOL_PLACE);
  });

  it('falls back to Photon when Nominatim finds nothing', async () => {
    const m = mockFetch((u) => (isNominatim(u) ? jsonResponse([]) : jsonResponse(photonHit)));
    assert.deepEqual(await geocodeAddress('X', { fetch: m.fetch, config: TEST_CONFIG }), SCHOOL_PLACE);
  });

  it('both providers answer with no results -> GeocodingNotFoundError', async () => {
    const m = mockFetch((u) => (isNominatim(u) ? jsonResponse([]) : jsonResponse({ features: [] })));
    await assert.rejects(
      geocodeAddress('Atlantis', { fetch: m.fetch, config: TEST_CONFIG }),
      (e: unknown) => e instanceof GeocodingNotFoundError && e.query === 'Atlantis' && e.failures.length === 0,
    );
  });

  it('one provider empty, the other down -> not found, with the outage listed', async () => {
    const m = mockFetch((u) => (isNominatim(u) ? jsonResponse([]) : fakeResponse('x', { status: 500 })));
    await assert.rejects(
      geocodeAddress('Atlantis', { fetch: m.fetch, config: TEST_CONFIG }),
      (e: unknown) =>
        e instanceof GeocodingNotFoundError && e.failures.length === 1 && e.failures[0]!.provider === 'photon',
    );
  });

  it('every provider failing -> GeocodingProviderError (NOT "address not found")', async () => {
    const m = mockFetch((u) => {
      if (isNominatim(u)) throw new TypeError('Network request failed');
      return fakeResponse('bad gateway', { status: 502 });
    });
    await assert.rejects(
      geocodeAddress('Anywhere', { fetch: m.fetch, config: TEST_CONFIG }),
      (e: unknown) =>
        e instanceof GeocodingProviderError &&
        !(e instanceof GeocodingNotFoundError) &&
        e.failures.map((f) => f.kind).join() === 'network,http',
    );
  });

  it('malformed provider data counts as a provider failure', async () => {
    const m = mockFetch((u) =>
      isNominatim(u) ? jsonResponse([{ lat: 'abc', lon: 'def' }]) : fakeResponse('<html>', { status: 200 }),
    );
    await assert.rejects(
      geocodeAddress('X', { fetch: m.fetch, config: TEST_CONFIG }),
      (e: unknown) =>
        e instanceof GeocodingProviderError && e.failures.every((f) => f.kind === 'invalid_response'),
    );
  });

  it('sends the configured User-Agent', async () => {
    let seen: RequestInit | undefined;
    const fetch = async (_u: string, init?: RequestInit) => {
      seen = init;
      return jsonResponse(nominatimHit);
    };
    await geocodeAddress('X', { fetch, config: TEST_CONFIG });
    assert.equal((seen?.headers as Record<string, string>)['User-Agent'], 'commute-tests/1.0');
  });
});
