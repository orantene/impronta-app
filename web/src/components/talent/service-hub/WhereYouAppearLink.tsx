"use client";

import Link from "next/link";

import { useDashboardLocale } from "@/i18n/use-dashboard-locale";

const COPY = {
  es: { title: "Ingresos por canal", desc: "Lo que ganas por tu sitio, el hub y cada negocio, y dónde apareces.", open: "Ver" },
  en: { title: "Earnings by channel", desc: "What you earn through your site, the hub and each business, and where you appear.", open: "View" },
} as const;

/** TUL-1469 · the way into "Where you appear / Earnings by channel" from the Money page. */
export function WhereYouAppearLink() {
  const c = COPY[useDashboardLocale().toLowerCase().startsWith("es") ? "es" : "en"];
  return (
    <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border px-4 py-3" data-testid="where-you-appear-link">
      <div className="min-w-0">
        <p className="m-0 text-sm font-semibold">{c.title}</p>
        <p className="m-0 text-xs opacity-70">{c.desc}</p>
      </div>
      <Link href="/talent/where-you-appear" className="inline-flex min-h-[44px] shrink-0 items-center rounded-full border px-4 text-sm">{c.open}</Link>
    </div>
  );
}
