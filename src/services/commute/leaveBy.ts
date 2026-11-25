/** Leave-by = next class start - route duration - buffer. Pure; same rule the UI already uses. */
export function computeLeaveBy(nextClassStart: Date, durationSeconds: number, bufferMinutes: number): Date {
  if (Number.isNaN(nextClassStart.getTime())) throw new RangeError('nextClassStart is not a valid date');
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
    throw new RangeError('durationSeconds must be a finite number >= 0');
  }
  if (!Number.isFinite(bufferMinutes) || bufferMinutes < 0) {
    throw new RangeError('bufferMinutes must be a finite number >= 0');
  }
  return new Date(nextClassStart.getTime() - durationSeconds * 1000 - bufferMinutes * 60_000);
}

/** 3725 -> "1 h 2 min"; 40 -> "1 min" (rounded up so the display never understates the trip). */
export function formatTravelDuration(durationSeconds: number): string {
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) throw new RangeError('invalid duration');
  const totalMinutes = Math.max(1, Math.ceil(durationSeconds / 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
