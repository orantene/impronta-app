"use client";

import { usePathname } from "next/navigation";
import { AdminPageTabs } from "@/components/admin/admin-page-tabs";

type AnalyticsTab = { href: string; label: string; exact?: boolean };

const TABS: readonly AnalyticsTab[] = [
  { href: "/admin/analytics", label: "Executive", exact: true },
  { href: "/admin/analytics/acquisition", label: "Traffic" },
  { href: "/admin/analytics/funnels", label: "Funnels" },
  { href: "/admin/analytics/talent", label: "Marketplace" },
  { href: "/admin/analytics/search", label: "AI / Search" },
  { href: "/admin/analytics/seo", label: "SEO" },
];

export function AdminAnalyticsSubnav() {
  const pathname = usePathname();
  return (
    <AdminPageTabs
      ariaLabel="Analytics sections"
      items={TABS.map((tab) => ({
        href: tab.href,
        label: tab.label,
        active: tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`),
      }))}
    />
  );
}
