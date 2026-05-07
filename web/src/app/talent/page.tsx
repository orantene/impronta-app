// Thin tenant-resolver redirect.
//
// Resolves the primary agency slug for the authenticated talent user and
// bounces to the canonical workspace talent shell at /{slug}/talent/today.
//
// Resolution order:
//   1. Unauthenticated → /login?next=/talent (preserving query)
//   2. Has roster row (active or pending) → /{slug}/talent/today
//   3. No roster → /onboarding/role
//
// Status priority: 'active' wins over 'pending'. 'inactive' and 'removed'
// are treated as no-roster (the talent is bounced to onboarding).

import { redirect } from "next/navigation";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadTalentPrimaryTenantSlug } from "@/lib/saas/role-tenant-resolver";
import { buildQuerySuffix } from "@/lib/saas/redirect-query";

export const dynamic = "force-dynamic";

export default async function TalentRootPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const querySuffix = buildQuerySuffix(sp);

  const session = await getCachedActorSession();
  if (!session.user) {
    redirect(`/login?next=${encodeURIComponent(`/talent${querySuffix}`)}`);
  }

  const slug = await loadTalentPrimaryTenantSlug(session.user.id).catch(() => null);
  if (slug) redirect(`/${slug}/talent/today${querySuffix}`);

  redirect(`/onboarding/role${querySuffix}`);
}
