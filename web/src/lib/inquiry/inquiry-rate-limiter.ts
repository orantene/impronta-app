/**
 * In-memory sliding window rate limiter (MVP). Swap for Redis later via {@link RateLimiter}.
 */

export type RateLimitResult =
  | { ok: true }
  | { ok: false; rateLimited: true; retryAfterMs: number };

export interface RateLimiter {
  check(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
}

type Bucket = { count: number; windowStart: number };

function createInMemoryRateLimiter(): RateLimiter {
  const buckets = new Map<string, Bucket>();

  return {
    async check(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
      const now = Date.now();
      const b = buckets.get(key);
      if (!b || now - b.windowStart > windowMs) {
        buckets.set(key, { count: 1, windowStart: now });
        return { ok: true };
      }
      if (b.count < limit) {
        b.count += 1;
        return { ok: true };
      }
      const retryAfterMs = windowMs - (now - b.windowStart);
      return { ok: false, rateLimited: true, retryAfterMs: Math.max(0, retryAfterMs) };
    },
  };
}

export const rateLimiter: RateLimiter = createInMemoryRateLimiter();

export function engineRateKey(action: string, userId: string, inquiryId?: string): string {
  return inquiryId ? `${action}:${userId}:${inquiryId}` : `${action}:${userId}`;
}
