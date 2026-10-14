import { createHmac, timingSafeEqual } from "node:crypto";

import { logServerError } from "@/lib/server/safe-error";

/**
 * HMAC-signed resume token for guest support threads.
 * Wire format: `v1.<base64url(payload-json)>.<base64url(hmac-sha256)>`.
 * Secret: GUEST_COOKIE_SECRET with a distinct HMAC prefix so it cannot
 * collide with the guest cookie or conversation-email tokens.
 */

/** TUL-618: 48h (was 7d). Every outbound support email mints a fresh token. */
export const GUEST_RESUME_TOKEN_MAX_AGE_MS = 48 * 60 * 60 * 1000;

const VERSION = "v1";
const SEPARATOR = ".";

type Payload = {
  p: "resume";
  tid: string;
  iat: number;
};

function getSecret(): string | null {
  const secret = process.env.GUEST_COOKIE_SECRET;
  return secret && secret.length > 0 ? secret : null;
}

function computeSignature(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`guest-support-resume:${VERSION}:${encodedPayload}`)
    .digest("base64url");
}

export function signGuestResumeToken(
  ticketId: string,
  nowMs: number = Date.now(),
): string | null {
  const secret = getSecret();
  if (!secret || !ticketId) return null;
  const payload: Payload = { p: "resume", tid: ticketId, iat: nowMs };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${VERSION}${SEPARATOR}${encoded}${SEPARATOR}${computeSignature(encoded, secret)}`;
}

export type VerifyGuestResumeTokenResult =
  | { ok: true; ticketId: string; issuedAtMs: number }
  | { ok: false; reason: "no_secret" | "malformed" | "bad_signature" | "wrong_purpose" | "expired" };

export function verifyGuestResumeToken(
  raw: string | null | undefined,
  nowMs: number = Date.now(),
): VerifyGuestResumeTokenResult {
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

  let payload: Payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    payload.p !== "resume" ||
    typeof payload.tid !== "string" ||
    !payload.tid ||
    typeof payload.iat !== "number"
  ) {
    return payload?.p && payload.p !== "resume"
      ? { ok: false, reason: "wrong_purpose" }
      : { ok: false, reason: "malformed" };
  }
  if (nowMs - payload.iat > GUEST_RESUME_TOKEN_MAX_AGE_MS) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, ticketId: payload.tid, issuedAtMs: payload.iat };
}

export function guestResumePath(ticketId: string): string {
  const token = signGuestResumeToken(ticketId);
  if (token) return `/contact?t=${encodeURIComponent(token)}`;
  // Never degrade silently: a missing secret turns every "Reply in app" link
  // into a blank /contact form (TUL-619).
  logServerError(
    "guest-resume-path",
    new Error("guest resume link degraded to /contact: GUEST_COOKIE_SECRET missing or empty ticket id"),
  );
  return "/contact";
}

/**
 * TUL-618 first-use binding. A token is a bearer secret, so a forwarded email
 * would hand the thread to whoever opens it. The first browser session to use
 * a token claims it (keyed by the token's iat, stored on the ticket); any
 * other session presenting the same token is refused and must request a fresh
 * link. The claiming session may reuse its own link until it expires.
 */
export type ResumeClaims = Record<string, string>;
const MAX_CLAIMS = 20;

export function evaluateResumeClaim(
  existing: unknown,
  issuedAtMs: number,
  sessionId: string,
): { allow: boolean; claims: ResumeClaims } {
  const claims: ResumeClaims =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? Object.fromEntries(
          Object.entries(existing as Record<string, unknown>).filter(
            (e): e is [string, string] => typeof e[1] === "string",
          ),
        )
      : {};
  const key = String(issuedAtMs);
  const owner = claims[key];
  if (owner) return { allow: owner === sessionId, claims };
  const next = { ...claims, [key]: sessionId };
  const keys = Object.keys(next).sort((a, b) => Number(a) - Number(b));
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_CLAIMS))) delete next[k];
  return { allow: true, claims: next };
}
