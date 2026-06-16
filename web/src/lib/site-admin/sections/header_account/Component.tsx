import { HeaderAuthArea } from "@/components/site-shell/HeaderAuthArea";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import type { Locale } from "@/i18n/config";
import {
  HeaderWidgetGlyph,
  HeaderWidgetPlaceholder,
} from "../shared/header-widget";
import type { SectionComponentProps } from "../types";
import type { HeaderAccountV1 } from "./schema";

/**
 * WS-A A5 — header ACCOUNT widget. Mounts the SAME `HeaderAuthArea` widget the
 * legacy `PublicHeader` uses, scoped to the account menu (no language toggle, no
 * discovery icons — those have their own embeds). It reads the actor session +
 * tenant locale settings exactly as the live header does.
 *
 *   - editor canvas (`preview`)  → a static placeholder chip. NO session read,
 *     NO `HeaderAuthArea` mount — so the canvas never hits auth / Supabase.
 *   - published shell            → the real auth area.
 */
export async function HeaderAccountComponent({
  preview,
  tenantId,
  locale,
}: SectionComponentProps<HeaderAccountV1>) {
  if (preview) {
    return (
      <HeaderWidgetPlaceholder
        typeKey="header_account"
        label="Account"
        glyph={
          <HeaderWidgetGlyph>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" />
          </HeaderWidgetGlyph>
        }
      />
    );
  }

  const localeSettings = tenantId
    ? await loadTenantLocaleSettings(tenantId)
    : {
        defaultLocale: "en" as const,
        supportedLocales: ["en", "es"] as const,
        showLanguageSwitcher: true,
      };

  return (
    <div
      className="site-header-widget-embed site-header-widget-embed--account"
      data-header-widget="header_account"
      data-header-widget-mode="live"
    >
      <HeaderAuthArea
        locale={locale as Locale}
        showAccountMenu
        showLanguageToggle={false}
        showDiscoveryTools={false}
        availableLocales={localeSettings.supportedLocales}
        defaultLocale={localeSettings.defaultLocale}
        showLanguageSwitcher={localeSettings.showLanguageSwitcher}
      />
    </div>
  );
}
