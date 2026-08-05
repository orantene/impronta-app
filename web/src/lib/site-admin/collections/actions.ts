"use server";

/**
 * Wave 5A (job #36) — member-gated server actions for operator content
 * collections. Each action resolves the active tenant via
 * {@link requireStaffTenantAction} (the canonical guard used across the CMS),
 * then mutates `cms_collections` / `cms_collection_items` through the
 * authenticated client (RLS-enforced). Validation is app-side via the pure
 * normalizers in ./types.
 *
 * Capability grading (2026-08-04, follow-up to PR #995): the guard's DEFAULT
 * capability is `agency.workspace.view`, which every membership role from
 * `viewer` up holds. That is right for the two reads, but the mutations write
 * content that reaches the live site and RLS (`is_staff_of_tenant`) does not
 * distinguish membership roles — so each mutation asks for
 * `agency.site_admin.pages.edit` (editor and above) explicitly. Before #995 the
 * global `requireStaff()` app_role gate was doing this job by accident.
 *
 * Surface: create / list / rename / delete a collection, replace its field
 * schema, and add / update / delete / reorder its rows. Returns discriminated
 * `{ ok }` results so the client editor can react without try/catch.
 */

import { revalidatePath } from "next/cache";

import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import {
  listTenantCollections,
  getTenantCollectionWithItems,
} from "./server";
import {
  COLLECTION_MAX_FIELDS,
  COLLECTION_MAX_ITEMS,
  COLLECTION_NAME_MAX,
  normalizeCollectionFields,
  normalizeCollectionItemData,
  slugifyCollectionKey,
  type CollectionFieldDefinition,
  type ContentCollection,
  type ContentCollectionWithItems,
} from "./types";

export type CollectionActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

