import { TalentPageRouteSyncer } from "../_talent-page-route-syncer";
import { TalentPlanRouteOpener } from "./_talent-plan-route-opener";

export const dynamic = "force-dynamic";

// TUL-666: a real, shell-wrapped URL for the talent plan comparison. The page
// behind it is Settings; the comparison drawer opens on top, the same one the
// sidebar Plan control opens.
export default function PlatformTalentPlanPage() {
  return (
    <>
      <TalentPageRouteSyncer page="settings" />
      <TalentPlanRouteOpener />
    </>
  );
}
