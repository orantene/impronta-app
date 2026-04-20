/**
 * Phase 5 / M2 — navigation server operations.
 *
 * Consumed by the `/admin/site-settings/navigation` Server Actions. All writes
 * go through this module so concurrency / audit / cache-bust discipline is
 * enforced uniformly.
 *
 * Two distinct lifecycles:
 *   - DRAFT — `cms_navigation_items` rows. Edits do NOT bust public cache.
 *   - PUBLISHED — `cms_navigation_menus.tree_json`. Updated atomically via
 *     `publishNavigationMenu`; busts `tagFor(tenantId, 'navigation')`.
 *
 * Capability gates:
 *   - draft CRUD → agency.site_admin.navigation.edit
 *   - publish    → agency.site_admin.navigation.publish
 *
 * Tenant safety: all reads + writes scope by `tenant_id` explicitly; RLS
 * adds a second layer (is_staff_of_tenant).
 */

import { randomUUID } from "node:crypto";
import { updateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  emitAuditEvent,
  fail,
  ok,
  requirePhase5Capability,
  tagFor,
  versionConflict,
  type Phase5Result,
} from "@/lib/site-admin";
import type {
  NavItemDeleteValues,
  NavItemDraftValues,
  NavPublishValues,
  NavReorderValues,
  NavTreeValues,
  NavZone,
} from "@/lib/site-admin/forms/navigation";
import { navTreeSchema } from "@/lib/site-admin/forms/navigation";
import type { Locale } from "@/lib/site-admin/locales";

// ---- row shapes -----------------------------------------------------------

export interface NavItemRow {
  id: string;
  tenant_id: string;
  zone: NavZone;
  locale: Locale;
  parent_id: string | null;
  label: string;
  href: string;
  sort_order: number;
  visible: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface NavMenuRow {
  id: string;
  tenant_id: string;
  zone: NavZone;
  locale: Locale;
  tree_json: NavTreeValues;
  version: number;
  published_at: string | null;
  published_by: string | null;
  created_at: string;
  updated_at: string;
}

const ITEM_COLUMNS = `
  id,
  tenant_id,
  zone,
  locale,
  parent_id,
  label,
  href,
  sort_order,
  visible,
  version,
  created_at,
  updated_at
`;

const MENU_COLUMNS = `
  id,
  tenant_id,
  zone,
  locale,
  tree_json,
  version,
  published_at,
  published_by,
  created_at,
  updated_at
`;

// ---- upsert single draft item --------------------------------------------

/**
 * Create or update one nav item. Concurrency: `expectedVersion === 0` →
 * insert (new item); otherwise compare-and-set update.
 */
export async function upsertNavItem(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    values: NavItemDraftValues;
    actorProfileId: string | null;
    correlationId?: string;
  },
): Promise<Phase5Result<{ id: string; version: number }>> {
  const { tenantId, values, actorProfileId } = params;
  const correlationId = params.correlationId ?? randomUUID();

  await requirePhase5Capability("agency.site_admin.navigation.edit", tenantId);

  const rowFields = {
    tenant_id: tenantId,
    zone: values.zone,
    locale: values.locale,
    parent_id: values.parentId ?? null,
    label: values.label,
    href: values.href,
    sort_order: values.sortOrder,
    visible: values.visible,
  };

  if (!values.id) {
    // --- CREATE ---
    const { data, error } = await supabase
      .from("cms_navigation_items")
      .insert({ ...rowFields, version: 1 })
      .select(ITEM_COLUMNS)
      .single<NavItemRow>();
    if (error || !data) {
      return fail("FORBIDDEN", error?.message ?? "Insert failed");
    }
    await emitAuditEvent(supabase, {
      tenantId,
      actorProfileId,
      action: "agency.site_admin.navigation.edit",
      entityType: "cms_navigation_items",
      entityId: data.id,
      diffSummary: `nav item created (${values.zone}/${values.locale}): ${values.label}`,
      beforeSnapshot: null,
      afterSnapshot: data,
      correlationId,
    });
    // Draft edits do NOT bust public cache (tagFor navigation) — the
    // storefront only ever reads the published menu snapshot.
    return ok({ id: data.id, version: data.version });
  }

  // --- UPDATE (compare-and-set) ---
  // Load current row for before-snapshot + to guard against cross-tenant
  // id smuggling (RLS catches it too; belt + braces).
  const { data: beforeRow, error: loadErr } = await supabase
    .from("cms_navigation_items")
    .select(ITEM_COLUMNS)
    .eq("id", values.id)
    .eq("tenant_id", tenantId)
    .maybeSingle<NavItemRow>();
  if (loadErr) return fail("FORBIDDEN", loadErr.message);
  if (!beforeRow) return fail("NOT_FOUND", "Nav item not found");

  if (beforeRow.version !== values.expectedVersion) {
    return versionConflict(beforeRow.version);
  }

  const nextVersion = beforeRow.version + 1;
  const { data, error } = await supabase
    .from("cms_navigation_items")
    .update({ ...rowFields, version: nextVersion })
    .eq("id", values.id)
    .eq("tenant_id", tenantId)
    .eq("version", beforeRow.version)
    .select(ITEM_COLUMNS)
    .maybeSingle<NavItemRow>();
  if (error) return fail("FORBIDDEN", error.message);
  if (!data) {
    // Another writer bumped version between SELECT and UPDATE.
    return versionConflict(beforeRow.version + 1);
  }

  await emitAuditEvent(supabase, {
    tenantId,
    actorProfileId,
    action: "agency.site_admin.navigation.edit",
    entityType: "cms_navigation_items",
    entityId: data.id,
    diffSummary: `nav item updated (${values.zone}/${values.locale}): ${values.label}`,
    beforeSnapshot: beforeRow,
    afterSnapshot: data,
    correlationId,
  });

  return ok({ id: data.id, version: data.version });
}

