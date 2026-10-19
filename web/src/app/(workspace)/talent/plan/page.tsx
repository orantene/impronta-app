import { TalentPageRouteSyncer } from "../_talent-page-route-syncer";
import { TalentPlanRouteOpener } from "./_talent-plan-route-opener";
import { parsePlanIntent, isTalentIntent } from "@/lib/onboarding/plan-intent";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// TUL-666: a real, shell-wrapped URL for the talent plan comparison. The page
// behind it is Settings; the comparison drawer opens on top, the same one the
// sidebar Plan control opens.
// BILL-B: the plan intent is read HERE, once, on the server, and handed to the
// opener as a prop, so the client fires exactly one upgrade action per mount.
export default async function PlatformTalentPlanPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp: SearchParams = (await searchParams) ?? {};
  const parsed = parsePlanIntent(first(sp.plan), first(sp.interval));
  const intent = isTalentIntent(parsed) ? parsed : null;
  return (
    <>
      <TalentPageRouteSyncer page="settings" />
      <TalentPlanRouteOpener intent={intent} />
    </>
  );
}
