import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed customer-manage token for cancel / reschedule from an email link.
 *
 * TUL-1550: signed with its OWN secret, `BOOKING_MANAGE_TOKEN_SECRET`, never the guest
 * cookie secret (one leaked or guessed secret must not forge both kinds of token). Links
 * already sent were signed with `GUEST_COOKIE_SECRET`; those still verify until
 * `LEGACY_COOKIE_SECRET_GRACE_UNTIL_MS` (they live at most 7 days), then only the new secret works.
 * The public page is the UI session's (D-POS-73).
 */

/** Old links (signed with the guest cookie secret) stop verifying at this instant. */
export const LEGACY_COOKIE_SECRET_GRACE_UNTIL_MS = Date.parse("2026-11-10T00:00:00.000Z");

export type BookingManageAction = "cancel" | "reschedule";

export type BookingManagePayload = {
  bookingId: string;
  tenantId: string;
  action: BookingManageAction;
  exp: number;
};

function secret(): string | null {
  const s = process.env.BOOKING_MANAGE_TOKEN_SECRET;
  return s && s.length > 0 ? s : null;
}

/** Only for links sent before the dedicated secret existed; see the grace constant. */
function legacySecret(nowMs: number): string | null {
  if (nowMs >= LEGACY_COOKIE_SECRET_GRACE_UNTIL_MS) return null;
  const s = process.env.GUEST_COOKIE_SECRET;
  return s && s.length > 0 ? s : null;
}

function signatureMatches(body: string, sig: string, key: string): boolean {
  const a = Buffer.from(sig);
  const b = Buffer.from(signBody(body, key));
  return a.length === b.length && timingSafeEqual(a, b);
}

function signBody(body: string, key: string): string {
  return createHmac("sha256", key).update(body).digest("base64url");
}

export function signBookingManageToken(
  input: Omit<BookingManagePayload, "exp"> & { ttlSeconds?: number; nowMs?: number },
): string | null {
  const key = secret();
  if (!key) return null;
  const now = input.nowMs ?? Date.now();
  const payload: BookingManagePayload = {
    bookingId: input.bookingId,
    tenantId: input.tenantId,
    action: input.action,
    exp: now + (input.ttlSeconds ?? 7 * 24 * 3600) * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${signBody(body, key)}`;
}

export function verifyBookingManageToken(
  token: string,
  nowMs: number = Date.now(),
): { ok: true; payload: BookingManagePayload } | { ok: false; reason: "token_invalid" } {
  const keys = [secret(), legacySecret(nowMs)].filter((k): k is string => k !== null);
  if (keys.length === 0) return { ok: false, reason: "token_invalid" };
  const cut = token.lastIndexOf(".");
  if (cut < 1) return { ok: false, reason: "token_invalid" };
  const body = token.slice(0, cut);
  const sig = token.slice(cut + 1);
  if (!keys.some((k) => signatureMatches(body, sig, k))) return { ok: false, reason: "token_invalid" };
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as BookingManagePayload;
    if (!payload.bookingId || !payload.tenantId) return { ok: false, reason: "token_invalid" };
    if (payload.action !== "cancel" && payload.action !== "reschedule") return { ok: false, reason: "token_invalid" };
    if (!Number.isFinite(payload.exp) || payload.exp <= nowMs) return { ok: false, reason: "token_invalid" };
    return { ok: true, payload };
  } catch {
    return { ok: false, reason: "token_invalid" };
  }
}
