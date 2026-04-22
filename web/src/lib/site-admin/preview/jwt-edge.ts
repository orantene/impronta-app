/**
 * Edge-runtime–safe preview JWT verification.
 *
 * The top-level Next.js middleware runs in the Edge runtime, which
 * cannot use `node:crypto`. This module mirrors `verifyPreviewJwt`
 * using Web Crypto (`SubtleCrypto`) so middleware can verify preview
 * tokens without pulling Node APIs.
 *
 * Signing still lives in `./jwt.ts` (Node-only) because signing runs
 * inside server actions, not middleware.
 *
 * Claims match the shape in `./jwt.ts`:
 *   iss, sub, tid, sid, iat, exp, jti
 */

// Duplicated from ./jwt (Node) to avoid pulling `node:crypto` into the
// Edge-runtime middleware bundle. Keep in sync on rotation.
const PREVIEW_JWT_ISSUER = "impronta-preview";

export interface PreviewClaims {
  tenantId: string;
  actorProfileId: string;
  subject: string;
}

export type PreviewVerifyResult =
  | {
      ok: true;
      claims: PreviewClaims & { expiresAt: Date; jti: string };
    }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "bad_issuer" };

function base64UrlToArrayBuffer(input: string): ArrayBuffer {
  const padded = input + "==".slice((input.length + 2) % 4);
  const normal = padded.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(normal), (c) => c.charCodeAt(0));
  return bytes.buffer;
}

function arrayBufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let acc = 0;
  for (let i = 0; i < a.length; i += 1) {
    acc |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return acc === 0;
}

async function hmacSignBase64Url(
  payload: string,
  secret: string,
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return arrayBufferToBase64Url(sig);
}

export async function verifyPreviewJwtEdge(
  token: string,
): Promise<PreviewVerifyResult> {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [headerPart, bodyPart, signaturePart] = parts;

  const secret = process.env.PREVIEW_JWT_SECRET;
  if (!secret || secret.length < 32) {
    // In Edge we can't throw meaningful errors that surface; treat as
    // bad signature to fail closed.
    return { ok: false, reason: "bad_signature" };
  }

  let expected: string;
  try {
    expected = await hmacSignBase64Url(`${headerPart}.${bodyPart}`, secret);
  } catch {
    return { ok: false, reason: "bad_signature" };
  }
  if (!timingSafeEqualStrings(signaturePart, expected)) {
    return { ok: false, reason: "bad_signature" };
  }

  let parsed: {
    iss: string;
    sub: string;
    tid: string;
    sid: string;
    iat: number;
    exp: number;
    jti: string;
  };
  try {
    const buf = base64UrlToArrayBuffer(bodyPart);
    const text = new TextDecoder().decode(buf);
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (parsed.iss !== PREVIEW_JWT_ISSUER) {
    return { ok: false, reason: "bad_issuer" };
  }
  const now = Math.floor(Date.now() / 1000);
  if (parsed.exp <= now) return { ok: false, reason: "expired" };

  return {
    ok: true,
    claims: {
      tenantId: parsed.tid,
      actorProfileId: parsed.sub,
      subject: parsed.sid,
      expiresAt: new Date(parsed.exp * 1000),
      jti: parsed.jti,
    },
  };
}
