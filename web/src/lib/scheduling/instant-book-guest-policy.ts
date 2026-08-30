/**
 * Pure guest-instant policy. No I/O. The action wires captcha + KV + identity.
 */

export type GuestInstantPolicy =
  | { ok: true; path: "session" | "guest" }
  | {
      ok: false;
      reason: "needs_auth" | "captcha_failed" | "captcha_required" | "rate_limited" | "validation";
    };

export function evaluateGuestInstantPolicy(input: {
  signedIn: boolean;
  requireAccount: boolean;
  hasEmail: boolean;
  captchaConfigured: boolean;
  /** null = token missing; true/false = verify result. Ignored when not configured. */
  captchaOk: boolean | null;
  rateLimited: boolean;
}): GuestInstantPolicy {
  if (input.signedIn) return { ok: true, path: "session" };
  if (input.requireAccount) return { ok: false, reason: "needs_auth" };
  if (!input.hasEmail) return { ok: false, reason: "validation" };
  if (input.rateLimited) return { ok: false, reason: "rate_limited" };
  if (input.captchaConfigured) {
    if (input.captchaOk === null) return { ok: false, reason: "captcha_required" };
    if (input.captchaOk === false) return { ok: false, reason: "captcha_failed" };
  }
  return { ok: true, path: "guest" };
}
