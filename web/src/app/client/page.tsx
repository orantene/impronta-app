// Thin tenant-resolver redirect.
//
// Resolves the primary agency slug for the authenticated client user and
// bounces to the canonical workspace client shell at /{slug}/client/today.
//
// Resolution order:
//   1. Unauthenticated → /login?next=/client (preserving query)
//   2. Has agency_client_relationships row → /{slug}/client/today
//   3. Has client_profiles row but no relationship → marketing home via
//      resolveMarketingOrigin() (isolated stacks stay off production).
//      /directory only exists on the marketing host, so the redirect is
//      absolute to avoid a 404 from the app host.
//   4. No client_profiles row at all → /onboarding/role

import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadClientPrimaryTenantSlug } from "@/lib/saas/role-tenant-resolver";
import { logServerError } from "@/lib/server/safe-error";
import { buildQuerySuffix } from "@/lib/saas/redirect-query";
import { resolveMarketingOrigin } from "@/lib/brand/marketing-origin";
import { legacyClientEntryRedirectFor } from "@/lib/client-account/entry-redirect.server";

export const dynamic = "force-dynamic";

export default async function ClientRootPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  // TUL-64: agency and hub hosts send clients to /account when the flag is on.
  if ((await legacyClientEntryRedirectFor()) === "account") redirect("/account");
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
      // TUL-520: origin from env so an isolated stack never lands on production.
      redirect(resolveMarketingOrigin());
    }
  }

  // TUL-64: an already-active client must never re-enter /onboarding/role
  // (on the app host that door becomes /start). Send them to discovery.
  if (
    session.profile?.app_role === "client" &&
    session.profile?.account_status === "active"
  ) {
    redirect(`https://${TULALA_APEX_HOST}`);
  }

  redirect(`/onboarding/role${querySuffix}`);
}
