"use client";

import { usePathname } from "next/navigation";
import { AdminPageTabs } from "@/components/admin/admin-page-tabs";

const TABS = [
  { href: "/admin/analytics/overview", label: "Executive" },
  { href: "/admin/analytics/acquisition", label: "Traffic" },
  { href: "/admin/analytics/funnels", label: "Funnels" },
  { href: "/admin/analytics/talent", label: "Marketplace" },
  { href: "/admin/analytics/search", label: "AI / Search" },
  { href: "/admin/analytics/seo", label: "SEO" },
] as const;

export function AdminAnalyticsSubnav() {
  const pathname = usePathname();
  return (
    <AdminPageTabs
      ariaLabel="Analytics sections"
      items={TABS.map((tab) => ({
        href: tab.href,
        label: tab.label,
        active: pathname === tab.href || pathname.startsWith(`${tab.href}/`),
      }))}
    />
  );
}
