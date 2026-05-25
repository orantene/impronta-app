import { notFound } from "next/navigation";

import { loadTalentPersonalSiteDashboardState } from "@/lib/talent-site/server/dashboard-state";
import { TalentSiteDashboardClient } from "./TalentSiteDashboardClient";

type Props = {
  tenantSlug: string;
};

export async function TalentSiteDashboard({ tenantSlug }: Props) {
  const loaded = await loadTalentPersonalSiteDashboardState(tenantSlug);
  if (!loaded.ok) {
    if (loaded.code === "workspace_not_found" || loaded.code === "talent_profile_not_found") {
      notFound();
    }
    return (
      <div style={{ padding: 24, fontFamily: '"Inter", system-ui, sans-serif' }}>
        <p>{loaded.error}</p>
      </div>
    );
  }

  return <TalentSiteDashboardClient tenantSlug={tenantSlug} initialState={loaded.state} />;
}
