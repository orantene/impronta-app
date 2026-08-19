/**
 * EditChromeMount — server gate for the in-place editor.
 *
 * Rules:
 *   1. Only renders on storefront paths (/, /p/:slug, /:locale, /:locale/p/:slug).
 *      Admin, auth, onboarding, talent-profile, and all other platform paths
 *      return null immediately — the builder is storefront-only.
 *   2. Only renders on tenant hosts (agency or hub); marketing/app/unknown
 *      hosts get nothing.
 *   3. Only renders for an authenticated MEMBER of the host's tenant — proven
 *      by the membership capability `agency.site_admin.pages.edit`, not by the
 *      global `profiles.app_role`. (2026-08-04: the old `requireStaff()` gate
 *      hid the edit pill from hybrid workspace owners — talent/client-signup
 *      users who own a workspace keep `app_role='talent'`/`'client'` — on
 *      their OWN storefront. Membership is the boundary; see the AUTH MODEL
 *      note on requireStaffTenantAction.) Talent / clients / unauthenticated
 *      visitors, and members of a DIFFERENT tenant, see nothing.
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

import { resolveAgencyHomeSlug } from "@/lib/site-admin/server/page-roles";
import { improntaLog } from "@/lib/server/structured-log";
import { headers } from "next/headers";
import { requireSession } from "@/lib/server/action-guards";
import { userHasCapability } from "@/lib/access";
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
import {
  isNonStorefrontPath,
  normalizeStorefrontPath,
} from "./non-storefront-path";

export async function EditChromeMount() {
  // Rule 1 — storefront-only. Read headers first (cheap) to skip all
  // expensive DB calls on admin / auth / platform routes.
  const reqHeaders = await headers();
  const rawPathname = reqHeaders.get(ORIGINAL_PATHNAME_HEADER) ?? "/";

  // Strip a leading `/<tenantSlug>` (or the path-mode PUBLIC_PATH_PREFIX_HEADER)
  // before the non-storefront check — see `non-storefront-path.ts`, which owns
  // both the prefix list and this normalisation so the quick-bar mount cannot
  // drift from the editor mount.
  const publicPathPrefix = reqHeaders.get(PUBLIC_PATH_PREFIX_HEADER) ?? "";
  const tenantSlug = reqHeaders.get(HOST_TENANT_SLUG_HEADER) ?? "";
  const normalizedPath = normalizeStorefrontPath(
    rawPathname,
    publicPathPrefix,
    tenantSlug,
  );
  if (isNonStorefrontPath(normalizedPath)) return null;

  const ctx = await getPublicHostContext();
  if (ctx.kind !== "agency" && ctx.kind !== "hub") return null;

  const session = await requireSession();
  // Membership proof, scoped to the tenant this host actually serves: a member
  // of tenant A never gets the edit pill on tenant B's storefront. Replaces the
  // former global-app_role `requireStaff()` gate (see the module doc, rule 3).
  const canEdit =
    session.ok &&
    (await userHasCapability("agency.site_admin.pages.edit", ctx.tenantId));
  if (!session.ok || !canEdit) {
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
  const staff = session;

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
  let pageSlug = siteShellSurfaceActive
    ? "__site_shell__"
    : ownership.kind === "directory"
      ? "__directory__"
      : ownership.kind === "builder_page"
        ? ownership.pageSlug
        : null;

  // The ROOT path carries no slug, so `pageSlug` is null here for "/".
  //
  // The public renderer resolves the tenant's `pageRoles.home` pointer to decide
  // what "/" actually is (app/page.tsx). The editor did not — it fell straight
  // through to the legacy homepage adapter — so for a tenant whose "/" is a
  // FREEFORM page the two surfaces disagreed about what the homepage even is:
  // the live site served the freeform page while the builder opened the old
  // slot-composed row and offered to edit that. An operator could publish edits
  // all day to a page nobody was looking at.
  //
  // Resolving the same pointer here puts both surfaces on one answer. It
  // returns null unless a PUBLISHED page exists at the pointer for this locale,
  // so a tenant with no home role (or a dangling one) still gets the legacy
  // adapter exactly as before.
  if (
    !pageSlug &&
    ownership.kind === "builder_page" &&
    (ctx.kind === "agency" || ctx.kind === "hub")
  ) {
    try {
      pageSlug = await resolveAgencyHomeSlug(ctx.tenantId, localeContext.locale);
    } catch {
      pageSlug = null;
    }
  }

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
      // MUST filter by locale: `cms_pages` is unique on (tenant_id, locale,
      // slug), so a page that exists in EN and ES matches two rows here and
      // `.maybeSingle()` errors out — leaving freeformPageMode=false, which
      // sends a freeform page through the homepage adapter and paints an
      // EMPTY canvas over live content. This is why every multi-locale
      // freeform page (Contact, About, FAQ, …) opened blank in the builder
      // while the single-locale homepage was fine.
      const { data: freeformRow } = await staff.supabase
        .from("cms_pages")
        .select("is_freeform")
        .eq("tenant_id", ctx.tenantId)
        .eq("locale", localeContext.locale)
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
