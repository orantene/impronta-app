// Thin tenant-resolver redirect.
//
// Resolves the primary agency slug for the authenticated client user and
// bounces to the canonical workspace client shell at /{slug}/client/today.
//
// Resolution order:
//   1. Unauthenticated → /login?next=/client (preserving query)
//   2. Has agency_client_relationships row → /{slug}/client/today
//   3. Has client_profiles row but no relationship → tulala.digital (marketing home)
//      Clients with no agency attachment are directed to the marketing surface
//      where they can discover talent. /directory only exists on the marketing
//      host, so we use an absolute redirect rather than a relative one to avoid
//      a 404 when this page is served from the app host (app.tulala.digital).
//   4. No client_profiles row at all → /onboarding/role

import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadClientPrimaryTenantSlug } from "@/lib/saas/role-tenant-resolver";
import { logServerError } from "@/lib/server/safe-error";
import { buildQuerySuffix } from "@/lib/saas/redirect-query";
import { TULALA_APEX_HOST } from "@/lib/brand/tulala";

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
      // Redirect to the marketing site so the user can discover talent.
      // /directory is a marketing-host route; using a relative path here
      // would 404 when served from the app host (app.tulala.digital).
      redirect(`https://${TULALA_APEX_HOST}`);
    }
  }

  redirect(`/onboarding/role${querySuffix}`);
}
