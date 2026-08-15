/**
 * GET /api/media/asset/[assetId]?s=<surface>&k=<signature>
 *
 * The byte-level half of the two-key rule (execution plan 2026-08-15 §1 P0-1).
 * Everything else in the media program decides which URL a page RENDERS; this
 * route decides who may fetch the object, by re-running the same predicate on
 * every request and only then issuing a short-lived signed storage URL.
 *
 * THIN BY DESIGN. Parse, verify the mint signature, ask
 * `resolveGatedMediaAccess()`, redirect or refuse. The verdict itself is a
 * library function so it can be tested without an HTTP server.
 *
 * DARK UNLESS SWITCHED ON. With `MEDIA_PRIVATE_ACCESS_ENABLED` off — which is
 * the default and production today — nothing mints these URLs and this route
 * 404s. The mechanism ships proven and inert; flipping it is a separate,
 * reversible decision.
 *
 * WHY A REDIRECT AND NOT A STREAM
 * ───────────────────────────────
 * Streaming would put every image byte through a Vercel Function and pay
 * Supabase egress AND Vercel egress for the same photo. The redirect costs one
 * small invocation and lets the bytes keep coming from storage. The tradeoff
 * is that an issued signature stays valid for its TTL even if the grant is
 * revoked a second later — a bounded window, documented in the PR body, versus
 * today's unbounded one.
 *
 * CACHING is the whole cost dial. `s-maxage` is the revocation lag and the
 * invocation multiplier at once; it must stay <= the signed-URL TTL or a
 * cached redirect outlives the signature it points at and the image breaks.
 *
 * ON ABUSE. The route is unauthenticated by necessity (public storefronts serve
 * anonymous visitors) and costs four Supabase round trips per miss, which would
 * be an attractive amplifier. Signature verification is pure crypto and runs
 * BEFORE anything touches the database, so an attacker without the signing
 * secret cannot reach the expensive half at all — the worst they can do is
 * replay URLs a real page already published.
 */

import { NextRequest, NextResponse } from "next/server";

import { resolveGatedMediaAccess } from "@/lib/media/gated-media-access";
import {
  GATED_MEDIA_CDN_MAX_AGE_SECONDS,
  GATED_MEDIA_SIGNED_URL_TTL_SECONDS,
  MEDIA_SIGNATURE_PARAM,
  MEDIA_SURFACE_PARAM,
  isPrivateMediaAccessEnabled,
  verifyGatedMediaRequest,
} from "@/lib/media/private-access";
import { createServiceRoleClient } from "@/lib/supabase/admin";

/** Bodies here are read by machines, not people; both locales say the same thing. */
const DENY_COPY: Record<string, { en: string; es: string }> = {
  not_presentable: {
    en: "This photo is not available on this site.",
    es: "Esta foto no esta disponible en este sitio.",
  },
  watermark_unavailable: {
    en: "This photo is only available with a watermark, which has not been prepared yet.",
    es: "Esta foto solo esta disponible con marca de agua, que aun no se ha preparado.",
  },
  asset_not_found: {
    en: "This photo is not available.",
    es: "Esta foto no esta disponible.",
  },
};

function refuse(errorCode: string, status: number): NextResponse {
  const copy = DENY_COPY[errorCode] ?? DENY_COPY.asset_not_found;
  return NextResponse.json(
    { ok: false, errorCode, message: copy },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ assetId: string }> },
) {
  // Off ⇒ the route does not exist. Not 403: an endpoint that answers
  // differently when a feature is dark advertises the feature.
  if (!isPrivateMediaAccessEnabled()) return refuse("asset_not_found", 404);

  const { assetId } = await context.params;
  if (!assetId) return refuse("asset_not_found", 404);

  const verified = verifyGatedMediaRequest(assetId, {
    surface: request.nextUrl.searchParams.get(MEDIA_SURFACE_PARAM),
    signature: request.nextUrl.searchParams.get(MEDIA_SIGNATURE_PARAM),
  });
  // A bad signature is a URL we never minted. 404 rather than 403 so probing
  // signatures learns nothing about which (asset, surface) pairs are real.
  if (!verified) return refuse("asset_not_found", 404);

  const admin = createServiceRoleClient();
  if (!admin) return refuse("asset_not_found", 404);

  const decision = await resolveGatedMediaAccess(admin, {
    assetId,
    surface: verified.surface,
  });
  if (!decision.ok) {
    return refuse(decision.reason, decision.reason === "asset_not_found" ? 404 : 403);
  }

  // Already-absolute paths (seeded avatars, bundled `public/` portraits) are
  // not storage objects. The minting helper does not gate them, so reaching
  // this branch means a hand-built URL — the gate has already passed, so hand
  // the caller the same thing the render path would have. Root-relative paths
  // are resolved against this request's own origin: `NextResponse.redirect`
  // requires an absolute URL and would otherwise throw a 500 here.
  if (decision.storagePath.startsWith("http")) return redirectTo(decision.storagePath);
  if (decision.storagePath.startsWith("/")) {
    return redirectTo(new URL(decision.storagePath, request.nextUrl.origin).toString());
  }

  const { data } = await admin.storage
    .from(decision.bucket)
    .createSignedUrl(decision.storagePath, GATED_MEDIA_SIGNED_URL_TTL_SECONDS);

  // No silent fallback to the public URL. Failing to sign means failing to
  // gate, and serving the unguarded original at that point would hand back
  // exactly the artifact this route exists to take away.
  if (!data?.signedUrl) return refuse("asset_not_found", 404);

  return redirectTo(data.signedUrl);
}

function redirectTo(url: string): NextResponse {
  return NextResponse.redirect(url, {
    status: 302,
    headers: {
      // <= the signed-URL TTL, always: a redirect cached past its signature is
      // a broken image everywhere downstream of that cache.
      "Cache-Control": `public, max-age=${GATED_MEDIA_CDN_MAX_AGE_SECONDS}, s-maxage=${GATED_MEDIA_CDN_MAX_AGE_SECONDS}`,
    },
  });
}
