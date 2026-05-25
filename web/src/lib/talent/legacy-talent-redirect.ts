import { redirect } from "next/navigation";

import { buildQuerySuffix } from "@/lib/saas/redirect-query";

type SearchParams = Promise<Record<string, string | string[] | undefined>> | undefined;

/**
 * Permanent redirect from legacy /{tenantSlug}/talent/* to platform /talent/*.
 */
export async function redirectLegacyTalentPath(
  segment: string,
  searchParams?: SearchParams,
): Promise<never> {
  const sp = (await searchParams) ?? {};
  const querySuffix = buildQuerySuffix(sp);
  redirect(`/talent/${segment}${querySuffix}`);
}
