import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * conversation-email-tokens.ts — HMAC-signed tokens for the inquiry email
 * loop's two unauthenticated email links:
 *
 *   • `continue` — the "Log in to continue the conversation" CTA. The token is
 *     exchanged AT CLICK TIME (`/api/conversation/continue`) for a fresh
 *     Supabase magic link, so no sign-in credential is ever at rest in the
 *     email body, the dispatch log, or a forwarded message — the token only
 *     names the conversation, and the click mints the credential. Expires
 *     (`CONTINUE_TOKEN_MAX_AGE_MS`) so an old email can't be replayed forever;
 *     every reply email carries a fresh one.
 *
 *   • `mute` — the "stop email notifications for this conversation" link
 *     (`/unsubscribe/conversation`). Deliberately NON-expiring: refusing an
 *     unsubscribe because the email is old would keep mailing someone who
 *     asked to stop. Signed (not single-use) per the loop's contract — the
 *     mutation it authorizes is idempotent and strictly privacy-reducing-none.
 *
 * Wire format: `v1.<base64url(payload-json)>.<base64url(hmac-sha256)>`.
 * Purpose lives INSIDE the signed payload, so a mute token can never be
 * replayed as a continue token (or vice versa).
 *
 * Secret: reuses `GUEST_COOKIE_SECRET` (already live in prod for the signed
 * guest cookie) with a per-purpose HMAC message prefix for domain separation.
 * With no secret set, signing returns null and callers omit the link — the
 * email degrades to the cookie-based `/c/{inquiryId}` CTA, never to an
 * unsigned token.
 */

export const CONTINUE_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const VERSION = "v1";
const SEPARATOR = ".";

export type ConversationTokenPurpose = "continue" | "mute";

export type ConversationTokenPayload = {
  /** Purpose — bound into the signature; a token is valid for one route only. */
  p: ConversationTokenPurpose;
  /** inquiries.id — the conversation the token names. */
  iq: string;
  /** Issued-at, epoch ms. */
  iat: number;
};

function getSecret(): string | null {
  const secret = process.env.GUEST_COOKIE_SECRET;
  return secret && secret.length > 0 ? secret : null;
}

function computeSignature(encodedPayload: string, secret: string): string {
  // Domain separation from the guest-cookie HMAC (same secret, different
  // message shape): the version prefix guarantees the two never collide.
  return createHmac("sha256", secret)
    .update(`conv-email-token:${VERSION}:${encodedPayload}`)
    .digest("base64url");
}

/**
 * Sign a conversation token. Returns null when the signing secret is not
 * configured — callers must then omit the link entirely.
 */
export function signConversationToken(
  purpose: ConversationTokenPurpose,
  inquiryId: string,
  nowMs: number = Date.now(),
): string | null {
  const secret = getSecret();
  if (!secret) return null;
  if (!inquiryId) return null;
  const payload: ConversationTokenPayload = { p: purpose, iq: inquiryId, iat: nowMs };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${VERSION}${SEPARATOR}${encoded}${SEPARATOR}${computeSignature(encoded, secret)}`;
}

export type VerifyConversationTokenResult =
  | { ok: true; inquiryId: string; issuedAtMs: number }
  | { ok: false; reason: "no_secret" | "malformed" | "bad_signature" | "wrong_purpose" | "expired" };

/**
 * Verify a conversation token for an expected purpose. `maxAgeMs` null ⇒ no
 * expiry (the mute link); otherwise tokens older than the window are refused.
 */
export function verifyConversationToken(
  raw: string | null | undefined,
  expectedPurpose: ConversationTokenPurpose,
  maxAgeMs: number | null,
  nowMs: number = Date.now(),
): VerifyConversationTokenResult {
  const secret = getSecret();
  if (!secret) return { ok: false, reason: "no_secret" };
  if (!raw) return { ok: false, reason: "malformed" };

  const parts = raw.split(SEPARATOR);
  if (parts.length !== 3 || parts[0] !== VERSION || !parts[1] || !parts[2]) {
    return { ok: false, reason: "malformed" };
  }
  const [, encoded, providedSig] = parts;

  const expectedSig = computeSignature(encoded, secret);
  let providedBuf: Buffer;
  let expectedBuf: Buffer;
  try {
    providedBuf = Buffer.from(providedSig, "base64url");
    expectedBuf = Buffer.from(expectedSig, "base64url");
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (
    providedBuf.length === 0 ||
    providedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(providedBuf, expectedBuf)
  ) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: ConversationTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof payload.iq !== "string" ||
    !payload.iq ||
    typeof payload.iat !== "number"
  ) {
    return { ok: false, reason: "malformed" };
  }
  if (payload.p !== expectedPurpose) return { ok: false, reason: "wrong_purpose" };
  if (maxAgeMs !== null && nowMs - payload.iat > maxAgeMs) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, inquiryId: payload.iq, issuedAtMs: payload.iat };
}
