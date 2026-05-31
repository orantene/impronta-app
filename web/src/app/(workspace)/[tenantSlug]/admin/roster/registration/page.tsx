// Legacy route — the "Open for registration" management surface now lives
// inside the admin dashboard (Settings → Roster → "Open for registration"),
// rendered by the SPA shell. This route + the notification "Review request"
// link redirect into that section via the ?focus deep-link.
//
// The route stays canonical (see admin-shell-client.tsx matcher) so this
// server redirect runs instead of the SPA overlaying it. The colocated
// actions.ts (saveRegistrationSettings / decideJoinRequest /
// loadRegistrationManageData) is still imported by the in-shell section.

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

export default async function AdminRosterRegistrationRedirect({
  params,
}: {
  params: PageParams;
}) {
  const { tenantSlug } = await params;
  redirect(`/${tenantSlug}/admin/settings?focus=registration`);
}
