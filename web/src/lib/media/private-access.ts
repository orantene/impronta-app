import "server-only";

/**
 * private-access.ts — the switch and the URL grammar for gated media reads
 * (execution plan 2026-08-15, §1 P0-1 option (b)).
 *
 * THE PROBLEM THIS EXISTS FOR
 * ───────────────────────────
 * `storage.buckets.media-public` is `public=true` and holds 100% of live
 * media. The two-key predicate (`media_assets_presentable_on_tenant`) and the
 * watermark condition decide WHICH URL a page renders; they do not decide who
 * may fetch the bytes. So a hub that receives a watermark-required release can
 * right-click the owning agency's own storefront — where the implicit owner
 * key serves the photo unwatermarked — and embed the original forever.
 * Revoking the release stops the RENDER; the saved URL keeps working.
 *
 * The fix is not a new rule. It is putting the EXISTING rule in front of the
 * bytes: every gated URL points at `/api/media/asset/<id>`, which re-runs the
 * same predicate on every request and only then issues a short-lived signed
 * storage URL. Revocation becomes real, bounded by the cache window rather
 * than by nothing at all.
 *
 * DEFAULT OFF, AND BYTE-IDENTICAL WHEN OFF
 * ────────────────────────────────────────
 * `MEDIA_PRIVATE_ACCESS_ENABLED` is off unless explicitly set. While it is
 * off, `mediaUrlForAsset()` returns exactly what `mediaPublicUrl()` returned
 * before this file existed, character for character, and the route 404s. A
 * wrong move here blanks every image on every site, so the mechanism ships
 * proven and dark.
 *
 * WHY THE SURFACE IS SIGNED INTO THE URL AND NOT READ FROM THE HOST
 * ─────────────────────────────────────────────────────────────────
 * The predicate answers a question about a PAIR: (asset, surface). The route
 * has to know which surface is asking.
 *
 *   • Taking the surface from a plain query param is a trivial bypass — the
 *     predicate is auth-independent, so an attacker just passes the OWNING
 *     tenant's id and every asset is presentable.
 *   • Deriving it from the request Host looks safer but is wrong here: a
 *     tenant reachable at `tulala.digital/<slug>` renders on the master host,
 *     `next/image` re-fetches the URL server-side through the optimizer, and
 *     both would evaluate against the wrong surface.
 *
 * So the surface travels in the URL and is HMAC-signed. The signature is NOT
 * an access token: it authenticates only "this URL was minted by us, for this
 * asset, for this surface". Whether that surface may see that asset is decided
 * fresh on every request by the predicate. That is what keeps a saved URL from
 * outliving the grant behind it, while leaving the URL stable enough to cache.
 *
 * MISCONFIGURATION FAILS TO TODAY'S BEHAVIOR, NOT TO A BLANK SITE
 * ───────────────────────────────────────────────────────────────
 * Signing needs a secret. If the flag is on and no secret is configured, this
 * module reports the feature DISABLED and logs once, rather than minting
 * unverifiable URLs or serving nothing. The failure mode of a missing env var
 * must never be "every photo on the platform disappears".
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** Opaque tenant id of the surface asking, or `null` for the master surface. */
export type MediaSurface = string | null;

/** Route that serves gated media. Allow-listed on every host kind. */
export const GATED_MEDIA_ROUTE = "/api/media/asset";

/** Query param carrying the surface tenant id (absent = master surface). */
export const MEDIA_SURFACE_PARAM = "s";
/** Query param carrying the HMAC over (asset, surface). */
export const MEDIA_SIGNATURE_PARAM = "k";

/**
 * How long an issued storage signature lives.
 *
 * MUST be >= `GATED_MEDIA_CDN_MAX_AGE_SECONDS`: the route answers with a
 * redirect, and a redirect cached for longer than the signature it points at
 * is a broken image for everyone downstream of that cache.
 */
export const GATED_MEDIA_SIGNED_URL_TTL_SECONDS = 3600;

