import "server-only";

/**
 * preview-workspace-context.ts — resolve the TENANT a workspace-targeted
 * template preview renders against.
 *
 * WHY THIS EXISTS
 * ───────────────
 * `/template-preview/[key]?kind=db-template` used to render EVERY persisted
 * template through the talent pipeline: a hardcoded `siteKind:
 * "talent_personal"` snapshot, `hydrateTalentTree` with talent tokens, and
 * `TalentSiteRenderer` with a demo persona and NO tenant context. For a
 * workspace-targeted template — which is exactly what a platform Default
 * Storefront is — that is a lie. Workspace-scoped connected nodes
 * (`featured_talent`, `talent_type_grid`, roster repeaters) resolve through
 * tenant-scoped loaders; with no tenant they render as nothing, silently. The
 * operator saw structural chrome and concluded the design was fine.
 *
 * WHY A REAL TENANT AND NOT A SYNTHETIC FIXTURE
 * ─────────────────────────────────────────────
 * A fixture would need a fake tenant id, and every data loader on the storefront
 * path is keyed on that id against real tables — so a fixture reproduces the
 * exact failure we are removing: empty connected sections that look deliberate.
 * The property that matters is "what you see is what a tenant gets", and only a
 * real tenant id gives you that. The route is super_admin gated (the row load
 * goes through `getTemplateById`), so there is no exposure concern in rendering
 * one tenant's public roster to a platform admin.
 *
 * RESOLUTION ORDER
 * ────────────────
 *   1. `?tenant=<slug>` — explicit, so an operator can preview the default
 *      against the workspace they actually care about (and so a bug report can
 *      carry a reproducible URL).
 *   2. the platform HUB tenant — the Lab's own media/authoring scope
 *      (`agencies.kind = 'hub'`), the closest thing the platform has to a
 *      canonical workspace, and the same tenant the Starter Kit already resolves
 *      for its thumbnail picker.
 *   3. the oldest ACTIVE non-hub workspace — a real roster to populate the
 *      connected nodes when no hub row exists (fresh environments).
 *
 * Returns `null` only when the database has no usable workspace at all; the
 * caller then renders the tree with no tenant and SAYS SO on the page rather
 * than pretending the empty connected sections are the design.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export interface WorkspacePreviewContext {
  tenantId: string;
  slug: string;
  displayName: string;
  /** How the tenant was chosen — surfaced in the preview banner so the operator
   *  is never guessing whose data they are looking at. */
  source: "requested" | "hub" | "first-active";
}

type AgencyRow = {
  id: string;
  slug: string;
  display_name: string | null;
};

function toContext(
  row: AgencyRow,
  source: WorkspacePreviewContext["source"],
): WorkspacePreviewContext {
  return {
    tenantId: row.id,
    slug: row.slug,
    displayName: row.display_name?.trim() || row.slug,
    source,
  };
}

/**
 * Resolve the workspace a `workspace` / `both` targeted template preview should
 * render against. Never throws — any failure degrades to `null`.
 */
export async function resolveWorkspacePreviewContext(
  requestedSlug?: string | null,
): Promise<WorkspacePreviewContext | null> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return null;

    const wanted = requestedSlug?.trim();
    if (wanted) {
      const { data } = await admin
        .from("agencies")
        .select("id, slug, display_name")
        .eq("slug", wanted)
        .maybeSingle<AgencyRow>();
      if (data?.id) return toContext(data, "requested");
      // An unknown slug falls through to the defaults rather than 404ing: the
      // point of the route is to SEE the template, and a typo in the query
      // string should not hide it.
    }

    const { data: hub } = await admin
      .from("agencies")
      .select("id, slug, display_name")
      .eq("kind", "hub")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<AgencyRow>();
    if (hub?.id) return toContext(hub, "hub");

    const { data: first } = await admin
      .from("agencies")
      .select("id, slug, display_name")
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<AgencyRow>();
    if (first?.id) return toContext(first, "first-active");

    return null;
  } catch (err) {
    logServerError("preview.resolveWorkspacePreviewContext", err);
    return null;
  }
}
