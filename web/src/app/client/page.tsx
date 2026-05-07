// Thin tenant-resolver redirect.
//
// Resolves the primary agency slug for the authenticated client user and
// bounces to the canonical workspace client shell at /{slug}/client/today.
//
// Resolution order:
//   1. Unauthenticated → /login?next=/client (preserving query)
//   2. Has agency_client_relationships row → /{slug}/client/today
//   3. Has client_profiles row but no relationship → /directory
//      (they completed onboarding but haven't engaged with any agency yet;
//      browsing talent is the natural surface for them)
//   4. No client_profiles row at all → /onboarding/role
//
// Phase 4 deletion notes: the legacy global /client surface was removed.
// Direct-signup clients (no agency relationship) used to land there;
// /directory now plays that role until an inquiry creates a relationship.

import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadClientPrimaryTenantSlug } from "@/lib/saas/role-tenant-resolver";
import { logServerError } from "@/lib/server/safe-error";
import { buildQuerySuffix } from "@/lib/saas/redirect-query";

export const dynamic = "force-dynamic";

export default async function ClientRootPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const querySuffix = buildQuerySuffix(sp);

  const session = await getCachedActorSession();
  if (!session.user) {
    redirect(`/login?next=${encodeURIComponent(`/client${querySuffix}`)}`);
  }

  const slug = await loadClientPrimaryTenantSlug(session.user.id).catch(() => null);
  if (slug) redirect(`/${slug}/client/today${querySuffix}`);

  // Determine onboarding completion. If a client_profiles row exists, the
  // user already chose "client" — funnel them to discovery rather than
  // re-asking the role question.
  const admin = createServiceRoleClient();
  if (admin) {
    const { data: profile, error } = await admin
      .from("client_profiles")
      .select("user_id")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (error) {
      logServerError("client/root-resolver/profile-lookup", error);
    } else if (profile) {
      redirect(`/directory${querySuffix}`);
    }
  }

  redirect(`/onboarding/role${querySuffix}`);
}
