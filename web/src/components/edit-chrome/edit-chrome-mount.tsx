/**
 * EditChromeMount — server gate for the in-place editor.
 *
 * Rules:
 *   1. Only renders on storefront paths (/, /p/:slug, /:locale, /:locale/p/:slug).
 *      Admin, auth, onboarding, talent-profile, and all other platform paths
 *      return null immediately — the builder is storefront-only.
 *   2. Only renders on tenant hosts (agency or hub); marketing/app/unknown
 *      hosts get nothing.
 *   3. Only renders for authenticated staff (super_admin or agency_staff).
 *      Talent / clients / unauthenticated visitors see nothing.
 *   4. Reads the edit cookie server-side to tell the client which mode to
 *      mount in (pill vs shell) — avoids a client flash from idle→engaged.
 *   5. Loads the tenant's published locales so the topbar locale switcher
 *      can render on first paint. Composition still fetches its own
 *      `availableLocales` for cache freshness, but threading it through as
 *      a prop means the switcher is correct *immediately* — independent
 *      of which composition surface (homepage / future per-page) the
 *      editor mounts against.
 *
 * Import this from the root layout. It's safe on every path because it
 * short-circuits on non-storefront and hostless/anonymous requests.
 */

import { headers } from "next/headers";
import { requireStaff } from "@/lib/server/action-guards";
import { getPublicHostContext } from "@/lib/saas/scope";
import { isEditModeActiveForTenant } from "@/lib/site-admin/edit-mode/is-active";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import { resolveStorefrontLocale } from "@/lib/site-admin/server/storefront-locale";
import { ORIGINAL_PATHNAME_HEADER } from "@/i18n/request-locale";
import { EditChrome } from "./edit-chrome";

/**
 * Path prefixes that are never storefronts — the builder must not mount here.
 * Checked against the raw request pathname (before any rewrites).
 */
const NON_STOREFRONT_PREFIXES = [
  "/admin",
  "/login",
  "/auth",
  "/onboarding",
  "/t/",       // talent public profiles
  "/share/",   // share links
  "/invite/",  // invite flows
  "/api/",     // API routes (safety belt)
  "/dev/",     // internal dev routes
];

export async function EditChromeMount() {
  // Rule 1 — storefront-only. Read headers first (cheap) to skip all
  // expensive DB calls on admin / auth / platform routes.
  const reqHeaders = await headers();
  const rawPathname = reqHeaders.get(ORIGINAL_PATHNAME_HEADER) ?? "/";

  const isNonStorefront = NON_STOREFRONT_PREFIXES.some(
    (prefix) => rawPathname === prefix.replace(/\/$/, "") || rawPathname.startsWith(prefix),
  );
  if (isNonStorefront) return null;

  const ctx = await getPublicHostContext();
  if (ctx.kind !== "agency" && ctx.kind !== "hub") return null;

  const staff = await requireStaff();
  if (!staff.ok) {
    // T1-1 diagnostic — when ?edit=1 is on the URL but the staff check
    // fails, an operator on the tenant host sees nothing (no pill, no
    // error, just the live storefront). The most common cause in dev is
    // that the admin session cookie lives on `localhost` while the
    // storefront renders on a sibling host like `impronta.lvh.me` — the
    // browser does not send the session cookie across that domain
    // boundary. In production both hosts share the parent domain so the
    // cookie travels. This log makes the failure mode visible in the
    // dev terminal so the operator stops chasing a phantom bug.
    if (process.env.NODE_ENV !== "production") {
      const editIntent =
        rawPathname.includes("edit=1") ||
        reqHeaders.get("referer")?.includes("edit=1");
      if (editIntent) {
        console.warn(
          `[edit-mode] EditChromeMount: staff check failed on tenant host ` +
            `${ctx.kind} (tenantId=${ctx.tenantId}) with ?edit=1 intent. ` +
            `Likely cause: no staff session on this host. In dev: the admin ` +
            `session is on localhost; this storefront is on a sibling domain. ` +
            `Sign in on the storefront host directly, or run admin from the ` +
            `same parent domain (e.g. tulala.lvh.me + impronta.lvh.me).`,
        );
      }
    }
    return null;
  }

  const editActive = await isEditModeActiveForTenant(ctx.tenantId);
  // Resolve the request's effective locale so the editor loads the matching
  // homepage row (composer used to expose this via the ?locale= query; the
  // in-place editor inherits the storefront's locale resolution instead).
  const [localeContext, localeSettings] = await Promise.all([
    resolveStorefrontLocale(),
    loadTenantLocaleSettings(ctx.tenantId),
  ]);

  // Extract the page slug from the original request pathname so the editor
  // loads the correct page's composition. The middleware sets
  // ORIGINAL_PATHNAME_HEADER before any rewrites, giving us the raw URL path.
  //
  // Path shapes we handle:
  //   /                   → homepage (null)
  //   /p/about            → slug "about"
  //   /en/p/about         → locale "en", slug "about"
  //   /es                 → locale "es", homepage (null)
  //   /about              → slug "about" (hypothetical direct route)
  // rawPathname is already resolved above.
  const supportedLocales = localeContext.settings.supportedLocales as ReadonlyArray<string>;
  let segs = (rawPathname.split("?")[0] ?? "/").split("/").filter(Boolean);
  // 1. Strip optional locale prefix.
  if (segs.length > 0 && supportedLocales.includes(segs[0]!)) {
    segs = segs.slice(1);
  }
  // 2. Strip optional /p/ page-route prefix so `/p/about` → slug `about`.
  if (segs.length > 0 && segs[0] === "p") {
    segs = segs.slice(1);
  }
  // 3. First remaining segment is the slug; nothing left → homepage.
  const pageSlug = segs.length > 0 ? segs[0]! : null;

  return (
    <EditChrome
      tenantId={ctx.tenantId}
      editActive={editActive}
      locale={localeContext.locale}
      pageSlug={pageSlug}
      availableLocales={localeSettings.supportedLocales}
    />
  );
}
