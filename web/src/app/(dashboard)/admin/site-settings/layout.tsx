import { Settings } from "lucide-react";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { SiteSettingsSectionNav } from "@/components/admin/site-settings-section-nav";
import { ADMIN_PAGE_STACK } from "@/lib/dashboard-shell-classes";

export default function SiteSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={ADMIN_PAGE_STACK}>
      <AdminPageHeader
        icon={Settings}
        title="Site Settings"
        description="Everything that shapes your public storefront — identity, branding, homepage composition, sections, and content."
      />
      <SiteSettingsSectionNav />
      {children}
    </div>
  );
}
