import { redirect } from "next/navigation";

import { requireStaff } from "@/lib/server/action-guards";
import { getTenantPreviewOrigin } from "@/lib/site-admin/server/tenant-hosts";
import { requireTenantScope } from "@/lib/saas";

export const dynamic = "force-dynamic";

/**
 * Phase 0 sweep (2026-04-26) — convergence-plan §1 REDIRECT bucket.
 *
 * The legacy `/admin/site-settings/sections` CRUD list and per-section editor
 * were the old composer-driven mental model. The canonical surface is now the
 * inline EditShell on the storefront — sections are selected on the canvas
 * and edited through the inspector dock.
 *
 * This route preserves the old URL so deep links don't 404; we redirect into
 * the storefront in edit mode. The `?panel=` query is reserved for Phase A,
 * when the EditShell learns to open a specific drawer on first paint.
 */
export default async function SiteSettingsSectionsRedirect() {
  const auth = await requireStaff();
  if (!auth.ok) redirect("/login");

  const scope = await requireTenantScope().catch(() => null);
  if (!scope) redirect("/admin");

  const previewOrigin = await getTenantPreviewOrigin(
    auth.supabase,
    scope.tenantId,
  ).catch(() => null);
  if (previewOrigin) {
    redirect(`${previewOrigin.replace(/\/$/, "")}/?edit=1&panel=sections`);
  }
  redirect("/?edit=1&panel=sections");
}
