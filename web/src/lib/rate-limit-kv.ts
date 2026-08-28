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

/**
 * The only failure code this module reports. Declared as its own literal rather
 * than `Extract<GuestChatErrorCode, "rate_limited">` so NON-guest callers (auth
 * OTP, below) can consume the verdict without importing the guest-chat
 * contract — the limiter is shared infrastructure, not a guest-chat detail.
 */
export type KvRateLimitCode = "rate_limited";

export type KvRateLimitResult =
  | { ok: true }
  | {
      ok: false;
      code: KvRateLimitCode;
      retryAfterMs: number;
    };

/**
 * Compile-time guarantee that guest-chat callers can still hand this verdict
 * straight back as a `GuestChatFailure` (they did so when the code was typed
 * from their contract). If `GuestChatErrorCode` ever stops including
 * "rate_limited", this line stops compiling instead of failing at runtime.
 */
const _guestChatStillAcceptsKvCode: GuestChatErrorCode =
  "rate_limited" satisfies KvRateLimitCode;
void _guestChatStillAcceptsKvCode;

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
 *
 * ⚠️ This composite is only as strong as its WEAKEST segment for an attacker
 * who can rotate one dimension. The guest session id is a client-rotatable
 * cookie, so a per-request fresh session yields a brand-new composite key every
 * time and the window never accumulates. Do NOT rely on this key alone for the
 * inquiry-create ceiling — evaluate the IP- and email-keyed limits below IN
 * ADDITION (they bind to dimensions the client can't cheaply rotate).
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

/**
 * Normalize an email for rate-limit keying so trivially-distinct addresses that
 * deliver to the SAME inbox share one bucket:
 *   - lowercased + trimmed
 *   - the +tag (everything from the first '+' in the local part) is stripped
 *   - for Gmail / Googlemail, dots in the local part are removed (Gmail ignores
 *     them), so a.b.c@gmail.com and abc@gmail.com key identically
 * Returns null for a malformed/empty address (no email dimension to key on).
 */
export function normalizeEmailForKey(email: string | null | undefined): string | null {
  const trimmed = (email ?? "").trim().toLowerCase();
  if (!trimmed) return null;
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return null;
  let local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  // Strip +tag.
  const plus = local.indexOf("+");
  if (plus >= 0) local = local.slice(0, plus);
  // Gmail ignores dots in the local part.
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.replace(/\./g, "");
  }
  if (!local) return null;
  return `${local}@${domain}`;
}

/**
 * Per-IP inquiry-create key — bound to the TRUSTED client IP (resolved
 * server-side from the platform-appended x-forwarded-for hop). A guest can't
 * rotate this without a new network path, so it survives cookie rotation.
 */
export function guestCreateIpKey(tenantId: string | null | undefined, ip: string | null | undefined): string {
  const s = (v: string | null | undefined) => (v?.trim() || "x").toLowerCase();
  return `guest_create_ip:${s(tenantId)}:${s(ip)}`;
}

/**
 * Per-email inquiry-create key — bound to the NORMALIZED email. Survives cookie
 * rotation (the abuser would have to burn a fresh, non-aliased mailbox per 3
 * inquiries).
 */
export function guestCreateEmailKey(tenantId: string | null | undefined, normalizedEmail: string | null | undefined): string {
  const s = (v: string | null | undefined) => (v?.trim() || "x").toLowerCase();
  return `guest_create_email:${s(tenantId)}:${s(normalizedEmail)}`;
}

// ---------------------------------------------------------------------------
// Auth OTP keys (passwordless email-code sign-in)
// ---------------------------------------------------------------------------

/**
 * Auth-OTP keys are deliberately NOT tenant-scoped.
 *
 * The same Supabase identity backend serves every host, and the cost being
 * limited (a sent email, a verify attempt against one address) is global. If
 * these keys carried a tenant segment, an abuser would get a fresh budget per
 * tenant host — turning the limit into "N × number of tenants".
 *
 * Emails go through `normalizeEmailForKey` so +tag and Gmail-dot aliases share
 * one bucket. That matters more here than for guest chat: a send COSTS an
 * outbound email, and `a+1@gmail.com … a+99@gmail.com` all reach one inbox.
 */
