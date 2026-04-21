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
    href: "/admin/site-settings/identity",
    label: "Identity",
    match: (p) => p.startsWith("/admin/site-settings/identity"),
  },
  {
    href: "/admin/site-settings/branding",
    label: "Branding",
    match: (p) => p.startsWith("/admin/site-settings/branding"),
  },
  {
    href: "/admin/site-settings/design",
    label: "Design",
    match: (p) => p.startsWith("/admin/site-settings/design"),
  },
  {
    href: "/admin/site-settings/navigation",
    label: "Navigation",
    match: (p) => p.startsWith("/admin/site-settings/navigation"),
  },
  {
    href: "/admin/site-settings/pages",
    label: "Pages",
    match: (p) => p.startsWith("/admin/site-settings/pages"),
  },
  {
    href: "/admin/site-settings/sections",
    label: "Sections",
    match: (p) => p.startsWith("/admin/site-settings/sections"),
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
