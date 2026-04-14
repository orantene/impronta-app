"use client";

import { usePathname } from "next/navigation";
import { AdminStatusTabs } from "@/components/admin/admin-status-tabs";

const SECTIONS: {
  href: string;
  label: string;
  match: (pathname: string) => boolean;
}[] = [
  {
    href: "/admin/site-settings",
    label: "Overview",
    match: (p) => p === "/admin/site-settings" || p === "/admin/site-settings/",
  },
  {
    href: "/admin/site-settings/content",
    label: "Content",
    match: (p) => p.startsWith("/admin/site-settings/content"),
  },
  {
    href: "/admin/site-settings/seo",
    label: "SEO & indexing",
    match: (p) => p.startsWith("/admin/site-settings/seo"),
  },
  {
    href: "/admin/site-settings/structure",
    label: "Structure",
    match: (p) => p.startsWith("/admin/site-settings/structure"),
  },
  {
    href: "/admin/site-settings/system",
    label: "System",
    match: (p) => p.startsWith("/admin/site-settings/system"),
  },
  {
    href: "/admin/site-settings/audit",
    label: "Audit",
    match: (p) => p.startsWith("/admin/site-settings/audit"),
  },
];

export function SiteSettingsSectionNav() {
  const pathname = usePathname();
  return (
    <AdminStatusTabs
      ariaLabel="Site settings sections"
      items={SECTIONS.map((s) => ({
        href: s.href,
        label: s.label,
        active: s.match(pathname),
      }))}
    />
  );
}
