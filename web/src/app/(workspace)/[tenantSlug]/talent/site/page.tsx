import { TalentPageRouteSyncer } from "../_talent-page-route-syncer";
import { TalentSiteDashboard } from "@/components/talent/site/TalentSiteDashboard";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

export default async function TalentSiteRoute({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  return (
    <>
      <TalentPageRouteSyncer page="public-page" />
      <TalentSiteDashboard tenantSlug={tenantSlug} />
    </>
  );
}
