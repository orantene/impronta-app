/**
 * Shortlist share-token helper — D10.
 *
 * Wraps the generic share-link JWT (`@/lib/site-admin/share-link/jwt`)
 * with shortlist-specific claim mapping. Same wire format as pitch
 * tokens; different `tid` sentinel so a stray pitch token can't masquerade
 * as a shortlist token and vice versa.
 *
 * Why no DB column for revocation: shortlists are account-scoped (not
 * tenant-scoped, not pitched-to-named-recipient), so we don't have a
 * per-recipient revoke story to support yet. Tokens revoke purely by
 * TTL expiry. A future `share_token_id` column on `client_shortlists`
 * can add rotation if/when the product needs it.
 *
 * Claim mapping:
 *   - tenantId      → "client-shortlist" (sentinel — kind discriminator)
 *   - pageId        → shortlistId
 *   - revisionId    → randomUUID per signing (each issued token is unique)
 *   - issuerProfileId → client_user_id (the shortlist owner)
 */

import { randomUUID } from "node:crypto";
import {
  signShareJwt,
  verifyShareJwt,
  SHARE_JWT_DEFAULT_TTL_SECONDS,
  SHARE_JWT_MAX_TTL_SECONDS,
  SHARE_JWT_MIN_TTL_SECONDS,
  type ShareVerifyResult,
} from "@/lib/site-admin/share-link/jwt";

const SHORTLIST_TENANT_SENTINEL = "client-shortlist";

export type SignedShortlistToken = {
  token: string;
  expiresAt: Date;
};

export type ShortlistTokenClaims = {
  shortlistId: string;
  issuerUserId: string;
};

export type ShortlistTokenVerifyResult =
  | { ok: true; claims: ShortlistTokenClaims & { expiresAt: Date; jti: string } }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "bad_issuer" | "wrong_kind" };

/**
 * Sign a shortlist share token. `ttlSeconds` defaults to the shared
 * 7-day TTL (clamped to [1h, 30d] by the underlying signer).
 */
export function signShortlistToken(
  claims: ShortlistTokenClaims,
  ttlSeconds?: number | null,
): SignedShortlistToken {
  const ttl =
    typeof ttlSeconds === "number" && ttlSeconds > 0
      ? Math.max(SHARE_JWT_MIN_TTL_SECONDS, Math.min(SHARE_JWT_MAX_TTL_SECONDS, ttlSeconds))
      : SHARE_JWT_DEFAULT_TTL_SECONDS;
  const signed = signShareJwt(
    {
      tenantId: SHORTLIST_TENANT_SENTINEL,
      pageId: claims.shortlistId,
      revisionId: randomUUID(),
      issuerProfileId: claims.issuerUserId,
      label: "shortlist",
      comment: "none",
    },
    ttl,
  );
  return { token: signed.token, expiresAt: signed.expiresAt };
}

export function verifyShortlistToken(token: string): ShortlistTokenVerifyResult {
  const result: ShareVerifyResult = verifyShareJwt(token);
  if (!result.ok) return { ok: false, reason: result.reason };
  if (result.claims.tenantId !== SHORTLIST_TENANT_SENTINEL) {
    return { ok: false, reason: "wrong_kind" };
  }
  return {
    ok: true,
    claims: {
      shortlistId: result.claims.pageId,
      issuerUserId: result.claims.issuerProfileId,
      expiresAt: result.claims.expiresAt,
      jti: result.claims.jti,
    },
  };
}

/**
 * Compute the public landing URL. Same canonical app host as pitch
 * shares — tulala.digital, not the tenant subdomain.
 */
export function buildShortlistShareUrl(token: string, baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return `${trimmed}/share/shortlist/${encodeURIComponent(token)}`;
}
