/**
 * rate-limit-kv.ts — Shared cross-instance rate limiter backed by Upstash Redis.
 *
 * This is the S1 anti-abuse floor for the guest conversational-inquiry MVP.
 * It replaces the per-instance in-memory limiter from `inquiry-rate-limiter.ts`
 * for the guest-chat paths (where a distributed view is critical — an abusive
 * guest can easily exhaust per-instance limits by hitting multiple cold starts).
 *
 * ## Env vars (set in Vercel project settings + .env.local for dev)
 *   UPSTASH_REDIS_REST_URL   — e.g. https://your-db.upstash.io
 *   UPSTASH_REDIS_REST_TOKEN — Upstash REST token
 *
 * ## Graceful fallback
 * When either env var is absent (local dev, CI, or before the Upstash project
 * is wired) every check returns { ok: true } — the in-memory limiter in
 * `inquiry-rate-limiter.ts` still provides a within-instance floor for
 * authenticated paths. The no-op fallback is intentional so local dev never
 * requires a Redis connection.
 *
 * ## Algorithm
 * Uses Upstash `@upstash/ratelimit` sliding-window algorithm (time-bucket
 * approximation, atomic Lua, ~2 Redis commands per check). The key is a
 * caller-provided composite string — callers are responsible for namespacing
 * (see `guestRateLimitKey`).
 *
 * ## Usage
 * ```ts
 * const key = guestRateLimitKey({ guestSessionId, ip, email, tenantId });
 *
 * // Guest inquiry-create: 3 new inquiries per 60 minutes per composite key
 * const result = await checkGuestInquiryCreate(key);
 * if (!result.ok) { ... return GuestChatFailure code 'rate_limited' ... }
 *
 * // Guest message-send: 30 messages per 60 seconds per composite key
 * const result = await checkGuestMessageSend(key);
 * if (!result.ok) { ... return GuestChatFailure code 'rate_limited' ... }
 * ```
 *
 * ## Integration points (Lane A must wire these)
 * - `startGuestChatInquiry` (guest-chat-actions.ts): call `checkGuestInquiryCreate`
 *   BEFORE any DB write; return code 'rate_limited' on failure.
 * - `sendGuestMessageAction` (guest-chat-actions.ts): call `checkGuestMessageSend`
 *   BEFORE the engine sendMessage; return code 'rate_limited' on failure.
 */

import type { GuestChatErrorCode } from "@/lib/inquiry/guest-chat-contract";

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export type KvRateLimitResult =
  | { ok: true }
  | {
      ok: false;
      code: Extract<GuestChatErrorCode, "rate_limited">;
      retryAfterMs: number;
    };

// ---------------------------------------------------------------------------
// Key builder
// ---------------------------------------------------------------------------

/**
 * Compose the rate-limit key for a guest action.
 *
 * All four segments contribute to the key so that:
 *   - A single guest session (cookie) can't exceed the limit across IPs.
 *   - A single IP can't bypass by clearing cookies.
 *   - The email adds an extra signal (shared-device / disposable-email chains).
 *   - tenant scoping prevents cross-tenant count pollution.
 *
 * Any null/undefined segment is replaced with "x" to keep keys stable.
 */
export function guestRateLimitKey(segments: {
  guestSessionId: string | null | undefined;
  ip: string | null | undefined;
  email: string | null | undefined;
  tenantId: string | null | undefined;
}): string {
  const s = (v: string | null | undefined) => (v?.trim() || "x").toLowerCase();
  return `guest:${s(segments.tenantId)}:${s(segments.guestSessionId)}:${s(segments.ip)}:${s(segments.email)}`;
}

// ---------------------------------------------------------------------------
// Minimal local interface for the subset of @upstash/ratelimit we use.
// Defined here so we can type-check usage without the package installed.
// ---------------------------------------------------------------------------

interface UpstashRateLimitResponse {
  success: boolean;
  /** Unix epoch ms when the window resets. */
  reset: number;
}

interface UpstashRatelimiterInstance {
  limit(key: string): Promise<UpstashRateLimitResponse>;
}

// ---------------------------------------------------------------------------
// Lazy client + limiter construction (avoid top-level await, tree-shakeable)
// ---------------------------------------------------------------------------

