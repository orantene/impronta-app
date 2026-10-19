"use client";

import type { ReactNode } from "react";
import { DashboardLocaleProvider } from "@/i18n/use-dashboard-locale";

/**
 * Pins the PAGE locale for everything under /book, including the InquiryDrawer
 * (its strings come from usePublicT, i.e. the cookie locale unless a provider
 * says otherwise). A Spanish workspace with an English cookie, or the reverse,
 * must render one language.
 */
export function BookLocaleScope({ locale, children }: { locale: "en" | "es"; children: ReactNode }) {
  return <DashboardLocaleProvider locale={locale}>{children}</DashboardLocaleProvider>;
}
