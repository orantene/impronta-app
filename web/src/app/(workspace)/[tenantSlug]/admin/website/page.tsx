// Phase 3.12 / Workspace nav fidelity — /admin/website canonical alias.
//
// The prototype's WORKSPACE_PAGES list calls this page "website"; the
// implementation directory has historically been `site/`. Rather than
// rename 90KB of canonical code (and chase every internal link),
// this lightweight server redirect makes /admin/website work as the
// front-door URL while /admin/site stays the implementation.
//
// Both URLs are valid; the topbar links to /admin/website (matches
// prototype), while internal `revalidatePath` and deep-links may still
// use /admin/site. The redirect normalises forward.

import { redirect } from "next/navigation";

type PageParams = Promise<{ tenantSlug: string }>;

export default async function WorkspaceWebsiteAlias({
  params,
}: {
  params: PageParams;
}) {
  const { tenantSlug } = await params;
  redirect(`/${tenantSlug}/admin/site`);
}
