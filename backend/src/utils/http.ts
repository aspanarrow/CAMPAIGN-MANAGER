import { logger } from './logger';

/**
 * Shared HTTP client for external APIs (Meta Graph, Shopify, OpenCode).
 *
 * Adds what raw fetch() lacks (per gap analysis C3):
 *   - Request timeout (AbortController) — a hung upstream call can no longer
 *     stall a BullMQ worker forever.
 *   - Exponential backoff with jitter + retry on 429 / 5xx / network errors.
 *   - Respects Retry-After when the API sends it (Meta/Shopify rate limits).
 *
 * Usage:
 *   const res = await httpFetch(url, { ... }, { timeoutMs: 15000, retries: 3 });
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
}

interface HttpResult {
  ok: boolean;
  status: number;
  json: any;
  text: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  const { timeoutMs = 30000, retries = 2, backoffMs = 500, label = 'http' } = options;

  let lastError: any = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
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

      // Retry on rate limiting / transient server errors.
      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < retries) {
        const retryAfter = Number(response.headers.get('retry-after'));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : backoffMs * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
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
      if (attempt < retries) {
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
        `${label}: request failed after ${retries + 1} attempts: ${error?.message || 'unknown error'}`
      );
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new Error(`${label}: request failed`);
}
