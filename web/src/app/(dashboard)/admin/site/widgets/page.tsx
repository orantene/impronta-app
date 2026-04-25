import { LayoutDashboard } from "lucide-react";

import { ComingSoonPage } from "@/components/admin/site-control-center/coming-soon-page";

export const dynamic = "force-dynamic";

export default function AdminSiteWidgetsPage() {
  return (
    <ComingSoonPage
      icon={LayoutDashboard}
      title="Widgets"
      plan="studio"
      description="Embed your roster anywhere — without leaving the platform."
      bullets={[
        "Drop-in <script> tag for WordPress, Webflow, Shopify, Squarespace, custom",
        "Roster grid, single-talent card, search box — pre-styled or fully themed",
        "Auto-syncs as you publish; never stale",
        "Per-embed analytics: views, click-through, inquiries opened",
      ]}
    />
  );
}
