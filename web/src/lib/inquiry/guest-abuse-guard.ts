/**
 * guest-abuse-guard.ts — Layered anti-abuse floor for guest chat actions.
 *
 * This is the wiring module that composes all three anti-abuse layers (S1, S2,
 * S3) into a single, callable guard function. Lane A's guest-chat-actions.ts
 * calls these functions before any DB write.
 *
 * ## Layers (in evaluation order)
 *
 *   L0 — Honeypot check (synchronous, zero cost)
 *       A hidden form field named differently from real fields. Populated value
 *       ⇒ silent reject (bot). The UI renders an off-screen, aria-hidden input
 *       per the contract; its value flows through StartGuestChatInput.honeypot
 *       and SendGuestMessageInput.honeypot.
 *
 *   L1 — Disposable email block (synchronous, set membership, S2)
 *       Only applies to startGuestChatInquiry (email collected on first send).
 *       Returns GuestChatFailure code "disposable_email".
 *
 *   L2 — KV rate-limit check (async, cross-instance, S1)
 *       Different limits for inquiry-create vs message-send. Returns
 *       GuestChatFailure code "rate_limited" with retryAfterMs.
 *
 *   L3 — Velocity-triggered captcha (S3)
 *       Applied after KV limit is NOT tripped but velocity is elevated.
 *       The velocity counter increments every send; if it exceeds the
 *       `VELOCITY_THRESHOLD` the guard requires a captcha ONLY when a real client
 *       widget is wired (isGuestCaptchaWidgetReady — a configured provider secret
 *       AND GUEST_CHAT_CAPTCHA_WIDGET_READY=1). Until then the escalation is a
 *       no-op: the MVP captcha slot is an inert stub, so returning
 *       "captcha_required" would permanently soft-brick a tripped guest (no token
 *       can be produced). When the widget IS ready, on the next call the client
 *       includes the token; we verify it and allow through (or return
 *       "captcha_failed" mapped to "validation_failed"). The IP/email/session KV
 *       ceilings are the actual hard floor.
 *
 * ## IP dimension
 * The caller (guest-chat-actions.resolveClientIp) resolves the TRUSTED client
 * IP server-side — the platform-set x-real-ip / the rightmost (Vercel-appended)
 * x-forwarded-for hop, NOT the spoofable leftmost hop. Pass `null` when
 * unavailable (the IP dimension is then absent from the keys; session+email
 * limits still apply).
 *
 * ## Usage (Lane A — guest-chat-actions.ts)
 * ```ts
 * // In startGuestChatInquiry:
 * const guard = await checkGuestInquiryAbuse({
 *   honeypot: input.honeypot,
 *   email: input.contactEmail,
 *   guestSessionId,          // resolved from x-impronta-guest cookie
 *   ip,                      // from x-forwarded-for header
 *   tenantId,                // from resolved tenant scope
 *   captchaToken: input.captchaToken,
 * });
 * if (!guard.ok) return guard; // GuestChatFailure — shape matches action result
 *
 * // In sendGuestMessageAction:
 * const guard = await checkGuestMessageAbuse({
 *   honeypot: input.honeypot,
 *   guestSessionId,
 *   ip,
 *   tenantId,
 *   captchaToken: input.captchaToken,
 * });
 * if (!guard.ok) return guard;
 * ```
 */

import { isDisposableEmail } from "@/lib/email/disposable";
import {
  checkGuestInquiryCreate,
  checkGuestInquiryCreateByIp,
  checkGuestInquiryCreateByEmail,
  checkGuestMessageSend,
  guestRateLimitKey,
  guestCreateIpKey,
  guestCreateEmailKey,
  normalizeEmailForKey,
} from "@/lib/rate-limit-kv";
import { verifyCaptchaToken, isGuestCaptchaWidgetReady } from "@/lib/captcha/verify";
import type { GuestChatFailure } from "@/lib/inquiry/guest-chat-contract";

// ---------------------------------------------------------------------------
// Velocity tracking (in-memory, per-instance, best-effort)
// ---------------------------------------------------------------------------
//
// This supplements the KV rate limiter: once a guest's submit rate exceeds
// VELOCITY_THRESHOLD within the current runtime instance, we require a
// captcha on the next send. Unlike the KV limiter (which is a hard block),
// this is a soft escalation that adds friction without a global Redis lookup
// for every request.
//
// Limitation: in-memory only — each cold start resets. The KV limiter is the
// hard ceiling; this is just a friction layer for bursty sends within a single
// runtime.