/**
 * How long a browser or CDN may reuse the route's redirect.
 *
 * This is the revocation lag, and it is the whole cost/latency dial: at 0 the
 * feature costs one Function invocation per image per view; at 300 a hot photo
 * costs one invocation per five minutes per edge. Five minutes of lag on a
 * revoked release is a product decision the owner can move; "forever" was not.
 */
export const GATED_MEDIA_CDN_MAX_AGE_SECONDS = 300;

/** Bytes of HMAC kept in the URL. 128 bits is far past forgery reach. */
const SIGNATURE_BYTES = 16;

function readSecret(): string | null {
  const secret = process.env.MEDIA_URL_SIGNING_SECRET?.trim();
  return secret && secret.length > 0 ? secret : null;
}

let warnedMissingSecret = false;
function warnMissingSecretOnce(): void {
  if (warnedMissingSecret) return;
  warnedMissingSecret = true;
  // eslint-disable-next-line no-console
  console.warn(
    "[media/private-access] MEDIA_PRIVATE_ACCESS_ENABLED is on but " +
      "MEDIA_URL_SIGNING_SECRET is not set. Gated media stays OFF (public " +
      "URLs, today's behavior). Set the secret to enable it.",
  );
}

/**
 * Is the gated media route live?
 *
 * Default OFF. Only "1" / "true" turns it on, and only together with a signing
 * secret — see the module header on why a missing secret degrades to today's
 * behavior instead of to an empty page.
 */
export function isPrivateMediaAccessEnabled(): boolean {
  const raw = process.env.MEDIA_PRIVATE_ACCESS_ENABLED;
  if (raw !== "1" && raw !== "true") return false;
  if (readSecret() === null) {
    warnMissingSecretOnce();
    return false;
  }
  return true;
}

/**
 * The signed message. The `master|` / `tenant|` tags are domain separation: a
 * tenant whose id happened to be the literal string "master" must not produce
 * the same message as the master surface.
 */
function surfaceMessage(assetId: string, surface: MediaSurface): string {
  return surface === null ? `master|${assetId}` : `tenant|${surface}|${assetId}`;
}

function computeSignature(assetId: string, surface: MediaSurface, secret: string): string {
  return createHmac("sha256", secret)
    .update(surfaceMessage(assetId, surface))
    .digest()
    .subarray(0, SIGNATURE_BYTES)
    .toString("base64url");
}

/**
 * The URL a page should render for `assetId` as seen from `surface`.
 *
 * Returns `null` when gating is off, so callers keep their existing public-URL
 * path rather than branching on a flag at every call site.
 */
export function gatedMediaPath(assetId: string, surface: MediaSurface): string | null {
  const secret = readSecret();
  if (!isPrivateMediaAccessEnabled() || !secret) return null;

  const signature = computeSignature(assetId, surface, secret);
  const params = new URLSearchParams();
  if (surface !== null) params.set(MEDIA_SURFACE_PARAM, surface);
  params.set(MEDIA_SIGNATURE_PARAM, signature);
  return `${GATED_MEDIA_ROUTE}/${encodeURIComponent(assetId)}?${params.toString()}`;
}

/**
 * Verify an inbound gated-media request and return the surface it was minted
 * for. `null` means the URL was not minted by us — the caller must refuse.
 *
 * The `{ surface }` wrapper exists because a VALID master-surface request
 * resolves to `null`, which would otherwise be indistinguishable from a
 * rejection.
 */
export function verifyGatedMediaRequest(
  assetId: string,
  params: { surface: string | null; signature: string | null },
): { surface: MediaSurface } | null {
  const secret = readSecret();
  if (!secret || !params.signature) return null;

  const surface = params.surface && params.surface.length > 0 ? params.surface : null;
  const expected = computeSignature(assetId, surface, secret);

  const provided = Buffer.from(params.signature, "base64url");
  const wanted = Buffer.from(expected, "base64url");
  if (provided.length !== wanted.length) return null;
  if (!timingSafeEqual(provided, wanted)) return null;

  return { surface };
}
