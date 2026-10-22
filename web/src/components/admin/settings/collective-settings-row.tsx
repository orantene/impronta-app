"use client";

/**
 * TUL-1374 · Settings row: "Friends collective". The page at /<slug>/admin/settings/collective
 * existed but nothing linked to it. The page itself re-checks the role on the server (owner or
 * admin) and the owner-only actions behind it re-check again; this row is only the door.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useDashboardLocale } from "@/i18n/use-dashboard-locale";

const UI = {
  es: { title: "Colectivo de amigos", sub: "Una persona coordina y recibe todas las solicitudes; tú defines lo que tomas de cada integrante. Quien integra no ve el chat con el cliente.", open: "Abrir" },
  en: { title: "Friends collective", sub: "One person coordinates and gets every request; you set what you take from each member. Members never see the client chat.", open: "Open" },
} as const;

export function CollectiveSettingsRow() {
  const lang = useDashboardLocale().toLowerCase().startsWith("es") ? "es" : "en";
  const t = UI[lang];
  const pathname = usePathname() ?? "";
  const adminRoot = pathname.includes("/admin") ? pathname.slice(0, pathname.indexOf("/admin")) + "/admin" : "/admin";
  return (
    <div className="flex items-center justify-between gap-3 py-3" data-testid="collective-settings-row">
      <div className="min-w-0">
        <p className="text-admin-13 font-medium">{t.title}</p>
        <p className="text-admin-12 text-admin-ink-muted">{t.sub}</p>
      </div>
      <Link href={`${adminRoot}/settings/collective`} className="inline-flex min-h-[44px] shrink-0 items-center rounded-full border border-admin-line px-4 text-admin-12">
        {t.open}
      </Link>
    </div>
  );
}
