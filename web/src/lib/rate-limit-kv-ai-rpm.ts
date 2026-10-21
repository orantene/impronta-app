/**
 * TUL-1624 · The per-minute AI request limit, shared across serverless instances. The old limiter was an in-memory Map,
 * so every instance had its own counter and the limit effectively multiplied by the number of warm instances.
 * Same shape as guest-support AI: Upstash sliding window, and FAIL CLOSED: a store error, or no store on the real
 * production project, refuses. Without a store anywhere else (dev, CI, previews) an in-memory window keeps working.
 */
import type { KvRateLimitResult } from "./rate-limit-kv";
import { failOpen } from "./rate-limit-fail-open";
import { memorySlidingWindow } from "./rate-limit-kv-tulala";

export const AI_RPM_STORE_ERROR: KvRateLimitResult = { ok: false, code: "rate_limited", retryAfterMs: 30_000 };

type Limit = (key: string) => Promise<{ success: boolean; reset: number }>;
const kvByRpm = new Map<number, Limit>();
const memByRpm = new Map<number, Limit>();
let _inject: ((rpm: number) => Limit) | null = null;

function isProduction(): boolean {
  return process.env.VERCEL_ENV === "production";
}

function kvLimiter(rpm: number): Limit | null {
  if (_inject) return _inject(rpm);
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const cached = kvByRpm.get(rpm);
  if (cached) return cached;
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
    const rl = new Ratelimit({ redis: new Redis({ url, token }), limiter: Ratelimit.slidingWindow(rpm, "1 m"), prefix: `rl:ai_rpm_${rpm}`, analytics: false });
    const fn: Limit = (k) => rl.limit(k);
    kvByRpm.set(rpm, fn);
    return fn;
  } catch {
    return null;
  }
}

export async function checkAiRpm(tenantId: string, rpm: number): Promise<KvRateLimitResult> {
  const key = `ai_rpm:${tenantId}`;
  const kv = kvLimiter(rpm);
  if (!kv) {
    if (isProduction()) return AI_RPM_STORE_ERROR;
    let mem = memByRpm.get(rpm);
    if (!mem) {
      const w = memorySlidingWindow(rpm, 60_000);
      mem = (k) => w.limit(k);
      memByRpm.set(rpm, mem);
    }
    const r = await mem(key);
    return r.success ? { ok: true } : { ok: false, code: "rate_limited", retryAfterMs: Math.max(0, r.reset - Date.now()) };
  }
  try {
    const r = await kv(key);
    return r.success ? { ok: true } : { ok: false, code: "rate_limited", retryAfterMs: Math.max(0, r.reset - Date.now()) };
  } catch (err) {
    failOpen("ai_rpm", key, err); // logs only: this limiter FAILS CLOSED
    return AI_RPM_STORE_ERROR;
  }
}

export function _resetAiRpmForTests(inject?: ((rpm: number) => Limit) | null): void {
  kvByRpm.clear();
  memByRpm.clear();
  _inject = inject ?? null;
}
