import { Search } from "lucide-react";
import { AdminGlobalUserSearchClient } from "@/app/(dashboard)/admin/users/admin-global-user-search-client";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import {
  loadTaxonomyTalentTypesForFilters,
} from "@/lib/dashboard/admin-dashboard-data";
import {
  ADMIN_PAGE_STACK,
  ADMIN_SECTION_TITLE_CLASS,
} from "@/lib/dashboard-shell-classes";

export default async function AdminGlobalUserSearchPage() {
  const talentTypes = await loadTaxonomyTalentTypesForFilters();

  return (
    <div className={ADMIN_PAGE_STACK}>
      <AdminPageHeader
        icon={Search}
        title="User search"
        description="Search across talent, clients, and staff. Combine text with role, account status, location, and taxonomy filters."
      />

      <DashboardSectionCard
        title="Global directory search"
        description="Results respect your filters; talent rows include completeness and pending media counts when available."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <AdminGlobalUserSearchClient talentTypes={talentTypes} />
      </DashboardSectionCard>
    </div>
  );
}
