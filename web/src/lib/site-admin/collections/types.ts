/**
 * Wave 5A (job #36) — operator-defined CONTENT COLLECTIONS.
 *
 * A collection is a named, tenant-scoped content set ("Team", "Projects",
 * "Testimonials") with a simple typed FIELD SCHEMA and a list of ITEM rows.
 * A freeform builder repeater binds to a collection via
 * `dataBinding.sourceKey = "collection:<id>"` (see `collectionSourceKey`); the
 * render repeat path resolves the collection's rows into
 * `dataSources.collections["collection:<id>"]` and child node props field-bind
 * to the collection's field keys through the existing `{{field_key}}` token
 * mechanism (data-bindings.ts).
 *
 * The DB shape (cms_collections / cms_collection_items, migration
 * 20260603210707_cms_collections.sql) keeps the field schema as JSONB on the
 * collection and each item's content as a JSONB object keyed by field key. This
 * module is the pure (no-IO) contract: the field types, the row/record shape,
 * the `collection:<id>` sourceKey helpers, validation, and the row→record
 * resolver the renderer consumes. The IO layer lives in
 * collections/server.ts + actions.ts.
 */

import type { BuilderDataSourceRecord } from "@/lib/site-admin/builder-node";

/** The typed field kinds an operator can add to a collection. */
export const COLLECTION_FIELD_TYPES = [
  "text",
  "richtext",
  "image",
  "url",
  "number",
  "boolean",
] as const;

export type CollectionFieldType = (typeof COLLECTION_FIELD_TYPES)[number];

export interface CollectionFieldDefinition {
  /** Stable machine key — the binding token (`{{key}}`) + the item-data key. */
  key: string;
  /** Human label shown in the editor + the binding picker. */
  label: string;
  type: CollectionFieldType;
}

/** A collection's content row. `data` is keyed by field.key. */
export interface CollectionItem {
  id: string;
  data: Readonly<Record<string, unknown>>;
  sortOrder: number;
}

/** A full collection: identity + field schema + (optionally) its items. */
export interface ContentCollection {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  fields: ReadonlyArray<CollectionFieldDefinition>;
  itemCount: number;
  updatedAt: string;
}

export interface ContentCollectionWithItems extends ContentCollection {
  items: ReadonlyArray<CollectionItem>;
}

// ── sourceKey helpers ───────────────────────────────────────────────────────
// A user collection is addressed as a builder data source by the opaque
// sourceKey `collection:<id>`. Keeping the prefix in one place means the
// renderer, the inspector, and the loader agree on the exact wire form.

export const COLLECTION_SOURCE_PREFIX = "collection:";

export function collectionSourceKey(collectionId: string): string {
  return `${COLLECTION_SOURCE_PREFIX}${collectionId}`;
}

export function isCollectionSourceKey(sourceKey: string | null | undefined): boolean {
  return (
    typeof sourceKey === "string" &&
    sourceKey.startsWith(COLLECTION_SOURCE_PREFIX) &&
    sourceKey.length > COLLECTION_SOURCE_PREFIX.length
  );
}

/** Extract the collection id from a `collection:<id>` sourceKey, or null. */
export function collectionIdFromSourceKey(
  sourceKey: string | null | undefined,
): string | null {
  if (!isCollectionSourceKey(sourceKey)) return null;
  const id = (sourceKey as string).slice(COLLECTION_SOURCE_PREFIX.length).trim();
  return id ? id : null;
}

// ── validation / normalization (pure, app-side) ─────────────────────────────

const FIELD_KEY_RE = /^[a-z][a-z0-9_]{0,38}$/;
export const COLLECTION_MAX_FIELDS = 24;
export const COLLECTION_MAX_ITEMS = 200;
export const COLLECTION_NAME_MAX = 80;

export function isCollectionFieldType(value: unknown): value is CollectionFieldType {
  return (
    typeof value === "string" &&
    (COLLECTION_FIELD_TYPES as ReadonlyArray<string>).includes(value)
  );
}

/** Slugify a free-text label into a stable lowercase field/collection key. */
export function slugifyCollectionKey(value: string): string {
  const base = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 38);
  if (!base) return "field";
  // A key must start with a letter — prefix if slugifying produced a leading digit.
  return /^[a-z]/.test(base) ? base : `f_${base}`.slice(0, 38);
}

/**
 * Coerce arbitrary JSON (the `fields` JSONB column or operator input) into a
 * clean, de-duplicated field schema. Unknown types fall back to "text"; empty
 * or malformed entries drop; keys are slugified + de-duplicated; capped at
 * COLLECTION_MAX_FIELDS. Never throws.
 */
export function normalizeCollectionFields(
  value: unknown,
): CollectionFieldDefinition[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: CollectionFieldDefinition[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const labelRaw =
      typeof record.label === "string" ? record.label.trim() : "";
    const keyRaw = typeof record.key === "string" ? record.key.trim() : "";
    const seedForKey = keyRaw || labelRaw;
    if (!seedForKey) continue;
    let key = slugifyCollectionKey(seedForKey);
    if (!FIELD_KEY_RE.test(key)) continue;
    // De-duplicate keys deterministically (key, key_2, key_3, …).
    if (seen.has(key)) {
      let n = 2;
      let candidate = `${key}_${n}`.slice(0, 38);
      while (seen.has(candidate)) {
        n += 1;
        candidate = `${key}_${n}`.slice(0, 38);
      }
      key = candidate;
    }
    seen.add(key);
    out.push({
      key,
      label: (labelRaw || key).slice(0, COLLECTION_NAME_MAX),
      type: isCollectionFieldType(record.type) ? record.type : "text",
    });
    if (out.length >= COLLECTION_MAX_FIELDS) break;
  }
  return out;
}

/**
 * Coerce an item's stored JSONB `data` into a record holding ONLY the keys the
 * collection's field schema declares, with values coerced to the field type's
 * natural JS shape. Unknown keys drop; missing keys are absent (not null).
 */
export function normalizeCollectionItemData(
  value: unknown,
  fields: ReadonlyArray<CollectionFieldDefinition>,
): Record<string, unknown> {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    if (!(field.key in source)) continue;
    out[field.key] = coerceFieldValue(source[field.key], field.type);
  }
  return out;
}

function coerceFieldValue(value: unknown, type: CollectionFieldType): unknown {
  switch (type) {
    case "number": {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : "";
      }
      return "";
    }
    case "boolean":
      return value === true || value === "true";
    default:
      // text / richtext / image / url — stored + rendered as strings.
      if (typeof value === "string") return value;
      if (value == null) return "";
      if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
      }
      return "";
  }
}

// ── row → render record resolution ──────────────────────────────────────────

/**
 * Turn collection items into the `BuilderDataSourceRecord[]` the renderer's
 * `collectionRecordsForSource` consumes. Each record is the item's coerced
 * field data PLUS a stable `id`, so the repeater's stable-key + field-binding
 * (`{{field_key}}`) resolution work exactly as they do for the built-in
 * sources. Items are returned in `sortOrder` then insertion order.
 */
export function collectionItemsToRecords(
  fields: ReadonlyArray<CollectionFieldDefinition>,
  items: ReadonlyArray<CollectionItem>,
): BuilderDataSourceRecord[] {
  return [...items]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => {
      const data = normalizeCollectionItemData(item.data, fields);
      return { id: item.id, ...data } satisfies BuilderDataSourceRecord;
    });
}
