/**
 * Clean public URLs for builder pages — the `/p/<slug>` ↔ `/<slug>` grammar.
 *
 * Owned here, not inlined in `proxy.ts`, for two reasons: the proxy sits under
 * a hard 800-line cap, and this grammar is the kind of thing that has to be
 * unit-testable without booting a request pipeline.
 *
 * ── The two directions ────────────────────────────────────────────────────
 *
 * SERVE (`resolveCleanUrlRewriteTarget`): a visitor asks for `/about` on a
 * tenant surface. Nothing in the platform allow-list answers to `/about`, so
 * it is a candidate page slug and the proxy rewrites it INTERNALLY to
 * `/p/about`, where the CMS catch-all renders it. The browser URL never
 * changes. An unpublished slug 404s from the page, not from here.
 *
 * REDIRECT (`resolveLegacyCmsRedirectPath`): a visitor arrives at the old
 * `/p/about` — a shared link, a QR code, a Google result. That is answered
 * with a 301 to `/about`, permanently, so link equity and bookmarks land on
 * the one canonical form.
 *
 * ── Why the 301 lives in middleware, not next.config.ts ───────────────────
 *
 * `next.config.ts` redirects are static and host-blind. This one is neither:
 *
 *   - Locale prefixes are per-TENANT. A tenant's default locale is served
 *     unprefixed and every other supported locale sits under `/<code>`, so the
 *     set of prefixes that may appear in front of `/p/` is a runtime value
 *     read from `agency_business_identity`, not a build-time enum.
 *   - Path-based workspaces carry a `/w/<tenantSlug>` prefix that must survive
 *     the redirect intact.
 *   - `/p/` must only collapse on a tenant surface. On the marketing host it
 *     is not a route at all.
 *
 * ── The one thing that must never redirect ───────────────────────────────
 *
 * `/p/__site_shell__` is the INTERNAL site-shell editing surface (flag-gated
 * plus a staff capability check inside the page). It is not a public page and
 * has no clean form. Underscores fail `SLUG_SEGMENT`, so both functions here
 * reject it by construction rather than by a name check — the same property
 * that keeps the shell sentinel unroutable from the public root.
 */

import type { LanguageSettings } from "@/lib/language-settings/types";
import { CMS_PATH_SEGMENT } from "@/lib/cms/paths";
import { WORKSPACE_PATH_SEGMENT } from "@/lib/saas/surface-allow-list";

/** One page-slug segment. Mirrors `SLUG_SEGMENT` in `cms/paths.ts`. */
const SLUG_SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Multi-segment slug path (`about`, `services/photography`). */
const SLUG_PATH = new RegExp(
  `^/([a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*)$`,
);

export type CleanUrlHostKind = "agency" | "app" | "hub" | "marketing" | string;

/**
 * The internal `/p/<slug>` target for a clean public URL, or `null` when this
 * request is not a clean-URL candidate.
 *
 * `canonicalPath` must already be locale-stripped and tenant-prefix-stripped —
 * i.e. the path AS THE TENANT SEES IT (`/about`, not `/es/w/acme/about`).
 * `isPathAllowed` is the surface allow-list; anything it claims is a platform
 * route and is never treated as a page slug.
 */
export function resolveCleanUrlRewriteTarget(params: {
  hostKind: CleanUrlHostKind;
  canonicalPath: string;
  isPathAllowed: (path: string) => boolean;
}): string | null {
  const { hostKind, canonicalPath, isPathAllowed } = params;
  // Only tenant storefronts have page slugs at their root. `agency` covers
  // both host-resolved tenants (custom domain, subdomain) and path-resolved
  // ones (`/w/<slug>` on the hub), because the path resolver returns an
  // `agency` context.
  if (hostKind !== "agency") return null;
  if (isPathAllowed(canonicalPath)) return null;

  const match = canonicalPath.match(SLUG_PATH);
  if (!match) return null;
  return `/${CMS_PATH_SEGMENT}/${match[1]}`;
}

/**
 * The clean destination for a legacy `/p/<slug>` URL, or `null` when the
 * request should be left alone.
 *
 * Takes the FULL browser pathname so it can preserve everything wrapped
 * around the `/p/` segment:
 *
 *   /p/about                    → /about
 *   /es/p/about                 → /es/about
 *   /w/acme/p/about             → /w/acme/about
 *   /es/w/acme/p/about          → /es/w/acme/about
 *   /p/services/photography     → /services/photography
 *
 * Returns `null` (keep serving `/p/`) when:
 *   - the host is not a tenant surface,
 *   - there is no slug after `/p`,
 *   - the slug is not a plain page slug (`__site_shell__`, encoded junk),
 *   - the clean form would collide with a platform route. Slugs like that
 *     cannot be created any more (see `reserved-routes.ts`), but grandfathered
 *     rows exist and must keep resolving to the page rather than silently
 *     redirecting a visitor onto `/directory` or `/login`.
 */
export function resolveLegacyCmsRedirectPath(params: {
  hostKind: CleanUrlHostKind;
  pathname: string;
  languageSettings: Pick<LanguageSettings, "publicLocales">;
  isPathAllowed: (path: string) => boolean;
}): string | null {
  const { hostKind, pathname, languageSettings, isPathAllowed } = params;
  if (hostKind !== "agency") return null;

  const parts = pathname.split("/").filter(Boolean);
  const prefix: string[] = [];
  let cursor = 0;

  // Optional leading locale segment. By the time middleware calls this the
  // default locale has already been stripped, so anything still here is a
  // real non-default prefix that must survive to the destination.
  const first = parts[cursor];
  if (
    first &&
    languageSettings.publicLocales.some((l) => l.toLowerCase() === first.toLowerCase())
  ) {
    prefix.push(first);
    cursor += 1;
  }

  // Optional `/w/<tenantSlug>` workspace prefix (path-based hosts).
  if (parts[cursor] === WORKSPACE_PATH_SEGMENT && parts[cursor + 1]) {
    prefix.push(parts[cursor]!, parts[cursor + 1]!);
    cursor += 2;
  }

  if (parts[cursor] !== CMS_PATH_SEGMENT) return null;
  const slugParts = parts.slice(cursor + 1);
  if (slugParts.length === 0) return null;
  if (!slugParts.every((segment) => SLUG_SEGMENT.test(segment))) return null;

  const cleanSlugPath = `/${slugParts.join("/")}`;
  if (isPathAllowed(cleanSlugPath)) return null;

  return `/${[...prefix, ...slugParts].join("/")}`;
}
