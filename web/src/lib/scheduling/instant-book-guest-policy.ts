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

/** What a guest who cleared the gates above actually books as. */
export type GuestBookingIdentity = {
  ok: true;
  /**
   * The buyer's auth account when they already have one, `null` when they do
   * not. Never invented: `PurchaseInput.actorUserId` is typed `string | null`
   * for exactly this reason.
   */
  userId: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
};

/**
 * Turn "did this guest end up with an account?" into the identity they book
 * with, instead of into a refusal.
 *
 * THE BUG THIS CLOSES: `ensureGuestClientByEmail` stopped minting `auth.users`
 * rows when customer auth was retired, so a first-time guest now comes back
 * `{ status: "unlinked", clientUserId: null }` BY DESIGN. `resolveInstantBookActor`
 * still read that null as a validation failure and answered
 * "Add your name and email to book." while the name and the email were sitting
 * in the request body. Every first-time customer was refused; only someone who
 * already had an account could finish. The refusal also blamed the customer for
 * a state they could do nothing about, which is the worst kind of dead end.
 *
 * An account is something a buyer GAINS, never a precondition for buying. The
 * purchase pipeline resolves a guest through `ensureCustomer` (a `customers`
 * row keyed by email, no auth user), and sign-in is gated separately and
 * explicitly by `require_account_to_book`. The only thing genuinely required
 * here is a reachable email, because a receipt, a reminder and a refund notice
 * all need one.
 */
export function resolveGuestBookingIdentity(input: {
  email: string;
  name: string;
  phone: string | null;
  /** From `ensureGuestClientByEmail`. `null` means "no account yet", not "invalid". */
  clientUserId: string | null;
}): GuestBookingIdentity | { ok: false; reason: "validation" } {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) return { ok: false, reason: "validation" };
  const name = input.name.trim();
  return {
    ok: true,
    userId: input.clientUserId?.trim() || null,
    contactName: name || email,
    contactEmail: email,
    contactPhone: input.phone,
  };
}
