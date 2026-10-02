import { permanentRedirect } from "next/navigation";

import { buildQuerySuffix } from "@/lib/saas/redirect-query";

export const dynamic = "force-dynamic";

/** Alias of My presence. The canonical route is /talent/site (same as /talent/public-page). */
export default async function PlatformTalentPresenceAlias({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  permanentRedirect(`/talent/site${buildQuerySuffix(await searchParams)}`);
}
