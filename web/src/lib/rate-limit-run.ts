import { failOpen } from "@/lib/rate-limit-fail-open";
import type { KvRateLimitResult } from "@/lib/rate-limit-kv";

/**
 * One Upstash limiter call, mapped to KvRateLimitResult. A store error fails
 * OPEN through failOpen() (counted + throttled log, TUL-628).
 */
export async function runLimiter(
  name: string,
  limiter: { limit(key: string): Promise<{ success: boolean; reset: number }> },
  key: string,
): Promise<KvRateLimitResult> {
  try {
    const r = await limiter.limit(key);
    if (r.success) return { ok: true };
    return { ok: false, code: "rate_limited", retryAfterMs: Math.max(0, r.reset - Date.now()) };
  } catch (err) {
    return failOpen(name, key, err);
  }
}