// ---- delete draft item ---------------------------------------------------

export async function deleteNavItem(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    values: NavItemDeleteValues;
    actorProfileId: string | null;
    correlationId?: string;
  },
): Promise<Phase5Result<{ id: string }>> {
  const { tenantId, values, actorProfileId } = params;
  const correlationId = params.correlationId ?? randomUUID();

  await requirePhase5Capability("agency.site_admin.navigation.edit", tenantId);

  const { data: beforeRow, error: loadErr } = await supabase
    .from("cms_navigation_items")
    .select(ITEM_COLUMNS)
    .eq("id", values.id)
    .eq("tenant_id", tenantId)
    .maybeSingle<NavItemRow>();
  if (loadErr) return fail("FORBIDDEN", loadErr.message);
  if (!beforeRow) return fail("NOT_FOUND", "Nav item not found");

  if (beforeRow.version !== values.expectedVersion) {
    return versionConflict(beforeRow.version);
  }

  // CAS delete: target specific version. Cascades children via FK.
  const { error, count } = await supabase
    .from("cms_navigation_items")
    .delete({ count: "exact" })
    .eq("id", values.id)
    .eq("tenant_id", tenantId)
    .eq("version", beforeRow.version);
  if (error) return fail("FORBIDDEN", error.message);
  if (!count) return versionConflict(beforeRow.version + 1);

  await emitAuditEvent(supabase, {
    tenantId,
    actorProfileId,
    action: "agency.site_admin.navigation.edit",
    entityType: "cms_navigation_items",
    entityId: values.id,
    diffSummary: `nav item deleted (${values.zone}/${values.locale}): ${beforeRow.label}`,
    beforeSnapshot: beforeRow,
    afterSnapshot: null,
    correlationId,
  });

  return ok({ id: values.id });
}

// ---- bulk reorder --------------------------------------------------------

