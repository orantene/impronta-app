import { redirect } from "next/navigation";

import { requireStaff } from "@/lib/server/action-guards";
import { getTenantPreviewOrigin } from "@/lib/site-admin/server/tenant-hosts";
import { requireTenantScope } from "@/lib/saas";

export const dynamic = "force-dynamic";

/**
 * Legacy `/admin/site-settings/structure` route — superseded by the in-place
 * editor on the storefront. The route now redirects so deep links from old
 * docs / nav surfaces land in the right place. Operators are routed to the
 * tenant storefront root, where the EditPill / EditShell handles the same
 * authoring flow without round-tripping through a separate composer page.
 *
 * If we cannot resolve a preview origin (admin not scoped to a tenant, or
 * the tenant lacks a public host), we fall back to `/` on the current host —
 * the storefront chrome will surface a "select a workspace" message.
 */
export default async function SiteSettingsStructureRedirect() {
  const auth = await requireStaff();
  if (!auth.ok) redirect("/login");

  const scope = await requireTenantScope().catch(() => null);
  if (!scope) redirect("/admin");

  const previewOrigin = await getTenantPreviewOrigin(
    auth.supabase,
    scope.tenantId,
  ).catch(() => null);
  if (previewOrigin) {
    redirect(`${previewOrigin.replace(/\/$/, "")}/?edit=1`);
  }
  redirect("/?edit=1");
}
