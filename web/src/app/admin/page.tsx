// Thin tenant-resolver redirect.
//
// Resolves the caller's active tenant and bounces to the canonical workspace
// admin shell at /{slug}/admin (preserving incoming query string).
//
// Resolution order:
//   1. Cookie/header-pinned active tenant (via getTenantScope) → use its slug
//   2. Otherwise first active membership → use its slug
//   3. No membership → the caller's own dashboard, or /onboarding/role
//
// THIS PAGE IS THE MEMBERSHIP GATE FOR /admin.
// Auth-routing used to reject non-staff `app_role`s before this page ever ran,
// which locked workspace owners out of their own workspace: provisioning never
// overwrites an existing role, so a talent who opens a workspace keeps
// `app_role = 'talent'` and failed the staff check. Middleware cannot read
// membership without a per-request query, so it now lets `/admin` exactly
// through and this resolver decides. Deeper `/admin/*` paths are still
// staff-gated in middleware. Anyone with no membership leaves here — step 3
// must therefore always lead somewhere that renders.

import { redirect } from "next/navigation";
import { getTenantScope, getCurrentUserTenants } from "@/lib/saas";
import { buildQuerySuffix } from "@/lib/saas/redirect-query";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { resolveAuthenticatedDestination } from "@/lib/auth-flow";

export const dynamic = "force-dynamic";

export default async function AdminRootPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const querySuffix = buildQuerySuffix(sp);

  const scope = await getTenantScope().catch(() => null);
  if (scope?.membership?.slug) {
    redirect(`/${scope.membership.slug}/admin${querySuffix}`);
  }

  const memberships = await getCurrentUserTenants().catch(() => []);
  const firstActive = memberships.find((m) => m.status === "active") ?? memberships[0];
  if (firstActive?.slug) {
    redirect(`/${firstActive.slug}/admin${querySuffix}`);
  }

  // No membership. Send them to the dashboard they can actually use — a client
  // who typed /admin belongs on /client, not in an onboarding flow. `/admin`
  // itself is excluded or we would bounce back here forever, which is exactly
  // what a staff account with no membership would do.
  const actor = await getCachedActorSession().catch(() => null);
  const ownDashboard = resolveAuthenticatedDestination(actor?.profile ?? null);
  if (ownDashboard !== "/admin" && ownDashboard !== "/") {
    redirect(`${ownDashboard}${querySuffix}`);
  }

  redirect(`/onboarding/role${querySuffix}`);
}
