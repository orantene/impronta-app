// Thin tenant-resolver redirect.
//
// Resolves the primary agency slug for the authenticated talent user and
// bounces to the canonical workspace talent shell at /{slug}/talent/today.
//
// Resolution order:
//   1. talent_profiles.user_id → agency_talent_roster → agencies.slug
//   2. No roster entry found → /onboarding/role

import { redirect } from "next/navigation";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadTalentPrimaryTenantSlug } from "@/lib/saas/role-tenant-resolver";

export const dynamic = "force-dynamic";

export default async function TalentRootPage() {
  const session = await getCachedActorSession();
  if (!session.user) redirect("/login?next=/talent");

  const slug = await loadTalentPrimaryTenantSlug(session.user.id).catch(() => null);
  if (slug) redirect(`/${slug}/talent/today`);

  redirect("/onboarding/role");
}
