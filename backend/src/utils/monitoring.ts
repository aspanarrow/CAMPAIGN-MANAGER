/**
 * Minimal monitoring hooks.
 * - If SENTRY_DSN is set, errors are forwarded to Sentry (lazy import, no hard dep).
 * - Otherwise errors are logged via winston (existing logger).
 */
import { logger } from './logger';

let sentryEnabled = false;

export async function initMonitoring(): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    logger.info('Monitoring: Sentry DSN not set — using local logs only');
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — optional dep, only needed when SENTRY_DSN is set
    const Sentry: any = await import('@sentry/node');
    Sentry.init({ dsn, environment: process.env.NODE_ENV || 'development', tracesSampleRate: 0.1 });
    sentryEnabled = true;
    logger.info('Monitoring: Sentry enabled');
  } catch {
    logger.warn('Monitoring: @sentry/node not installed — run `pnpm add @sentry/node` to enable');
  }
}

export async function captureError(error: unknown, context?: Record<string, unknown>): Promise<void> {
  logger.error('Unhandled error', { error: error instanceof Error ? error.message : String(error), ...context });
  if (!sentryEnabled) return;
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — optional dep
    const Sentry: any = await import('@sentry/node');
    Sentry.captureException(error, { extra: context });
  } catch {
    // monitoring must never break the app
  }
}
