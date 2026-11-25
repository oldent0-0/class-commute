/**
 * Live smoke test against the real short-link redirect, geocoders and OSRM routers.
 * Run on a machine with internet access:
 *
 *   npx tsx scripts/commute-smoke.ts                       # supplied short link, Walk
 *   npx tsx scripts/commute-smoke.ts "https://maps.app.goo.gl/RNDPC49VB4Z1bVFp8" Car 47.9184 106.9177
 *   npx tsx scripts/commute-smoke.ts "Sukhbaatar Square, Ulaanbaatar" Taxi
 *
 * Uses a fixed fake GPS position (default: central Ulaanbaatar) instead of expo-location.
 */
import { getTravelEstimate } from '../src/services/commute/estimate';
import { CommuteError } from '../src/services/commute/errors';
import { formatTravelDuration } from '../src/services/commute/leaveBy';
import type { TransportMode } from '../src/services/commute/types';

const [, , place = 'https://maps.app.goo.gl/RNDPC49VB4Z1bVFp8', mode = 'Walk', lat = '47.9184', lon = '106.9177'] =
  process.argv;

async function main(): Promise<void> {
  try {
    const est = await getTravelEstimate(place, mode as TransportMode, {
      location: {
        requestForegroundPermission: async () => ({ granted: true, canAskAgain: true }),
        hasServicesEnabled: async () => true,
        getCurrentPosition: async () => ({ latitude: Number(lat), longitude: Number(lon) }),
      },
      fetch: (url, init) => fetch(url, init),
      config: { userAgent: 'ClassCommute-smoke/1.0' },
    });
    console.log({
      destination: est.destination,
      origin: est.origin,
      router: est.routeProvider,
      duration: formatTravelDuration(est.durationSeconds),
      seconds: est.durationSeconds,
      distanceMeters: est.distanceMeters,
      liveTraffic: est.includesLiveTraffic,
    });
  } catch (e) {
    if (e instanceof CommuteError) {
      console.error(`${e.name} [${e.category}/${e.code}]: ${e.message}`);
      if ('failures' in e) console.error((e as { failures: unknown }).failures);
      process.exitCode = 1;
    } else {
      throw e;
    }
  }
}
void main();