/**
 * Apply a re-parent / re-sort batch. Each entry carries its own
 * `expectedVersion`; if any stale, abort with VERSION_CONFLICT and don't mutate
 * the others (best-effort — supabase-js does not expose a true transaction,
 * so we short-circuit on the first conflict).
 *
 * NOTE: a future milestone can move this into a SECURITY DEFINER RPC that
 * runs the batch in one transaction. For M2 we accept minor non-atomicity:
 * the depth trigger still prevents invalid states, and a failed batch leaves
 * the earlier writes applied — the editor re-loads after a conflict, the
 * operator retries, no data is lost.
 */
export async function reorderNavItems(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    values: NavReorderValues;
    actorProfileId: string | null;
    correlationId?: string;
  },
): Promise<Phase5Result<{ updated: number }>> {
  const { tenantId, values, actorProfileId } = params;
  const correlationId = params.correlationId ?? randomUUID();

  await requirePhase5Capability("agency.site_admin.navigation.edit", tenantId);

  let updated = 0;
  for (const item of values.items) {
    const { data, error } = await supabase
      .from("cms_navigation_items")
      .update({
        parent_id: item.parentId,
        sort_order: item.sortOrder,
        version: item.expectedVersion + 1,
      })
      .eq("id", item.id)
      .eq("tenant_id", tenantId)
      .eq("version", item.expectedVersion)
      .eq("zone", values.zone)
      .eq("locale", values.locale)
      .select("id, version")
      .maybeSingle<{ id: string; version: number }>();
    if (error) return fail("FORBIDDEN", error.message);
    if (!data) return versionConflict(item.expectedVersion + 1);
    updated += 1;
  }

  await emitAuditEvent(supabase, {
    tenantId,
    actorProfileId,
    action: "agency.site_admin.navigation.edit",
    entityType: "cms_navigation_items",
    entityId: `${values.zone}:${values.locale}`,
    diffSummary: `nav reorder (${values.zone}/${values.locale}): ${updated} items`,
    beforeSnapshot: null,
    afterSnapshot: { updated },
    correlationId,
  });

  return ok({ updated });
}

// ---- publish --------------------------------------------------------------

/**
 * Snapshot the current draft items into `cms_navigation_menus.tree_json` and
 * mark them published. Atomic unit is one (tenant, zone, locale) triple.
 */
