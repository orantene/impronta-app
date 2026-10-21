// TUL-1369: the owner's service hub inside the Catalog (review queue, groups,
// per-entry settings, own services in the same list). Standalone server page,
// registered in CANONICAL_ROUTE_MATCHERS so the admin shell yields.
import { notFound } from "next/navigation";

import { OwnerHubScreen } from "@/components/admin/service-hub/OwnerHubScreen";
import { fieldsAllowed } from "@/lib/service-hub/entry-permissions";
import { getRequestLocale } from "@/i18n/request-locale";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { loadOwnerHub, resolveHubRoles } from "@/lib/service-hub/entries.server";
import { ownerHubCopy } from "@/lib/service-hub/owner-hub-copy";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function OwnerServiceHubPage() {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) notFound();
  const admin = createServiceRoleClient();
  if (!admin) notFound();
  const locale = await getRequestLocale();
  const c = ownerHubCopy(locale);
  const [roles, hub] = await Promise.all([resolveHubRoles(admin, guard.tenantId, guard.user.id), loadOwnerHub(admin, guard.tenantId)]);
  return (
    <main className="mx-auto max-w-[820px] px-4 py-8">
      {roles === "unreadable" || !hub.ok ? (
        <p role="alert">{c.loadFailed}</p>
      ) : (
        <OwnerHubScreen hub={hub} roles={roles} locale={locale} copy={c} allowedFields={fieldsAllowed(roles)} />
      )}
    </main>
  );
}
