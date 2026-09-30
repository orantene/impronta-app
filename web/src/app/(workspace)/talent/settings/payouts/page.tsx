import { permanentRedirect } from "next/navigation";

import { buildQuerySuffix } from "@/lib/saas/redirect-query";

export const dynamic = "force-dynamic";

/**
 * Legacy URL. Payouts is one in-shell talent section, and its ONE canonical
 * route is /talent/payouts. The query string survives.
 */
export default async function LegacyTalentSettingsPayoutsRedirect({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  permanentRedirect(`/talent/payouts${buildQuerySuffix(await searchParams)}`);
}
