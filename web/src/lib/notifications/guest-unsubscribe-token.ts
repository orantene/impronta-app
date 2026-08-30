import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Email-keyed unsubscribe token for guest support mail.
 * Wire: `ge1.<base64url(email)>.<base64url(hmac)>`.
 * Distinct HMAC prefix from the guest cookie and resume token.
 */
const VERSION = "ge1";
const SEPARATOR = ".";

function getSecret(): string | null {
  const secret = process.env.GUEST_COOKIE_SECRET;
  return secret && secret.length > 0 ? secret : null;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function computeSignature(encodedEmail: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`guest-email-unsub:${VERSION}:${encodedEmail}`)
    .digest("base64url");
}

export function signGuestEmailUnsubscribeToken(email: string): string | null {
  const secret = getSecret();
  const normalized = normalizeEmail(email);
  if (!secret || !normalized.includes("@")) return null;
  const encoded = Buffer.from(normalized, "utf8").toString("base64url");
  return `${VERSION}${SEPARATOR}${encoded}${SEPARATOR}${computeSignature(encoded, secret)}`;
}

export function verifyGuestEmailUnsubscribeToken(
  token: string,
): { ok: true; email: string } | { ok: false } {
  const secret = getSecret();
  if (!secret || !token) return { ok: false };
  const parts = token.split(SEPARATOR);
  if (parts.length !== 3 || parts[0] !== VERSION) return { ok: false };
  const [, encoded, sig] = parts;
  const expected = computeSignature(encoded, secret);
  const a = Buffer.from(sig, "base64url");
  const b = Buffer.from(expected, "base64url");
  if (a.length !== b.length || a.length === 0 || !timingSafeEqual(a, b)) {
    return { ok: false };
  }
  try {
    const email = Buffer.from(encoded, "base64url").toString("utf8");
    if (!email.includes("@")) return { ok: false };
    return { ok: true, email };
  } catch {
    return { ok: false };
  }
}
