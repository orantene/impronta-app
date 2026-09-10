/**
 * /admin/work — Projects' legacy segment.
 *
 * The destination registry has always declared `work` an alias of `projects`.
 * While Projects was unbuilt this page stood in for it by syncing the shell to
 * Messages, so a URL for a job landed on the thread it would have been about.
 * P4 gave Projects a real route, and leaving the stand-in in place would have
 * split the screen in two: the rail highlighting Projects (the registry
 * resolves `work` to it) while the body showed Messages.
 *
 * A redirect rather than a second copy of the list: one route per surface, and
 * the URL the operator ends on names what they are looking at. `/admin/work/<id>`
 * is untouched — that is the canonical booking detail, a different page.
 */

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminWorkPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  // Middleware canonicalises the Location on a branded host, so the slug here
  // costs one hop and never lands on the wrong workspace.
  redirect(`/${tenantSlug}/admin/projects`);
}
