import { IMPERSONATION_COOKIE_NAME } from "@/lib/impersonation/constants";

const PAYLOAD_VERSION = 1;
const MAX_AGE_MS = 8 * 60 * 60 * 1000;

export type ParsedImpersonationCookie = {
  targetUserId: string;
  iat: number;
};

const textEncoder = new TextEncoder();

function stringToBase64Url(s: string): string {
  const bytes = textEncoder.encode(s);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function base64UrlToUtf8(s: string): string {
  return new TextDecoder().decode(base64UrlToBytes(s));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Constant-time compare of UTF-8 byte sequences (matches Node Buffer timingSafeEqual on utf8 strings). */
function timingSafeEqualUtf8(a: string, b: string): boolean {
  const ea = textEncoder.encode(a);
  const eb = textEncoder.encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i]! ^ eb[i]!;
  return diff === 0;
}

async function hmacSha256Base64Url(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, textEncoder.encode(message));
  return bytesToBase64Url(new Uint8Array(sig));
}

export async function signImpersonationCookie(
  secret: string,
  targetUserId: string,
  iat = Date.now(),
): Promise<string> {
  const body = JSON.stringify({
    v: PAYLOAD_VERSION,
    targetUserId,
    iat,
  });
  const payload = stringToBase64Url(body);
  const sig = await hmacSha256Base64Url(secret, payload);
  return `${payload}.${sig}`;
}

export async function parseImpersonationCookie(
  raw: string | undefined,
  secret: string | undefined,
): Promise<
  | { ok: true; data: ParsedImpersonationCookie }
  | { ok: false; reason: string }
> {
  if (!raw?.length) return { ok: false, reason: "empty" };
  if (!secret?.length) return { ok: false, reason: "no_secret" };

  const dot = raw.indexOf(".");
  if (dot <= 0) return { ok: false, reason: "format" };
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!payload || !sig) return { ok: false, reason: "format" };

  const expectedSig = await hmacSha256Base64Url(secret, payload);
  if (!timingSafeEqualUtf8(expectedSig, sig)) {
    return { ok: false, reason: "sig" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(base64UrlToUtf8(payload));
  } catch {
    return { ok: false, reason: "json" };
  }
  if (!parsed || typeof parsed !== "object") return { ok: false, reason: "shape" };
  const o = parsed as Record<string, unknown>;
  if (o.v !== PAYLOAD_VERSION) return { ok: false, reason: "version" };
  if (typeof o.targetUserId !== "string" || !o.targetUserId.length) {
    return { ok: false, reason: "target" };
  }
  if (typeof o.iat !== "number" || !Number.isFinite(o.iat)) {
    return { ok: false, reason: "iat" };
  }
  if (Date.now() - o.iat > MAX_AGE_MS) return { ok: false, reason: "expired" };

  return { ok: true, data: { targetUserId: o.targetUserId, iat: o.iat } };
}

export function impersonationCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(MAX_AGE_MS / 1000),
  };
}

export function clearImpersonationCookieOnResponse(res: {
  cookies: { set: (name: string, value: string, options: object) => void };
}): void {
  res.cookies.set(IMPERSONATION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
