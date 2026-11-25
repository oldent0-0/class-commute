import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  GeocodingProviderError,
  LocationPermissionError,
  LocationUnavailableError,
  UnsupportedTransportModeError,
} from '../errors';
import { getTravelEstimate, type EstimateDeps } from '../estimate';
import { computeLeaveBy, formatTravelDuration } from '../leaveBy';
import type { LocationProvider } from '../location';
import { FULL_LINK, PHONE, SCHOOL_PLACE, SHORT_LINK, fakeResponse, jsonResponse, mockFetch, okRoute } from './helpers';

function location(overrides: Partial<LocationProvider> = {}) {
  const calls: string[] = [];
  const provider: LocationProvider = {
    requestForegroundPermission: async () => {
      calls.push('permission');
      return { granted: true, canAskAgain: true };
    },
    hasServicesEnabled: async () => true,
    getCurrentPosition: async () => {
      calls.push('position');
      return PHONE;
    },
    ...overrides,
  };
  return { provider, calls };
}

const routeFetch = (seconds = 1234) =>
  mockFetch((u) =>
    u.startsWith('https://maps.app.goo.gl/')
      ? fakeResponse('', { url: FULL_LINK })
      : jsonResponse(okRoute(seconds, 5000)),
  );

const deps = (loc: LocationProvider, f: EstimateDeps['fetch'], extra: Partial<EstimateDeps> = {}): EstimateDeps => ({
  location: loc,
  fetch: f,
  ...extra,
});

describe('getTravelEstimate', () => {
  it('supplied short link + Walk: GPS origin -> school place coordinates -> foot route', async () => {
    const m = routeFetch(1234.4);
    const loc = location();
    const est = await getTravelEstimate(SHORT_LINK, 'Walk', deps(loc.provider, m.fetch));
    assert.equal(est.durationSeconds, 1234);
    assert.equal(est.includesLiveTraffic, false);
    assert.deepEqual(est.destination.coordinates, SCHOOL_PLACE);
    assert.deepEqual(est.origin, PHONE);
    assert.equal(m.calls.length, 2);
    assert.match(m.calls[1]!, /routed-foot\/route\/v1\/foot\/106\.917700,47\.918400;106\.966276,47\.920653/);
  });

  it('Car and Taxi use driving routes', async () => {
    for (const mode of ['Car', 'Taxi'] as const) {
      const m = routeFetch();
      await getTravelEstimate('47.9206526, 106.9662756', mode, deps(location().provider, m.fetch));
      assert.match(m.calls[0]!, /routed-car\/route\/v1\/driving\//, mode);
    }
  });

  it('Bus: "not supported" error before any permission prompt or network request', async () => {
    const m = routeFetch();
    const loc = location();
    await assert.rejects(
      getTravelEstimate(SHORT_LINK, 'Bus', deps(loc.provider, m.fetch)),
      UnsupportedTransportModeError,
    );
    assert.equal(m.calls.length, 0);
    assert.equal(loc.calls.length, 0);
  });

  it('permission denied -> LocationPermissionError with canAskAgain, no route request', async () => {
    const m = routeFetch();
    const loc = location({ requestForegroundPermission: async () => ({ granted: false, canAskAgain: false }) });
    await assert.rejects(
      getTravelEstimate('47.9206526, 106.9662756', 'Walk', deps(loc.provider, m.fetch)),
      (e: unknown) => e instanceof LocationPermissionError && e.canAskAgain === false,
    );
    assert.equal(m.calls.length, 0);
  });

  it('location services off, GPS error, GPS timeout and invalid fix are distinct typed errors', async () => {
    const run = (overrides: Partial<LocationProvider>, extra: Partial<EstimateDeps> = {}) =>
      getTravelEstimate('47.9206526, 106.9662756', 'Walk', deps(location(overrides).provider, routeFetch().fetch, extra));

    await assert.rejects(run({ hasServicesEnabled: async () => false }), (e: unknown) =>
      e instanceof LocationUnavailableError && e.reason === 'services_disabled');
    await assert.rejects(run({ getCurrentPosition: async () => { throw new Error('GPS hardware off'); } }), (e: unknown) =>
      e instanceof LocationUnavailableError && e.reason === 'provider_error' && /GPS hardware off/.test(e.message));
    await assert.rejects(
      run({ getCurrentPosition: () => new Promise(() => undefined) }, { config: { locationTimeoutMs: 20 } }),
      (e: unknown) => e instanceof LocationUnavailableError && e.reason === 'timeout',
    );
    await assert.rejects(run({ getCurrentPosition: async () => ({ latitude: NaN, longitude: 1 }) }), (e: unknown) =>
      e instanceof LocationUnavailableError && e.reason === 'invalid_fix');
    await assert.rejects(run({ getCurrentPosition: async () => ({ latitude: 0, longitude: 0 }) }), (e: unknown) =>
      e instanceof LocationUnavailableError && e.reason === 'invalid_fix');
  });

  it('geocoding provider outage surfaces as GeocodingProviderError before GPS is requested', async () => {
    const m = mockFetch(() => fakeResponse('down', { status: 503 }));
    const loc = location();
    await assert.rejects(
      getTravelEstimate('Peace Avenue 12, Ulaanbaatar', 'Car', deps(loc.provider, m.fetch)),
      GeocodingProviderError,
    );
    assert.equal(loc.calls.length, 0);
  });
});

describe('leave-by helpers', () => {
  it('leave by = class start - route duration - buffer', () => {
    const start = new Date('2026-11-26T09:00:00.000Z');
    assert.equal(computeLeaveBy(start, 1200, 10).toISOString(), '2026-11-26T08:30:00.000Z');
    assert.equal(computeLeaveBy(start, 0, 0).toISOString(), start.toISOString());
  });

  it('rejects invalid inputs', () => {
    const start = new Date('2026-11-26T09:00:00.000Z');
    assert.throws(() => computeLeaveBy(new Date('nope'), 1, 1), RangeError);
    assert.throws(() => computeLeaveBy(start, NaN, 1), RangeError);
    assert.throws(() => computeLeaveBy(start, 1, -1), RangeError);
  });

  it('formats durations rounding up', () => {
    assert.equal(formatTravelDuration(40), '1 min');
    assert.equal(formatTravelDuration(1234), '21 min');
    assert.equal(formatTravelDuration(3600), '1 h');
    assert.equal(formatTravelDuration(3725), '1 h 3 min');
  });
});