async function uniqueCollectionSlug(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  tenantId: string,
  base: string,
  excludeId?: string,
): Promise<string> {
  const { data } = await supabase
    .from("cms_collections")
    .select("id, slug")
    .eq("tenant_id", tenantId);
  const taken = new Set(
    ((data as Array<{ id: string; slug: string }> | null) ?? [])
      .filter((row) => row.id !== excludeId)
      .map((row) => row.slug),
  );
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

// ── reads ───────────────────────────────────────────────────────────────────

export async function listCollectionsAction(): Promise<
  CollectionActionResult<ContentCollection[]>
> {
  const guard = await requireStaffTenantAction();
  if (!guard.ok) return fail(guard.error);
  try {
    const data = await listTenantCollections(guard.supabase, guard.tenantId);
    return { ok: true, data };
  } catch (error) {
    logServerError("collections:listCollectionsAction", error);
    return fail("Could not load collections.");
  }
}

export async function getCollectionAction(
  collectionId: string,
): Promise<CollectionActionResult<ContentCollectionWithItems>> {
  const guard = await requireStaffTenantAction();
  if (!guard.ok) return fail(guard.error);
  try {
    const data = await getTenantCollectionWithItems(
      guard.supabase,
      guard.tenantId,
      collectionId,
    );
    if (!data) return fail("Collection not found.");
    return { ok: true, data };
  } catch (error) {
    logServerError("collections:getCollectionAction", error);
    return fail("Could not load the collection.");
  }
}

// ── collection mutations ────────────────────────────────────────────────────

export async function createCollectionAction(input: {
  name: string;
  description?: string;
  fields?: ReadonlyArray<{ key?: string; label: string; type: string }>;
}): Promise<CollectionActionResult<ContentCollection>> {
  const guard = await requireStaffTenantAction({
    capability: "agency.site_admin.pages.edit",
  });
  if (!guard.ok) return fail(guard.error);

  const name = input.name?.trim().slice(0, COLLECTION_NAME_MAX);
  if (!name) return fail("A collection needs a name.");
  const fields = normalizeCollectionFields(input.fields ?? []);

  try {
    const slug = await uniqueCollectionSlug(
      guard.supabase,
      guard.tenantId,
      slugifyCollectionKey(name),
    );
    const { data, error } = await guard.supabase
      .from("cms_collections")
      .insert([
        {
          tenant_id: guard.tenantId,
          name,
          slug,
          description: input.description?.trim() || null,
          fields,
          created_by: guard.user.id,
          updated_by: guard.user.id,
        },
      ])
      .select("id, tenant_id, name, slug, description, fields, updated_at")
      .single();

    if (error || !data) {
      return fail(error?.message ?? "Could not create the collection.");
    }
    revalidatePath(`/${guard.tenantSlug}/admin`);
    const row = data as {
      id: string;
      tenant_id: string;
      name: string;
      slug: string;
      description: string | null;
      fields: unknown;
      updated_at: string;
    };
    return {
      ok: true,
      data: {
        id: row.id,
        tenantId: row.tenant_id,
        name: row.name,
        slug: row.slug,
        description: row.description ?? null,
        fields: normalizeCollectionFields(row.fields),
        itemCount: 0,
        updatedAt: row.updated_at,
      },
    };
  } catch (error) {
    logServerError("collections:createCollectionAction", error);
    return fail("Could not create the collection.");
  }
}

export async function updateCollectionAction(input: {
  collectionId: string;
  name?: string;
  description?: string | null;
  fields?: ReadonlyArray<{ key?: string; label: string; type: string }>;
}): Promise<CollectionActionResult<{ id: string }>> {
  const guard = await requireStaffTenantAction({
    capability: "agency.site_admin.pages.edit",
  });
  if (!guard.ok) return fail(guard.error);

  const patch: Record<string, unknown> = { updated_by: guard.user.id };
  if (typeof input.name === "string") {
    const name = input.name.trim().slice(0, COLLECTION_NAME_MAX);
    if (!name) return fail("A collection needs a name.");
    patch.name = name;
  }
  if (input.description !== undefined) {
    patch.description =
      typeof input.description === "string" && input.description.trim()
        ? input.description.trim()
        : null;
  }
  let nextFields: CollectionFieldDefinition[] | null = null;
  if (input.fields !== undefined) {
    nextFields = normalizeCollectionFields(input.fields);
    if (nextFields.length > COLLECTION_MAX_FIELDS) {
      return fail(`A collection can have at most ${COLLECTION_MAX_FIELDS} fields.`);
    }
    patch.fields = nextFields;
  }

  try {
    const { error } = await guard.supabase
      .from("cms_collections")
      .update(patch)
      .eq("tenant_id", guard.tenantId)
      .eq("id", input.collectionId);
    if (error) return fail(error.message);
    revalidatePath(`/${guard.tenantSlug}/admin`);
    return { ok: true, data: { id: input.collectionId } };
  } catch (error) {
    logServerError("collections:updateCollectionAction", error);
    return fail("Could not update the collection.");
  }
}

export async function deleteCollectionAction(input: {
  collectionId: string;
}): Promise<CollectionActionResult<{ id: string }>> {
  const guard = await requireStaffTenantAction({
    capability: "agency.site_admin.pages.edit",
  });
  if (!guard.ok) return fail(guard.error);
  try {
    // Items cascade via the FK on delete.
    const { error } = await guard.supabase
      .from("cms_collections")
      .delete()
      .eq("tenant_id", guard.tenantId)
      .eq("id", input.collectionId);
    if (error) return fail(error.message);
    revalidatePath(`/${guard.tenantSlug}/admin`);
    return { ok: true, data: { id: input.collectionId } };
  } catch (error) {
    logServerError("collections:deleteCollectionAction", error);
    return fail("Could not delete the collection.");
  }
}

// ── item (row) mutations ────────────────────────────────────────────────────

async function loadCollectionFields(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  tenantId: string,
  collectionId: string,
): Promise<CollectionFieldDefinition[] | null> {
  const { data, error } = await supabase
    .from("cms_collections")
    .select("fields")
    .eq("tenant_id", tenantId)
    .eq("id", collectionId)
    .maybeSingle();
  if (error || !data) return null;
  return normalizeCollectionFields((data as { fields: unknown }).fields);
}

export async function addCollectionItemAction(input: {
  collectionId: string;
  data?: Record<string, unknown>;
}): Promise<CollectionActionResult<{ id: string }>> {
  const guard = await requireStaffTenantAction({
    capability: "agency.site_admin.pages.edit",
  });
  if (!guard.ok) return fail(guard.error);
  try {
    const fields = await loadCollectionFields(
      guard.supabase,
      guard.tenantId,
      input.collectionId,
    );
    if (!fields) return fail("Collection not found.");

    const { count } = await guard.supabase
      .from("cms_collection_items")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", guard.tenantId)
      .eq("collection_id", input.collectionId);
    if ((count ?? 0) >= COLLECTION_MAX_ITEMS) {
      return fail(`A collection can hold at most ${COLLECTION_MAX_ITEMS} items.`);
    }

    const cleanData = normalizeCollectionItemData(input.data ?? {}, fields);
    const { data, error } = await guard.supabase
      .from("cms_collection_items")
      .insert([
        {
          collection_id: input.collectionId,
          tenant_id: guard.tenantId,
          data: cleanData,
          sort_order: count ?? 0,
        },
      ])
      .select("id")
      .single();
    if (error || !data) return fail(error?.message ?? "Could not add the item.");
    revalidatePath(`/${guard.tenantSlug}/admin`);
    return { ok: true, data: { id: (data as { id: string }).id } };
  } catch (error) {
    logServerError("collections:addCollectionItemAction", error);
    return fail("Could not add the item.");
  }
}

export async function updateCollectionItemAction(input: {
  collectionId: string;
  itemId: string;
  data: Record<string, unknown>;
}): Promise<CollectionActionResult<{ id: string }>> {
  const guard = await requireStaffTenantAction({
    capability: "agency.site_admin.pages.edit",
  });
  if (!guard.ok) return fail(guard.error);
  try {
    const fields = await loadCollectionFields(
      guard.supabase,
      guard.tenantId,
      input.collectionId,
    );
    if (!fields) return fail("Collection not found.");
    const cleanData = normalizeCollectionItemData(input.data, fields);
    const { error } = await guard.supabase
      .from("cms_collection_items")
      .update({ data: cleanData })
      .eq("tenant_id", guard.tenantId)
      .eq("collection_id", input.collectionId)
      .eq("id", input.itemId);
    if (error) return fail(error.message);
    revalidatePath(`/${guard.tenantSlug}/admin`);
    return { ok: true, data: { id: input.itemId } };
  } catch (error) {
    logServerError("collections:updateCollectionItemAction", error);
    return fail("Could not update the item.");
  }
}

export async function deleteCollectionItemAction(input: {
  itemId: string;
}): Promise<CollectionActionResult<{ id: string }>> {
  const guard = await requireStaffTenantAction({
    capability: "agency.site_admin.pages.edit",
  });
  if (!guard.ok) return fail(guard.error);
  try {
    const { error } = await guard.supabase
      .from("cms_collection_items")
      .delete()
      .eq("tenant_id", guard.tenantId)
      .eq("id", input.itemId);
    if (error) return fail(error.message);
    revalidatePath(`/${guard.tenantSlug}/admin`);
    return { ok: true, data: { id: input.itemId } };
  } catch (error) {
    logServerError("collections:deleteCollectionItemAction", error);
    return fail("Could not delete the item.");
  }
}

export async function reorderCollectionItemsAction(input: {
  collectionId: string;
  orderedItemIds: ReadonlyArray<string>;
}): Promise<CollectionActionResult<{ id: string }>> {
  const guard = await requireStaffTenantAction({
    capability: "agency.site_admin.pages.edit",
  });
  if (!guard.ok) return fail(guard.error);
  try {
    // Apply the new sort_order one update per item, all tenant + collection
    // scoped so a stray id from another collection can never be touched.
    for (let index = 0; index < input.orderedItemIds.length; index += 1) {
      const itemId = input.orderedItemIds[index];
      const { error } = await guard.supabase
        .from("cms_collection_items")
        .update({ sort_order: index })
        .eq("tenant_id", guard.tenantId)
        .eq("collection_id", input.collectionId)
        .eq("id", itemId);
      if (error) return fail(error.message);
    }
    revalidatePath(`/${guard.tenantSlug}/admin`);
    return { ok: true, data: { id: input.collectionId } };
  } catch (error) {
    logServerError("collections:reorderCollectionItemsAction", error);
    return fail("Could not reorder the items.");
  }
}
