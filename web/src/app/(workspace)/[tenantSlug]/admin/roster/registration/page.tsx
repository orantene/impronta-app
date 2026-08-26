// Legacy route — the "Open for registration" management surface now lives
// inside the admin dashboard (Settings → Roster → "Open for registration"),
// rendered by the SPA shell. This route + the notification "Review request"
// link redirect into that section via the ?focus deep-link.
//
// The route stays canonical (see admin-shell-client.tsx matcher) so this
// server redirect runs instead of the SPA overlaying it. The colocated
// actions.ts (saveRegistrationSettings / decideJoinRequest /
// loadRegistrationManageData) is still imported by the in-shell section.

import { notFound, redirect } from "next/navigation";

import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { assertRosterWorkspace } from "@/lib/saas/assert-roster-workspace";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

export default async function AdminRosterRegistrationRedirect({
  params,
}: {
  params: PageParams;
}) {
  const { tenantSlug } = await params;

  // Direct-URL guard, layer 2 (server). "Open for registration" is talent
  // self-signup onto a roster — a business workspace has none, so the alias
  // 404s rather than bouncing the user into a Settings section that is not
  // there. Hides the route; deletes nothing.
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();
  await assertRosterWorkspace(scope.tenantId);

  redirect(`/${tenantSlug}/admin/settings?focus=registration`);
}