function authKeySegment(v: string | null | undefined): string {
  return (v?.trim() || "x").toLowerCase();
}

/** Per-address OTP SEND key (an email is dispatched — the expensive direction). */
export function authOtpSendEmailKey(email: string | null | undefined): string {
  return `auth_otp_send_email:${authKeySegment(normalizeEmailForKey(email))}`;
}

/** Per-IP OTP SEND key. Looser (NAT/office/household share an IP) but survives address rotation. */
export function authOtpSendIpKey(ip: string | null | undefined): string {
  return `auth_otp_send_ip:${authKeySegment(ip)}`;
}

/** Per-address OTP VERIFY key — the brute-force dimension (guessing a 6-digit code). */
export function authOtpVerifyEmailKey(email: string | null | undefined): string {
  return `auth_otp_verify_email:${authKeySegment(normalizeEmailForKey(email))}`;
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
  /** Per-IP inquiry-create ceiling (looser, survives cookie rotation). */
  checkInquiryCreateByIp(key: string): Promise<KvRateLimitResult>;
  /** Per-email inquiry-create ceiling (tight, survives cookie rotation). */
  checkInquiryCreateByEmail(key: string): Promise<KvRateLimitResult>;
  checkMessageSend(key: string): Promise<KvRateLimitResult>;
  /** Auth OTP: sends per normalized email address. */
  checkAuthOtpSendByEmail(key: string): Promise<KvRateLimitResult>;
  /** Auth OTP: sends per client IP. */
  checkAuthOtpSendByIp(key: string): Promise<KvRateLimitResult>;
  /** Auth OTP: verify attempts per normalized email address. */
  checkAuthOtpVerifyByEmail(key: string): Promise<KvRateLimitResult>;
  /** Support tickets: 5 creates / 60 min / user. */
  checkSupportTicketCreate(key: string): Promise<KvRateLimitResult>;
  /** Support messages: 30 / 60 min / user. */
  checkSupportMessageSend(key: string): Promise<KvRateLimitResult>;
  /** Public booking slots: 60 / 60 s / IP. */
  checkBookingSlots(key: string): Promise<KvRateLimitResult>;
}

/** No-op fallback used when Upstash env vars are absent. */
const noopLimiter: KvLimiter = {
  async checkInquiryCreate() {
    return { ok: true };
  },
  async checkInquiryCreateByIp() {
    return { ok: true };
  },
  async checkInquiryCreateByEmail() {
    return { ok: true };
  },
  async checkMessageSend() {
    return { ok: true };
  },
  async checkAuthOtpSendByEmail() {
    return { ok: true };
  },
  async checkAuthOtpSendByIp() {
    return { ok: true };
  },
  async checkAuthOtpVerifyByEmail() {
    return { ok: true };
  },
  async checkSupportTicketCreate() {
    return { ok: true };
  },
  async checkSupportMessageSend() {
    return { ok: true };
  },
  async checkBookingSlots() {
    return { ok: true };
  },
};

/**
 * One-time loud warning when the limiter falls back to noop in production. The
 * Upstash KV is the cross-instance "hard ceiling" for the guest-chat floor; if
 * its env is unset on prod the floor is effectively down (only the per-instance
 * in-memory engine limiter + honeypot + disposable-email list remain). We log
 * once (not per request) so a missing-env regression is visible, and never
 * crash — a hard-fail would take the whole guest path down.
 */
