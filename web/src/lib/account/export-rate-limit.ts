/**
 * TUL-725. 5 exports per hour per user. Same fail-open posture as the other
 * per-user KV limiters: no Upstash configured, or a store error, allows the
 * request (the freshness check is the hard gate; this only blunts repeats).
 */
import { runLimiter } from "@/lib/rate-limit-run";
import type { KvRateLimitResult } from "@/lib/rate-limit-kv";

type Limiter = { limit(key: string): Promise<{ success: boolean; reset: number }> };
let limiter: Limiter | null | undefined;

function getLimiter(): Limiter | null {
  if (limiter !== undefined) return limiter;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return (limiter = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis } = require("@upstash/redis") as { Redis: new (o: { url: string; token: string }) => unknown };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Ratelimit } = require("@upstash/ratelimit") as {
      Ratelimit: {
        new (o: { redis: unknown; limiter: unknown; prefix: string; analytics: boolean }): Limiter;
        slidingWindow(n: number, w: string): unknown;
      };
    };
    limiter = new Ratelimit({
      redis: new Redis({ url, token }),
      limiter: Ratelimit.slidingWindow(5, "60 m"),
      prefix: "rl:account_export",
      analytics: false,
    });
  } catch {
    limiter = null;
  }
  return limiter;
}

export async function checkAccountExport(userId: string): Promise<KvRateLimitResult> {
  const l = getLimiter();
  if (!l) return { ok: true };
  return runLimiter("checkAccountExport", l, `account_export:${userId}`);
}