const VELOCITY_THRESHOLD = 8; // sends within the window that trigger a captcha prompt
const VELOCITY_WINDOW_MS = 60_000; // 1 minute

const velocityBuckets = new Map<string, { count: number; windowStart: number }>();

function incrementVelocity(key: string): number {
  const now = Date.now();
  const b = velocityBuckets.get(key);
  if (!b || now - b.windowStart > VELOCITY_WINDOW_MS) {
    velocityBuckets.set(key, { count: 1, windowStart: now });
    return 1;
  }
  b.count += 1;
  return b.count;
}

function peekVelocity(key: string): number {
  const now = Date.now();
  const b = velocityBuckets.get(key);
  if (!b || now - b.windowStart > VELOCITY_WINDOW_MS) return 0;
  return b.count;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function honeypotTripped(honeypot: string | null | undefined): boolean {
  return typeof honeypot === "string" && honeypot.trim().length > 0;
}

/** Map captcha verify failure to the appropriate GuestChatFailure. */
function captchaFailure(
  code: "captcha_required" | "captcha_failed",
  message: string,
): GuestChatFailure {
  if (code === "captcha_required") {
    return { ok: false, code: "captcha_required", message };
  }
  // captcha_failed maps to validation_failed per the contract error vocabulary
  return {
    ok: false,
    code: "validation_failed",
    message,
    missingFields: ["captchaToken"],
  };
}

// ---------------------------------------------------------------------------
// Public API — inquiry create guard
// ---------------------------------------------------------------------------

export interface GuestInquiryAbuseArgs {
  /** StartGuestChatInput.honeypot — must be empty. */
  honeypot: string | null | undefined;
  /** Guest's submitted email — checked for disposable domain. */
  email: string;
  /** Resolved guest_sessions.id (from cookie, server-side). */
  guestSessionId: string | null | undefined;
  /** Client IP from x-forwarded-for[0]. */
  ip: string | null | undefined;
  /** Resolved agency tenant id. */
  tenantId: string | null | undefined;
  /** Optional Turnstile/hCaptcha token when a challenge was shown (S3). */
  captchaToken: string | null | undefined;
}

/**
 * Run the full L0–L3 abuse-check stack for a NEW inquiry creation.
 *
 * Returns `{ ok: true }` when all checks pass.
 * Returns a `GuestChatFailure` (partial — the action adds `ok: false`)
 * on the first failing layer.
 *
 * Evaluation order: honeypot → disposable email → KV rate-limit →
 *   velocity-captcha (only when captcha provider is configured).
 */
export async function checkGuestInquiryAbuse(
  args: GuestInquiryAbuseArgs,
): Promise<{ ok: true } | GuestChatFailure> {
  // L0 — Honeypot
  if (honeypotTripped(args.honeypot)) {
    // Silent reject — return a success-shaped response to avoid fingerprinting.
    // Bots must not discover they've been blocked.
    return { ok: true };
  }

  // L1 — Disposable email
  if (isDisposableEmail(args.email)) {
    return {
      ok: false,
      code: "disposable_email",
      message: "Please use a non-disposable email address to send an inquiry.",
    };
  }

  // Normalize the email once: it feeds both the composite key's email segment
  // and the dedicated per-email ceiling (so +tag / gmail-dot variants collide).
  const normalizedEmail = normalizeEmailForKey(args.email);

  const kvKey = guestRateLimitKey({
    guestSessionId: args.guestSessionId,
    ip: args.ip,
    email: normalizedEmail,
    tenantId: args.tenantId,
  });

  // L2 — KV rate-limit (hard ceiling). The composite/session key is rotatable
  // (the guest cookie is client-controlled), so we ALSO evaluate IP- and
  // email-keyed ceilings that bind to dimensions the client can't cheaply
  // rotate. ANY of the three tripping rejects the create. The composite key is
  // kept for its tighter (tenant+session+ip+email) granularity when the cookie
  // is stable.
  const rlChecks = await Promise.all([
    checkGuestInquiryCreate(kvKey),
    checkGuestInquiryCreateByIp(guestCreateIpKey(args.tenantId, args.ip)),
    checkGuestInquiryCreateByEmail(guestCreateEmailKey(args.tenantId, normalizedEmail)),
  ]);
  const tripped = rlChecks.find((r) => !r.ok);
  if (tripped && !tripped.ok) {
    return {
      ok: false,
      code: "rate_limited",
      message: "You've sent too many inquiries recently. Please wait before trying again.",
      retryAfterMs: tripped.retryAfterMs,
    };
  }

  // L3 — Velocity-triggered captcha (soft escalation). ONLY escalate when a real
  // client widget is wired (isGuestCaptchaWidgetReady) — otherwise a tripped
  // guest receives captcha_required with no way to produce a token and is
  // permanently soft-bricked. While the widget is a stub this is a no-op; the
  // IP/email/session KV ceilings above remain the hard floor.
  const velocityCount = incrementVelocity(kvKey);
  if (velocityCount > VELOCITY_THRESHOLD && isGuestCaptchaWidgetReady()) {
    const captchaResult = await verifyCaptchaToken({
      token: args.captchaToken,
      ip: args.ip,
    });
    if (!captchaResult.ok) {
      return captchaFailure(captchaResult.code, captchaResult.message);
    }
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Public API — message send guard
// ---------------------------------------------------------------------------

export interface GuestMessageAbuseArgs {
  /** SendGuestMessageInput.honeypot — must be empty. */
  honeypot: string | null | undefined;
  /** Resolved guest_sessions.id (from cookie, server-side). */
  guestSessionId: string | null | undefined;
  /** Client IP from x-forwarded-for[0]. */
  ip: string | null | undefined;
  /** Resolved agency tenant id. */
  tenantId: string | null | undefined;
  /**
   * The email associated with this guest's account (if known).
   * Used for the KV key — may be null for anonymous sessions.
   */
  email: string | null | undefined;
  /** Optional Turnstile/hCaptcha token when a challenge was shown (S3). */
  captchaToken: string | null | undefined;
}

/**
 * Run the L0/L2/L3 abuse-check stack for a FOLLOW-UP message send.
 * (L1 disposable email is NOT re-checked — already gated at inquiry create.)
 *
 * Returns `{ ok: true }` when all checks pass.
 * Returns a `GuestChatFailure` on the first failing layer.
 *
 * Evaluation order: honeypot → KV rate-limit → velocity-captcha.
 */
export async function checkGuestMessageAbuse(
  args: GuestMessageAbuseArgs,
): Promise<{ ok: true } | GuestChatFailure> {
  // L0 — Honeypot
  if (honeypotTripped(args.honeypot)) {
    return { ok: true }; // Silent reject
  }

  // Message-send is already bounded by the inquiry ownership gate (a guest can
  // only send to an inquiry their cookie owns; rotating the cookie loses that
  // ownership), so the composite key is sufficient here — no separate IP/email
  // create-ceiling. We still normalize the email for key consistency.
  const kvKey = guestRateLimitKey({
    guestSessionId: args.guestSessionId,
    ip: args.ip,
    email: normalizeEmailForKey(args.email),
    tenantId: args.tenantId,
  });

  // L2 — KV rate-limit (hard ceiling)
  const rlResult = await checkGuestMessageSend(kvKey);
  if (!rlResult.ok) {
    return {
      ok: false,
      code: "rate_limited",
      message: "You're sending messages too quickly. Please wait before trying again.",
      retryAfterMs: rlResult.retryAfterMs,
    };
  }

  // L3 — Velocity-triggered captcha (soft escalation). Gated on a real wired
  // widget (isGuestCaptchaWidgetReady) so we never return captcha_required to a
  // guest who can't produce a token (permanent soft-brick). No-op while the
  // widget is a stub.
  const velocityCount = incrementVelocity(kvKey);
  if (velocityCount > VELOCITY_THRESHOLD && isGuestCaptchaWidgetReady()) {
    const captchaResult = await verifyCaptchaToken({
      token: args.captchaToken,
      ip: args.ip,
    });
    if (!captchaResult.ok) {
      return captchaFailure(captchaResult.code, captchaResult.message);
    }
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Exported for observability tests
// ---------------------------------------------------------------------------

/**
 * Peek at the current velocity count for a given composite key.
 * Only useful in unit tests that need to drive the velocity to threshold.
 * @internal
 */
export { peekVelocity as _peekVelocityForTests };

/**
 * Reset the velocity bucket for a given key (test isolation).
 * @internal
 */
export function _resetVelocityBucketForTests(key: string): void {
  velocityBuckets.delete(key);
}
