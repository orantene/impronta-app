import { failOpen } from "@/lib/rate-limit-fail-open";
import type { KvRateLimitResult } from "@/lib/rate-limit-kv";
import { tryConsumeRateLimit } from "@/lib/rate-limit";

/**
 * TUL-1342: the PUBLIC catalog / booking-slots limiters must never silently become "no limit" on a real
 * deployment. The in-memory table (`rate-limit.ts`) is per serverless instance, so on Vercel it does
 * not bound a client: a client fanned out across instances sees a fresh table each time (QA sent 68
 * requests against a 30/min limit and got 200 on all of them).
 *
 * On a DEPLOYED environment (VERCEL_ENV production | preview):
 *   - Upstash env missing  -> FAIL CLOSED (429), logged once. Nothing there to share a count with.
 *   - Upstash store error  -> a conservative per-instance floor instead of "open" (still counted and logged
 *                             through failOpen so the Sentry alert keeps working).
 * Everywhere else (local dev, CI, tests) the old behaviour stays: an in-memory limit, or open on a store error.
 */
const WINDOW_MS = 60_000;

export function isDeployedEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview";
}

const warned = new Set<string>();
function warnOnce(name: string, message: string): void {
  if (warned.has(name)) return;
  warned.add(name);
  // eslint-disable-next-line no-console
  console.error(`[rate-limit-kv] ${name}: ${message}`);
}

/** The public limiter when there is no shared store at all (Upstash env unset or the client failed to build). */
export function publicLimitWithoutStore(name: string, key: string, max: number): KvRateLimitResult {
  if (isDeployedEnv()) {
    warnOnce(
      name,
      `there is no shared Upstash store on a deployed environment (VERCEL_ENV=${process.env.VERCEL_ENV}; env unset or the client failed to start), so a per-instance counter cannot bound clients. ` +
        "FAILING CLOSED (429) for this public endpoint until UPSTASH_REDIS_REST_URL/TOKEN are provisioned.",
    );
    return { ok: false, code: "rate_limited", retryAfterMs: WINDOW_MS };
  }
  warnOnce(name, `Upstash env is UNSET, using the per-instance in-memory limiter (${max}/min/IP, not shared across instances).`);
  return tryConsumeRateLimit(key, max, WINDOW_MS) ? { ok: true } : { ok: false, code: "rate_limited", retryAfterMs: WINDOW_MS };
}

/** One Upstash call for a PUBLIC limiter. A store error is counted/logged like any fail-open, but on a deployed env it falls back to a per-instance floor instead of letting everything through. */
export async function runPublicLimiter(
  name: string,
  limiter: { limit(key: string): Promise<{ success: boolean; reset: number }> },
  key: string,
  max: number,
): Promise<KvRateLimitResult> {
  try {
    const r = await limiter.limit(key);
    if (r.success) return { ok: true };
    return { ok: false, code: "rate_limited", retryAfterMs: Math.max(0, r.reset - Date.now()) };
  } catch (err) {
    const open = failOpen(name, key, err);
    if (!isDeployedEnv()) return open;
    return tryConsumeRateLimit(`${key}:store-error-floor`, max, WINDOW_MS) ? { ok: true } : { ok: false, code: "rate_limited", retryAfterMs: WINDOW_MS };
  }
}

export type LimiterStoreState = "ok" | "error" | "unset";

/** For health / smoke: can this runtime actually reach the limiter store? (No secret value is read out.) */
export async function probeLimiterStore(): Promise<LimiterStoreState> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return "unset";
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis } = require("@upstash/redis") as { Redis: new (c: { url: string; token: string }) => { ping(): Promise<unknown> } };
    await new Redis({ url, token }).ping();
    return "ok";
  } catch {
    return "error";
  }
}

export function _resetPublicFloorWarningsForTests(): void {
  warned.clear();
}
