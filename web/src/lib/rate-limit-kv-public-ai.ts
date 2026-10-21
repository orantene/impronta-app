/**
 * TUL-1630 · Per-IP limits for the anonymous AI routes (/api/ai/inquiry-draft, interpret-search, search,
 * refine-suggestions). They spend tokens or embeddings for visitors with no account, so the only brake used to be the
 * global hub caps. Same shape as guest-support AI: its own namespace, one sliding window per (route, IP), and FAIL
 * CLOSED: a store error, an unreachable Redis, or no Redis at all on the real production project refuses (429).
 * Local dev, CI, previews and the isolated QA branch (in-memory stand-in) stay allowed.
 */
import type { KvRateLimitResult } from "./rate-limit-kv";
import { failOpen } from "./rate-limit-fail-open";
import { isMemoryLimiterAllowed, memorySlidingWindow } from "./rate-limit-kv-tulala";

export const PUBLIC_AI_ROUTES = ["inquiry-draft", "interpret-search", "search", "refine-suggestions"] as const;
export type PublicAiRoute = (typeof PUBLIC_AI_ROUTES)[number];

/**
 * Requests per (route, IP) in a 10 minute sliding window. Typing-driven routes get more room than the drafter. The
 * numbers are generous on purpose: Mexican carriers put many people behind one IP (CGNAT), so a per-IP ceiling that is
 * too tight locks out real visitors.
 */
export const PUBLIC_AI_LIMITS: Readonly<Record<PublicAiRoute, number>> = {
  "inquiry-draft": 25,
  "interpret-search": 40,
  search: 60,
  "refine-suggestions": 40,
};
const WINDOW_MS = 10 * 60 * 1000;

/** Returned when the store errors or is absent in production (surfaces as a 429). */
export const PUBLIC_AI_STORE_ERROR: KvRateLimitResult = { ok: false, code: "rate_limited", retryAfterMs: 30_000 };

export function publicAiKey(route: PublicAiRoute, ip: string | null | undefined): string {
  return `public_ai:${route}:${(ip?.trim() || "x").toLowerCase()}`;
}

function isProductionRuntime(): boolean {
  return process.env.VERCEL_ENV === "production";
}

type Limit = (key: string) => Promise<{ success: boolean; reset: number }>;
let _limits: Record<PublicAiRoute, Limit> | null = null;
let _mode: "kv" | "memory" | "none" | null = null;

function build(): void {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Redis } = require("@upstash/redis") as { Redis: new (o: { url: string; token: string }) => unknown };
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Ratelimit } = require("@upstash/ratelimit") as {
        Ratelimit: {
          new (o: { redis: unknown; limiter: unknown; prefix: string; analytics: boolean }): { limit: Limit };
          slidingWindow(n: number, w: string): unknown;
        };
      };
      const redis = new Redis({ url, token });
      const out = {} as Record<PublicAiRoute, Limit>;
      for (const r of PUBLIC_AI_ROUTES) {
        const rl = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(PUBLIC_AI_LIMITS[r], "10 m"), prefix: `rl:public_ai_${r}`, analytics: false });
        out[r] = (k) => rl.limit(k);
      }
      _limits = out;
      _mode = "kv";
      return;
    } catch {
      _limits = null;
      _mode = "none";
      return;
    }
  }
  if (isMemoryLimiterAllowed()) {
    const out = {} as Record<PublicAiRoute, Limit>;
    for (const r of PUBLIC_AI_ROUTES) {
      const w = memorySlidingWindow(PUBLIC_AI_LIMITS[r], WINDOW_MS);
      out[r] = (k) => w.limit(k);
    }
    _limits = out;
    _mode = "memory";
    return;
  }
  _limits = null;
  _mode = "none";
}

export async function checkPublicAiByIp(route: PublicAiRoute, ip: string | null | undefined): Promise<KvRateLimitResult> {
  if (!_mode) build();
  if (!_limits) {
    // No usable store: production must not serve unmetered anonymous AI; other environments keep working.
    return isProductionRuntime() ? PUBLIC_AI_STORE_ERROR : { ok: true };
  }
  const key = publicAiKey(route, ip);
  try {
    const r = await _limits[route](key);
    if (r.success) return { ok: true };
    return { ok: false, code: "rate_limited", retryAfterMs: Math.max(0, r.reset - Date.now()) };
  } catch (err) {
    failOpen(`public_ai_${route}`, key, err); // logs; the result is deliberately ignored: this limiter FAILS CLOSED
    return PUBLIC_AI_STORE_ERROR;
  }
}

export function _resetPublicAiLimiterForTests(inject?: Record<PublicAiRoute, Limit> | null): void {
  _limits = inject ?? null;
  _mode = inject ? "kv" : null;
}
