import { notFound } from "next/navigation";

import { EditChrome } from "@/components/edit-chrome/edit-chrome";
import { userHasCapability } from "@/lib/access";
import { getRequestLocale } from "@/i18n/request-locale";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadBuilderWorkspacePlan } from "@/lib/site-admin/builder-capabilities";
import { createBoundPrintAdapter } from "@/lib/site-admin/builder-core/adapters/print-adapter";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";

// Slice 1b — the print-design editor mount. Unlike the storefront in-place
// editor (EditChromeMount, which returns null on admin hosts), the print surface
// has no public URL: it is only ever reached from /[tenantSlug]/admin/print, so
// it needs its own admin-side mount. We resolve tenant + capability from the
// workspace slug (never a client-passed id), load the design through the print
// adapter, and hand EditChrome `printMode` — which selects buildPrintBuilderConfig
// (no publish, no revisions, no responsive breakpoints, blocks+designs galleries).
const EDIT_PRINT_CAPABILITY = "agency.site_admin.pages.edit" as const;

export default async function PrintDesignEditorPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; id: string }>;
}) {
  const { tenantSlug, id } = await params;

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();
  if (!(await userHasCapability(EDIT_PRINT_CAPABILITY, scope.tenantId))) {
    notFound();
  }

  const session = await getCachedActorSession();
  if (!session.supabase || !session.user) notFound();

  const locale = await getRequestLocale();

  // Load the design through the adapter so the server-prefetched composition and
  // the client mount sit on one seam (no "0 sections" first-paint flash). The
  // adapter's actions re-check staff + tenant scope, so a wrong-tenant id 404s.
  const loaded = await createBoundPrintAdapter().load({ locale, pageId: id });
  if (!loaded.ok) notFound();

  const [workspacePlan, localeSettings] = await Promise.all([
    loadBuilderWorkspacePlan(session.supabase, scope.tenantId, {
      logTag: "print-editor",
    }),
    loadTenantLocaleSettings(scope.tenantId),
  ]);

  return (
    <EditChrome
      tenantId={scope.tenantId}
      editActive
      locale={locale}
      pageSlug={id}
      availableLocales={localeSettings.supportedLocales}
      defaultLocale={localeSettings.defaultLocale}
      initialComposition={loaded.data}
      workspacePlan={workspacePlan}
      workspaceMembershipSlug={tenantSlug}
      canInsertRawHtmlElements={false}
      printMode
    />
  );
}
