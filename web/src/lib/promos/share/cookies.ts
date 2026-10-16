import { createHash } from "node:crypto";

/** The 7-day promo cookie holds the promo id ONLY (L4); first-touch `via` lives in its own cookie. */
export const PROMO_COOKIE = "tl_promo";
export const PROMO_VIA_COOKIE = "tl_promo_via";
export const PROMO_SESSION_COOKIE = "tl_psid";
export const PROMO_COOKIE_MAX_AGE_S = 7 * 24 * 60 * 60;

export const promoCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: true,
  path: "/",
  maxAge: PROMO_COOKIE_MAX_AGE_S,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

/** What the analytics row stores: a hash of the cookie id, never the id. */
export function sessionHash(sessionId: string): string {
  return createHash("sha256").update(`promo-session:${sessionId}`).digest("hex").slice(0, 32);
}
