/**
 * Pure refresh policy shared by the workspace sweep (`tenant_integrations`)
 * and the talent sweep (`talent_integrations`). Both owners keep the same
 * bookkeeping keys in their JSON config column, so one policy decides for both.
 * See ./logic.ts for why each number is what it is.
 */

export const IG_REFRESH_WINDOW_MS = 15 * 24 * 60 * 60 * 1000;
export const TT_REFRESH_WINDOW_MS = 6 * 60 * 60 * 1000;

/** Transient failures tolerated before a connection is declared needs-reconnect. */
export const MAX_CONSECUTIVE_FAILURES = 5;

/** First retry delay; doubles per consecutive failure up to the cap. */
const BACKOFF_BASE_MS = 30 * 60 * 1000; // 30 minutes
const BACKOFF_MAX_MS = 24 * 60 * 60 * 1000; // 1 day

export function needsRefresh(expiresAt: unknown, windowMs: number, now = Date.now()): boolean {
  if (typeof expiresAt !== "string" || !expiresAt) return true; // unknown → try
  const ms = Date.parse(expiresAt);
  if (Number.isNaN(ms)) return true;
  return ms - now < windowMs;
}

export function readFailureCount(config: Record<string, unknown>): number {
  const raw = config.refresh_consecutive_failures;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return 0;
  return Math.floor(raw);
}

/**
 * Has this row's backoff elapsed? A row with no recorded failure is always due.
 * Delay doubles per consecutive failure (30m, 1h, 2h, 4h, 8h…) capped at a day,
 * so a vendor outage does not turn into a retry storm.
 */
export function backoffElapsed(config: Record<string, unknown>, now: number): boolean {
  const failures = readFailureCount(config);
  if (failures === 0) return true;
  const last = config.refresh_last_failure_at;
  if (typeof last !== "string" || !last) return true;
  const lastMs = Date.parse(last);
  if (Number.isNaN(lastMs)) return true;
  const delay = Math.min(BACKOFF_BASE_MS * 2 ** (failures - 1), BACKOFF_MAX_MS);
  return now - lastMs >= delay;
}

/**
 * A vendor 4xx means the grant itself is dead — retrying cannot help. Anything
 * else (5xx, unreachable host, malformed 200) is transient. An ABSENT status is
 * a transport failure, which is the retryable direction.
 */
export function isFatalFailure(status: number | undefined): boolean {
  return typeof status === "number" && status >= 400 && status < 500;
}

/**
 * The config after a failure, and whether this failure is the transition into
 * needs-reconnect (the only moment the owner is notified).
 */
export function failureConfig(
  config: Record<string, unknown>,
  error: string,
  opts: { fatal: boolean; nowIso: string },
): { config: Record<string, unknown>; flagged: boolean; transitioned: boolean } {
  const failures = readFailureCount(config) + 1;
  const alreadyFlagged = config.needs_reconnect === true;
  const flagged = opts.fatal || failures >= MAX_CONSECUTIVE_FAILURES;
  return {
    config: {
      ...config,
      needs_reconnect: flagged,
      refresh_consecutive_failures: failures,
      refresh_last_failure_at: opts.nowIso,
      refresh_last_error: error,
    },
    flagged,
    transitioned: flagged && !alreadyFlagged,
  };
}
