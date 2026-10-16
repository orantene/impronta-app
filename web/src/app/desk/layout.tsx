/**
 * Support Desk host shell — full-bleed, no Platform Admin chrome.
 * Auth + flag are enforced in `page.tsx` via `loadDeskPage`.
 */

import { getRequestLocale } from "@/i18n/request-locale";
import { DashboardLocaleProvider } from "@/i18n/use-dashboard-locale";

export default async function SupportDeskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getRequestLocale();
  return (
    <DashboardLocaleProvider locale={locale}>
      <div className="min-h-[100dvh] bg-admin-surface text-admin-ink antialiased">
        {children}
      </div>
    </DashboardLocaleProvider>
  );
}