export async function publishNavigationMenu(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    values: NavPublishValues;
    actorProfileId: string | null;
    correlationId?: string;
  },
): Promise<Phase5Result<{ version: number; publishedAt: string }>> {
  const { tenantId, values, actorProfileId } = params;
  const correlationId = params.correlationId ?? randomUUID();

  await requirePhase5Capability("agency.site_admin.navigation.publish", tenantId);

  // 1. Load the current menu row (if any) for CAS + before-snapshot.
  const { data: beforeMenu, error: loadMenuErr } = await supabase
    .from("cms_navigation_menus")
    .select(MENU_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("zone", values.zone)
    .eq("locale", values.locale)
    .maybeSingle<NavMenuRow>();
  if (loadMenuErr) return fail("FORBIDDEN", loadMenuErr.message);

  const currentVersion = beforeMenu?.version ?? 0;
  if (currentVersion !== values.expectedMenuVersion) {
    return versionConflict(currentVersion);
  }

  // 2. Read the draft item set for this (tenant, zone, locale).
  const { data: drafts, error: loadDraftsErr } = await supabase
    .from("cms_navigation_items")
    .select(ITEM_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("zone", values.zone)
    .eq("locale", values.locale)
    .order("sort_order", { ascending: true });
  if (loadDraftsErr) return fail("FORBIDDEN", loadDraftsErr.message);

  const tree = buildTreeFromRows(drafts ?? []);

  // 3. Validate the serialized tree — depth + duplicates + href rules. The
  // DB trigger guards depth too, but re-validating before persist matches
  // the identity-form flow (Zod + DB CHECK for every write).
  const parsed = navTreeSchema.safeParse(tree);
  if (!parsed.success) {
    return fail(
      "VALIDATION_FAILED",
      `Menu tree invalid: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
    );
  }

  const nextVersion = currentVersion + 1;
  const nowIso = new Date().toISOString();

  // 4. Upsert the menu row (CAS on UPDATE; INSERT when no row yet).
  let afterMenu: NavMenuRow | null = null;
  if (!beforeMenu) {
    const { data, error } = await supabase
      .from("cms_navigation_menus")
      .insert({
        tenant_id: tenantId,
        zone: values.zone,
        locale: values.locale,
        tree_json: parsed.data,
        version: nextVersion,
        published_at: nowIso,
        published_by: actorProfileId,
      })
      .select(MENU_COLUMNS)
      .single<NavMenuRow>();
    if (error || !data) {
      return fail("FORBIDDEN", error?.message ?? "Menu insert failed");
    }
    afterMenu = data;
  } else {
    const { data, error } = await supabase
      .from("cms_navigation_menus")
      .update({
        tree_json: parsed.data,
        version: nextVersion,
        published_at: nowIso,
        published_by: actorProfileId,
      })
      .eq("tenant_id", tenantId)
      .eq("zone", values.zone)
      .eq("locale", values.locale)
      .eq("version", currentVersion)
      .select(MENU_COLUMNS)
      .maybeSingle<NavMenuRow>();
    if (error) return fail("FORBIDDEN", error.message);
    if (!data) return versionConflict(currentVersion + 1);
    afterMenu = data;
  }

  // 5. Append revision snapshot (best-effort).
  {
    const { error } = await supabase.from("cms_navigation_revisions").insert({
      tenant_id: tenantId,
      zone: values.zone,
      locale: values.locale,
      version: nextVersion,
      snapshot: parsed.data,
      created_by: actorProfileId,
    });
    if (error) {
      console.warn("[site-admin/navigation] revision insert failed", {
        tenantId,
        zone: values.zone,
        locale: values.locale,
        version: nextVersion,
        error: error.message,
      });
    }
  }

  // 6. Audit.
  await emitAuditEvent(supabase, {
    tenantId,
    actorProfileId,
    action: "agency.site_admin.navigation.publish",
    entityType: "cms_navigation_menus",
    entityId: afterMenu.id,
    diffSummary: `navigation published (${values.zone}/${values.locale}): ${countNodes(parsed.data)} items, v${nextVersion}`,
    beforeSnapshot: beforeMenu,
    afterSnapshot: afterMenu,
    correlationId,
  });

  // 7. Cache bust — navigation tag only. Storefront identity + branding
  // tags are untouched.
  updateTag(tagFor(tenantId, "navigation"));

  return ok({ version: nextVersion, publishedAt: nowIso });
}

// ---- helpers --------------------------------------------------------------

/** Compose a depth-≤2 tree from a flat row set sorted by sort_order. */
export function buildTreeFromRows(rows: NavItemRow[]): NavTreeValues {
  type Node = NavTreeValues[number];
  const byId = new Map<string, Node>();
  const roots: Node[] = [];

  // First pass: create nodes.
  for (const row of rows) {
    byId.set(row.id, {
      id: row.id,
      label: row.label,
      href: row.href,
      visible: row.visible,
      sortOrder: row.sort_order,
      children: [],
    });
  }

  // Second pass: hook children → parents. Rows with unknown/cross-tenant
  // parent (shouldn't happen under RLS) get promoted to root as a safety.
  for (const row of rows) {
    const node = byId.get(row.id)!;
    if (row.parent_id && byId.has(row.parent_id)) {
      byId.get(row.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Stable sort each level by sort_order (input was already sorted, but
  // depth-2 groupings may need resorting).
  function sortLevel(list: Node[]) {
    list.sort((a, b) => a.sortOrder - b.sortOrder);
    for (const n of list) if (n.children.length) sortLevel(n.children);
  }
  sortLevel(roots);

  return roots;
}

/** Count total nodes in a tree (for diff summaries). */
function countNodes(tree: NavTreeValues): number {
  let n = 0;
  const stack = [...tree];
  while (stack.length) {
    const node = stack.pop()!;
    n += 1;
    for (const c of node.children) stack.push(c);
  }
  return n;
}
