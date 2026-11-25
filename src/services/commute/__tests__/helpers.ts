import type { FetchLike } from '../types';
import { DEFAULT_CONFIG, type CommuteConfig } from '../types';

export const SHORT_LINK = 'https://maps.app.goo.gl/RNDPC49VB4Z1bVFp8';

/** The short link redirects here (observed redirect target of the supplied link). */
export const FULL_LINK =
  'https://www.google.com/maps/place/School+of+Information+and+Telecommunication+Technology/@47.9232031,106.9622216,14.75z/data=!4m6!3m5!1s0x5d9691f3ab1910cd:0x26a53c35c8113432!8m2!3d47.9206526!4d106.9662756!16s%2Fg%2F11b6p9bbz4!18m1!1e1';

export const SCHOOL_PLACE = { latitude: 47.9206526, longitude: 106.9662756 };
export const MAP_CENTER = { latitude: 47.9232031, longitude: 106.9622216 };
export const PHONE = { latitude: 47.9184, longitude: 106.9177 };

export const TEST_CONFIG: CommuteConfig = { ...DEFAULT_CONFIG, userAgent: 'commute-tests/1.0' };

export function fakeResponse(body: string, opts: { status?: number; url?: string } = {}): Response {
  const res = new Response(body, { status: opts.status ?? 200 });
  Object.defineProperty(res, 'url', { value: opts.url ?? '' });
  return res;
}

export function jsonResponse(value: unknown, status = 200): Response {
  return fakeResponse(JSON.stringify(value), { status });
}

export interface MockFetch {
  fetch: FetchLike;
  calls: string[];
}

/** Routes each requested URL through `handler`; records every URL requested. */
export function mockFetch(handler: (url: string) => Response | Promise<Response>): MockFetch {
  const calls: string[] = [];
  const fetch: FetchLike = async (url) => {
    calls.push(url);
    return handler(url);
  };
  return { fetch, calls };
}

/** A fetch that never settles until aborted (to exercise timeouts). */
export const hangingFetch: FetchLike = (_url, init) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
  });

export const okRoute = (durationSeconds: number, distance = 1000) => ({
  code: 'Ok',
  routes: [{ duration: durationSeconds, distance }],
});
