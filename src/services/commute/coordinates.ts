import { InvalidCoordinatesError } from './errors';
import type { Coordinates } from './types';

/**
 * Validate a latitude/longitude pair. Rejects NaN/Infinity, out-of-range values and exactly 0,0
 * (the classic "missing data" value; it is open ocean, never a school).
 */
export function toValidCoordinates(latitude: number, longitude: number): Coordinates | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90) return null;
  if (longitude < -180 || longitude > 180) return null;
  if (latitude === 0 && longitude === 0) return null;
  return { latitude, longitude };
}

export function assertValidCoordinates(latitude: number, longitude: number, input: string): Coordinates {
  const valid = toValidCoordinates(latitude, longitude);
  if (valid) return valid;
  throw new InvalidCoordinatesError(
    `Invalid coordinates "${input}": latitude must be -90..90 and longitude -180..180, in "latitude, longitude" order (and not 0,0).`,
    input,
  );
}

// Decimal degrees with a mandatory fractional part, so house-number style text like "12, 34" is
// treated as an address, not a coordinate pair.
const NUM = '[-+]?\\d{1,3}\\.\\d+';
const WHOLE_PAIR = new RegExp(`^\\(?\\s*(${NUM})\\s*°?\\s*(?:[,;]\\s*|\\s+)(${NUM})\\s*°?\\s*\\)?$`);
// Inside free text only comma/semicolon separators count, to avoid matching "Room 1.2 3.4".
const EMBEDDED_PAIR = new RegExp(`(?:^|[^\\d.])(${NUM})\\s*°?\\s*[,;]\\s*(${NUM})`);

/**
 * Whole-string coordinate pair ("47.92, 106.92", "(47.92 106.92)").
 * Returns null if the text is not pair-shaped; throws InvalidCoordinatesError if it is pair-shaped
 * but invalid (for example swapped latitude/longitude), so it is never geocoded by mistake.
 */
export function parseWholeCoordinateInput(text: string): Coordinates | null {
  const m = WHOLE_PAIR.exec(text.trim());
  if (!m) return null;
  return assertValidCoordinates(Number(m[1]), Number(m[2]), text.trim());
}

/** First valid comma-separated decimal pair found anywhere in the text, or null. Never throws. */
export function findEmbeddedCoordinates(text: string): Coordinates | null {
  const m = EMBEDDED_PAIR.exec(text);
  if (!m) return null;
  return toValidCoordinates(Number(m[1]), Number(m[2]));
}
