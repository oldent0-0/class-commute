import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NoRouteError, RoutingProviderError, UnsupportedTransportModeError } from '../errors';
import { buildRouteUrl, DEFAULT_ROUTERS, fetchRoute, profileForMode } from '../routing';
import { PHONE, SCHOOL_PLACE, TEST_CONFIG, fakeResponse, hangingFetch, jsonResponse, mockFetch, okRoute } from './helpers';

const isFossgis = (u: string) => u.startsWith('https://routing.openstreetmap.de/routed-car');
const isDemo = (u: string) => u.startsWith('https://router.project-osrm.org');
const deps = (f: ReturnType<typeof mockFetch>['fetch'], extra = {}) => ({ fetch: f, config: TEST_CONFIG, ...extra });

describe('mode -> routing profile', () => {
  it('Walk is walking; Car and Taxi are driving (case-insensitive)', () => {
    assert.equal(profileForMode('Walk'), 'walk');
    assert.equal(profileForMode('Car'), 'drive');
    assert.equal(profileForMode('Taxi'), 'drive');
    assert.equal(profileForMode('taxi'), 'drive');
  });

  it('Bus is a clear "not supported" error', () => {
    assert.throws(
      () => profileForMode('Bus'),
      (e: unknown) =>
        e instanceof UnsupportedTransportModeError && e.mode === 'Bus' && /not supported/i.test(e.message),
    );
  });

  it('unknown modes are rejected, not defaulted', () => {
    assert.throws(() => profileForMode('Teleport'), UnsupportedTransportModeError);
  });
});

describe('route requests', () => {
  it('walk uses the foot router, longitude first', async () => {
    const m = mockFetch(() => jsonResponse(okRoute(900, 1200)));
    const r = await fetchRoute('walk', PHONE, SCHOOL_PLACE, deps(m.fetch));
    assert.equal(r.durationSeconds, 900);
    assert.equal(r.distanceMeters, 1200);
    assert.equal(
      m.calls[0],
      'https://routing.openstreetmap.de/routed-foot/route/v1/foot/106.917700,47.918400;106.966276,47.920653?overview=false&alternatives=false&steps=false',
    );
  });

  it('drive uses the primary car router', async () => {
    const m = mockFetch(() => jsonResponse(okRoute(420)));
    const r = await fetchRoute('drive', PHONE, SCHOOL_PLACE, deps(m.fetch));
    assert.equal(r.provider, 'osrm-fossgis-car');
    assert.equal(m.calls.length, 1);
    assert.ok(isFossgis(m.calls[0]!));
  });

  it('driving falls back to the second router on HTTP error, timeout and network error', async () => {
    const cases: Array<[string, (u: string) => Response | Promise<Response>, number?]> = [
      ['http 500', (u) => (isFossgis(u) ? fakeResponse('oops', { status: 500 }) : jsonResponse(okRoute(600)))],
      ['network', (u) => { if (isFossgis(u)) throw new TypeError('Network request failed'); return jsonResponse(okRoute(600)); }],
    ];
    for (const [label, handler] of cases) {
      const m = mockFetch(handler);
      const r = await fetchRoute('drive', PHONE, SCHOOL_PLACE, deps(m.fetch));
      assert.equal(r.provider, 'osrm-project-demo', label);
      assert.ok(isDemo(m.calls[1]!), label);
    }
    const slow = (async (u: string, init?: RequestInit) =>
      isFossgis(u) ? hangingFetch(u, init) : jsonResponse(okRoute(600))) as typeof hangingFetch;
    const r = await fetchRoute('drive', PHONE, SCHOOL_PLACE, { fetch: slow, config: { ...TEST_CONFIG, routeTimeoutMs: 20 } });
    assert.equal(r.provider, 'osrm-project-demo');
  });

  it('all routers failing -> RoutingProviderError listing every failure', async () => {
    const m = mockFetch((u) => {
      if (isFossgis(u)) throw new TypeError('Network request failed');
      return fakeResponse('bad gateway', { status: 502 });
    });
    await assert.rejects(
      fetchRoute('drive', PHONE, SCHOOL_PLACE, deps(m.fetch)),
      (e: unknown) =>
        e instanceof RoutingProviderError &&
        e.failures.map((f) => `${f.provider}:${f.kind}`).join() === 'osrm-fossgis-car:network,osrm-project-demo:http',
    );
  });

  it('walking has no fallback: a failure is reported, not hidden', async () => {
    const m = mockFetch(() => fakeResponse('down', { status: 503 }));
    await assert.rejects(fetchRoute('walk', PHONE, SCHOOL_PLACE, deps(m.fetch)), RoutingProviderError);
    assert.equal(m.calls.length, DEFAULT_ROUTERS.walk.length);
  });

  it('OSRM NoRoute (also on HTTP 400) -> NoRouteError after trying the fallback', async () => {
    const m = mockFetch(() => jsonResponse({ code: 'NoRoute', message: 'Impossible route between points' }, 400));
    await assert.rejects(fetchRoute('drive', PHONE, SCHOOL_PLACE, deps(m.fetch)), NoRouteError);
    assert.equal(m.calls.length, 2);
  });

  it('rejects malformed route responses instead of defaulting a duration', async () => {
    const bad: unknown[] = [
      { code: 'Ok', routes: [] },
      { code: 'Ok', routes: [{ duration: 'soon' }] },
      { code: 'Ok', routes: [{ duration: -5 }] },
      { code: 'Ok', routes: [{ duration: null }] },
      { code: 'Ok' },
      { code: 'InvalidQuery' },
      'not an object',
    ];
    for (const body of bad) {
      const m = mockFetch(() => jsonResponse(body));
      await assert.rejects(
        fetchRoute('walk', PHONE, SCHOOL_PLACE, deps(m.fetch)),
        (e: unknown) => e instanceof RoutingProviderError && e.failures[0]!.kind === 'invalid_response',
        JSON.stringify(body),
      );
    }
    const html = mockFetch(() => fakeResponse('<html>captcha</html>'));
    await assert.rejects(fetchRoute('walk', PHONE, SCHOOL_PLACE, deps(html.fetch)), RoutingProviderError);
  });

  it('builds URLs for custom routers too', () => {
    const url = buildRouteUrl({ name: 'x', baseUrl: 'https://r.example', profile: 'driving' }, PHONE, SCHOOL_PLACE);
    assert.ok(url.startsWith('https://r.example/route/v1/driving/106.917700,47.918400;'));
  });
});
