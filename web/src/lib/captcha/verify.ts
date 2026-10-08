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

import "server-only";

import { envCaptchaFallback } from "@/lib/captcha/env-fallback";
import { resolveTenantCaptcha } from "@/lib/integrations/resolve";

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
    if (!r.ok) return false;
    const j = (await r.json()) as { success?: boolean; "error-codes"?: string[] };
    return j.success === true;
  } catch {
    return false; // fail CLOSED on network / parse errors
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

export type CaptchaResolver = (tenantId: string) => Promise<{
  provider: "hcaptcha" | "turnstile" | "none";
  getSecret: () => Promise<string | null>;
}>;

/** Same resolution as booking/forms: tenant row, platform DB, then env (final fallback). */
async function resolveFor(
  tenantId: string | null | undefined,
  resolver: CaptchaResolver,
): Promise<{ provider: "hcaptcha" | "turnstile" | "none"; getSecret: () => Promise<string | null> }> {
  if (tenantId) return resolver(tenantId);
  const env = envCaptchaFallback(process.env);
  return { provider: env.provider, getSecret: async () => env.secret };
}

/**
 * Verify a captcha token from a guest submission. Provider + secret come from
 * `resolveTenantCaptcha(tenantId)` (tenant row, platform DB, env last).
 *
 * - No provider resolved: `{ ok: true }` (no-op; honeypot + rate limits remain).
 * - Provider but no token: `captcha_required`.
 * - Provider but missing secret, bad token, or any vendor error: `captcha_failed` (fail CLOSED).
 */
export async function verifyCaptchaToken(opts: {
  token: string | null | undefined;
  ip?: string | null;
  tenantId?: string | null;
  resolver?: CaptchaResolver;
}): Promise<CaptchaVerifyResult> {
  let cfg;
  try {
    cfg = await resolveFor(opts.tenantId, opts.resolver ?? resolveTenantCaptcha);
  } catch {
    return { ok: false, code: "captcha_failed", message: "Challenge failed — please try again." };
  }
  if (cfg.provider === "none") return { ok: true };

  const token = opts.token?.trim() || "";
  if (!token) {
    return {
      ok: false,
      code: "captcha_required",
      message: "Please complete the challenge to continue.",
    };
  }

  let secret: string | null = null;
  try {
    secret = await cfg.getSecret();
  } catch {
    secret = null;
  }
  const success = secret
    ? cfg.provider === "turnstile"
      ? await verifyTurnstile(token, secret, opts.ip ?? null)
      : await verifyHcaptcha(token, secret)
    : false;

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
 * True only when the guest-chat widget is wired (GUEST_CHAT_CAPTCHA_WIDGET_READY=1)
 * AND a provider resolves for this tenant. Velocity escalation stays off otherwise
 * so a guest is never asked for a token they cannot produce.
 */
export async function isGuestCaptchaWidgetReady(
  tenantId: string | null | undefined,
  resolver: CaptchaResolver = resolveTenantCaptcha,
): Promise<boolean> {
  if (process.env.GUEST_CHAT_CAPTCHA_WIDGET_READY !== "1") return false;
  try {
    return (await resolveFor(tenantId, resolver)).provider !== "none";
  } catch {
    return false;
  }
}
