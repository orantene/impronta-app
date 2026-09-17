import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { isSafeReturnPath } from "./trial-door";

/**
 * Signed return-to-spot token carried on a Stripe Checkout `success_url`.
 *
 * Stripe sends the person back to `/<slug>/admin/account?billing=success`;
 * with a verified token the account page forwards to the exact spot the
 * door opened from (the domain field, the logo step). Same HMAC family as
 * `lib/bookings/manage-token.ts` (`GUEST_COOKIE_SECRET`). The path is
 * validated at signing AND at verification; the subject is bound so a token
 * minted for one workspace cannot forward inside another.
 */

export type CheckoutReturnPayload = {
  /** `agencies.id` for workspace checkouts; `talent_profiles.id` for talent. */
  subjectId: string;
  path: string;
  exp: number;
};

const TTL_SECONDS = 2 * 3600;

function secret(): string | null {
  const s = process.env.GUEST_COOKIE_SECRET;
  return s && s.length > 0 ? s : null;
}

function sign(body: string, key: string): string {
  return createHmac("sha256", key).update(body).digest("base64url");
}

export function signCheckoutReturn(input: {
  subjectId: string;
  path: string;
  nowMs?: number;
}): string | null {
  const key = secret();
  if (!key || !input.subjectId || !isSafeReturnPath(input.path)) return null;
  const payload: CheckoutReturnPayload = {
    subjectId: input.subjectId,
    path: input.path,
    exp: (input.nowMs ?? Date.now()) + TTL_SECONDS * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body, key)}`;
}

export function verifyCheckoutReturn(
  token: unknown,
  subjectId: string,
  nowMs: number = Date.now(),
): { ok: true; path: string } | { ok: false } {
  const key = secret();
  if (!key || typeof token !== "string" || token.length > 2048) return { ok: false };
  const cut = token.lastIndexOf(".");
  if (cut < 1) return { ok: false };
  const body = token.slice(0, cut);
  const sig = token.slice(cut + 1);
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(body, key));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false };
  let payload: CheckoutReturnPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as CheckoutReturnPayload;
  } catch {
    return { ok: false };
  }
  if (payload.subjectId !== subjectId) return { ok: false };
  if (typeof payload.exp !== "number" || payload.exp < nowMs) return { ok: false };
  if (!isSafeReturnPath(payload.path)) return { ok: false };
  return { ok: true, path: payload.path };
}

/** `&return=<token>` for a success_url, or nothing. */
export function returnQuery(returnToken: string | null | undefined): string {
  return returnToken ? `&return=${encodeURIComponent(returnToken)}` : "";
}

/**
 * Stripe rejects an idempotency key reused with different parameters. A
 * checkout with a return target differs from one without, so the key carries
 * a short digest of the token; the no-return key is unchanged.
 */
export function idempotencySuffix(returnToken: string | null | undefined): string {
  if (!returnToken) return "";
  return `_r${createHash("sha256").update(returnToken).digest("hex").slice(0, 10)}`;
}
