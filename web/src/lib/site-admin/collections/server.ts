/**
 * Wave 5A (job #36) — server IO for operator-defined content collections.
 *
 * Pure data-layer functions (each takes an explicit `supabase` + `tenantId`,
 * matching media/assets.ts) for:
 *   - listing a workspace's collections (+ item counts)
 *   - reading one collection with its items
 *   - resolving a set of `collection:<id>` sourceKeys → render records, for the
 *     storefront/editor render path (`dataSources.collections`)
 *
 * Mutations (create/update/delete collection, define fields, add/edit/delete
 * rows) live in the staff-gated server actions (actions.ts) that call these.
 *
 * Tenancy: every query filters on `tenant_id`. RLS (migration
 * 20260603210707_cms_collections.sql) is the authority; these `.eq(tenant_id)`
 * filters are defense-in-depth + correctness for the service-role read path the
 * public storefront uses (which bypasses RLS).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { BuilderDataSourceRecord } from "@/lib/site-admin/builder-node";
import {
  COLLECTION_MAX_ITEMS,
  collectionIdFromSourceKey,
  collectionItemsToRecords,
  collectionSourceKey,
  isCollectionSourceKey,
  normalizeCollectionFields,
  type CollectionItem,
  type ContentCollection,
  type ContentCollectionWithItems,
} from "./types";

const COLLECTION_COLUMNS =
  "id, tenant_id, name, slug, description, fields, updated_at";

interface CollectionRow {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  description: string | null;
  fields: unknown;
  updated_at: string;
}

interface CollectionItemRow {
  id: string;
  data: unknown;
  sort_order: number;
}

function rowToCollection(row: CollectionRow, itemCount: number): ContentCollection {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? null,
    fields: normalizeCollectionFields(row.fields),
    itemCount,
    updatedAt: row.updated_at,
  };
}

function rowToItem(row: CollectionItemRow): CollectionItem {
  return {
    id: row.id,
    data:
      row.data && typeof row.data === "object" && !Array.isArray(row.data)
        ? (row.data as Record<string, unknown>)
        : {},
    sortOrder: typeof row.sort_order === "number" ? row.sort_order : 0,
  };
}

/** List every collection for a tenant with its item count (no item bodies). */
export async function listTenantCollections(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<ContentCollection[]> {
  const { data, error } = await supabase
    .from("cms_collections")
    .select(`${COLLECTION_COLUMNS}, cms_collection_items ( id )`)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return (data as unknown as Array<CollectionRow & { cms_collection_items?: { id: string }[] }>).map(
    (row) => rowToCollection(row, row.cms_collection_items?.length ?? 0),
  );
}

/** Read one collection (tenant-scoped) with its ordered items. */
export async function getTenantCollectionWithItems(
  supabase: SupabaseClient,
  tenantId: string,
  collectionId: string,
): Promise<ContentCollectionWithItems | null> {
  const { data, error } = await supabase
    .from("cms_collections")
    .select(COLLECTION_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("id", collectionId)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as unknown as CollectionRow;

  const { data: itemRows } = await supabase
    .from("cms_collection_items")
    .select("id, data, sort_order")
    .eq("tenant_id", tenantId)
    .eq("collection_id", collectionId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(COLLECTION_MAX_ITEMS);

  const items = ((itemRows as unknown as CollectionItemRow[]) ?? []).map(rowToItem);
  return { ...rowToCollection(row, items.length), items };
}

/**
 * Resolve a set of `collection:<id>` sourceKeys into the
 * `dataSources.collections` map the renderer consumes. Loads each referenced
 * collection's field schema + items in one round-trip per relation, coerces
 * rows into records (`collectionItemsToRecords`), and keys the result by the
 * ORIGINAL sourceKey so `collectionRecordsForSource` finds it verbatim.
 *
 * Unknown / cross-tenant / empty ids resolve to an empty record list (the
 * repeater falls back to its single template child) — never an error.
 */
export async function resolveCollectionDataSources(
  supabase: SupabaseClient,
  tenantId: string,
  sourceKeys: ReadonlyArray<string>,
): Promise<Record<string, ReadonlyArray<BuilderDataSourceRecord>>> {
  const idBySourceKey = new Map<string, string>();
  for (const sourceKey of sourceKeys) {
    const id = collectionIdFromSourceKey(sourceKey);
    if (id) idBySourceKey.set(sourceKey, id);
  }
  if (idBySourceKey.size === 0) return {};

  const uniqueIds = [...new Set(idBySourceKey.values())];

  const [{ data: collectionRows }, { data: itemRows }] = await Promise.all([
    supabase
      .from("cms_collections")
      .select("id, fields")
      .eq("tenant_id", tenantId)
      .in("id", uniqueIds),
    supabase
      .from("cms_collection_items")
      .select("id, collection_id, data, sort_order")
      .eq("tenant_id", tenantId)
      .in("collection_id", uniqueIds)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(COLLECTION_MAX_ITEMS * uniqueIds.length),
  ]);

  const fieldsById = new Map(
    ((collectionRows as unknown as Array<{ id: string; fields: unknown }>) ?? []).map(
      (row) => [row.id, normalizeCollectionFields(row.fields)] as const,
    ),
  );
  const itemsById = new Map<string, CollectionItem[]>();
  for (const raw of (itemRows as unknown as Array<CollectionItemRow & { collection_id: string }>) ??
    []) {
    const list = itemsById.get(raw.collection_id) ?? [];
    list.push(rowToItem(raw));
    itemsById.set(raw.collection_id, list);
  }

  const out: Record<string, ReadonlyArray<BuilderDataSourceRecord>> = {};
  for (const [sourceKey, id] of idBySourceKey) {
    const fields = fieldsById.get(id);
    if (!fields) {
      out[sourceKey] = [];
      continue;
    }
    out[sourceKey] = collectionItemsToRecords(fields, itemsById.get(id) ?? []);
  }
  return out;
}

/** Project a loaded collection into the inspector's bindable-source shape. */
export function collectionToBindableSource(collection: ContentCollection): {
  sourceKey: string;
  label: string;
  fields: ReadonlyArray<{ key: string; label: string; kind: "text" | "image" | "href" }>;
  itemCount: number;
} {
  return {
    sourceKey: collectionSourceKey(collection.id),
    label: collection.name,
    itemCount: collection.itemCount,
    fields: collection.fields.map((field) => ({
      key: field.key,
      label: field.label,
      kind:
        field.type === "image" ? "image" : field.type === "url" ? "href" : "text",
    })),
  };
}

export { isCollectionSourceKey };
