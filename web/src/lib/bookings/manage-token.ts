import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed customer-manage token for cancel / reschedule from an email link.
 *
 * Same HMAC family as `lib/guest-cookie.ts` (`GUEST_COOKIE_SECRET`).
 * The public page is the UI session's (D-POS-63).
 */

export type BookingManageAction = "cancel" | "reschedule";

export type BookingManagePayload = {
  bookingId: string;
  tenantId: string;
  action: BookingManageAction;
  exp: number;
};

function secret(): string | null {
  const s = process.env.GUEST_COOKIE_SECRET;
  return s && s.length > 0 ? s : null;
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
  const key = secret();
  if (!key) return { ok: false, reason: "token_invalid" };
  const cut = token.lastIndexOf(".");
  if (cut < 1) return { ok: false, reason: "token_invalid" };
  const body = token.slice(0, cut);
  const sig = token.slice(cut + 1);
  const expected = signBody(body, key);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "token_invalid" };
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