let _warnedNoopInProd = false;
function warnNoopInProductionOnce(): void {
  if (_warnedNoopInProd) return;
  _warnedNoopInProd = true;
  if (process.env.NODE_ENV === "production") {
    // eslint-disable-next-line no-console
    console.error(
      "[rate-limit-kv] UPSTASH_REDIS_REST_URL/TOKEN are UNSET in production — " +
        "the guest-chat cross-instance rate-limit floor is DISABLED (no-op). " +
        "The inquiry-create hard ceiling is not enforced. Provision the Upstash " +
        "env vars in the Vercel project to restore the floor.",
    );
  }
}

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
    // Env vars absent — no-op for local dev / CI. In production this means the
    // hard ceiling is down: warn loudly (once) so it isn't silently disabled.
    warnNoopInProductionOnce();
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

    // Per-IP inquiry-create: 12 per 60-minute sliding window. Looser than the
    // per-email/per-session limit because an IP can legitimately be shared (NAT,
    // office, household), but still kills a single-source flood that rotates the
    // session cookie. Bound to the platform-trusted client IP.
    const inquiryCreateIpLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(12, "60 m"),
      prefix: "rl:guest_create_ip",
      analytics: false,
    });

    // Per-email inquiry-create: 3 per 60-minute sliding window. The email is a
    // precise identity; this survives cookie rotation (a fresh non-aliased
    // mailbox is required per 3 inquiries).
    const inquiryCreateEmailLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(3, "60 m"),
      prefix: "rl:guest_create_email",
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

    // ── Auth OTP (passwordless email-code sign-in) ───────────────────────────
    // Budgets intentionally MATCH the in-memory counter in app/auth/otp-actions.ts
    // (5 sends/email, 20 sends/IP, 10 verifies/email per 15 min). The point of
    // moving them here is not to tighten the numbers, it is to make them mean
    // what they say: the in-memory counter is per Node/Edge instance and resets
    // on cold start, so the real budget was silently multiplied by instance
    // count. These windows are cross-instance and survive cold starts.
    const authOtpSendEmailLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "15 m"),
      prefix: "rl:auth_otp_send_email",
      analytics: false,
    });

    const authOtpSendIpLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, "15 m"),
      prefix: "rl:auth_otp_send_ip",
      analytics: false,
    });

    const authOtpVerifyEmailLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "15 m"),
      prefix: "rl:auth_otp_verify_email",
      analytics: false,
    });

    const supportTicketCreateLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "60 m"),
      prefix: "rl:support_ticket_create",
      analytics: false,
    });

    const supportMessageSendLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, "60 m"),
      prefix: "rl:support_message_send",
      analytics: false,
    });

    const bookingSlotsLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, "1 m"),
      prefix: "rl:booking_slots",
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

      async checkInquiryCreateByIp(key: string): Promise<KvRateLimitResult> {
        try {
          const r = await inquiryCreateIpLimiter.limit(key);
          if (r.success) return { ok: true };
          const retryAfterMs = Math.max(0, r.reset - Date.now());
          return { ok: false, code: "rate_limited", retryAfterMs };
        } catch {
          return { ok: true };
        }
      },

      async checkInquiryCreateByEmail(key: string): Promise<KvRateLimitResult> {
        try {
          const r = await inquiryCreateEmailLimiter.limit(key);
          if (r.success) return { ok: true };
          const retryAfterMs = Math.max(0, r.reset - Date.now());
          return { ok: false, code: "rate_limited", retryAfterMs };
        } catch {
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

      async checkAuthOtpSendByEmail(key: string): Promise<KvRateLimitResult> {
        try {
          const r = await authOtpSendEmailLimiter.limit(key);
          if (r.success) return { ok: true };
          return { ok: false, code: "rate_limited", retryAfterMs: Math.max(0, r.reset - Date.now()) };
        } catch {
          // Fail open: an Upstash outage must not lock people out of signing in.
          // The in-memory counter in otp-actions.ts remains as the floor.
          return { ok: true };
        }
      },

      async checkAuthOtpSendByIp(key: string): Promise<KvRateLimitResult> {
        try {
          const r = await authOtpSendIpLimiter.limit(key);
          if (r.success) return { ok: true };
          return { ok: false, code: "rate_limited", retryAfterMs: Math.max(0, r.reset - Date.now()) };
        } catch {
          return { ok: true };
        }
      },

      async checkAuthOtpVerifyByEmail(key: string): Promise<KvRateLimitResult> {
        try {
          const r = await authOtpVerifyEmailLimiter.limit(key);
          if (r.success) return { ok: true };
          return { ok: false, code: "rate_limited", retryAfterMs: Math.max(0, r.reset - Date.now()) };
        } catch {
          return { ok: true };
        }
      },

      async checkSupportTicketCreate(key: string): Promise<KvRateLimitResult> {
        try {
          const r = await supportTicketCreateLimiter.limit(key);
          if (r.success) return { ok: true };
          return { ok: false, code: "rate_limited", retryAfterMs: Math.max(0, r.reset - Date.now()) };
        } catch {
          return { ok: true };
        }
      },

      async checkSupportMessageSend(key: string): Promise<KvRateLimitResult> {
        try {
          const r = await supportMessageSendLimiter.limit(key);
          if (r.success) return { ok: true };
          return { ok: false, code: "rate_limited", retryAfterMs: Math.max(0, r.reset - Date.now()) };
        } catch {
          return { ok: true };
        }
      },

      async checkBookingSlots(key: string): Promise<KvRateLimitResult> {
        try {
          const r = await bookingSlotsLimiter.limit(key);
          if (r.success) return { ok: true };
          return { ok: false, code: "rate_limited", retryAfterMs: Math.max(0, r.reset - Date.now()) };
        } catch {
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
 * Per-IP inquiry-create ceiling. Evaluated IN ADDITION to the composite/session
 * limit so cookie rotation can't grant unlimited creation. Limit: 12 / 60 min.
 *
 * @param key Key from `guestCreateIpKey(tenantId, ip)`.
 */
export async function checkGuestInquiryCreateByIp(key: string): Promise<KvRateLimitResult> {
  const limiter = await getLimiter();
  return limiter.checkInquiryCreateByIp(key);
}

/**
 * Per-email inquiry-create ceiling. Evaluated IN ADDITION to the session limit.
 * Limit: 3 / 60 min on the NORMALIZED email.
 *
 * @param key Key from `guestCreateEmailKey(tenantId, normalizedEmail)`.
 */
export async function checkGuestInquiryCreateByEmail(key: string): Promise<KvRateLimitResult> {
  const limiter = await getLimiter();
  return limiter.checkInquiryCreateByEmail(key);
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
 * Auth OTP — can this ADDRESS be sent another code? 5 / 15 min on the
 * normalized email. Cross-instance, unlike the in-process counter it backstops.
 *
 * @param key Key from `authOtpSendEmailKey(email)`.
 */
export async function checkAuthOtpSendByEmail(key: string): Promise<KvRateLimitResult> {
  const limiter = await getLimiter();
  return limiter.checkAuthOtpSendByEmail(key);
}

/**
 * Auth OTP — can this IP send another code? 20 / 15 min. Looser than per-email
 * (shared NAT is legitimate) but it survives address rotation.
 *
 * @param key Key from `authOtpSendIpKey(ip)`.
 */
export async function checkAuthOtpSendByIp(key: string): Promise<KvRateLimitResult> {
  const limiter = await getLimiter();
  return limiter.checkAuthOtpSendByIp(key);
}

/**
 * Auth OTP — can this ADDRESS attempt another verify? 10 / 15 min. This is the
 * brute-force ceiling on guessing a 6-digit code.
 *
 * @param key Key from `authOtpVerifyEmailKey(email)`.
 */
export async function checkAuthOtpVerifyByEmail(key: string): Promise<KvRateLimitResult> {
  const limiter = await getLimiter();
  return limiter.checkAuthOtpVerifyByEmail(key);
}

/** Support tickets: 5 new tickets per 60 minutes per user. */
export async function checkSupportTicketCreate(userId: string): Promise<KvRateLimitResult> {
  const limiter = await getLimiter();
  return limiter.checkSupportTicketCreate(`support_ticket:${userId}`);
}

/** Support messages: 30 per 60 minutes per user. */
export async function checkSupportMessageSend(userId: string): Promise<KvRateLimitResult> {
  const limiter = await getLimiter();
  return limiter.checkSupportMessageSend(`support_msg:${userId}`);
}

/** Public booking slots: 60 requests per minute per trusted client IP. */
export async function checkBookingSlots(ip: string): Promise<KvRateLimitResult> {
  const limiter = await getLimiter();
  const key = (ip.trim() || "x").toLowerCase();
  return limiter.checkBookingSlots(`booking_slots:${key}`);
}

/**
 * Expose the limiter singleton reset for tests.
 * Call this in `beforeEach` when you stub getLimiter.
 * @internal
 */
export function _resetLimiterSingletonForTests(): void {
  _limiter = null;
}
