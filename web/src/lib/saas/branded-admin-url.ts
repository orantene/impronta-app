// Branded-host admin URL canonicalization.
//
// A host that IS the tenant — a custom domain like improntamodels.com, or a
// tenant subdomain like impronta.tulala.digital — already says which workspace
// you are in. Repeating the slug in the path says it twice:
//
//   improntamodels.com/impronta/admin   ← doubled, non-canonical
//   improntamodels.com/admin            ← canonical
//
// The proxy's "branded workspace shortcut" rewrite makes the branded form
// WORK (it internally routes `/admin` to the `[tenantSlug]/admin` tree). These
// helpers make it the ONLY form: one redirects the doubled URL back to the
// branded one, the other keeps auth's `?next=` round-trip from reintroducing
// the slug.
//
// Scope is deliberately narrow — the same two surfaces the shortcut rewrite
// covers. Public storefront paths are excluded because a CMS page slug may
// legitimately collide with the tenant slug, and path-addressed tenants
// (`/w/<slug>` on hub/marketing/local app hosts) genuinely need their prefix.

/** Surfaces the branded shortcut rewrite serves without a slug prefix. */
function isBrandedWorkspaceSurface(pathWithoutSlug: string): boolean {
  return (
    pathWithoutSlug === "/admin" ||
    pathWithoutSlug.startsWith("/admin/") ||
    pathWithoutSlug === "/client" ||
    pathWithoutSlug.startsWith("/client/")
  );
}

/**
 * Phase 3.12 / 3.13 — branded workspace shortcuts on agency hosts.
 *
 * Given a slug-less request pathname, return the slug-prefixed path it should
 * be INTERNALLY rewritten to (browser URL unchanged), or `null` to leave it
 * alone. `/admin` and `/client` have no standalone (non-slug) route tree, so
 * the branded URL can only be served by routing it through the canonical
 * `[tenantSlug]` handlers.
 *
 * `/talent/*` is DELIBERATELY EXCLUDED. The talent self-surface has its own
 * standalone, host-agnostic tree at `app/(workspace)/talent/*` that resolves
 * the talent's active agency from session + cookie, so it renders correctly on
 * ANY host without a slug prefix (the app host already serves it this way).
 * The tenant-scoped `app/(workspace)/[tenantSlug]/talent/*` pages, by
 * contrast, are all *legacy redirectors* that `redirect()` straight back to
 * `/talent/*`. So rewriting `/talent/foo` → `/<slug>/talent/foo` lands on a
 * redirector that bounces back to `/talent/foo`, which middleware rewrites
 * again — an infinite client-side navigation loop where every hop is an HTTP
 * 200 carrying a NEXT_REDIRECT directive to the same URL (the page never
 * settles, the heading never renders). This bit every canonical
 * platform-talent route — /talent/trust, /talent/discover,
 * /talent/settings/payouts — on agency custom domains. Letting `/talent/*`
 * fall through to its own tree is both correct and identical to how the app
 * host serves it.
 *
 * `/client/register` is excluded too: it is an unauthenticated (auth)-route
 * page, and rewriting it to `/<slug>/client/register` would hit a
 * non-existent workspace path → 404, breaking the client-acquisition funnel
 * on the tenant's own host.
 */
export function brandedAdminRewritePath(
  pathname: string,
  tenantSlug: string,
): string | null {
  if (!tenantSlug) return null;
  if (pathname === "/client/register") return null;
  if (pathname.startsWith(`/${tenantSlug}/`)) return null;
  return isBrandedWorkspaceSurface(pathname) ? `/${tenantSlug}${pathname}` : null;
}

/**
 * Given a request pathname on a tenant-owned host, return the branded
 * (slug-less) path it should be redirected to, or `null` to leave it alone.
 *
 * `/impronta/admin/roster` → `/admin/roster`
 * `/impronta/gallery`      → null (storefront, not ours to touch)
 * `/admin/roster`          → null (already canonical)
 */
export function brandedAdminRedirectPath(
  pathname: string,
  tenantSlug: string,
): string | null {
  if (!tenantSlug) return null;
  const slugPrefix = `/${tenantSlug}`;
  if (!pathname.startsWith(`${slugPrefix}/`)) return null;
  const withoutSlug = pathname.slice(slugPrefix.length);
  return isBrandedWorkspaceSurface(withoutSlug) ? withoutSlug : null;
}

/**
 * Strip the tenant slug from a redirect's `?next=` when the branded shortcut
 * rewrite put it there.
 *
 * Auth routing runs against the POST-rewrite path, so a signed-out visitor to
 * the branded `/admin` gets bounced to `/login?next=/<slug>/admin` and, after
 * signing in, lands on the doubled URL. `brandedAdminRedirectPath` would
 * eventually correct that, but only after an extra round-trip and a visible
 * flash of the non-canonical URL.
 *
 * Mutates `response`'s `location` header in place; no-ops when there is
 * nothing to normalize.
 */
export function normalizeBrandedNextParam(
  response: { headers: Headers },
  tenantSlug: string,
): void {
  const location = response.headers.get("location");
  if (!location || !tenantSlug) return;

  // `location` is normally absolute, but may be relative. A placeholder base
  // makes parsing total; it is discarded when writing the value back.
  let url: URL;
  try {
    url = new URL(location, "http://placeholder.invalid");
  } catch {
    return;
  }

  const next = url.searchParams.get("next");
  if (!next) return;

  const branded = brandedAdminRedirectPath(next, tenantSlug);
  if (!branded) return;

  url.searchParams.set("next", branded);
  response.headers.set(
    "location",
    location.startsWith("/") ? `${url.pathname}${url.search}` : url.toString(),
  );
}
