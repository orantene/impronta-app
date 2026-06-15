"use server";

/**
 * catalog-structure-actions.ts — super_admin-gated server actions for the
 * builder catalog STRUCTURE (Builder Studio WS-B).
 *
 * Where the overlay (`catalog-overlay-actions.ts`) governs per-ITEM visibility
 * and metadata, the structure (`builder_catalog_structure`) governs the catalog
 * TAXONOMY: tab names/order/visibility, category (section) names/icons/order,
 * and which tab/category a component lives in. Rows are keyed by `ref`:
 *   - `tab:<tabId>`   — override a built-in tab (label/order/hidden)
 *   - `cat:<catId>`   — override or create a category
 *   - `item:<itemId>` — move a component to a different tab/category
 *
 * Reads use the authenticated cookie client (authenticated-read RLS); writes go
 * through the service-role client (the super_admin gate IS the auth boundary)
 * and bump `builder_catalog_version` + revalidate so both live "+" galleries and
 * the Lab pick the new structure up on next load. Mirrors the overlay actions.
 */

import { revalidatePath } from "next/cache";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logServerError, CLIENT_ERROR } from "@/lib/server/safe-error";
import { bumpCatalogVersion } from "@/lib/site-admin/builder-core/templates/catalog-version";
import {
  CODE_TAB_DEFS,
  type CatalogStructureMap,
  type CatalogStructureRow,
} from "./catalog-structure";

export type StructureActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function ok<T>(data: T): StructureActionResult<T> {
  return { ok: true, data };
}
function fail(error: string): StructureActionResult<never> {
  return { ok: false, error };
}

type GateOk = { ok: true; userId: string };
type GateErr = { ok: false; error: string };

async function requireSuperAdmin(): Promise<GateOk | GateErr> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not signed in." };
  if (!isPlatformAdmin(session.profile)) {
    return { ok: false, error: "Super admin access required." };
  }
  return { ok: true, userId: session.user.id };
}

function getAdminClient() {
  const client = createServiceRoleClient();
  if (!client) throw new Error("Service-role client unavailable.");
  return client;
}

/** Same 3-path revalidation the overlay writes use (live galleries + Lab). */
function revalidateCatalog() {
  revalidatePath("/platform/admin");
  revalidatePath("/t", "layout");
  revalidatePath("/(public)/p", "layout");
}

const KNOWN_TAB_IDS = new Set<string>(CODE_TAB_DEFS.map((t) => t.id));

/** A built-in tab id (created tabs are a deferred follow-up — see the plan). */
function isKnownTab(tabId: string): boolean {
  return KNOWN_TAB_IDS.has(tabId);
}

// ── read ─────────────────────────────────────────────────────────────────────

/**
 * The full structure map keyed by `ref`. Read with the authenticated cookie
 * client (authenticated-read RLS). Never throws — returns {} on error so the
 * gallery merge degrades to code-default taxonomy.
 */
export async function listCatalogStructure(): Promise<CatalogStructureMap> {
  try {
    const sb = await createClient();
    if (!sb) return {};
    const { data, error } = await sb.from("builder_catalog_structure").select();
    if (error || !data) return {};
    const map: CatalogStructureMap = {};
    for (const raw of data) {
      const row: CatalogStructureRow = {
        ref: raw.ref,
        kind: (raw.kind as CatalogStructureRow["kind"]) ?? "item",
        label_override: raw.label_override,
        icon_override: raw.icon_override,
        parent_tab: raw.parent_tab,
        sort_order: raw.sort_order,
        created: raw.created,
        hidden: raw.hidden,
        category_override: raw.category_override,
      };
      map[row.ref] = row;
    }
    return map;
  } catch (err) {
    logServerError("listCatalogStructure", err);
    return {};
  }
}

// ── writes (super_admin) ─────────────────────────────────────────────────────

type StructureUpsert = {
  ref: string;
  kind: "tab" | "category" | "item";
  label_override?: string | null;
  icon_override?: string | null;
  parent_tab?: string | null;
  sort_order?: number | null;
  created?: boolean;
  hidden?: boolean;
  category_override?: string | null;
};

