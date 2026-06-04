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
