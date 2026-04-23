"use client";

import { usePathname } from "next/navigation";
import { AdminStatusTabs } from "@/components/admin/admin-status-tabs";

/**
 * Phase 15 / Admin shell v2 — Site area in-page nav.
 *
 * Composer leads. Identity + Branding merge visually into a single "Brand"
 * tab (Brand surfaces both under /identity and /branding; entry point is
 * /identity). System and Audit are demoted to the end.
 */
const SECTIONS: {
  href: string;
  label: string;
  match: (pathname: string) => boolean;
}[] = [
  {
    href: "/admin/site-settings/structure",
    label: "Composer",
    match: (p) => p.startsWith("/admin/site-settings/structure"),
  },
  {
    href: "/admin/site-settings/design",
    label: "Design",
    match: (p) => p.startsWith("/admin/site-settings/design"),
  },
  {
    href: "/admin/site-settings/sections",
    label: "Sections",
    match: (p) => p.startsWith("/admin/site-settings/sections"),
  },
  {
    href: "/admin/site-settings/pages",
    label: "Pages",
    match: (p) => p.startsWith("/admin/site-settings/pages"),
  },
  {
    href: "/admin/site-settings/content",
    label: "Content",
    match: (p) => p.startsWith("/admin/site-settings/content"),
  },
  {
    href: "/admin/site-settings/navigation",
    label: "Navigation",
    match: (p) => p.startsWith("/admin/site-settings/navigation"),
  },
  {
    href: "/admin/site-settings/seo",
    label: "SEO",
    match: (p) => p.startsWith("/admin/site-settings/seo"),
  },
  {
    href: "/admin/site-settings/identity",
    label: "Brand",
    match: (p) =>
      p.startsWith("/admin/site-settings/identity") ||
      p.startsWith("/admin/site-settings/branding"),
  },
  {
    href: "/admin/site-settings",
    label: "Overview",
    match: (p) => p === "/admin/site-settings" || p === "/admin/site-settings/",
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
