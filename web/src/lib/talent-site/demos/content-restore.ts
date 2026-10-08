/**
 * The content half of a demo backup: what `before` holds for every table the
 * reference content step can write, and the PURE plan that puts those rows back.
 * No I/O; `content-state.server.ts` reads, snapshots and executes.
 */
import { sameStable } from "./stable";
import { CONTENT_WRITE_TABLES, type ContentTable } from "./fixture-plan";

type Row = Record<string, unknown>;

/** Rows of one talent, per table. `talent_location_settings` is 0 or 1 row; `talent_profiles` is the column subset. */
export type ContentSnapshot = Record<ContentTable, Row[]>;

/** talent_profiles columns the content step changes (restored as a patch). */
export const PROFILE_COLUMNS = ["short_bio", "bio_i18n", "home_city_text", "height_cm", "social_links"] as const;

interface TableSpec {
  /** Columns that identify a row. */
  key: readonly string[];
  /** Conflict target for upsert. */
  onConflict: string;
}

export const TABLE_SPECS: Readonly<Record<Exclude<ContentTable, "talent_profiles">, TableSpec>> = {
  talent_offerings: { key: ["id"], onConflict: "id" },
  talent_offering_media: { key: ["offering_id", "media_asset_id"], onConflict: "offering_id,media_asset_id" },
  talent_offering_variants: { key: ["id"], onConflict: "id" },
  talent_offering_addons: { key: ["id"], onConflict: "id" },
  talent_faq_items: { key: ["id"], onConflict: "id" },
  talent_profile_field_values: { key: ["id"], onConflict: "id" },
  talent_languages: { key: ["talent_profile_id", "language_code"], onConflict: "talent_profile_id,language_code" },
  talent_location_settings: { key: ["talent_profile_id"], onConflict: "talent_profile_id" },
  talent_service_areas: { key: ["id"], onConflict: "id" },
  // The content step only edits `metadata.caption` of existing photos; the executor restores it with an update (never an insert or delete).
  media_assets: { key: ["id"], onConflict: "id" },
};

/** Parents before children for upserts; children before parents for deletes. */
export const RESTORE_ORDER: readonly Exclude<ContentTable, "talent_profiles">[] = [
  "talent_offerings",
  "talent_offering_media",
  "talent_offering_variants",
  "talent_offering_addons",
  "talent_faq_items",
  "talent_profile_field_values",
  "talent_languages",
  "talent_location_settings",
  "talent_service_areas",
  "media_assets",
];

export type RestoreOp =
  | { table: Exclude<ContentTable, "talent_profiles">; kind: "upsert"; row: Row }
  | { table: Exclude<ContentTable, "talent_profiles">; kind: "delete"; key: Row }
  | { table: "talent_profiles"; kind: "patch"; patch: Row };

const keyOf = (spec: TableSpec, r: Row) => spec.key.map((k) => String(r[k])).join("|");
const pick = (spec: TableSpec, r: Row): Row => Object.fromEntries(spec.key.map((k) => [k, r[k]]));

export function emptySnapshot(): ContentSnapshot {
  return Object.fromEntries(CONTENT_WRITE_TABLES.map((t) => [t, []])) as unknown as ContentSnapshot;
}

/** PURE: the ops that turn `current` back into `before`. Rows already equal produce no op. */
export function planContentRestore(before: ContentSnapshot, current: ContentSnapshot): RestoreOp[] {
  const ops: RestoreOp[] = [];
  const upserts: RestoreOp[] = [];
  const deletes: RestoreOp[] = [];
  for (const table of RESTORE_ORDER) {
    // A backup taken before a table joined the content step has no rows for it: leave that table alone.
    if (!Array.isArray(before[table])) continue;
    const spec = TABLE_SPECS[table];
    const have = new Map((current[table] ?? []).map((r) => [keyOf(spec, r), r]));
    const want = new Map((before[table] ?? []).map((r) => [keyOf(spec, r), r]));
    for (const [k, row] of want) {
      const cur = have.get(k);
      if (!cur || !sameStable(cur, row)) upserts.push({ table, kind: "upsert", row });
    }
    for (const [k, row] of have) if (!want.has(k)) deletes.push({ table, kind: "delete", key: pick(spec, row) });
  }
  ops.push(...upserts);
  // Deletes run children first so a parent never goes while a child row points at it.
  ops.push(...deletes.reverse());
  const b = (before.talent_profiles ?? [])[0];
  const c = (current.talent_profiles ?? [])[0];
  if (b) {
    const patch: Row = {};
    for (const col of PROFILE_COLUMNS) if (!sameStable(b[col], c?.[col])) patch[col] = b[col] ?? null;
    if (Object.keys(patch).length) ops.push({ table: "talent_profiles", kind: "patch", patch });
  }
  return ops;
}

/** Tables a snapshot has data for (a restore can cover exactly these). */
export function snapshotTables(s: Partial<ContentSnapshot> | undefined): ContentTable[] {
  return CONTENT_WRITE_TABLES.filter((t) => Array.isArray(s?.[t]));
}
