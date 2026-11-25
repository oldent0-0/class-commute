import type { FetchLike } from './types';

/** Transport-level failure (no usable HTTP response). */
export class HttpFailure extends Error {
  readonly kind: 'timeout' | 'network';
  readonly originalError?: unknown;
  constructor(kind: 'timeout' | 'network', message: string, originalError?: unknown) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'HttpFailure';
    this.kind = kind;
    this.originalError = originalError;
  }
}

export interface HttpResult {
  status: number;
  ok: boolean;
  /** Final URL after redirects (falls back to the requested URL if the runtime omits it). */
  url: string;
  text: string;
}

/**
 * GET a URL and read the whole body, all under one timeout. Rejects with HttpFailure only for
 * timeouts and network errors; HTTP error statuses are returned for the caller to interpret.
 */
export async function fetchText(
  fetchImpl: FetchLike,
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<HttpResult> {
  const controller =
    typeof AbortController === 'undefined' ? null : new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller?.abort();
      reject(new HttpFailure('timeout', `timed out after ${timeoutMs} ms`));
    }, timeoutMs);
  });
  const work = (async (): Promise<HttpResult> => {
    const res = await fetchImpl(
      url,
      controller
        ? { method: 'GET', headers, signal: controller.signal }
        : { method: 'GET', headers },
    );
    const text = await res.text();
    return { status: res.status, ok: res.ok, url: res.url || url, text };
  })();
  try {
    return await Promise.race([work, timeout]);
  } catch (e) {
    if (e instanceof HttpFailure) throw e;
    throw new HttpFailure('network', e instanceof Error ? e.message : String(e), e);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
