import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * HMAC-signed guest cookie (`impronta_guest`).
 *
 * The guest cookie carries the guest session id that links a returning,
 * unauthenticated visitor to their in-flight inquiry / chat thread. Because
 * that id is the *only* proof of ownership server-side, an unsigned cookie
 * lets any client forge or rotate an arbitrary session id and hijack a
 * thread. We therefore sign the id with HMAC-SHA256 and only trust an
 * inbound value whose signature verifies.
 *
 * Wire format: `${id}.${base64url(HMAC_SHA256(id, secret))}`.
 *
 * GRACEFUL FALLBACK (the guest-chat feature is LIVE): if
 * `GUEST_COOKIE_SECRET` is not set, signing is disabled — `signGuestCookie`
 * returns the plain id and `verifyGuestCookie` accepts any non-empty value
 * verbatim (legacy raw-UUID behavior). This keeps live guests working when
 * the secret is absent; a one-time warning is logged. Set the secret to
 * enable forgery protection.
 */

const SEPARATOR = ".";

function getSecret(): string | null {
  const secret = process.env.GUEST_COOKIE_SECRET;
  return secret && secret.length > 0 ? secret : null;
}

let warnedMissingSecret = false;
function warnMissingSecretOnce(): void {
  if (warnedMissingSecret) return;
  warnedMissingSecret = true;
  // eslint-disable-next-line no-console
  console.warn(
    "[guest-cookie] GUEST_COOKIE_SECRET is not set — guest cookies are " +
      "UNSIGNED and inbound values are trusted verbatim (legacy behavior). " +
      "Set GUEST_COOKIE_SECRET to enable HMAC forgery protection.",
  );
}

function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function computeSignature(id: string, secret: string): string {
  return base64url(createHmac("sha256", secret).update(id).digest());
}

/** Whether HMAC signing is active (secret present). */
export function guestCookieSigningEnabled(): boolean {
  return getSecret() !== null;
}

/**
 * Produce the value to store in the `impronta_guest` cookie for `id`.
 * With a secret: `${id}.${base64url(HMAC_SHA256(id, secret))}`.
 * Without a secret: the plain `id` (legacy, unsigned).
 */
export function signGuestCookie(id: string): string {
  const secret = getSecret();
  if (!secret) {
    warnMissingSecretOnce();
    return id;
  }
  return `${id}${SEPARATOR}${computeSignature(id, secret)}`;
}

/**
 * Validate an inbound `impronta_guest` cookie value and return the plain
 * guest id, or `null` if it cannot be trusted.
 *
 * With a secret: the value MUST be `${id}.${sig}` and the signature MUST
 * match — a bare/legacy-unsigned value returns `null` (caller mints fresh).
 * Without a secret: any non-empty value is returned verbatim (legacy).
 */
export function verifyGuestCookie(value: string | null | undefined): string | null {
  if (!value) return null;

  const secret = getSecret();
  if (!secret) {
    warnMissingSecretOnce();
    // Legacy mode: trust the raw value as-is (it is the plain id).
    return value;
  }

  const idx = value.lastIndexOf(SEPARATOR);
  if (idx <= 0 || idx === value.length - 1) {
    // No separator, empty id, or empty signature → not a signed value.
    return null;
  }

  const id = value.slice(0, idx);
  const providedSig = value.slice(idx + 1);
  const expectedSig = computeSignature(id, secret);

  let providedBuf: Buffer;
  let expectedBuf: Buffer;
  try {
    providedBuf = Buffer.from(providedSig, "base64url");
    expectedBuf = Buffer.from(expectedSig, "base64url");
  } catch {
    return null;
  }

  if (
    providedBuf.length === 0 ||
    providedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(providedBuf, expectedBuf)
  ) {
    return null;
  }

  return id;
}

/**
 * Single source of truth for the guest cookie's wire name, header name, and
 * `Set-Cookie` options. `updateSession` (the normal auth path) and any
 * surface that bypasses it must read these from here, never redeclare them —
 * see `resolveGuestIdentity` below for why a redeclaration is dangerous.
 */
export const GUEST_COOKIE_NAME = "impronta_guest";
export const GUEST_HEADER_NAME = "x-impronta-guest";
export const GUEST_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 400,
  secure: process.env.NODE_ENV === "production",
};

export interface GuestIdentity {
  /** The plain guest id — travels downstream on the `x-impronta-guest` header. */
  guestKey: string;
  /** True when the inbound cookie was absent, forged, or legacy-unsigned. */
  needsGuestCookie: boolean;
  /** The signed value to write back if `needsGuestCookie` is true. */
  signedGuestCookie: string;
}

/**
 * Resolve (or mint) the guest identity for a request, from the raw
 * `impronta_guest` cookie value.
 *
 * THIS IS THE ONLY PLACE THIS LOGIC MAY LIVE. `updateSession` runs it for
 * every ordinary request. A surface that returns from middleware BEFORE
 * `updateSession` runs — a talent vanity host's rewrite in `proxy.ts` is the
 * known case — must call this directly instead of skipping guest identity
 * entirely. Two independent implementations of "verify or mint a guest id"
 * WILL drift (a `session_key` minted by one that the other's cookie options
 * don't match, a re-mint on every request because the two disagree on when
 * a cookie "needs" replacing), and a guest that never gets a stable session
 * id can never open a second server action successfully — every one of them
 * reads `x-impronta-guest`, gets nothing or a fresh id each time, and
 * refuses as `forbidden`. See the 2026-09-24 incident: a talent vanity host
 * never called this at all and no guest could start a conversation.
 */
export function resolveGuestIdentity(rawGuestCookie: string | null | undefined): GuestIdentity {
  const verifiedGuestId = verifyGuestCookie(rawGuestCookie);
  const guestKey = verifiedGuestId ?? crypto.randomUUID();
  const needsGuestCookie =
    verifiedGuestId === null || rawGuestCookie !== signGuestCookie(guestKey);
  const signedGuestCookie = signGuestCookie(guestKey);
  return { guestKey, needsGuestCookie, signedGuestCookie };
}
