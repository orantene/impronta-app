import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

const VERSION = "v1";
const SEPARATOR = ".";
const PURPOSE = "pos-thread";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type ThreadTokenPayload = {
  p: typeof PURPOSE;
  iq: string;
  tenant: string;
  iat: number;
};

function secret(): string | null {
  const value = process.env.GUEST_COOKIE_SECRET;
  return value && value.length > 0 ? value : null;
}

function signEncoded(encoded: string, key: string): string {
  return createHmac("sha256", key).update(`pos-thread:${VERSION}:${encoded}`).digest("base64url");
}

export function signThreadToken(inquiryId: string, tenantId: string, nowMs = Date.now()): string | null {
  const key = secret();
  if (!key || !inquiryId || !tenantId) return null;
  const payload: ThreadTokenPayload = { p: PURPOSE, iq: inquiryId, tenant: tenantId, iat: nowMs };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${VERSION}${SEPARATOR}${encoded}${SEPARATOR}${signEncoded(encoded, key)}`;
}

export type VerifyThreadTokenResult =
  | { ok: true; inquiryId: string; tenantId: string; issuedAtMs: number }
  | { ok: false; reason: "no_secret" | "malformed" | "bad_signature" | "expired" };

export function verifyThreadToken(token: string, nowMs = Date.now()): VerifyThreadTokenResult {
  const key = secret();
  if (!key) return { ok: false, reason: "no_secret" };
  const parts = token.split(SEPARATOR);
  if (parts.length !== 3 || parts[0] !== VERSION) return { ok: false, reason: "malformed" };
  const [ , encoded, sig] = parts;
  const expected = signEncoded(encoded, key);
  const left = Buffer.from(sig, "utf8");
  const right = Buffer.from(expected, "utf8");
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return { ok: false, reason: "bad_signature" };
  }
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ThreadTokenPayload;
    if (payload.p !== PURPOSE || !payload.iq || !payload.tenant) return { ok: false, reason: "malformed" };
    if (nowMs - payload.iat > MAX_AGE_MS) return { ok: false, reason: "expired" };
    return { ok: true, inquiryId: payload.iq, tenantId: payload.tenant, issuedAtMs: payload.iat };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}

export function issueVisitorCode(): string {
  return String(randomInt(100000, 1000000));
}

/** Customer cards until the integrator dispatches `/c/:param` (D-POS-82). */
export function publicThreadPath(token: string): string {
  return `/c/t/${encodeURIComponent(token)}`;
}
