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
 * WHY THE SURFACE AND SIGNATURE LIVE IN THE PATH AND NOT IN A QUERY STRING
 * ───────────────────────────────────────────────────────────────────────
 * They used to be query params (`?s=<surface>&k=<sig>`). That shipped, was
 * switched on in production, and instantly broke every talent photo on the
 * public directory: cards rendered alt text and a broken-image icon.
 *
 * The route was never the problem — fetched directly it 302s to a signed
 * storage URL and serves the bytes. `next/image` was. Next refuses to optimize
 * a LOCAL path carrying a query string unless `images.localPatterns` permits
 * it, and — this is the part that is easy to get wrong — the permission is not
 * opt-out. `next/dist/server/config` normalizes an ABSENT `images.localPatterns`
 * to `[{ pathname: "**", search: "" }]`, i.e. every local path, but only with an
 * EMPTY query string. So a config with no `localPatterns` at all is not
 * permissive; it is precisely the rule that rejects us, and
 * `ImageOptimizerCache.validateParams` answers `"url" parameter is not allowed`
 * → HTTP 400 → broken image.
 *
 * Putting both values in the path sidesteps the restriction rather than
 * negotiating with it:
 *
 *   master surface   /api/media/asset/m/<sig>/<assetId>
 *   tenant surface   /api/media/asset/t/<tenantId>/<sig>/<assetId>
 *
 * There is no query string, so the minted URL matches Next's own default and
 * `next.config.ts` needs no `images.localPatterns` entry. That is deliberate.
 * The alternative — allow-listing `/api/media/asset/**` with `search` omitted —
 * does work in this Next version (an omitted `search` skips the check outright),
 * but it is the worse trade: declaring `localPatterns` REPLACES the `**`
 * default instead of extending it, so the same edit that unbreaks gated media
 * silently breaks every other local image on the platform unless the author
 * also remembers to re-add `{ pathname: "**", search: "" }` by hand. A fix
 * whose failure mode is "all images vanish, in a file nobody links to this
 * feature from" is not a fix. Coupling the URL grammar to a config file two
 * directories away is the fragility; not needing the config at all is the
 * repair.
 *
 * The two leading segments (`m` / `t`) mirror the `master|` / `tenant|` tags in
 * `surfaceMessage()`: the shape is unambiguous for EVERY tenant id, including a
 * tenant whose id is the literal string `m`, which addresses as `t/m/...`.
 *
 * `gated-url-optimizer.test.ts` holds this property down by running the real
 * `next.config.ts` through Next's own config loader and the minted URL through
 * Next's own `validateParams`. Every test that existed when the query-string
 * grammar shipped passed; none of them looked through the optimizer.
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

/**
 * Leading path segment marking a request minted for the master surface.
 * Shape: `/api/media/asset/m/<sig>/<assetId>`.
 */
export const MEDIA_MASTER_SEGMENT = "m";
/**
 * Leading path segment marking a request minted for a tenant surface. The
 * tenant id is the segment after it: `/api/media/asset/t/<id>/<sig>/<assetId>`.
 *
 * A distinct leading tag (rather than a reserved placeholder value in a fixed
 * surface slot) is what makes the grammar total: there is no tenant id that
 * could be mistaken for the master marker.
 */
export const MEDIA_TENANT_SEGMENT = "t";

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
  const segments =
    surface === null
      ? [MEDIA_MASTER_SEGMENT, signature, assetId]
      : [MEDIA_TENANT_SEGMENT, surface, signature, assetId];
  // No query string, by design — see the optimizer note in the module header.
  return `${GATED_MEDIA_ROUTE}/${segments.map(encodeURIComponent).join("/")}`;
}

/** What a well-formed gated path says before any of it is believed. */
export type ParsedGatedMediaPath = {
  surface: MediaSurface;
  assetId: string;
  signature: string;
};

/**
 * Split a gated-media path into its claims. Pure shape work: NOTHING here is
 * trusted, and a successful parse grants nothing — `verifyGatedMediaRequest()`
 * is what decides whether we minted this URL.
 *
 * Kept separate from verification so the grammar can be tested without a
 * signing secret, and so a malformed path is distinguishable in tests from a
 * well-formed one bearing a forged signature.
 *
 * `segments` are the already-percent-decoded path segments AFTER
 * `GATED_MEDIA_ROUTE` — exactly what a catch-all route hands over.
 */
export function parseGatedMediaPath(segments: string[]): ParsedGatedMediaPath | null {
  const [tag, ...rest] = segments;

  if (tag === MEDIA_MASTER_SEGMENT && rest.length === 2) {
    const [signature, assetId] = rest;
    if (!signature || !assetId) return null;
    return { surface: null, assetId, signature };
  }

  if (tag === MEDIA_TENANT_SEGMENT && rest.length === 3) {
    const [surface, signature, assetId] = rest;
    // An empty tenant segment would otherwise collapse into the master surface.
    if (!surface || !signature || !assetId) return null;
    return { surface, assetId, signature };
  }

  return null;
}

/**
 * Verify an inbound gated-media request and return the surface and asset it was
 * minted for. `null` means the URL was not minted by us — the caller must
 * refuse.
 *
 * Returning a wrapper object rather than the bare surface is load-bearing: a
 * VALID master-surface request resolves to `surface: null`, which would
 * otherwise be indistinguishable from a rejection.
 */
export function verifyGatedMediaRequest(
  segments: string[],
): { surface: MediaSurface; assetId: string } | null {
  const secret = readSecret();
  if (!secret) return null;

  const parsed = parseGatedMediaPath(segments);
  if (!parsed) return null;

  const expected = computeSignature(parsed.assetId, parsed.surface, secret);

  const provided = Buffer.from(parsed.signature, "base64url");
  const wanted = Buffer.from(expected, "base64url");
  if (provided.length !== wanted.length) return null;
  if (!timingSafeEqual(provided, wanted)) return null;

  return { surface: parsed.surface, assetId: parsed.assetId };
}
