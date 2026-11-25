/**
 * Typed errors for the commute estimator. Every failure mode surfaces as a
 * CommuteError subclass so the UI can show a specific message instead of a
 * silent default.
 */

export type CommuteErrorCategory = 'input' | 'location' | 'link' | 'geocoding' | 'routing';

/** One provider's failure, kept on the final error so nothing is hidden. */
export interface ProviderFailure {
  provider: string;
  kind: 'timeout' | 'network' | 'http' | 'invalid_response' | 'no_result' | 'no_route';
  message: string;
  status?: number;
}

export class CommuteError extends Error {
  readonly code: string;
  readonly category: CommuteErrorCategory;
  readonly originalError?: unknown;

  constructor(code: string, category: CommuteErrorCategory, message: string, cause?: unknown) {
    super(message);
    // Keep instanceof working when classes are transpiled to ES5.
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = new.target.name;
    this.code = code;
    this.category = category;
    this.originalError = cause;
  }
}

/* ---------- input ---------- */

export class InvalidDestinationError extends CommuteError {
  constructor(message: string) {
    super('invalid_destination', 'input', message);
  }
}

export class InvalidCoordinatesError extends CommuteError {
  readonly input: string;
  constructor(message: string, input: string) {
    super('invalid_coordinates', 'input', message);
    this.input = input;
  }
}

export class UnsupportedTransportModeError extends CommuteError {
  readonly mode: string;
  constructor(mode: string, message: string) {
    super('transport_mode_unsupported', 'input', message);
    this.mode = mode;
  }
}

/* ---------- phone location ---------- */

export class LocationPermissionError extends CommuteError {
  /** false means the user must enable permission from system settings. */
  readonly canAskAgain: boolean;
  constructor(canAskAgain: boolean) {
    super(
      'location_permission_denied',
      'location',
      canAskAgain
        ? 'Location permission was denied. Allow location access to estimate your commute.'
        : 'Location permission is blocked. Enable it for this app in system settings.',
    );
    this.canAskAgain = canAskAgain;
  }
}

export class LocationUnavailableError extends CommuteError {
  readonly reason: 'services_disabled' | 'timeout' | 'provider_error' | 'invalid_fix';
  constructor(
    reason: 'services_disabled' | 'timeout' | 'provider_error' | 'invalid_fix',
    message: string,
    cause?: unknown,
  ) {
    super('location_unavailable', 'location', message, cause);
    this.reason = reason;
  }
}

/* ---------- map links ---------- */

export class LinkResolutionError extends CommuteError {
  readonly url: string;
  readonly reason: 'timeout' | 'network' | 'http';
  readonly status?: number;
  constructor(url: string, reason: 'timeout' | 'network' | 'http', message: string, status?: number, cause?: unknown) {
    super('link_unreachable', 'link', message, cause);
    this.url = url;
    this.reason = reason;
    this.status = status;
  }
}

export class LinkParseError extends CommuteError {
  readonly url: string;
  constructor(url: string, message: string) {
    super('link_no_coordinates', 'link', message);
    this.url = url;
  }
}

/* ---------- geocoding ---------- */

/** Providers answered, but none knows this address. */
export class GeocodingNotFoundError extends CommuteError {
  readonly query: string;
  /** Failures from providers that did not answer (empty if all answered). */
  readonly failures: ProviderFailure[];
  constructor(query: string, failures: ProviderFailure[]) {
    super('geocoding_not_found', 'geocoding', `Address not found: "${query}".`);
    this.query = query;
    this.failures = failures;
  }
}

/** No provider could answer (timeouts, network, HTTP or malformed responses). */
export class GeocodingProviderError extends CommuteError {
  readonly failures: ProviderFailure[];
  constructor(failures: ProviderFailure[]) {
    super(
      'geocoding_provider_failed',
      'geocoding',
      `Address lookup failed: ${failures.map((f) => `${f.provider} (${f.message})`).join('; ')}`,
    );
    this.failures = failures;
  }
}

/* ---------- routing ---------- */

/** Routers answered, but no route exists between the points for this mode. */
export class NoRouteError extends CommuteError {
  readonly failures: ProviderFailure[];
  constructor(failures: ProviderFailure[]) {
    super('routing_no_route', 'routing', 'No route was found between your location and the destination.');
    this.failures = failures;
  }
}

/** No router could answer. */
export class RoutingProviderError extends CommuteError {
  readonly failures: ProviderFailure[];
  constructor(failures: ProviderFailure[]) {
    super(
      'routing_provider_failed',
      'routing',
      `Route lookup failed: ${failures.map((f) => `${f.provider} (${f.message})`).join('; ')}`,
    );
    this.failures = failures;
  }
}
