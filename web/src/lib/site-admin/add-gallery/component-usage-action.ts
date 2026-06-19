"use server";

/**
 * component-usage-action.ts — D1 read-only component-TYPE usage tally.
 *
 * Walks every tenant tree-bearing column to count, per `BuilderNode.kind`, how
 * many tenant trees reference each component type. Powers the Builder Lab
 * Catalog's "Used N" column.
 *
 * Sources (one batched read each — never N queries):
 *   - `cms_pages.blocks`
 *   - `cms_sections.props_jsonb`
 *   - `cms_builder_components.subtree_jsonb`
 *   - `talent_sites` (`draft_snapshot`, `published_snapshot`, `shell_tree`,
 *     `shell_published`)
 *
 * GATE mirrors catalog-overlay-actions.ts: requireSuperAdmin() server-side; the
 * batched reads go through the service-role client (the gate IS the auth
 * boundary) so the tally spans EVERY tenant — this is a platform-wide inventory,
 * not a per-tenant view. Read-only: no writes, no revalidate.
 *
 * The per-request `cache()` wrapper dedupes the four-table scan within a single
 * `loadCatalogAdminView` render (the action is called once; the cache guards
 * against an accidental second call in the same request).
 */

import { cache } from "react";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  emptyUsageTally,
  mergeUsageTallies,
  tallyTreeJson,
  type ComponentUsageTally,
} from "./component-usage-scan";

async function requireSuperAdmin(): Promise<boolean> {
  const session = await getCachedActorSession();
  if (!session.user) return false;
  return isPlatformAdmin(session.profile);
}

/** Tally one column across an array of rows, reading the JSON at `key`. */
function tallyColumn<Row>(
  rows: ReadonlyArray<Row>,
  key: keyof Row,
): ComponentUsageTally {
  const perRow = rows.map((row) => tallyTreeJson(row[key] as unknown));
  return mergeUsageTallies(...perRow);
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
      // Four batched reads — one round-trip per source column (not per row).
      const [pages, sections, components, sites] = await Promise.all([
        admin.from("cms_pages").select("blocks"),
        admin.from("cms_sections").select("props_jsonb"),
        admin.from("cms_builder_components").select("subtree_jsonb"),
        admin
          .from("talent_sites")
          .select("draft_snapshot, published_snapshot, shell_tree, shell_published"),
      ]);

      const tallies: ComponentUsageTally[] = [];
      if (pages.data) tallies.push(tallyColumn(pages.data, "blocks"));
      if (sections.data) tallies.push(tallyColumn(sections.data, "props_jsonb"));
      if (components.data) {
        tallies.push(tallyColumn(components.data, "subtree_jsonb"));
      }
      if (sites.data) {
        // talent_sites carries FOUR tree columns; tally each then merge.
        for (const key of [
          "draft_snapshot",
          "published_snapshot",
          "shell_tree",
          "shell_published",
        ] as const) {
          tallies.push(tallyColumn(sites.data, key));
        }
      }

      return mergeUsageTallies(...tallies);
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
