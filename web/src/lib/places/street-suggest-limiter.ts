import "server-only";

/**
 * Fail-CLOSED rate limiter for the public street-address routes.
 *
 * `rate-limit-kv.ts` fails OPEN by design (a missing Upstash env or a Redis
 * error returns ok). That is right for sign-in and guest chat; it is wrong here,
 * where every allowed request is a billable Google call on an unauthenticated
 * route. So this module reuses the same Upstash backend (no new dependency) but
 * treats "no limiter" and "limiter errored" as a denial.
 *
 * Two buckets per request: one per trusted client IP (stops a single source)
 * and one per host (stops a distributed flood against one talent site).
 */

export type StreetLimitBackend = {
  limit(key: string): Promise<{ success: boolean; reset: number }>;
};

export type StreetLimitBackends = { ip: StreetLimitBackend; host: StreetLimitBackend };

export type StreetLimitVerdict =
  | { ok: true }
  | { ok: false; reason: "rate_limited"; retryAfterMs: number }
  | { ok: false; reason: "unavailable" };

/** Per IP: 30 calls / minute (a typing burst plus the details call). */
const IP_BUDGET = { requests: 30, window: "1 m" } as const;
/** Per host: 300 calls / minute across every visitor of that site. */
const HOST_BUDGET = { requests: 300, window: "1 m" } as const;

let cached: StreetLimitBackends | null | undefined;

function buildUpstashBackends(): StreetLimitBackends | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    // Same lazy require as rate-limit-kv.ts: a missing module must not crash import.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis } = require("@upstash/redis") as {
      Redis: new (opts: { url: string; token: string }) => unknown;
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Ratelimit } = require("@upstash/ratelimit") as {
      Ratelimit: {
        new (opts: {
          redis: unknown;
          limiter: unknown;
          prefix: string;
          analytics: boolean;
        }): StreetLimitBackend;
        slidingWindow(requests: number, window: string): unknown;
      };
    };
    const redis = new Redis({ url, token });
    const make = (prefix: string, b: { requests: number; window: string }) =>
      new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(b.requests, b.window),
        prefix,
        analytics: false,
      });
    return {
      ip: make("rl:street_suggest_ip", IP_BUDGET),
      host: make("rl:street_suggest_host", HOST_BUDGET),
    };
  } catch {
    return null;
  }
}

function getBackends(): StreetLimitBackends | null {
  if (cached === undefined) cached = buildUpstashBackends();
  return cached;
}

function segment(v: string): string {
  return (v.trim() || "x").toLowerCase().slice(0, 200);
}

export async function checkStreetSuggestLimit(
  input: { ip: string; host: string },
  backends: StreetLimitBackends | null = getBackends(),
): Promise<StreetLimitVerdict> {
  if (!backends) return { ok: false, reason: "unavailable" };
  try {
    const byIp = await backends.ip.limit(`street_ip:${segment(input.ip)}`);
    if (!byIp.success) {
      return {
        ok: false,
        reason: "rate_limited",
        retryAfterMs: Math.max(0, byIp.reset - Date.now()),
      };
    }
    const byHost = await backends.host.limit(`street_host:${segment(input.host)}`);
    if (!byHost.success) {
      return {
        ok: false,
        reason: "rate_limited",
        retryAfterMs: Math.max(0, byHost.reset - Date.now()),
      };
    }
    return { ok: true };
  } catch {
    // Redis error: closed, never open.
    return { ok: false, reason: "unavailable" };
  }
}
