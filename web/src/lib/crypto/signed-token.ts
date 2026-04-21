/**
 * Shared primitives for HMAC-signed opaque tokens.
 *
 * Used by the impersonation cookie and the invite-link flow to avoid
 * duplicated base64url / crypto.subtle boilerplate. Pure functions — no
 * env, no side effects. The caller owns the secret and the payload schema.
 *
 * Token format: `<base64url(payload)>.<base64url(hmac_sha256(secret, payload))>`
 * `payload` is opaque bytes; callers typically pass JSON.
 */

const textEncoder = new TextEncoder();

export function stringToBase64Url(s: string): string {
  const bytes = textEncoder.encode(s);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function base64UrlToUtf8(s: string): string {
  return new TextDecoder().decode(base64UrlToBytes(s));
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Constant-time byte-sequence equality (matches Node `timingSafeEqual` for utf-8 strings). */
export function timingSafeEqualUtf8(a: string, b: string): boolean {
  const ea = textEncoder.encode(a);
  const eb = textEncoder.encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i]! ^ eb[i]!;
  return diff === 0;
}

export async function hmacSha256Base64Url(
  secret: string,
  message: string,
): Promise<string> {
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

/** Sign an opaque payload string, returning `<b64url(payload)>.<b64url(sig)>`. */
export async function signToken(secret: string, payload: string): Promise<string> {
  const b64 = stringToBase64Url(payload);
  const sig = await hmacSha256Base64Url(secret, b64);
  return `${b64}.${sig}`;
}

export type VerifiedToken = {
  ok: true;
  payload: string;
};

export type VerifyFailure = {
  ok: false;
  reason: "empty" | "no_secret" | "format" | "sig";
};

/**
 * Verify a signed token and return the raw payload string. The caller is
 * responsible for parsing the payload and validating semantic fields such
 * as version, expiry, and required shape.
 */
export async function verifyToken(
  raw: string | undefined,
  secret: string | undefined,
): Promise<VerifiedToken | VerifyFailure> {
  if (!raw?.length) return { ok: false, reason: "empty" };
  if (!secret?.length) return { ok: false, reason: "no_secret" };

  const dot = raw.indexOf(".");
  if (dot <= 0) return { ok: false, reason: "format" };
  const encoded = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!encoded || !sig) return { ok: false, reason: "format" };

  const expected = await hmacSha256Base64Url(secret, encoded);
  if (!timingSafeEqualUtf8(expected, sig)) return { ok: false, reason: "sig" };

  return { ok: true, payload: base64UrlToUtf8(encoded) };
}
