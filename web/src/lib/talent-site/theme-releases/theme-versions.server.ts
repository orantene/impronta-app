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
}

/** Insert snapshots; an existing (design, version) row is never overwritten. */
export async function writeThemeVersionSnapshots(
  admin: SupabaseClient,
  rows: ReadonlyArray<ThemeVersionSnapshot>,
): Promise<{ ok: boolean; skipped?: "missing_table" }> {
  if (rows.length === 0) return { ok: true };
  const { error } = await admin
    .from("talent_theme_versions")
    .upsert(
      rows.map((r) => ({ design: r.design, version: r.version, payload: r.payload, source: r.source ?? null })),
      { onConflict: "design,version", ignoreDuplicates: true },
    );
  if (!error) return { ok: true };
  if (error.code && MISSING_TABLE.has(error.code)) return { ok: true, skipped: "missing_table" };
  logServerError("themeReleases.versions.write", error);
  return { ok: false };
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
