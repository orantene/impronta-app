import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import type { DesignPayload } from "../theme-catalog/types";

/**
 * THEME RELEASES: immutable payload snapshots per Design version
 * (`talent_theme_versions`, migration 20261231299570). The catalog keeps only
 * the current payload; these rows give the merge engine and the stamp backfill
 * an EXACT base for a site pinned to an older version. Missing-table tolerant.
 */
const MISSING_TABLE = new Set(["42P01", "PGRST205"]);

export interface ThemeVersionSnapshot {
  design: string;
  version: number;
  payload: DesignPayload;
  source?: string | null;
  /** Optional; only sent when set, so callers work before the `meta` column exists. */
  meta?: Record<string, unknown> | null;
  created_by?: string | null;
}

export interface WriteSnapshotOptions {
  /**
   * Plain insert instead of upsert-ignore: a (design, version) that already
   * exists returns `{ ok: false, code: "conflict" }` instead of a silent ok.
   */
  failOnConflict?: boolean;
}

export type WriteSnapshotResult =
  | { ok: true; skipped?: "missing_table" }
  | { ok: false; code?: "conflict" };

function snapshotRow(r: ThemeVersionSnapshot): Record<string, unknown> {
  return {
    design: r.design,
    version: r.version,
    payload: r.payload,
    source: r.source ?? null,
    ...(r.meta !== undefined ? { meta: r.meta } : {}),
    ...(r.created_by !== undefined ? { created_by: r.created_by } : {}),
  };
}

/** Insert snapshots; an existing (design, version) row is never overwritten. */
export async function writeThemeVersionSnapshots(
  admin: SupabaseClient,
  rows: ReadonlyArray<ThemeVersionSnapshot>,
  options: WriteSnapshotOptions = {},
): Promise<WriteSnapshotResult> {
  if (rows.length === 0) return { ok: true };
  const table = admin.from("talent_theme_versions");
  const { error } = options.failOnConflict
    ? await table.insert(rows.map(snapshotRow) as never)
    : await table.upsert(rows.map(snapshotRow) as never, { onConflict: "design,version", ignoreDuplicates: true });
  if (!error) return { ok: true };
  if (options.failOnConflict && error.code === "23505") return { ok: false, code: "conflict" };
  if (error.code && MISSING_TABLE.has(error.code)) return { ok: true, skipped: "missing_table" };
  logServerError("themeReleases.versions.write", error);
  return { ok: false };
}

/**
 * `source` of the snapshot at (design, version). `snapshot: null` when none
 * exists (or the table is missing); a read error is `ok: false` so a gate
 * built on it can fail closed.
 */
export async function loadThemeVersionSource(
  admin: SupabaseClient,
  design: string,
  version: number,
): Promise<{ ok: true; snapshot: { version: number; source: string | null } | null } | { ok: false; error: string }> {
  const { data, error } = await admin
    .from("talent_theme_versions")
    .select("source")
    .eq("design", design)
    .eq("version", version)
    .maybeSingle();
  if (error) {
    if (error.code && MISSING_TABLE.has(error.code)) return { ok: true, snapshot: null };
    logServerError("themeReleases.versions.readSource", error);
    return { ok: false, error: "Could not read the version snapshot. Try again." };
  }
  if (!data) return { ok: true, snapshot: null };
  return { ok: true, snapshot: { version, source: (data as { source?: string | null }).source ?? null } };
}

/** The payload a Design had at `version`, or null when no snapshot exists. */
export async function loadThemeVersionPayload(
  admin: SupabaseClient,
  design: string,
  version: number,
): Promise<DesignPayload | null> {
  const { data, error } = await admin
    .from("talent_theme_versions")
    .select("payload")
    .eq("design", design)
    .eq("version", version)
    .maybeSingle();
  if (error) {
    if (!(error.code && MISSING_TABLE.has(error.code))) logServerError("themeReleases.versions.read", error);
    return null;
  }
  return (data as { payload?: DesignPayload } | null)?.payload ?? null;
}
