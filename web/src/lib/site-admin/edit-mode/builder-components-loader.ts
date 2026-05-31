import "server-only";

/**
 * Phase 3 — published-render component loader.
 *
 * Loads a tenant's saved component definitions (componentId → master subtree)
 * so the renderer can resolve LIVE linked instances on the PUBLISHED page.
 *
 * Distinct from builder-components-action.ts (the staff-only "use server"
 * actions): published pages are viewed by ANONYMOUS visitors, who cannot read
 * private components through RLS. This loader uses the service-role client and
 * is scoped strictly to `tenant_id = <the page's tenant>` — i.e. a tenant's own
 * components, used only to render that tenant's own public page (content that
 * is public anyway once rendered). Read-only; never writes.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { looksLikeBuilderNode } from "@/lib/site-admin/edit-mode/builder-component-rows";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import type { ComponentDefinitions } from "@/lib/site-admin/builder-node/component-instances";

export async function loadBuilderComponentsForTenant(
  tenantId: string,
): Promise<ComponentDefinitions> {
  const admin = createServiceRoleClient();
  if (!admin) return {};

  const { data, error } = await admin
    .from("cms_builder_components")
    .select("id, subtree_jsonb")
    .eq("tenant_id", tenantId)
    .neq("visibility", "archived")
    .limit(500);
  if (error || !data) return {};

  const out: ComponentDefinitions = {};
  for (const row of data) {
    const subtree = (row as { id: string; subtree_jsonb: unknown }).subtree_jsonb;
    if (looksLikeBuilderNode(subtree)) {
      out[(row as { id: string }).id] = subtree as BuilderNode;
    }
  }
  return out;
}
