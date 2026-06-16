/**
 * Pitch share-token helper.
 *
 * Wraps the existing share-link JWT from `@/lib/site-admin/share-link/jwt`
 * with pitch-specific claim mapping. We reuse the JWT helper verbatim
 * rather than rolling a new signer — same `PREVIEW_JWT_SECRET` env var,
 * same issuer prefix (`impronta-share`), same HS256 algorithm.
 *
 * Claim mapping:
 *   - tenantId       → ShareClaims.tenantId
 *   - pitchId        → ShareClaims.pageId   (the JWT calls it "page", we say "pitch")
 *   - shareTokenId   → ShareClaims.revisionId  (rotate this column on the row to revoke all outstanding tokens for the pitch)
 *   - issuerProfileId→ ShareClaims.issuerProfileId
 *
 * Revocation: we do NOT rely on JWT validity alone. The public-action layer
 * loads the pitch by id + share_token_id and rejects if status is in
 * (cancelled, expired) or if expires_at has passed. Rotating share_token_id
 * therefore invalidates all previously-issued tokens immediately.
 */

import {
  signShareJwt,
  verifyShareJwt,
  SHARE_JWT_DEFAULT_TTL_SECONDS,
  SHARE_JWT_MAX_TTL_SECONDS,
  SHARE_JWT_MIN_TTL_SECONDS,
  type ShareVerifyResult,
} from "@/lib/site-admin/share-link/jwt";
import { pickLocale } from "@/lib/i18n/pick-locale";

export type SignedPitchToken = {
  token: string;
  expiresAt: Date;
};

export type PitchTokenClaims = {
  tenantId: string;
  pitchId: string;
  shareTokenId: string;
  issuerProfileId: string;
};

export type PitchTokenVerifyResult =
  | { ok: true; claims: PitchTokenClaims & { expiresAt: Date; jti: string } }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "bad_issuer" };

/**
 * Sign a pitch share token. `ttlSeconds` is clamped to [1h, 30d] by the
 * underlying signer — pass null/undefined to use the default 7-day TTL.
 *
 * If the pitch row has `expires_at` set, callers should pass the matching
 * TTL so the JWT and the DB row agree on when the token stops working.
 */
export function signPitchToken(
  claims: PitchTokenClaims,
  ttlSeconds?: number | null,
): SignedPitchToken {
  const ttl =
    typeof ttlSeconds === "number" && ttlSeconds > 0
      ? Math.max(SHARE_JWT_MIN_TTL_SECONDS, Math.min(SHARE_JWT_MAX_TTL_SECONDS, ttlSeconds))
      : SHARE_JWT_DEFAULT_TTL_SECONDS;
  const signed = signShareJwt(
    {
      tenantId: claims.tenantId,
      pageId: claims.pitchId,
      revisionId: claims.shareTokenId,
      issuerProfileId: claims.issuerProfileId,
      label: "pitch",
      comment: "none",
    },
    ttl,
  );
  return { token: signed.token, expiresAt: signed.expiresAt };
}

export function verifyPitchToken(token: string): PitchTokenVerifyResult {
  const result: ShareVerifyResult = verifyShareJwt(token);
  if (!result.ok) return { ok: false, reason: result.reason };
  const c = result.claims;
  return {
    ok: true,
    claims: {
      tenantId: c.tenantId,
      pitchId: c.pageId,
      shareTokenId: c.revisionId,
      issuerProfileId: c.issuerProfileId,
      expiresAt: c.expiresAt,
      jti: c.jti,
    },
  };
}

/**
 * Compute the public landing URL for a pitch token. We use the platform's
 * canonical app host (tulala.digital) rather than the tenant subdomain so
 * the share link works regardless of which agency host the recipient pastes
 * it onto. The middleware's `share/[token]` handler already resolves
 * tenant from JWT claims, not from Host header.
 */
export function buildPitchShareUrl(token: string, baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return `${trimmed}/share/pitch/${encodeURIComponent(token)}`;
}

/**
 * Localised WhatsApp deep-link template. Returns a `https://wa.me/...` URL
 * with the message pre-filled. If `phone` is provided we include it so the
 * link opens a chat with that number; otherwise it opens the share dialog.
 */
export function buildWhatsappDeepLink(args: {
  shareUrl: string;
  agencyName: string;
  phone?: string | null;
  locale?: "en" | "es";
}): string {
  const locale = args.locale ?? "en";
  const text = pickLocale(locale, {
    en: `${args.agencyName} sent you a talent pitch: ${args.shareUrl}`,
    es: `${args.agencyName} te ha enviado una propuesta de talento: ${args.shareUrl}`,
  });
  const phoneSegment = args.phone ? args.phone.replace(/[^\d]/g, "") : "";
  return `https://wa.me/${phoneSegment}?text=${encodeURIComponent(text)}`;
}

/**
 * Localised mailto: deep-link template.
 */
export function buildEmailDeepLink(args: {
  shareUrl: string;
  agencyName: string;
  email?: string | null;
  locale?: "en" | "es";
}): string {
  const locale = args.locale ?? "en";
  const subject = pickLocale(locale, {
    en: `${args.agencyName} — talent pitch`,
    es: `${args.agencyName} — propuesta de talento`,
  });
  const body = pickLocale(locale, {
    en: `${args.agencyName} sent you a talent pitch.\n\nOpen it here: ${args.shareUrl}`,
    es: `${args.agencyName} te ha enviado una propuesta de talento.\n\nÁbrela aquí: ${args.shareUrl}`,
  });
  const to = args.email ? encodeURIComponent(args.email) : "";
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
