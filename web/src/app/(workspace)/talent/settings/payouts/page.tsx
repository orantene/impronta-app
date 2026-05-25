import TalentPayoutsPage from "../../../[tenantSlug]/talent/settings/payouts/page";

export const dynamic = "force-dynamic";

export default function PlatformTalentPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; refresh?: string }>;
}) {
  return TalentPayoutsPage({
    params: Promise.resolve({}),
    searchParams,
  });
}
