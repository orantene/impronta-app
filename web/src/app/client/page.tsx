// Thin tenant-resolver redirect.
//
// Resolves the primary agency slug for the authenticated client user and
// bounces to the canonical workspace client shell at /{slug}/client/today.
//
// Resolution order:
//   1. client_profiles.user_id → agency_client_relationships → agencies.slug
//   2. No relationship found → /onboarding/role

import { redirect } from "next/navigation";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadClientPrimaryTenantSlug } from "@/lib/saas/role-tenant-resolver";

export const dynamic = "force-dynamic";

export default async function ClientRootPage() {
  const session = await getCachedActorSession();
  if (!session.user) redirect("/login?next=/client");

  const slug = await loadClientPrimaryTenantSlug(session.user.id).catch(() => null);
  if (slug) redirect(`/${slug}/client/today`);

  redirect("/onboarding/role");
}
