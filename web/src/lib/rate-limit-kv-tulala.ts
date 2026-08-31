/**
 * Tulala intake KV ceilings.
 *
 * Its own namespace, following the same reasoning that split guest-support off
 * from storefront: a scripted attack on the anonymous signup endpoint must not
 * consume the budget that keeps support answering, and vice versa. Shared
 * prefixes make one abusive surface degrade every other one.
 *
 * FAIL-CLOSED, like guest-support AI. An anonymous, unauthenticated endpoint
 * that spends tokens on every request cannot be allowed to run with its limiter
 * switched off — a misconfigured deploy would be a metered outage rather than a
 * degraded feature. The route refuses when Upstash is absent.
 *
 * Two independent axes on purpose:
 *   - per SESSION: what one visitor can spend. Generous, because a real intake
 *     is 10 to 20 turns and hitting a wall mid-signup loses the customer.
 *   - per IP: what one machine can spend. Tight, because a thousand fresh guest
 *     cookies from one host is the actual attack, and the session limiter is
 *     blind to it by construction.
 */

import type { KvRateLimitResult } from "./rate-limit-kv";

export function isTulalaKvConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

export function tulalaSessionKey(sessionId: string | null | undefined): string {
  return `tulala_session:${(sessionId?.trim() || "x").toLowerCase()}`;
}

export function tulalaIpKey(ip: string | null | undefined): string {
  return `tulala_ip:${(ip?.trim() || "x").toLowerCase()}`;
}

type TulalaLimiter = {
  checkTurnBySession(key: string): Promise<KvRateLimitResult>;
  checkTurnByIp(key: string): Promise<KvRateLimitResult>;
  checkImportBySession(key: string): Promise<KvRateLimitResult>;
  checkImportByIp(key: string): Promise<KvRateLimitResult>;
};

const allow: KvRateLimitResult = { ok: true };
const noop: TulalaLimiter = {
  async checkTurnBySession() {
    return allow;
  },
  async checkTurnByIp() {
    return allow;
  },
  async checkImportBySession() {
    return allow;
  },
  async checkImportByIp() {
    return allow;
  },
};

let _limiter: TulalaLimiter | null = null;

async function wrap(
  limit: (key: string) => Promise<{ success: boolean; reset: number }>,
  key: string,
): Promise<KvRateLimitResult> {
  try {
    const r = await limit(key);
    if (r.success) return { ok: true };
    return { ok: false, code: "rate_limited", retryAfterMs: Math.max(0, r.reset - Date.now()) };
  } catch {
    // A KV outage must not break signup. The route's fail-closed check already
    // refused if Upstash was never CONFIGURED; a transient error here is a
    // different situation, and the abuse floor plus the per-session turn ceiling
    // still apply.
    return { ok: true };
  }
}

async function getTulalaLimiter(): Promise<TulalaLimiter> {
  if (_limiter) return _limiter;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    _limiter = noop;
    return _limiter;
  }
  try {
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
        }): { limit(key: string): Promise<{ success: boolean; reset: number }> };
        slidingWindow(requests: number, window: string): unknown;
      };
    };
    const redis = new Redis({ url, token });
    const mk = (requests: number, window: string, prefix: string) =>
      new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(requests, window),
        prefix,
        analytics: false,
      });
    // 30 per session-hour: comfortably above the ~20-turn hard ceiling, so a
    // genuine intake (including retries and a restart) never touches it.
    const turnSession = mk(30, "60 m", "rl:tulala_turn_session");
    // 60 per IP-hour: three full intakes from one address. A shared office NAT
    // stays fine; a scripted fresh-cookie loop does not.
    const turnIp = mk(60, "60 m", "rl:tulala_turn_ip");
    // Imports are metered far tighter than turns, on both axes, because they are
    // a different kind of expensive: each one makes an OUTBOUND request to an
    // address the caller chose. Even fully SSRF-guarded, a generous ceiling here
    // would make the endpoint a usable amplifier pointed at third parties, with
    // our IP on the traffic. Five is more than any honest visitor needs — a site
    // and an Instagram, with retries.
    const importSession = mk(5, "60 m", "rl:tulala_import_session");
    const importIp = mk(15, "60 m", "rl:tulala_import_ip");
    _limiter = {
      checkTurnBySession: (key) => wrap((k) => turnSession.limit(k), key),
      checkTurnByIp: (key) => wrap((k) => turnIp.limit(k), key),
      checkImportBySession: (key) => wrap((k) => importSession.limit(k), key),
      checkImportByIp: (key) => wrap((k) => importIp.limit(k), key),
    };
  } catch {
    _limiter = noop;
  }
  return _limiter;
}

export async function checkTulalaTurnBySession(
  sessionId: string,
): Promise<KvRateLimitResult> {
  return (await getTulalaLimiter()).checkTurnBySession(tulalaSessionKey(sessionId));
}

export async function checkTulalaTurnByIp(ip: string): Promise<KvRateLimitResult> {
  return (await getTulalaLimiter()).checkTurnByIp(tulalaIpKey(ip));
}

export async function checkTulalaImportBySession(
  sessionId: string,
): Promise<KvRateLimitResult> {
  return (await getTulalaLimiter()).checkImportBySession(tulalaSessionKey(sessionId));
}

export async function checkTulalaImportByIp(ip: string): Promise<KvRateLimitResult> {
  return (await getTulalaLimiter()).checkImportByIp(tulalaIpKey(ip));
}

export function _resetTulalaLimiterForTests(): void {
  _limiter = null;
}
