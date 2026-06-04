/**
 * captcha/verify.ts — Unified server-side captcha token verifier.
 *
 * This is the S3 anti-abuse layer for the guest conversational-inquiry MVP.
 * Reuses the exact env-var pattern from `web/src/app/api/cms/forms/submit/route.ts`
 * (HCAPTCHA_SECRET / TURNSTILE_SECRET) so no new env vars are introduced.
 *
 * ## Supported providers (priority order)
 *   1. Cloudflare Turnstile (TURNSTILE_SECRET) — preferred for Vercel Edge
 *   2. hCaptcha            (HCAPTCHA_SECRET)   — legacy / existing config
 *
 * ## Env vars
 *   TURNSTILE_SECRET  — Cloudflare Turnstile secret key
 *   HCAPTCHA_SECRET   — hCaptcha secret key
 *
 * ## Behaviour
 *   - When neither secret is configured: returns { ok: true } — no-op.
 *     This is deliberate: a misconfigured tenant still gets submissions through.
 *     The honeypot + KV rate-limit are the real floor.
 *   - When the token is absent but a secret is configured:
 *     returns { ok: false, code: "captcha_required" } so the UI can surface
 *     the challenge widget on the next render.
 *   - When the token is present but fails verification:
 *     returns { ok: false, code: "captcha_failed" } — treated as an invalid
 *     submission (map to "validation_failed" in the action layer if needed).
 *
 * ## Velocity guard (S3)
 * The velocity guard logic lives in `guest-abuse-guard.ts`. This module only
 * handles the token-verification half. The decision of WHEN to require a
 * captcha (e.g. after N velocity events) is made by the caller.
 *
 * ## Usage
 * ```ts
 * import { verifyCaptchaToken } from "@/lib/captcha/verify";
 *
 * const captchaResult = await verifyCaptchaToken({
 *   token: input.captchaToken ?? null,
 *   ip,
 * });
 * if (!captchaResult.ok) {
 *   return { ok: false, code: captchaResult.code, message: captchaResult.message };
 * }
 * ```
 *
 * ## Integration points (Lane A must wire this)
 * - `startGuestChatInquiry` (guest-chat-actions.ts): when the velocity guard
 *   returns `captcha_required`, surface that code to the UI. On the next call
 *   the UI includes `captchaToken`; pass it to `verifyCaptchaToken` before
 *   proceeding with the inquiry creation.
 * - `sendGuestMessageAction` (guest-chat-actions.ts): same pattern — optional,
 *   only triggered when the velocity guard trips.
 */

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type CaptchaVerifyResult =
  | { ok: true }
  | {
      ok: false;
      /** "captcha_required" = no token provided but captcha is active. */
      code: "captcha_required" | "captcha_failed";
      message: string;
    };

// ---------------------------------------------------------------------------
// Provider-level verifiers (private)
// ---------------------------------------------------------------------------

async function verifyTurnstile(token: string, secret: string, ip: string | null): Promise<boolean> {
  try {
    const params = new URLSearchParams({ secret, response: token });
    if (ip) params.set("remoteip", ip);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    const j = (await r.json()) as { success?: boolean };
    return j.success === true;
  } catch {
    return false;
  }
}

async function verifyHcaptcha(token: string, secret: string): Promise<boolean> {
  try {
    const r = await fetch("https://api.hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
    });
    const j = (await r.json()) as { success?: boolean };
    return j.success === true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Verify a captcha token from a guest form submission.
 *
 * @param opts.token   The token from the client (null/empty = not provided).
 * @param opts.ip      Visitor IP for Turnstile's remoteip hint (optional).
 *
 * Returns `{ ok: true }` when:
 *   - No captcha provider is configured (env vars absent) — no-op.
 *   - The token verifies successfully.
 *
 * Returns `{ ok: false, code: "captcha_required" }` when a provider is
 * configured but no token was submitted. The UI should surface the widget.
 *
 * Returns `{ ok: false, code: "captcha_failed" }` when the token is present
 * but fails server-side verification.
 */
export async function verifyCaptchaToken(opts: {
  token: string | null | undefined;
  ip?: string | null;
}): Promise<CaptchaVerifyResult> {
  const turnstileSecret = process.env.TURNSTILE_SECRET;
  const hcaptchaSecret = process.env.HCAPTCHA_SECRET;

  const captchaConfigured = !!(turnstileSecret || hcaptchaSecret);

  if (!captchaConfigured) {
    // No-op: local dev / tenant has not configured a captcha provider.
    return { ok: true };
  }

  const token = opts.token?.trim() || "";

  if (!token) {
    return {
      ok: false,
      code: "captcha_required",
      message: "Please complete the challenge to continue.",
    };
  }

  // Prefer Turnstile if configured; fall back to hCaptcha.
  let success = false;
  if (turnstileSecret) {
    success = await verifyTurnstile(token, turnstileSecret, opts.ip ?? null);
  } else if (hcaptchaSecret) {
    success = await verifyHcaptcha(token, hcaptchaSecret);
  }

  if (!success) {
    return {
      ok: false,
      code: "captcha_failed",
      message: "Challenge failed — please try again.",
    };
  }

  return { ok: true };
}

/**
 * Returns true when at least one captcha provider is currently configured.
 * Useful for the UI to decide whether to render the challenge widget.
 */
export function isCaptchaConfigured(): boolean {
  return !!(process.env.TURNSTILE_SECRET || process.env.HCAPTCHA_SECRET);
}
