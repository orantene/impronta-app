// Retired standalone talent editor — defensive redirect.
//
// The catalog-driven profile-shell drawer (`talent-profile-shell`, opened from
// the roster list and the New Talent drawer's post-create handoff) is now the
// SOLE reachable admin talent editor. This full-page editor is no longer linked
// from any normal flow, so direct/bookmarked hits to `/admin/roster/[id]` are
// redirected to the tenant roster list rather than rendering the dead editor.
//
// The standalone editor's component + action files (TalentEditForm,
// EditorSections, actions.ts, extended-actions.ts, …) remain in the tree as
// now-dead code; their removal is a separate supervised step.

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string; id: string }>;

export default async function RetiredWorkspaceRosterTalentPage({
  params,
}: {
  params: PageParams;
}) {
  const { tenantSlug } = await params;
  redirect(`/${tenantSlug}/admin/roster`);
}
