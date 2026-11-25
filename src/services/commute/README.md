# Commute estimate

The Home screen uses this service to estimate travel from the phone's current GPS location to the saved school destination. `getTravelDurationSeconds` returns seconds; the screen subtracts the duration and configured buffer from the next class time.

The school destination can be coordinates, an address, a full map link, or a supported Google Maps short link. Coordinates are extracted before geocoding. Walk uses an OpenStreetMap foot router; Car and Taxi use free driving routers with a fallback. Bus schedules and live traffic are not supported.

Failures are typed `CommuteError` subclasses with categories for input, location, map-link resolution, geocoding, and routing. The Home screen maps them to localized messages.

## Validation

Run the focused unit suite with `npm run test:commute`. The optional `scripts/commute-smoke.ts` checks real public services using a fixed sample GPS position; it does not use the phone's location.

Geocoding uses public OpenStreetMap-based services. Requests identify the app as `ClassCommute/1.0`, destinations are cached in memory, and lookups should remain user-initiated and low-volume. Public services have fair-use limits and no availability guarantee.
