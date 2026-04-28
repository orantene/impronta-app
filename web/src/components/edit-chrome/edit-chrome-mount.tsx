/**
 * EditChromeMount — server gate for the in-place editor.
 *
 * Rules:
 *   1. Only renders on tenant hosts (agency or hub); marketing/app/unknown
 *      hosts get nothing.
 *   2. Only renders for authenticated staff (super_admin or agency_staff).
 *      Talent / clients / unauthenticated visitors see nothing.
 *   3. Reads the edit cookie server-side to tell the client which mode to
 *      mount in (pill vs shell) — avoids a client flash from idle→engaged.
 *   4. Loads the tenant's published locales so the topbar locale switcher
 *      can render on first paint. Composition still fetches its own
 *      `availableLocales` for cache freshness, but threading it through as
 *      a prop means the switcher is correct *immediately* — independent
 *      of which composition surface (homepage / future per-page) the
 *      editor mounts against.
 *
 * Import this from the root layout. It's safe on every path because it
 * short-circuits on hostless/anonymous requests.
 */

import { headers } from "next/headers";
import { requireStaff } from "@/lib/server/action-guards";
import { getPublicHostContext } from "@/lib/saas/scope";
import { isEditModeActiveForTenant } from "@/lib/site-admin/edit-mode/is-active";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import { resolveStorefrontLocale } from "@/lib/site-admin/server/storefront-locale";
import { ORIGINAL_PATHNAME_HEADER } from "@/i18n/request-locale";
import { EditChrome } from "./edit-chrome";

export async function EditChromeMount() {
  const ctx = await getPublicHostContext();
  if (ctx.kind !== "agency" && ctx.kind !== "hub") return null;

  const staff = await requireStaff();
  if (!staff.ok) return null;

  const editActive = await isEditModeActiveForTenant(ctx.tenantId);
  // Resolve the request's effective locale so the editor loads the matching
  // homepage row (composer used to expose this via the ?locale= query; the
  // in-place editor inherits the storefront's locale resolution instead).
  const [localeContext, localeSettings, requestHeaders] = await Promise.all([
    resolveStorefrontLocale(),
    loadTenantLocaleSettings(ctx.tenantId),
    headers(),
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
  const rawPathname = requestHeaders.get(ORIGINAL_PATHNAME_HEADER) ?? "/";
  const supportedLocales = localeContext.settings.supportedLocales as ReadonlyArray<string>;
  let segs = rawPathname.split("?")[0]!.split("/").filter(Boolean);
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
