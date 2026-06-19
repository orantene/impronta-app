"use server";

/**
 * component-usage-action.ts — D1 read-only component-TYPE usage tally.
 *
 * Counts, per `BuilderNode.kind`, how many tenant trees reference each component
 * type — across every tenant tree-bearing column. Powers the Builder Lab
 * Catalog's "Used N" column.
 *
 * P3 SCALE FIX: the per-type counting is done SERVER-SIDE by two SECURITY DEFINER
 * RPCs (one migration, 20261106000900) instead of selecting four whole tables
 * into Node and walking them in JS. The old path (a) truncated at PostgREST's
 * 1000-row `max_rows` and (b) streamed every tree column's full JSON over the
 * wire on Lab open. The RPCs aggregate in Postgres, so the counts are EXACT at
 * any scale and the read is a tiny `(kind, n)` / `(embed_key, n)` result set:
 *
 *   - `count_builder_component_usage()`             → (kind, n)
 *   - `count_builder_component_section_embed_keys()` → (embed_key, n)
 *
 * Both walk the same four sources the JS walker did (cms_pages.blocks /
 * cms_sections.props_jsonb / cms_builder_components.subtree_jsonb / talent_sites
 * draft+published+shell columns) via recursive-descent jsonpath.
 *
 * GATE mirrors catalog-overlay-actions.ts: requireSuperAdmin() server-side; the
 * RPCs run through the service-role client (the gate IS the auth boundary) and
 * are themselves SECURITY DEFINER + service_role-only, so the tally spans EVERY
 * tenant — a platform-wide inventory, not a per-tenant view. Read-only.
 *
 * The per-request `cache()` wrapper dedupes the RPC pair within a single render
 * (e.g. loadCatalogUsageCounts ∪ loadHideImpact in the same request).
 */

import { cache } from "react";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  emptyUsageTally,
  tallyFromRpcRows,
  type ComponentUsageTally,
} from "./component-usage-scan";

async function requireSuperAdmin(): Promise<boolean> {
  const session = await getCachedActorSession();
  if (!session.user) return false;
  return isPlatformAdmin(session.profile);
}

/**
 * Per-request-memoized implementation. NOT exported — a `"use server"` file may
 * only export async functions, so the `cache()`-wrapped const stays private and
 * the public entry point below is a thin async wrapper.
 */
const loadComponentUsageTallyCached = cache(
  async (): Promise<ComponentUsageTally> => {
    if (!(await requireSuperAdmin())) return emptyUsageTally();

    const admin = createServiceRoleClient();
    if (!admin) return emptyUsageTally();

    try {
      // Two server-side aggregates — no row streaming, no 1000-row truncation.
      const [byKind, byEmbed] = await Promise.all([
        admin.rpc("count_builder_component_usage"),
        admin.rpc("count_builder_component_section_embed_keys"),
      ]);

      if (byKind.error) logServerError("loadComponentUsageTally/byKind", byKind.error);
      if (byEmbed.error) {
        logServerError("loadComponentUsageTally/byEmbed", byEmbed.error);
      }

      return tallyFromRpcRows(byKind.data, byEmbed.data);
    } catch (err) {
      logServerError("loadComponentUsageTally", err);
      return emptyUsageTally();
    }
  },
);

/**
 * Load the platform-wide component-TYPE usage tally. Super_admin-gated;
 * returns an empty tally (never throws) when not authorized or on a read error,
 * so the Catalog view degrades to "—" rather than failing. Memoized per request.
 */
export async function loadComponentUsageTally(): Promise<ComponentUsageTally> {
  return loadComponentUsageTallyCached();
}
