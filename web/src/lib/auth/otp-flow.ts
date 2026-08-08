/**
 * P4 — passwordless-first email auth for the CLIENT (booker) intent.
 *
 * WHY this module exists: a person booking talent should almost never meet a
 * password form. Passwords cost abandoned bookings and support cycles, and a
 * one-time email code is the same flow a future mobile app needs with no new
 * backend. So `/register?as=client` (and `/login?as=client`) now lead with
 * "email me a code", and the password fields live behind a plain
 * "use a password instead" affordance.
 *
 * Everything here is PURE (no `next/*`, no Supabase, no DB) so the code
 * normalization, the error mapping, the redirect building and the email-link
 * `next` extraction are unit tested without a request — see `otp-flow.test.ts`.
 * The server actions in `app/auth/otp-actions.ts` keep only the parts that
 * genuinely need Supabase and a request.
 *
 * D1 is respected: nothing here centralizes auth on the app host. The code is
 * requested and verified on whatever host the visitor is already on; only the
 * post-auth DESTINATION is made host-safe (by the caller), exactly as the
 * password actions already do.
 */

import type { RegisterIntent } from "./register-intent";

/* ─────────────────────────── code normalization ─────────────────────────── */

/** Supabase email OTP length. */
export const OTP_CODE_LENGTH = 6;

/**
 * Digits only, capped at {@link OTP_CODE_LENGTH}.
 *
 * People paste "123 456", "123-456" and the whole "Your code is 123456" line
 * out of the email. Stripping everything that is not a digit is the difference
 * between "it just worked" and a bogus "that code isn't right".
 */
export function normalizeOtpCode(raw: unknown): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).replace(/\D+/g, "").slice(0, OTP_CODE_LENGTH);
}

/** True once the normalized code is exactly {@link OTP_CODE_LENGTH} digits. */
export function isCompleteOtpCode(code: string): boolean {
  return new RegExp(`^\\d{${OTP_CODE_LENGTH}}$`).test(code);
}

/* ────────────────────────────── email input ─────────────────────────────── */

/** Trim + lowercase. Supabase stores addresses lowercased; so do our keys. */
export function normalizeAuthEmail(raw: unknown): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

/** Same shape check the password actions use, kept in one place. */
export function isValidAuthEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* ──────────────────────────── who gets it first ─────────────────────────── */

/**
 * Which signup/login intent leads with the code instead of a password.
 *
 * CLIENT ONLY in this phase. Operators and talent keep password-first auth
 * untouched: an operator is signing up to run a business (and often expects a
 * password manager entry), and the talent claim/invite flows have their own
 * verified-email assumptions that are out of scope here.
 */
export function prefersPasswordlessFirst(
  intent: RegisterIntent | null | undefined,
): boolean {
  return intent === "client";
}

/* ───────────────────────────── error mapping ────────────────────────────── */

const A = "public.auth.actions";
const P = "public.auth.passwordless";

function errorCode(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  return typeof code === "string" ? code : "";
}

function errorMessage(error: unknown): string {
  const message = (error as { message?: string } | null)?.message;
  return typeof message === "string" ? message.toLowerCase() : "";
}

/**
 * Catalog key for a failed `signInWithOtp` send.
 *
 * Note `over_email_send_rate_limit` gets its own line: Supabase enforces a
 * per-address email budget of its own, and "wait a minute" is actionable where
 * the generic "try again" invites an instant retry that fails identically.
 */
export function otpSendErrorKey(error: unknown): string {
  const code = errorCode(error);
  const message = errorMessage(error);
  if (code === "validation_failed" || code === "email_address_invalid") {
    return `${A}.invalidEmail`;
  }
  if (code === "email_address_not_authorized") {
    return `${A}.signupDomainBlocked`;
  }
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit") {
    return `${P}.errors.tooMany`;
  }
  if (code === "signup_disabled" || code === "otp_disabled") {
    return `${A}.signupDisabled`;
  }
  if (message.includes("rate") || message.includes("too many")) {
    return `${P}.errors.tooMany`;
  }
  return `${P}.errors.sendFailed`;
}

/**
 * Catalog key for a failed `verifyOtp`.
 *
 * Supabase reports a wrong code and an expired code with the SAME
 * `otp_expired` code, and its message for both is the ambiguous "Token has
 * expired or is invalid" (verified live against the project). So the ONLY
 * message we treat as definitely-expired is one that says expired WITHOUT
 * saying invalid; everything else gets the "check the digits or send a new
 * code" line, which is the actionable answer when a mistyped digit is just as
 * likely as a stale code. Telling a booker who fat-fingered a 6 that their
 * code "expired" sends them to resend instead of to their typo.
 */
export function otpVerifyErrorKey(error: unknown): string {
  const code = errorCode(error);
  const message = errorMessage(error);
  if (code === "over_request_rate_limit" || message.includes("too many")) {
    return `${P}.errors.tooMany`;
  }
  if (message.includes("expired") && !message.includes("invalid")) {
    return `${P}.errors.codeExpired`;
  }
  if (
    code === "otp_expired" ||
    code === "invalid_credentials" ||
    message.includes("expired") ||
    message.includes("invalid") ||
    message.includes("token")
  ) {
    return `${P}.errors.codeInvalid`;
  }
  return `${P}.errors.verifyFailed`;
}

/* ─────────────────────────── email link plumbing ────────────────────────── */

/**
 * `emailRedirectTo` for `signInWithOtp`.
 *
 * Deliberately the SAME contract the password actions already use:
 * `/auth/callback?next=<internal path>&lang=<en|es>`. `/auth/callback` is the
 * only route that exchanges a PKCE `?code=`, and `lang` is what the auth-email
 * hook reads back to send the email in EN/ES (there is no per-user locale in
 * Supabase).
 */
export function buildOtpEmailRedirect(input: {
  origin: string;
  nextPath?: string | null;
  lang: "en" | "es";
}): string {
  const origin = input.origin.replace(/\/$/, "");
  const params = new URLSearchParams();
  const next =
    typeof input.nextPath === "string" && input.nextPath.startsWith("/")
      ? input.nextPath
      : "/";
  params.set("next", next);
  params.set("lang", input.lang);
  return `${origin}/auth/callback?${params.toString()}`;
}

/**
 * The in-app `next` for the token_hash link the auth-email hook builds.
 *
 * The hook used to take `new URL(redirect_to).pathname` verbatim. For every
 * flow in the app that pathname is literally `/auth/callback` (the real
 * destination rides in `?next=`), so the emailed link resolved its post-auth
 * destination to `/auth/callback` — a route that, reached without a `?code=`,
 * bounces to `/login?error=auth`. Reading the inner `next` first keeps the
 * emailed code/link path landing where the form said it would, and fixes the
 * same latent hole for password-reset mail.
 *
 * Returns null when there is nothing usable, so callers keep the previous
 * "let /auth/confirm use its default" behaviour.
 */
export function authEmailLinkNext(redirectTo: string | undefined | null): string | null {
  if (!redirectTo) return null;
  let url: URL;
  try {
    url = new URL(redirectTo);
  } catch {
    return null;
  }
  const inner = url.searchParams.get("next");
  if (inner && inner.startsWith("/") && !inner.startsWith("//")) {
    return inner;
  }
  const path = url.pathname;
  // An /auth/* pathname with no usable inner next is a dead end (see above).
  if (!path || path === "/" || path.startsWith("/auth/")) return null;
  return path;
}
