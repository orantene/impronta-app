"use client";

/**
 * DashboardLanguagePanel (TUL-96) — Settings > Language.
 *
 * Switches the DASHBOARD language only (cookie + reload, the same write the
 * account menu makes). The website's languages are a separate thing and live in
 * Website settings > Languages; a plain link below points there.
 *
 * Token classes only; inline styles are frozen under components/admin/shell.
 */

import { setLocaleCookie } from "@/components/dashboard-locale-toggle";
import { getLocaleMetadata, type Locale } from "@/i18n/config";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { useDashboardText } from "../../dashboard-i18n";

/** Languages the dashboard UI itself is translated into. */
export const DASHBOARD_LOCALES: readonly Locale[] = ["es", "en"] as Locale[];

export function DashboardLanguagePanel({ onManageWebsiteLanguages }: { onManageWebsiteLanguages?: () => void }) {
  const copy = useDashboardText();
  const current = useDashboardLocale();

  const pick = (next: Locale) => {
    if (next === current) return;
    setLocaleCookie(next);
    window.location.reload();
  };

  return (
    <div className="flex flex-col gap-[10px] font-admin-body" data-testid="dashboard-language-panel">
      <div role="radiogroup" aria-label={copy.t("Dashboard language")} className="flex flex-wrap gap-[8px]">
        {DASHBOARD_LOCALES.map((code) => {
          const active = code === current;
          return (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => pick(code)}
              className={`cursor-pointer rounded-[9px] border px-[14px] py-[7px] text-admin-13 font-medium ${
                active
                  ? "border-admin-ink bg-admin-surface-alt text-admin-ink"
                  : "border-admin-border bg-admin-card text-admin-ink-muted hover:text-admin-ink"
              }`}
            >
              {getLocaleMetadata(code).label}
            </button>
          );
        })}
      </div>
      <div className="text-[11.5px] text-admin-ink-muted">
        {copy.t("Applies to your dashboard only. Your website has its own languages.")}
      </div>
      {onManageWebsiteLanguages ? (
        <button
          type="button"
          onClick={onManageWebsiteLanguages}
          className="w-fit cursor-pointer border-0 bg-transparent p-0 text-admin-13 font-medium text-admin-ink underline"
        >
          {copy.t("Manage website languages")}
        </button>
      ) : null}
    </div>
  );
}
