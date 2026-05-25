import { TalentPageRouteSyncer } from "../_talent-page-route-syncer";
import { TalentSiteDashboard } from "@/components/talent/site/TalentSiteDashboard";
import { resolveTalentPageScope } from "@/lib/talent/platform-talent-context";

export const dynamic = "force-dynamic";

export default async function PlatformTalentSitePage() {
  const { tenantSlug } = await resolveTalentPageScope(Promise.resolve({}));
  return (
    <>
      <TalentPageRouteSyncer page="public-page" />
      <TalentSiteDashboard tenantSlug={tenantSlug} />
    </>
  );
}
