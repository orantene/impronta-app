import { TalentPageRouteSyncer } from "../_talent-page-route-syncer";
import { TalentSiteDashboard } from "@/components/talent/site/TalentSiteDashboard";

export const dynamic = "force-dynamic";

export default async function PlatformTalentSitePage() {
  return (
    <>
      <TalentPageRouteSyncer page="public-page" />
      <TalentSiteDashboard />
    </>
  );
}
