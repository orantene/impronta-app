"use client";

/**
 * TUL-1471 · the way into the owner's service hub from the Catalog: review what people offer,
 * group it, and shape what the workspace sells. Token classes only (inline styles are frozen
 * under components/admin/shell). The hub page checks staff access itself.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useDashboardLocale } from "@/i18n/use-dashboard-locale";

const COPY = {
  es: { title: "Servicio compartido", desc: "Revisa lo que ofrece tu gente, agrúpalo y decide qué vende tu negocio.", open: "Abrir" },
  en: { title: "Shared services", desc: "Review what your people offer, group it and decide what your business sells.", open: "Open" },
} as const;

export function CatalogServiceHubLink() {
  const lang = useDashboardLocale().toLowerCase().startsWith("es") ? "es" : "en";
  const c = COPY[lang];
  const pathname = usePathname() ?? "";
  // /<slug>/admin/... or /admin/... : the hub sits under the same admin root.
  const adminRoot = pathname.includes("/admin") ? `${pathname.slice(0, pathname.indexOf("/admin"))}/admin` : "/admin";
  return (
    <div className="flex items-center justify-between gap-[12px] rounded-[12px] border border-admin-border-soft px-[16px] py-[12px]" data-testid="catalog-service-hub-link">
      <div className="min-w-0">
        <p className="m-0 font-admin-body text-admin-13 font-semibold">{c.title}</p>
        <p className="m-0 font-admin-body text-admin-12 text-admin-ink-muted">{c.desc}</p>
      </div>
      <Link href={`${adminRoot}/catalog/service-hub`} className="inline-flex min-h-[44px] shrink-0 items-center rounded-full border border-admin-border-soft px-[16px] font-admin-body text-admin-12">
        {c.open}
      </Link>
    </div>
  );
}
