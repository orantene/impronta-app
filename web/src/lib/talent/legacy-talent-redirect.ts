import { redirect } from "next/navigation";

import { buildQuerySuffix } from "@/lib/saas/redirect-query";
import { isTenantSlugCandidate } from "@/lib/saas/surface-allow-list";

type SearchParams = Promise<Record<string, string | string[] | undefined>> | undefined;

/**
 * Maps `/{tenantSlug}/talent[/…]` to `/talent[/…]` for middleware (HTTP 308).
 * Returns null when the path is not a legacy tenant-scoped talent URL.
 */
export function resolveLegacyTalentPlatformPath(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const tenantSlug = parts[0];
  if (!isTenantSlugCandidate(tenantSlug)) return null;
  if (parts[1] !== "talent") return null;
  const rest = parts.slice(2).join("/");
  return rest ? `/talent/${rest}` : "/talent";
}

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
