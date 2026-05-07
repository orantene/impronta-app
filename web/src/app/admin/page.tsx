// Thin tenant-resolver redirect.
//
// Resolves the active tenant for a staff user and bounces to the canonical
// workspace admin shell at /{slug}/admin (preserving incoming query string).
//
// Resolution order:
//   1. Cookie/header-pinned active tenant (via getTenantScope) → use its slug
//   2. Otherwise first active staff membership → use its slug
//   3. No staff membership → /onboarding/role (post-signup flow)
//
// Auth-routing already gates /admin with isStaffRole, so by the time we
// reach this page the user is known to be super_admin or agency_staff.

import { redirect } from "next/navigation";
import { getTenantScope, getCurrentUserTenants } from "@/lib/saas";
import { buildQuerySuffix } from "@/lib/saas/redirect-query";

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

  redirect(`/onboarding/role${querySuffix}`);
}
