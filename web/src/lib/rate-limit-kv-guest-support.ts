/**
 * Guest-support KV ceilings. Separate namespace from storefront
 * guestCreateIpKey so a busy tenant chat cannot starve marketing.
 *
 * Guest AI FAIL-CLOSED: if Upstash env is missing, the AI route must refuse
 * rather than spend tokens. Create/message still fail-open (honeypot remains).
 */
import { normalizeEmailForKey, type KvRateLimitResult } from "./rate-limit-kv";

export function isKvLimiterConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

export function supportGuestSessionKey(guestSessionId: string | null | undefined): string {
  return `support_guest_session:${(guestSessionId?.trim() || "x").toLowerCase()}`;
}

export function supportGuestIpKey(ip: string | null | undefined): string {
  return `support_guest_ip:${(ip?.trim() || "x").toLowerCase()}`;
}

export function supportGuestEmailKey(email: string | null | undefined): string {
  return `support_guest_email:${normalizeEmailForKey(email) ?? "x"}`;
}

type GuestSupportLimiter = {
  checkCreateBySession(key: string): Promise<KvRateLimitResult>;
  checkCreateByIp(key: string): Promise<KvRateLimitResult>;
  checkCreateByEmail(key: string): Promise<KvRateLimitResult>;
  checkMessageBySession(key: string): Promise<KvRateLimitResult>;
  checkMessageByIp(key: string): Promise<KvRateLimitResult>;
  checkAiByIp(key: string): Promise<KvRateLimitResult>;
};

const allow: KvRateLimitResult = { ok: true };
const noop: GuestSupportLimiter = {
  async checkCreateBySession() { return allow; },
  async checkCreateByIp() { return allow; },
  async checkCreateByEmail() { return allow; },
  async checkMessageBySession() { return allow; },
  async checkMessageByIp() { return allow; },
  async checkAiByIp() { return allow; },
};

let _limiter: GuestSupportLimiter | null = null;

async function wrap(
  limit: (key: string) => Promise<{ success: boolean; reset: number }>,
  key: string,
): Promise<KvRateLimitResult> {
  try {
    const r = await limit(key);
    if (r.success) return { ok: true };
    return { ok: false, code: "rate_limited", retryAfterMs: Math.max(0, r.reset - Date.now()) };
  } catch {
    return { ok: true };
  }
}

async function getGuestSupportLimiter(): Promise<GuestSupportLimiter> {
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
        new (opts: { redis: unknown; limiter: unknown; prefix: string; analytics: boolean }): {
          limit(key: string): Promise<{ success: boolean; reset: number }>;
        };
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
    const createSession = mk(3, "60 m", "rl:support_guest_create_session");
    const createIp = mk(10, "60 m", "rl:support_guest_create_ip");
    const createEmail = mk(3, "60 m", "rl:support_guest_create_email");
    const msgSession = mk(20, "1 m", "rl:support_guest_msg_session");
    const msgIp = mk(60, "1 m", "rl:support_guest_msg_ip");
    const aiIp = mk(20, "60 m", "rl:support_guest_ai_ip");
    _limiter = {
      checkCreateBySession: (key) => wrap((k) => createSession.limit(k), key),
      checkCreateByIp: (key) => wrap((k) => createIp.limit(k), key),
      checkCreateByEmail: (key) => wrap((k) => createEmail.limit(k), key),
      checkMessageBySession: (key) => wrap((k) => msgSession.limit(k), key),
      checkMessageByIp: (key) => wrap((k) => msgIp.limit(k), key),
      checkAiByIp: (key) => wrap((k) => aiIp.limit(k), key),
    };
  } catch {
    _limiter = noop;
  }
  return _limiter;
}

export async function checkSupportGuestCreateBySession(guestSessionId: string): Promise<KvRateLimitResult> {
  return (await getGuestSupportLimiter()).checkCreateBySession(supportGuestSessionKey(guestSessionId));
}

export async function checkSupportGuestCreateByIp(ip: string): Promise<KvRateLimitResult> {
  return (await getGuestSupportLimiter()).checkCreateByIp(supportGuestIpKey(ip));
}

export async function checkSupportGuestCreateByEmail(email: string): Promise<KvRateLimitResult> {
  return (await getGuestSupportLimiter()).checkCreateByEmail(supportGuestEmailKey(email));
}

export async function checkSupportGuestMessageBySession(guestSessionId: string): Promise<KvRateLimitResult> {
  return (await getGuestSupportLimiter()).checkMessageBySession(supportGuestSessionKey(guestSessionId));
}

export async function checkSupportGuestMessageByIp(ip: string): Promise<KvRateLimitResult> {
  return (await getGuestSupportLimiter()).checkMessageByIp(supportGuestIpKey(ip));
}

export async function checkSupportGuestAiByIp(ip: string): Promise<KvRateLimitResult> {
  return (await getGuestSupportLimiter()).checkAiByIp(supportGuestIpKey(ip));
}

export function _resetGuestSupportLimiterForTests(): void {
  _limiter = null;
}
