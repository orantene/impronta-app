import { redirect } from "next/navigation";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { requirePlatformTalentContext } from "@/lib/talent/platform-talent-context";
import { loadTalentPayoutSnapshot } from "../../../[tenantSlug]/talent/settings/payouts/actions";
import { PayoutsShell } from "../../../[tenantSlug]/talent/settings/payouts/PayoutsShell";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ ok?: string; refresh?: string }>;

export default async function PlatformTalentPayoutsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;

  const session = await getCachedActorSession();
  if (!session.user) {
    redirect(`/login?next=/talent/settings/payouts`);
  }

  // Embedded onboarding has no Stripe-hosted return redirect, so it does
  // NOT require an active agency tenant. requirePlatformTalentContext only
  // 404s when the user has no talent profile (correct) — an independent
  // (agency-less) talent with no tenantSlug can still onboard here.
  await requirePlatformTalentContext();
  const snapResult = await loadTalentPayoutSnapshot();

  return (
    <PayoutsShell
      snapshot={snapResult.ok ? snapResult.snapshot : null}
      loadError={snapResult.ok ? null : snapResult.error}
      justReturned={sp.ok === "1"}
      justRefreshed={sp.refresh === "1"}
    />
  );
}
