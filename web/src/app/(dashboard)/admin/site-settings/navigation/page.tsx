import { redirect } from "next/navigation";

import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";
import { hasPhase5Capability } from "@/lib/site-admin";
import type { NavZone } from "@/lib/site-admin/forms/navigation";
import type { Locale } from "@/lib/site-admin/locales";
import {
  loadDraftNavigationItems,
  loadMenuForStaff,
} from "@/lib/site-admin/server/navigation-reads";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";

import { NavigationEditor } from "./navigation-editor";

export const dynamic = "force-dynamic";

function pickZone(search: Record<string, string | string[] | undefined>): NavZone {
  const raw = search.zone;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "footer" ? "footer" : "header";
}

function pickLocale(
  search: Record<string, string | string[] | undefined>,
  supported: readonly Locale[],
  fallback: Locale,
): Locale {
  const raw = search.locale;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value && (supported as readonly string[]).includes(value)) {
    return value as Locale;
  }
  return fallback;
}

export default async function SiteSettingsNavigationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await requireStaff();
  if (!auth.ok) redirect("/login");

  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return (
      <div className="space-y-4">
        <DashboardSectionCard
          title="Navigation"
          description="Select an agency workspace to edit navigation."
          titleClassName={ADMIN_SECTION_TITLE_CLASS}
        >
          <p className="text-sm text-muted-foreground">
            Use the workspace switcher in the admin header to pick a tenant.
          </p>
        </DashboardSectionCard>
      </div>
    );
  }

  const [canEdit, canPublish, tenantLocales, search] = await Promise.all([
    hasPhase5Capability("agency.site_admin.navigation.edit", scope.tenantId),
    hasPhase5Capability("agency.site_admin.navigation.publish", scope.tenantId),
    loadTenantLocaleSettings(scope.tenantId),
    searchParams,
  ]);

  const zone = pickZone(search);
  const locale = pickLocale(
    search,
    tenantLocales.supportedLocales,
    tenantLocales.defaultLocale,
  );

  const [items, menu] = await Promise.all([
    loadDraftNavigationItems(auth.supabase, scope.tenantId, zone, locale),
    loadMenuForStaff(auth.supabase, scope.tenantId, zone, locale),
  ]);

  return (
    <div className="space-y-4">
      <DashboardSectionCard
        title="Navigation"
        description="Header and footer menus. Draft edits stay private; publish pushes the current tree to the storefront."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <NavigationEditor
          canEdit={canEdit}
          canPublish={canPublish}
          zone={zone}
          locale={locale}
          supportedLocales={tenantLocales.supportedLocales}
          items={items}
          menu={menu}
        />
      </DashboardSectionCard>
    </div>
  );
}
