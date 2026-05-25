import { redirect } from "next/navigation";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { resolveTalentPageScope } from "@/lib/talent/platform-talent-context";
import { loadTalentPayoutSnapshot } from "../../../[tenantSlug]/talent/settings/payouts/actions";
import { PayoutsShell } from "../../../[tenantSlug]/talent/settings/payouts/PayoutsShell";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ ok?: string; refresh?: string }>;

export default async function PlatformTalentPayoutsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { tenantSlug } = await resolveTalentPageScope(Promise.resolve({}));
  const sp = await searchParams;

  const session = await getCachedActorSession();
  if (!session.user) {
    redirect(`/login?next=/talent/settings/payouts`);
  }

  const snapResult = await loadTalentPayoutSnapshot();

  return (
    <PayoutsShell
      tenantSlug={tenantSlug}
      snapshot={snapResult.ok ? snapResult.snapshot : null}
      loadError={snapResult.ok ? null : snapResult.error}
      justReturned={sp.ok === "1"}
      justRefreshed={sp.refresh === "1"}
    />
  );
}