let _limiter: KvLimiter | null = null;

interface KvLimiter {
  checkInquiryCreate(key: string): Promise<KvRateLimitResult>;
  checkMessageSend(key: string): Promise<KvRateLimitResult>;
}

/** No-op fallback used when Upstash env vars are absent. */
const noopLimiter: KvLimiter = {
  async checkInquiryCreate() {
    return { ok: true };
  },
  async checkMessageSend() {
    return { ok: true };
  },
};

/**
 * Attempt to construct the Upstash-backed limiter on first call.
 * Catches all import/init errors and falls back to the no-op limiter so the
 * application never crashes due to a missing/misconfigured Redis project.
 */
async function getLimiter(): Promise<KvLimiter> {
  if (_limiter !== null) return _limiter;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    // Env vars absent — no-op for local dev / CI.
    _limiter = noopLimiter;
    return _limiter;
  }

  try {
    // @upstash/redis and @upstash/ratelimit are declared in package.json.
    // They are imported via require() to avoid static analysis of missing
    // modules during tsc (the packages are installed at deploy time via
    // npm install; they are absent from local node_modules until then).
    // The try/catch ensures a missing module falls through to noopLimiter.
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
        }): UpstashRatelimiterInstance;
        slidingWindow(requests: number, window: string): unknown;
      };
    };

    const redis = new Redis({ url, token });

    // Guest inquiry-create: 3 new inquiries per 60-minute sliding window.
    // Tight — creating a new inquiry is a high-value action; bursty guests
    // are almost always bots or bad-faith actors.
    const inquiryCreateLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(3, "60 m"),
      prefix: "rl:guest_create",
      // Fail open when Redis is unreachable so a Upstash outage doesn't block
      // legitimate guest inquiries (L0 honeypot + per-instance limiter are
      // still active).
      analytics: false,
    });

    // Guest message-send: 30 messages per 60-second sliding window.
    // Generous enough for a real back-and-forth but kills message flooding.
    const messageSendLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, "60 s"),
      prefix: "rl:guest_msg",
      analytics: false,
    });

    _limiter = {
      async checkInquiryCreate(key: string): Promise<KvRateLimitResult> {
        try {
          const r = await inquiryCreateLimiter.limit(key);
          if (r.success) return { ok: true };
          const retryAfterMs = Math.max(0, r.reset - Date.now());
          return { ok: false, code: "rate_limited", retryAfterMs };
        } catch {
          // Fail open on Redis error.
          return { ok: true };
        }
      },

      async checkMessageSend(key: string): Promise<KvRateLimitResult> {
        try {
          const r = await messageSendLimiter.limit(key);
          if (r.success) return { ok: true };
          const retryAfterMs = Math.max(0, r.reset - Date.now());
          return { ok: false, code: "rate_limited", retryAfterMs };
        } catch {
          // Fail open on Redis error.
          return { ok: true };
        }
      },
    };
  } catch {
    // Package not installed or import failed — fall back to no-op.
    _limiter = noopLimiter;
  }

  return _limiter;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether a guest is allowed to CREATE a new inquiry.
 *
 * Limit: 3 new inquiries per 60 minutes (sliding window, cross-instance).
 * Falls back to allow when Upstash is unconfigured or unreachable.
 *
 * @param key Composite key from `guestRateLimitKey(...)`.
 */
export async function checkGuestInquiryCreate(key: string): Promise<KvRateLimitResult> {
  const limiter = await getLimiter();
  return limiter.checkInquiryCreate(key);
}

/**
 * Check whether a guest is allowed to SEND a message to an existing inquiry.
 *
 * Limit: 30 messages per 60 seconds (sliding window, cross-instance).
 * Falls back to allow when Upstash is unconfigured or unreachable.
 *
 * @param key Composite key from `guestRateLimitKey(...)`.
 */
export async function checkGuestMessageSend(key: string): Promise<KvRateLimitResult> {
  const limiter = await getLimiter();
  return limiter.checkMessageSend(key);
}

/**
 * Expose the limiter singleton reset for tests.
 * Call this in `beforeEach` when you stub getLimiter.
 * @internal
 */
export function _resetLimiterSingletonForTests(): void {
  _limiter = null;
}
