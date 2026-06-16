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

import { improntaLog } from "@/lib/server/structured-log";
import { headers } from "next/headers";
import { requireStaff } from "@/lib/server/action-guards";
import { getPublicHostContext } from "@/lib/saas/scope";
import { type CompositionData } from "@/lib/site-admin/edit-mode/composition-actions";
import { homepageAdapter } from "@/lib/site-admin/builder-core/adapters/homepage-adapter";
import { createBoundCmsPageAdapter } from "@/lib/site-admin/builder-core/adapters/cms-page-adapter";
import { createBoundSiteShellAdapter } from "@/lib/site-admin/builder-core/adapters/site-shell-adapter";
import { shouldRouteSiteShellSurface } from "@/lib/site-admin/site-shell-flag";
import { isEditModeActiveForTenant } from "@/lib/site-admin/edit-mode/is-active";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import { resolveStorefrontLocale } from "@/lib/site-admin/server/storefront-locale";
import { ORIGINAL_PATHNAME_HEADER } from "@/i18n/request-locale";
import { HOST_TENANT_SLUG_HEADER, PUBLIC_PATH_PREFIX_HEADER } from "@/lib/saas/scope";
import { loadBuilderWorkspacePlan } from "@/lib/site-admin/builder-capabilities";
import { loadTenantSiteLabelForEditChrome } from "@/lib/site-admin/edit-mode/tenant-site-label";
import { EditChrome } from "./edit-chrome";
import { resolvePublicSurfaceOwnershipFromPath } from "./edit-path";

/**
 * Path prefixes that are never storefronts — the builder must not mount here.
 * Checked against the raw request pathname (before any rewrites).
 *
 * Important: tenant agency hosts (impronta.tulala.digital) ALLOW dashboard
 * paths so members can run the workspace from their subdomain
 * (`surface-allow-list.ts` AGENCY branch). That means /admin, /talent,
 * /client all resolve on the agency host — which would also match the
 * `agency` kind check in EditChromeMount and try to mount the editor on
 * top of dashboard chrome. Every dashboard prefix MUST appear here.
 */
const NON_STOREFRONT_PREFIXES = [
  "/admin",
  "/talent",   // talent dashboard (NOT /t/<slug> public profile)
  "/client",   // client dashboard
  "/login",
  "/register",
  "/auth",
  "/onboarding",
  "/account",  // account settings
  "/t/",       // talent public profiles
  "/share/",   // share links
  "/invite/",  // invite flows
  "/api/",     // API routes (safety belt)
  "/dev/",     // internal dev routes
  "/prototypes/", // dev/staging prototype routes
  "/update-password",
  "/forgot-password",
  "/waitlist",
];

