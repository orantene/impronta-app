"use client";

import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { hoursDatePlaceholder } from "@/lib/talent-agenda/hours-display-format";

/**
 * TUL-721: a native date input shows the BROWSER's format (mm/dd/yyyy on an
 * en-US browser) even in Spanish. This line under it names the format the
 * dashboard language expects (dd/mm/aaaa). Only shown in Spanish.
 */
export function DateFormatHint({ locale }: { locale: string }) {
  if (!locale.toLowerCase().startsWith("es")) return null;
  return (
    <span data-date-format-hint className="text-[10.5px] text-admin-ink-muted">
      {hoursDatePlaceholder(locale)}
    </span>
  );
}

/** Same hint, reading the dashboard language itself (for large files that
 *  would otherwise need a locale hook plumbed in). */
export function DashboardDateFormatHint() {
  return <DateFormatHint locale={useDashboardLocale()} />;
}
