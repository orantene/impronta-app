import { createHash } from "node:crypto";

import { logServerError } from "@/lib/server/safe-error";
import type { KvRateLimitResult } from "@/lib/rate-limit-kv";

/**
 * TUL-628: the Upstash limiters fail OPEN (an outage must not lock people out
 * of signing in or asking for help), but a silent fail-open means the abuse
 * floor can be down for hours with nobody knowing. Every fail-open is counted;
 * the first one per limiter per window is logged (Sentry via logServerError)
 * with the limiter name, key namespace and a short key hash (never the raw
 * key: it can embed an email or IP). Later ones in the same window only bump
 * the counter and are reported in the next log line.
 */
export const FAIL_OPEN_LOG_WINDOW_MS = 60_000;

/**
 * TUL-1139: more than this many fail-opens inside one hour is an outage, not noise.
 * One distinct "threshold" error is logged per hour (a stable Sentry alert-rule target:
 * message prefix `rate limiter fail-open threshold`), independent of the per-limiter log.
 */
export const FAIL_OPEN_ALERT_WINDOW_MS = 3_600_000;
export const FAIL_OPEN_ALERT_DEFAULT_THRESHOLD = 20;

function alertThreshold(): number {
  const n = Number.parseInt(process.env.RATE_LIMIT_FAILOPEN_ALERT_PER_HOUR ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : FAIL_OPEN_ALERT_DEFAULT_THRESHOLD;
}

let hourStart = -Infinity;
let hourCount = 0;
let hourAlerted = false;

type Slot = { lastLogAt: number; suppressed: number };
const slots = new Map<string, Slot>();
let total = 0;

export function failOpenCount(): number {
  return total;
}

export function resetFailOpenStateForTests(): void {
  slots.clear();
  total = 0;
  hourStart = -Infinity;
  hourCount = 0;
  hourAlerted = false;
}

export function failOpen(
  limiter: string,
  key: string,
  err: unknown,
  nowMs: number = Date.now(),
): KvRateLimitResult {
  total += 1;
  if (nowMs - hourStart >= FAIL_OPEN_ALERT_WINDOW_MS) {
    hourStart = nowMs;
    hourCount = 0;
    hourAlerted = false;
  }
  hourCount += 1;
  if (!hourAlerted && hourCount > alertThreshold()) {
    hourAlerted = true;
    try {
      logServerError(
        "rate-limit-kv.fail-open.threshold",
        new Error(`rate limiter fail-open threshold exceeded: ${hourCount} in the last hour (limit ${alertThreshold()})`),
      );
    } catch {
      /* observability must never break the request path */
    }
  }
  const slot = slots.get(limiter) ?? { lastLogAt: -Infinity, suppressed: 0 };
  if (nowMs - slot.lastLogAt >= FAIL_OPEN_LOG_WINDOW_MS) {
    const ns = key.split(":")[0] || "?";
    const hash = createHash("sha256").update(key).digest("hex").slice(0, 8);
    const note = `rate limiter failed open (${limiter}, key ${ns}:${hash}, ${slot.suppressed} more since last log)`;
    slot.lastLogAt = nowMs;
    slot.suppressed = 0;
    slots.set(limiter, slot);
    try {
      logServerError("rate-limit-kv.fail-open", new Error(note, { cause: err }));
    } catch {
      /* observability must never break the request path */
    }
  } else {
    slot.suppressed += 1;
    slots.set(limiter, slot);
  }
  return { ok: true };
}
