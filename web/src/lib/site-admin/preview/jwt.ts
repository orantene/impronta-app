/**
 * Phase 5 — preview JWT.
 *
 * A short-lived, tenant-scoped HS256 JWT stored in an HttpOnly cookie
 * named `impronta_preview`. Middleware checks the cookie on public
 * surfaces; when valid, bypass cache + include draft reads.
 *
 * Claims:
 *   - iss: "impronta-preview"
 *   - sub: actor_profile_id
 *   - tid: tenant_id (UUID)
 *   - sid: subject kind (e.g. "branding", "page:<uuid>")
 *   - iat, exp, jti
 *
 * Lifetime: 15 minutes.
 *
 * Secret: env PREVIEW_JWT_SECRET (server-only). Rotates via env update;
 * in-flight tokens become invalid — expected behavior for a preview.
 *
 * Implementation uses Node's built-in Web Crypto (SubtleCrypto) so no new
 * dependency is required.
 */

import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";

export const PREVIEW_JWT_ISSUER = "impronta-preview";
export const PREVIEW_JWT_TTL_SECONDS = 15 * 60;

export interface PreviewClaims {
  tenantId: string;
  actorProfileId: string;
  /** e.g. "branding" or "page:<uuid>" — the thing being previewed. */
  subject: string;
}

export interface SignedPreview {
  token: string;
  expiresAt: Date;
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input: string): Buffer {
  const padded = input + "==".slice((input.length + 2) % 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function getSecret(): string {
  const secret = process.env.PREVIEW_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "PREVIEW_JWT_SECRET is not set or is too short (require >= 32 chars)",
    );
  }
  return secret;
}

function hmacSign(payload: string, secret: string): string {
  return base64UrlEncode(
    createHmac("sha256", secret).update(payload).digest(),
  );
}

export function signPreviewJwt(claims: PreviewClaims): SignedPreview {
  const secret = getSecret();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + PREVIEW_JWT_TTL_SECONDS;
  const jti = randomUUID();

  const header = { alg: "HS256", typ: "JWT" };
  const body = {
    iss: PREVIEW_JWT_ISSUER,
    sub: claims.actorProfileId,
    tid: claims.tenantId,
    sid: claims.subject,
    iat: now,
    exp,
    jti,
  };

  const headerPart = base64UrlEncode(JSON.stringify(header));
  const bodyPart = base64UrlEncode(JSON.stringify(body));
  const signingInput = `${headerPart}.${bodyPart}`;
  const signature = hmacSign(signingInput, secret);
  return {
    token: `${signingInput}.${signature}`,
    expiresAt: new Date(exp * 1000),
  };
}

export type PreviewVerifyResult =
  | {
      ok: true;
      claims: PreviewClaims & { expiresAt: Date; jti: string };
    }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "bad_issuer" };

export function verifyPreviewJwt(token: string): PreviewVerifyResult {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };

  const [headerPart, bodyPart, signaturePart] = parts;
  let secret: string;
  try {
    secret = getSecret();
  } catch {
    return { ok: false, reason: "bad_signature" };
  }

  const expected = hmacSign(`${headerPart}.${bodyPart}`, secret);
  const sigBuf = Buffer.from(signaturePart);
  const expBuf = Buffer.from(expected);
  if (
    sigBuf.length !== expBuf.length ||
    !timingSafeEqual(sigBuf, expBuf)
  ) {
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
    parsed = JSON.parse(base64UrlDecode(bodyPart).toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (parsed.iss !== PREVIEW_JWT_ISSUER) {
    return { ok: false, reason: "bad_issuer" };
  }
  const now = Math.floor(Date.now() / 1000);
  if (parsed.exp <= now) {
    return { ok: false, reason: "expired" };
  }
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
