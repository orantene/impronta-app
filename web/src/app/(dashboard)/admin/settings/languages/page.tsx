import Link from "next/link";
import { Languages } from "lucide-react";

import { LanguagesAdminClient } from "@/app/(dashboard)/admin/settings/languages/languages-admin-client";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { ADMIN_PAGE_STACK, ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";
import { getLanguageSettings } from "@/lib/language-settings/get-language-settings";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import type { AppLocaleRow } from "@/lib/language-settings/types";

export default async function AdminLanguageSettingsPage() {
  const supabase = await getCachedServerSupabase();
  if (!supabase) {
    return (
      <div className={ADMIN_PAGE_STACK}>
        <p className="text-sm text-muted-foreground">Supabase not configured.</p>
      </div>
    );
  }

  const { data: rows, error } = await supabase
    .from("app_locales")
    .select(
      "code, label_native, label_en, enabled_admin, enabled_public, sort_order, is_default, fallback_locale, archived_at",
    )
    .is("archived_at", null)
    .order("sort_order", { ascending: true });

  if (error) {
    return (
      <div className={ADMIN_PAGE_STACK}>
        <p className="text-sm text-destructive">Could not load languages: {error.message}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Apply migration <code className="font-mono">20260430140000_app_locales_and_language_settings.sql</code> if
          this is a fresh checkout.
        </p>
      </div>
    );
  }

  const settings = await getLanguageSettings(supabase);

  return (
    <div className={ADMIN_PAGE_STACK}>
      <AdminPageHeader
        icon={Languages}
        title="Language settings"
        description="Catalog of locales, public visibility, defaults, and translation inventory controls."
      />

      <p className="text-sm text-muted-foreground">
        <Link href="/admin/settings" className="text-primary underline-offset-4 hover:underline">
          All settings
        </Link>
        {" · "}
        <Link href="/admin/translations" className="text-primary underline-offset-4 hover:underline">
          Translation Center
        </Link>
      </p>

      <DashboardSectionCard
        title="Wide-column content"
        description="Taxonomy, locations, and talent bios still use EN/ES-specific columns until migrated. See code references in wide-column migration notes."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <p className="text-sm text-muted-foreground">
          Registry entries declare{" "}
          <code className="font-mono text-xs">supportedLocaleMode</code> per domain (
          <code className="font-mono text-xs">en_es_pair</code>, <code className="font-mono text-xs">dynamic_json</code>
          , etc.).
        </p>
      </DashboardSectionCard>

      <LanguagesAdminClient
        locales={(rows ?? []) as AppLocaleRow[]}
        fallbackMode={settings.fallbackMode}
        publicSwitcherMode={settings.publicSwitcherMode}
        inventoryVersion={settings.translationInventoryVersion}
        inventoryRefreshedAt={settings.translationInventoryRefreshedAt}
      />
    </div>
  );
}
