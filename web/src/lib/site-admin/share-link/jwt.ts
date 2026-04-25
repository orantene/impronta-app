/**
 * Phase 9 — share-link JWT.
 *
 * Operator-issued, tenant-scoped HS256 JWT bound to a specific page +
 * revision id. Lifetime is operator-chosen between 1 hour and 30 days,
 * defaulting to 7 days. Rendered as the path segment of `/share/<token>`,
 * verified server-side at the route boundary.
 *
 * Why a fresh module instead of reusing `preview/jwt.ts`:
 *   - Different audience: the preview JWT lives in an HttpOnly cookie
 *     and grants staff a draft-bypass on their own routes. The share
 *     JWT lives in a public URL and grants an unauthenticated visitor
 *     a one-page view of a specific revision.
 *   - Different lifetime: previews are 15-minute staff sessions; shares
 *     are days-to-weeks visitor sessions.
 *   - Different claim shape: shares bind to `pageId` + `revisionId`, not
 *     to the live state.
 *
 * Both modules share the same secret (PREVIEW_JWT_SECRET) so we don't
 * have to provision a second env var. The issuer prefix keeps them
 * disjoint — a token signed for preview is rejected by share verify
 * and vice versa.
 */

import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";

export const SHARE_JWT_ISSUER = "impronta-share";

/** Default lifetime when the operator doesn't specify. 7 days. */
export const SHARE_JWT_DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Hard ceiling on issued share-link lifetimes. 30 days. */
export const SHARE_JWT_MAX_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Hard floor on issued share-link lifetimes. 1 hour. */
export const SHARE_JWT_MIN_TTL_SECONDS = 60 * 60;

export interface ShareClaims {
  /** Tenant id the share is scoped to (used to enforce host match). */
  tenantId: string;
  /** Page id the share resolves against. */
  pageId: string;
  /** Revision id the share renders. */
  revisionId: string;
  /** Profile id of the operator that issued the share. */
  issuerProfileId: string;
  /**
   * Optional human label set by the operator (e.g. "Client review —
   * draft v3"). Surfaced in the share landing page footer for context.
   */
  label?: string;
}

export interface SignedShare {
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

/**
 * Sign a share-link JWT. `ttlSeconds` is clamped to
 * [SHARE_JWT_MIN_TTL_SECONDS, SHARE_JWT_MAX_TTL_SECONDS] — out-of-range
 * inputs are coerced rather than rejected so the caller doesn't have to
 * pre-validate, but the resulting `expiresAt` always reflects the
 * actual signed claim.
 */
export function signShareJwt(
  claims: ShareClaims,
  ttlSeconds: number = SHARE_JWT_DEFAULT_TTL_SECONDS,
): SignedShare {
  const secret = getSecret();
  const now = Math.floor(Date.now() / 1000);
  const ttl = Math.max(
    SHARE_JWT_MIN_TTL_SECONDS,
    Math.min(SHARE_JWT_MAX_TTL_SECONDS, Math.floor(ttlSeconds)),
  );
  const exp = now + ttl;
  const jti = randomUUID();

  const header = { alg: "HS256", typ: "JWT" };
  const body = {
    iss: SHARE_JWT_ISSUER,
    sub: claims.issuerProfileId,
    tid: claims.tenantId,
    pid: claims.pageId,
    rev: claims.revisionId,
    lbl: claims.label ?? null,
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

export type ShareVerifyResult =
  | {
      ok: true;
      claims: ShareClaims & { expiresAt: Date; jti: string; issuedAt: Date };
    }
  | {
      ok: false;
      reason: "malformed" | "bad_signature" | "expired" | "bad_issuer";
    };

export function verifyShareJwt(token: string): ShareVerifyResult {
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
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return { ok: false, reason: "bad_signature" };
  }

  let parsed: {
    iss: string;
    sub: string;
    tid: string;
    pid: string;
    rev: string;
    lbl: string | null;
    iat: number;
    exp: number;
    jti: string;
  };
  try {
    parsed = JSON.parse(base64UrlDecode(bodyPart).toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (parsed.iss !== SHARE_JWT_ISSUER) {
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
      pageId: parsed.pid,
      revisionId: parsed.rev,
      issuerProfileId: parsed.sub,
      label: parsed.lbl ?? undefined,
      expiresAt: new Date(parsed.exp * 1000),
      issuedAt: new Date(parsed.iat * 1000),
      jti: parsed.jti,
    },
  };
}
