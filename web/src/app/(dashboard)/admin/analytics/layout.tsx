import { BarChart3 } from "lucide-react";
import { AdminAnalyticsSubnav } from "@/components/admin/admin-analytics-subnav";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ADMIN_PAGE_STACK } from "@/lib/dashboard-shell-classes";

export default function AdminAnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={ADMIN_PAGE_STACK}>
      <AdminPageHeader
        icon={BarChart3}
        title="Analytics"
        description="Operating view: internal database metrics (exact), GA4 and Search Console (cached; may be modeled or delayed). Use the labels on each block."
      />
      <AdminAnalyticsSubnav />
      {children}
    </div>
  );
}
