// Thin tenant-resolver redirect.
//
// Resolves the primary agency slug for the authenticated client user and
// bounces to the canonical workspace client shell at /{slug}/client/today.
//
// Resolution order:
//   1. Unauthenticated → /login?next=/client (preserving query)
//   2. Has agency_client_relationships row → /{slug}/client/today
//   3. Client (profile row or active client) but no relationship → /account when
//      this host serves the account area (TUL-691), else tulala.digital
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
import { resolveMarketingOrigin } from "@/lib/brand/marketing-origin";
import { legacyClientEntryRedirectFor } from "@/lib/client-account/entry-redirect.server";
import { resolveDashboardIdentity } from "@/lib/impersonation/dashboard-identity";
import { effectiveReadContext } from "@/lib/impersonation/effective-read";
import { accountFlagKindForHost } from "@/lib/client-account/agency-area-pure";
import { readAccountHost } from "@/lib/client-account/area-site.server";
import { clientAccountEnabledFor } from "@/lib/client-account/flag";
import { clientRootFallback } from "@/lib/client-account/claim-landing";

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

  // TUL-255: under staff impersonation the subject has the agency relationship,
  // not the actor. Resolving with session.user.id bounced staff to
  // /onboarding/role → /admin → /client (infinite loop).
  const readCtx = effectiveReadContext(
    session.user.id,
    await resolveDashboardIdentity().catch(() => null),
  );
  const subjectUserId = readCtx.userId;

  const slug = await loadClientPrimaryTenantSlug(subjectUserId).catch(() => null);
  if (slug) redirect(`/${slug}/client/today${querySuffix}`);

  // TUL-691: a client with claimed history but no agency relationship (pay-only
  // guest, hub booker) lands on their account area, never the marketing apex or
  // the role picker. Account area off on this host keeps the discovery bounce.
  let hasClientProfile = false;
  const admin = createServiceRoleClient();
  if (admin) {
    const { data: profile, error } = await admin
      .from("client_profiles")
      .select("user_id")
      .eq("user_id", subjectUserId)
      .maybeSingle();
    if (error) logServerError("client/root-resolver/profile-lookup", error);
    hasClientProfile = Boolean(profile);
  }
  const flagKind = accountFlagKindForHost((await readAccountHost()).hostContext);
  const fallback = clientRootFallback({
    hasClientProfile,
    appRole: session.profile?.app_role,
    accountStatus: session.profile?.account_status,
    accountAreaOn: flagKind ? clientAccountEnabledFor(flagKind) : false,
  });
  if (fallback === "account") redirect("/account");
  // /directory is a marketing-host route; the apex is absolute so the app host never 404s.
  if (fallback === "discover") redirect(resolveMarketingOrigin());
  redirect(`/onboarding/role${querySuffix}`);
}