export async function EditChromeMount() {
  // Rule 1 — storefront-only. Read headers first (cheap) to skip all
  // expensive DB calls on admin / auth / platform routes.
  const reqHeaders = await headers();
  const rawPathname = reqHeaders.get(ORIGINAL_PATHNAME_HEADER) ?? "/";

  // On tenant hosts the URL can legitimately carry the tenant slug as the
  // first segment (e.g. `improntamodels.com/impronta/admin/roster/[id]`).
  // The `(workspace)/[tenantSlug]` route resolves the same way for both
  // path-based access (`tulala.digital/impronta/...`) and custom-domain
  // access — so admins reach the dashboard with the slug in the path on
  // BOTH host kinds. Strip a leading `/<tenantSlug>` (or the path-mode
  // PUBLIC_PATH_PREFIX_HEADER) before the NON_STOREFRONT_PREFIXES check
  // so admin / talent / client / auth routes are detected even when the
  // tenant slug is in front. Without this the check would silently miss
  // `/impronta/admin/...` and the editor would mount over the dashboard.
  const publicPathPrefix = reqHeaders.get(PUBLIC_PATH_PREFIX_HEADER) ?? "";
  const tenantSlug = reqHeaders.get(HOST_TENANT_SLUG_HEADER) ?? "";
  let normalizedPath = rawPathname;
  if (publicPathPrefix && normalizedPath.startsWith(publicPathPrefix)) {
    normalizedPath = normalizedPath.slice(publicPathPrefix.length) || "/";
  } else if (tenantSlug) {
    const slugPrefix = `/${tenantSlug}`;
    if (
      normalizedPath === slugPrefix ||
      normalizedPath.startsWith(`${slugPrefix}/`)
    ) {
      normalizedPath = normalizedPath.slice(slugPrefix.length) || "/";
    }
  }

  const isNonStorefront = NON_STOREFRONT_PREFIXES.some(
    (prefix) => normalizedPath === prefix.replace(/\/$/, "") || normalizedPath.startsWith(prefix),
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
        void improntaLog("edit_chrome_mount.warn", {
          message: `[edit-mode] EditChromeMount: staff check failed on tenant host ` +
            `${ctx.kind} (tenantId=${ctx.tenantId}) with ?edit=1 intent. ` +
            `Likely cause: no staff session on this host. In dev: the admin ` +
            `session is on localhost; this storefront is on a sibling domain. ` +
            `Sign in on the storefront host directly, or run admin from the ` +
            `same parent domain (e.g. tulala.lvh.me + impronta.lvh.me).`,
        });
      }
    }
    return null;
  }

  const editActive = await isEditModeActiveForTenant(ctx.tenantId);
  const workspacePlan = await loadBuilderWorkspacePlan(staff.supabase, ctx.tenantId, {
    logTag: "edit-mode",
  });
  // Resolve the request's effective locale so the editor loads the matching
  // homepage row (composer used to expose this via the ?locale= query; the
  // in-place editor inherits the storefront's locale resolution instead).
  const [localeContext, localeSettings] = await Promise.all([
    resolveStorefrontLocale(),
    loadTenantLocaleSettings(ctx.tenantId),
  ]);

  // Extract the page slug from the original request pathname so the editor
  // loads the correct page's composition, but only for builder-owned
  // surfaces. The middleware sets
  // ORIGINAL_PATHNAME_HEADER before any rewrites, giving us the raw URL path.
  //
  // Path shapes we handle:
  //   /                   → homepage (null)
  //   /p/about            → slug "about"
  //   /en/p/about         → locale "en", slug "about"
  //   /es                 → locale "es", homepage (null)
  //   /about              → slug "about" (hypothetical direct route)
  //   /directory          → seeded Directory system page (__directory__)
  //   /t/TAL-...          → profile public surface (no mount)
  // rawPathname is already resolved above.
  const supportedLocales = localeContext.settings.supportedLocales as ReadonlyArray<string>;
  const ownership = resolvePublicSurfaceOwnershipFromPath({
    rawPathname,
    supportedLocales,
    publicPathPrefix,
  });

  // WS-A A2 — the `site_shell` editor surface. The `__site_shell__` storefront
  // path resolves to ownership.kind "site_shell" (set up in A1's edit-path
  // resolver). Routing here is gated on `shouldRouteSiteShellSurface`, OFF by
  // default: with the flag off this branch is NEVER taken — a `site_shell`
  // ownership falls through to the `return null` below exactly as before, so the
  // existing mount path is byte-for-byte unchanged. The shell surface is keyed
  // by (tenant, locale), not slug — the adapter ignores pageSlug — but we thread
  // the canonical `__site_shell__` slug for display + surface identity.
  const siteShellSurfaceActive =
    ownership.kind === "site_shell" &&
    shouldRouteSiteShellSurface(ctx.tenantId);

  if (
    ownership.kind !== "builder_page" &&
    ownership.kind !== "directory" &&
    !siteShellSurfaceActive
  ) {
    return null;
  }
  const pageSlug = siteShellSurfaceActive
    ? "__site_shell__"
    : ownership.kind === "directory"
      ? "__directory__"
      : ownership.kind === "builder_page"
        ? ownership.pageSlug
        : null;

  // T1-2 — Server-prefetch the composition when the editor is engaged.
  //
  // The audit's biggest first-paint trust issue: navigator says 0 sections,
  // canvas insert points say 0 slots, publish drawer says 0 sections going
  // live — all while the canvas is rendering a populated homepage. Cause:
  // the EditProvider seeds state from empty defaults and only fetches via
  // a client-side server-action call after mount. With this prefetch the
  // provider's initial state is the real composition before React even
  // hydrates, so all three surfaces are correct on first paint.
  //
  // We only prefetch when editActive is true. The idle EditPill and the
  // PreviewPill don't render the navigator / drawers, so the data isn't
  // needed and we'd just be paying a DB round-trip for nothing. The action
  // itself does its own staff + tenant-scope guards (we already passed both
  // above) so an unauthenticated path reaching this branch would still get
  // a typed error result we ignore — we never throw on prefetch failure;
  // the client-side fetch retry path is the safety net.
  let tenantSiteLabel: string | null = null;
  if (ctx.kind === "agency" || ctx.kind === "hub") {
    try {
      tenantSiteLabel = await loadTenantSiteLabelForEditChrome(
        staff.supabase,
        ctx.tenantId,
      );
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        void improntaLog("edit_chrome_mount.warn", {
          message: "[edit-mode] loadTenantSiteLabelForEditChrome failed:",
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // Wave 4.1 — is this cms_page FREEFORM (is_freeform=true)? Only real custom
  // slugs can be (never the homepage, never the __system__ pages), so the
  // homepage/system/slot edit path is provably untouched. The flag picks the
  // editor surface for BOTH the server prefetch (below) AND EditChrome's client
  // config, so the two always agree.
  let freeformPageMode = false;
  if (
    (ctx.kind === "agency" || ctx.kind === "hub") &&
    pageSlug &&
    !pageSlug.startsWith("__")
  ) {
    try {
      const { data: freeformRow } = await staff.supabase
        .from("cms_pages")
        .select("is_freeform")
        .eq("tenant_id", ctx.tenantId)
        .eq("slug", pageSlug)
        .eq("is_freeform", true)
        .maybeSingle();
      freeformPageMode = !!freeformRow;
    } catch {
      freeformPageMode = false;
    }
  }

  // WS1 core-adapter seam — prefetch the composition through the matching
  // adapter so server + client stay on one seam (eliminates the "0 sections"
  // first-paint flash). FREEFORM pages prefetch via the cms_page adapter
  // (cms_pages.blocks); homepage + slot pages via the homepage adapter (a pure
  // pass-through over loadHomepageCompositionAction — byte-identical behaviour).
  let initialComposition: CompositionData | null = null;
  if (editActive) {
    try {
      // WS-A A2 — the shell surface prefetches via the A1 site_shell adapter
      // (cms_pages.blocks draft, falling back to the published snapshot tree).
      // It is keyed by locale; pageSlug is ignored by the adapter. Only reachable
      // when `siteShellSurfaceActive` (flag ON) — otherwise this branch is dead.
      const res = siteShellSurfaceActive
        ? await createBoundSiteShellAdapter(localeContext.locale).load({
            locale: localeContext.locale,
            pageSlug,
          })
        : freeformPageMode
          ? await createBoundCmsPageAdapter().load({
              locale: localeContext.locale,
              pageSlug,
            })
          : await homepageAdapter.load({
              locale: localeContext.locale,
              pageSlug,
            });
      if (res.ok) {
        initialComposition = res.data;
      } else {
        void improntaLog("edit_chrome_mount.warn", {
          message: `[edit-mode] prefetch composition failed: ${res.error}`,
        });
      }
    } catch (err) {
      // Never let a prefetch failure break the editor — fall through to
      // the legacy client-side load path. Logged for diagnostics only.
      void improntaLog("edit_chrome_mount.warn", {
        message: "[edit-mode] prefetch composition threw:",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const workspaceMembershipSlug =
    ctx.kind === "agency" && ctx.tenantSlug.trim() !== ""
      ? ctx.tenantSlug
      : null;

  // Owner-only gate: raw-HTML `code` blocks are insertable only by platform
  // owners (super_admin), never by ordinary workspace editors (agency_staff).
  const canInsertRawHtmlElements = staff.profile?.app_role === "super_admin";

  return (
    <EditChrome
      tenantId={ctx.tenantId}
      editActive={editActive}
      locale={localeContext.locale}
      pageSlug={pageSlug}
      availableLocales={localeSettings.supportedLocales}
      defaultLocale={localeSettings.defaultLocale}
      initialComposition={initialComposition}
      workspacePlan={workspacePlan}
      tenantSiteLabel={tenantSiteLabel}
      workspaceMembershipSlug={workspaceMembershipSlug}
      canInsertRawHtmlElements={canInsertRawHtmlElements}
      freeformPageMode={freeformPageMode}
      siteShellMode={siteShellSurfaceActive}
    />
  );
}
