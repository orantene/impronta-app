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
 * Gating is off unless someone deliberately turns it on. While it is off,
 * `mediaUrlForAsset()` returns exactly what `mediaPublicUrl()` returned before
 * this file existed, character for character, and the route 404s. A wrong move
 * here blanks every image on every site, so the mechanism ships proven and
 * dark.
 *
 * WHO DECIDES: THE PRECEDENCE TABLE
 * ─────────────────────────────────
 * The on/off decision lives in `platform_settings.media_private_access_enabled`
 * so the owner can flip it from /platform/admin/settings without a deploy. The
 * environment keeps a veto, because "kill this feature now" must not depend on
 * a database write landing.
 *
 *   MEDIA_PRIVATE_ACCESS_ENABLED   platform setting   secret   ⇒ effective
 *   ────────────────────────────   ────────────────   ──────   ───────────
 *   "0" / "false"                  anything           any      OFF (forced)
 *   "1" / "true"                   anything           present  ON  (forced)
 *   "1" / "true"                   anything           MISSING  OFF + warn once
 *   unset / anything else          ON                 present  ON
 *   unset / anything else          ON                 MISSING  OFF + warn once
 *   unset / anything else          OFF                any      OFF
 *
 * The env var force-ENABLES on "1"/"true" purely for back-compat with the
 * contract that shipped before the setting existed. Anything unrecognised
 * (including the empty string) is treated as unset, i.e. defer to the setting.
 *
 * THE SECRET NEVER MOVES INTO THE DATABASE
 * ────────────────────────────────────────
 * `MEDIA_URL_SIGNING_SECRET` stays an environment variable. It is the thing
 * that makes a gated URL unforgeable; anyone who could read a settings row
 * could otherwise mint a URL for any (asset, surface) pair. The switch is safe
 * to hand to an admin UI; the secret is not.
 *
 * THIS MODULE STAYS PURE
 * ──────────────────────
 * `resolvePrivateMediaAccess()` takes the platform setting as an ARGUMENT and
 * reads only `process.env` besides. No database client is imported here, so
 * `gatedMediaPath()` can stay synchronous and be called once per image without
 * a query behind it. The one place that actually reads the setting (and caches
 * it) is `@/lib/platform/gated-media`.
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
    "[media/private-access] Gated media access is switched ON but " +
      "MEDIA_URL_SIGNING_SECRET is not set. Gated media stays OFF (public " +
      "URLs, today's behavior). Set the secret to enable it.",
  );
}

/** Test seam. The warn-once latch is process-wide and would hide later cases. */
export function __resetPrivateMediaWarning(): void {
  warnedMissingSecret = false;
}

/**
 * The env var's three states: forced on, forced off, or "not my call".
 *
 * Anything unrecognised (including "") reads as unset rather than as off, so a
 * typo defers to the platform setting instead of silently vetoing it.
 */
export function readPrivateMediaEnvOverride(): boolean | null {
  const raw = process.env.MEDIA_PRIVATE_ACCESS_ENABLED?.trim().toLowerCase();
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return null;
}

/** Why gating ended up on or off. The admin UI renders one line per value. */
export type PrivateMediaAccessReason =
  /** MEDIA_PRIVATE_ACCESS_ENABLED=0/false. The switch has no effect. */
  | "forced_off_by_env"
  /** Someone asked for it, but MEDIA_URL_SIGNING_SECRET is not configured. */
  | "missing_secret"
  /** Nobody asked for it. Today's behavior, public URLs. */
  | "setting_off"
  /** On, and actually serving through the checked route. */
  | "active";

/**
 * The full answer, not just the boolean.
 *
 * The admin UI has to be honest about a two-part state: a switch that is ON
 * while the signing secret is missing is NOT a working feature, and showing it
 * as a green check would be a lie. So the resolver returns every input it used
 * and the reason it reached its verdict, and the UI renders that rather than
 * re-deriving it from a bare boolean.
 */
export type PrivateMediaAccessState = {
  /** The effective answer. The other fields explain it. */
  enabled: boolean;
  /** What `platform_settings.media_private_access_enabled` says. */
  settingEnabled: boolean;
  /** Is `MEDIA_URL_SIGNING_SECRET` configured? Never its value. */
  secretConfigured: boolean;
  /** `true` forced on, `false` forced off, `null` defer to the setting. */
  envOverride: boolean | null;
  reason: PrivateMediaAccessReason;
};

/**
 * Resolve the effective state from the platform setting plus the environment.
 *
 * Synchronous and pure apart from `process.env`, which is what lets callers
 * resolve once per request and pass the boolean down to every image. See the
 * precedence table in the module header.
 */
export function resolvePrivateMediaAccess(settingEnabled: boolean): PrivateMediaAccessState {
  const envOverride = readPrivateMediaEnvOverride();
  const secretConfigured = readSecret() !== null;
  const base = { settingEnabled, secretConfigured, envOverride } as const;

  // The kill switch. Checked first and answered without looking at anything
  // else, so "turn it off now" never depends on a database write landing.
  if (envOverride === false) {
    return { ...base, enabled: false, reason: "forced_off_by_env" };
  }

  const wanted = envOverride === true || settingEnabled;
  if (!wanted) return { ...base, enabled: false, reason: "setting_off" };

  // Misconfiguration degrades to today's behavior, never to a blank site.
  if (!secretConfigured) {
    warnMissingSecretOnce();
    return { ...base, enabled: false, reason: "missing_secret" };
  }

  return { ...base, enabled: true, reason: "active" };
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
 *
 * `enabled` is PASSED IN, not looked up. This function runs once per rendered
 * image; the caller resolves the state once for the whole request (it already
 * had to await the database for the assets themselves) and hands the answer
 * down. That is also why this stays synchronous.
 */
export function gatedMediaPath(
  assetId: string,
  surface: MediaSurface,
  enabled: boolean,
): string | null {
  const secret = readSecret();
  // The secret re-check is belt and braces: `enabled` can only be true when a
  // secret was configured, but this function must never mint an unsigned URL
  // even if a caller passes a stale boolean.
  if (!enabled || !secret) return null;

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
