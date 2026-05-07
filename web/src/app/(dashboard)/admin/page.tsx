// Phase 4 — `/admin` is now a thin tenant-resolver redirect into the canonical
// workspace admin shell at `/{slug}/admin`. The legacy 575-line admin home is
// fully replaced by the workspace shell's overview surface.
//
// Resolution order:
//   1. Cookie/header-pinned active tenant (via getTenantScope) → use its slug
//   2. Otherwise first active staff membership → use its slug
//   3. No staff membership → /onboarding/role (post-signup flow)
//
// Auth-routing already gates `/admin` with isStaffRole, so by the time we
// reach this page the user is known to be super_admin or agency_staff.

import { redirect } from "next/navigation";
import { getTenantScope, getCurrentUserTenants } from "@/lib/saas";

export const dynamic = "force-dynamic";

export default async function AdminDashboardIndexPage() {
  const scope = await getTenantScope().catch(() => null);
  if (scope?.membership?.slug) {
    redirect(`/${scope.membership.slug}/admin`);
  }

  const memberships = await getCurrentUserTenants().catch(() => []);
  const firstActive = memberships.find((m) => m.status === "active") ?? memberships[0];
  if (firstActive?.slug) {
    redirect(`/${firstActive.slug}/admin`);
  }

  redirect("/onboarding/role");
}
