import { notFound, redirect } from "next/navigation";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { resolveTalentPageScope } from "@/lib/talent/platform-talent-context";
import { loadTalentPayoutSnapshot } from "./actions";
import { PayoutsShell } from "./PayoutsShell";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug?: string }>;
type SearchParams = Promise<{ ok?: string; refresh?: string }>;

export default async function TalentPayoutsPage({
  params, searchParams,
}: {
  params: PageParams;
  searchParams: SearchParams;
}) {
  const { tenantSlug } = await resolveTalentPageScope(params);
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