/** Shared upsert: gate, write the row(s), bump version, revalidate. */
async function commitRows(rows: StructureUpsert[]): Promise<StructureActionResult> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return fail(gate.error);
  if (rows.length === 0) return ok(undefined);

  const payload = rows.map((r) => ({ ...r, updated_by: gate.userId }));
  try {
    const sb = getAdminClient();
    const { error } = await sb
      .from("builder_catalog_structure")
      .upsert(payload, { onConflict: "ref" });
    if (error) return fail(error.message);
    await bumpCatalogVersion(sb);
    revalidateCatalog();
    return ok(undefined);
  } catch (err) {
    logServerError("catalogStructure/commitRows", err);
    return fail(CLIENT_ERROR.generic);
  }
}

/** Rename / re-icon / reorder / hide a built-in TAB. */
export async function setTabOverride(input: {
  tabId: string;
  label_override?: string | null;
  icon_override?: string | null;
  sort_order?: number | null;
  hidden?: boolean;
}): Promise<StructureActionResult> {
  if (!input.tabId) return fail("Missing tab id.");
  if (!isKnownTab(input.tabId)) return fail(`Unknown tab "${input.tabId}".`);
  return commitRows([
    {
      ref: `tab:${input.tabId}`,
      kind: "tab",
      label_override: input.label_override,
      icon_override: input.icon_override,
      sort_order: input.sort_order,
      hidden: input.hidden,
    },
  ]);
}

/** Rename / re-icon / reorder / hide a category, or CREATE a new one. */
export async function setCategoryOverride(input: {
  categoryId: string;
  parent_tab?: string | null;
  label_override?: string | null;
  icon_override?: string | null;
  sort_order?: number | null;
  hidden?: boolean;
  created?: boolean;
}): Promise<StructureActionResult> {
  if (!input.categoryId) return fail("Missing category id.");
  if (input.parent_tab && !isKnownTab(input.parent_tab)) {
    return fail(`Unknown parent tab "${input.parent_tab}".`);
  }
  if (input.created && !input.parent_tab) {
    return fail("A new category needs a parent tab.");
  }
  return commitRows([
    {
      ref: `cat:${input.categoryId}`,
      kind: "category",
      parent_tab: input.parent_tab,
      label_override: input.label_override,
      icon_override: input.icon_override,
      sort_order: input.sort_order,
      hidden: input.hidden,
      created: input.created,
    },
  ]);
}

/** Persist a new left-to-right TAB order (sort_order = index). */
export async function reorderTabs(
  orderedTabIds: string[],
): Promise<StructureActionResult> {
  const unknown = orderedTabIds.find((id) => !isKnownTab(id));
  if (unknown) return fail(`Unknown tab "${unknown}".`);
  return commitRows(
    orderedTabIds.map((tabId, i) => ({
      ref: `tab:${tabId}`,
      kind: "tab" as const,
      sort_order: i,
    })),
  );
}

/** Persist a new category order within a tab (sort_order = index). */
export async function reorderCategories(
  parentTab: string,
  orderedCategoryIds: string[],
): Promise<StructureActionResult> {
  if (!isKnownTab(parentTab)) return fail(`Unknown tab "${parentTab}".`);
  return commitRows(
    orderedCategoryIds.map((catId, i) => ({
      ref: `cat:${catId}`,
      kind: "category" as const,
      parent_tab: parentTab,
      sort_order: i,
    })),
  );
}

/** Move a component to a different tab + category. */
export async function moveItem(input: {
  itemId: string;
  parent_tab: string;
  category_override: string;
}): Promise<StructureActionResult> {
  if (!input.itemId) return fail("Missing item id.");
  if (!isKnownTab(input.parent_tab)) return fail(`Unknown tab "${input.parent_tab}".`);
  if (!input.category_override.trim()) return fail("A target category is required.");
  return commitRows([
    {
      ref: `item:${input.itemId}`,
      kind: "item",
      parent_tab: input.parent_tab,
      category_override: input.category_override.trim(),
    },
  ]);
}

/** Remove a structure row → that tab/category/item reverts to its code default. */
export async function deleteStructureRow(
  ref: string,
): Promise<StructureActionResult> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return fail(gate.error);
  if (!/^(tab|cat|item):.+/.test(ref)) return fail("Invalid structure ref.");

  try {
    const sb = getAdminClient();
    const { error } = await sb
      .from("builder_catalog_structure")
      .delete()
      .eq("ref", ref);
    if (error) return fail(error.message);
    await bumpCatalogVersion(sb);
    revalidateCatalog();
    return ok(undefined);
  } catch (err) {
    logServerError("catalogStructure/deleteStructureRow", err);
    return fail(CLIENT_ERROR.generic);
  }
}
