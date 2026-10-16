import {
  CODE_ATTEMPTS_PER_DAY_PER_PHONE,
  CODE_ATTEMPTS_PER_MINUTE,
  codeAttemptPhoneKey,
  codeAttemptSessionKey,
} from "./policy";
import { memorySlidingWindow } from "@/lib/rate-limit-kv-tulala";

/**
 * Promo-code brute-force limits (L2): 5/min per session+IP, 20/day per phone.
 *
 * Same `{ limit(key) }` contract as Upstash `Ratelimit`, so the real limiter
 * and the in-memory one (tests, QA stack) are interchangeable. Injected into
 * the service, never constructed inside it.
 */
export type SlidingLimiter = { limit(key: string): Promise<{ success: boolean; reset: number }> };

export type CodeAttemptLimiters = { perMinute: SlidingLimiter; perPhoneDay: SlidingLimiter };

export type CodeAttemptVerdict = { ok: true } | { ok: false; retryAfterMs: number };

export async function checkCodeAttempt(
  limiters: CodeAttemptLimiters,
  input: { sessionId: string | null; ip: string | null; phoneE164: string | null },
  now: () => number = Date.now,
): Promise<CodeAttemptVerdict> {
  try {
    const a = await limiters.perMinute.limit(codeAttemptSessionKey(input.sessionId, input.ip));
    if (!a.success) return { ok: false, retryAfterMs: Math.max(0, a.reset - now()) };
    if (input.phoneE164) {
      const b = await limiters.perPhoneDay.limit(codeAttemptPhoneKey(input.phoneE164));
      if (!b.success) return { ok: false, retryAfterMs: Math.max(0, b.reset - now()) };
    }
    return { ok: true };
  } catch {
    // A KV blip must not block checkout. The DB lock still guards every limit
    // that costs the talent money; this layer only slows guessing.
    return { ok: true };
  }
}

export function memoryCodeAttemptLimiters(now: () => number = Date.now): CodeAttemptLimiters {
  return {
    perMinute: memorySlidingWindow(CODE_ATTEMPTS_PER_MINUTE, 60_000, now),
    perPhoneDay: memorySlidingWindow(CODE_ATTEMPTS_PER_DAY_PER_PHONE, 24 * 3_600_000, now),
  };
}

let _limiters: CodeAttemptLimiters | null = null;

/**
 * Upstash when configured, else in-memory per instance. In-memory is weaker
 * across lambdas but still caps a single scripted client; the generic error
 * and the DB limits stand behind it either way.
 */
export function defaultCodeAttemptLimiters(): CodeAttemptLimiters {
  if (_limiters) return _limiters;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Redis } = require("@upstash/redis") as {
        Redis: new (opts: { url: string; token: string }) => unknown;
      };
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Ratelimit } = require("@upstash/ratelimit") as {
        Ratelimit: {
          new (opts: { redis: unknown; limiter: unknown; prefix: string; analytics: boolean }): SlidingLimiter;
          slidingWindow(requests: number, window: string): unknown;
        };
      };
      const redis = new Redis({ url, token });
      _limiters = {
        perMinute: new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow(CODE_ATTEMPTS_PER_MINUTE, "1 m"),
          prefix: "rl:promo_code_min",
          analytics: false,
        }),
        perPhoneDay: new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow(CODE_ATTEMPTS_PER_DAY_PER_PHONE, "1 d"),
          prefix: "rl:promo_code_phone_day",
          analytics: false,
        }),
      };
      return _limiters;
    } catch {
      // fall through to memory
    }
  }
  _limiters = memoryCodeAttemptLimiters();
  return _limiters;
}
