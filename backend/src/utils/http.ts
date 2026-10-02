import { logger } from './logger';

/**
 * Shared HTTP client for external APIs (Meta Graph, Shopify, OpenCode).
 *
 * Hardened per gap analysis (C3) + NINA's C1 spec §11:
 *   - Request timeout (AbortController) — a hung upstream call can no longer
 *     stall a BullMQ worker forever.
 *   - Exponential backoff with jitter on retries.
 *   - **Bug 1**: retries only apply to idempotent methods (GET/HEAD/PUT/
 *     DELETE/OPTIONS) unless `retryNonIdempotent` is explicitly true. Retrying
 *     a POST that already succeeded upstream (e.g. Meta campaign create)
 *     would create a duplicate — a billing incident.
 *   - **Bug 2**: Meta Marketing API returns rate-limit errors as HTTP 400
 *     with error codes 4, 17, 32, 613, 80004 — not 429. These are retried too.
 *   - **Bug 3**: Shopify Admin GraphQL throttling returns HTTP 200 with a
 *     THROTTLED error in the body. The body is inspected, not just the status.
 *   - **Bug 4**: Retry-After may be seconds OR an HTTP-date. It is parsed in
 *     both forms, capped at MAX_WAIT (60s) so a job slot is never held for an
 *     hour, and jitter is applied on every wait path (thundering-herd guard).
 *
 * Returns on 4xx instead of throwing so callers can read Meta's error object —
 * every call site MUST check `.ok` before treating the body as data.
 *
 * Usage:
 *   const res = await httpFetch(url, { method: 'GET', headers }, { label: 'meta' });
 *   if (!res.ok) throw new Error(`Meta ${res.status}: ${res.text.slice(0, 200)}`);
 *   const data = res.json;
 */

export interface HttpOptions {
  /** Overall request timeout in ms. Default 30000. */
  timeoutMs?: number;
  /** Number of retry attempts (after the first try). Default 2. */
  retries?: number;
  /** Base backoff delay in ms. Default 500. */
  backoffMs?: number;
  /** Human label for logs (e.g. 'meta', 'shopify'). */
  label?: string;
  /**
   * Allow retries on non-idempotent methods (POST/PATCH). Default false.
   * Only set true when the operation is safe to repeat or de-duplicated
   * upstream (never for Meta campaign/ad creation).
   */
  retryNonIdempotent?: boolean;
}

interface HttpResult {
  ok: boolean;
  status: number;
  json: any;
  text: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Methods that are safe to retry. */
const IDEMPOTENT_METHODS = ['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS'];

/** Meta Marketing API rate-limit / throttling error codes (returned as HTTP 400). */
const META_RATE_LIMIT_CODES = [4, 17, 32, 613, 80004];

/** Hard cap on any single wait (Bug 4): never sleep longer than this. */
const MAX_WAIT = 60_000;

/**
 * Parse a Retry-After header. Accepts delta-seconds or an HTTP-date.
 * Returns milliseconds or NaN when absent/invalid.
 */
function parseRetryAfter(value: string | null): number {
  if (!value) return NaN;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const date = Date.parse(value); // HTTP-date form
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : NaN;
}

/** True when Meta reports a rate-limit error (Bug 2). */
function isMetaRateLimited(status: number, json: any): boolean {
  return status === 400 && META_RATE_LIMIT_CODES.includes(Number(json?.error?.code));
}

/** True when Shopify GraphQL throttled us inside an HTTP 200 (Bug 3). */
function isShopifyThrottled(status: number, json: any): boolean {
  return (
    status === 200 &&
    Array.isArray(json?.errors) &&
    json.errors.some((e: any) => e?.extensions?.code === 'THROTTLED')
  );
}

/**
 * Fetch with timeout + exponential backoff. Returns the parsed body even on
 * non-2xx so callers can read API error payloads (e.g. Meta's error object).
 * Throws only after retries are exhausted on network/timeout errors.
 */
export async function httpFetch(
  url: string,
  init: RequestInit = {},
  options: HttpOptions = {}
): Promise<HttpResult> {
  const {
    timeoutMs = 30000,
    retries = 2,
    backoffMs = 500,
    label = 'http',
    retryNonIdempotent = false,
  } = options;

  const method = (init.method ?? 'GET').toUpperCase();
  const idempotent = IDEMPOTENT_METHODS.includes(method);
  // Bug 1: never retry a POST/PATCH unless the caller explicitly opts in.
  const maxAttempts = idempotent || retryNonIdempotent ? retries : 0;

  let lastError: any = null;

  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });

      let text = '';
      let json: any = null;
      try {
        text = await response.text();
        json = text ? JSON.parse(text) : null;
      } catch {
        // leave json null; caller can inspect text/status
      }

      // Retry conditions: 429, 5xx, Meta rate-limit codes (Bug 2),
      // and Shopify GraphQL throttle-in-200 (Bug 3).
      const retryable =
        response.status === 429 ||
        response.status >= 500 ||
        isMetaRateLimited(response.status, json) ||
        isShopifyThrottled(response.status, json);

      if (retryable && attempt < maxAttempts) {
        const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
        const backoff = backoffMs * Math.pow(2, attempt);
        // Bug 4: honor Retry-After but cap it; always add jitter.
        const waitMs =
          Math.min(MAX_WAIT, Number.isFinite(retryAfterMs) ? retryAfterMs : backoff) +
          Math.floor(Math.random() * 250);

        logger.warn(`${label}: transient ${response.status}, retrying`, {
          attempt: attempt + 1,
          waitMs,
          url: url.slice(0, 120),
        });
        await sleep(waitMs);
        continue;
      }

      return { ok: response.ok, status: response.status, json, text };
    } catch (error: any) {
      lastError = error;
      const isTimeout = error?.name === 'AbortError';
      if (attempt < maxAttempts) {
        const waitMs = backoffMs * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
        logger.warn(`${label}: ${isTimeout ? 'timeout' : 'network error'}, retrying`, {
          attempt: attempt + 1,
          waitMs,
          error: error?.message?.slice(0, 120),
        });
        await sleep(waitMs);
        continue;
      }
      throw new Error(
        `${label}: request failed after ${maxAttempts + 1} attempts: ${error?.message || 'unknown error'}`
      );
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new Error(`${label}: request failed`);
}
