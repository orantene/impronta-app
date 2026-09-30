import "server-only";

/**
 * THEME RELEASES: the Design a release targets, and the catalog flip.
 *
 * A gated sync leaves `talent_theme_catalog` at the old version while the
 * release's payload sits in `talent_theme_versions`. Everything that works
 * FOR the release (dry run, demo apply, a talent's preview / apply / add
 * block) reads the target Design from the snapshot through
 * `loadReleaseDesign`; new applies keep reading the catalog until the release
 * reaches `default`, when `flipCatalogToRelease` moves the row.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { loadMaisonCatalogRow } from "@/lib/talent-site/server/maison-catalog-row";
import { TALENT_THEME_SCHEMA_VERSION, type DesignPayload, type TalentThemeDesignRow } from "../theme-catalog/types";
import { validateDesign } from "../theme-catalog/validate";
import type { ThemeRelease } from "./types";
import { loadThemeVersionPayload } from "./theme-versions.server";

type ReleaseRef = Pick<ThemeRelease, "design_slug" | "to_version">;

/** PURE: the catalog row viewed at the release's to-version. */
export function pickReleaseDesign(
  row: TalentThemeDesignRow,
  snapshot: DesignPayload | null,
  toVersion: number,
): TalentThemeDesignRow | null {
  if (row.version === toVersion) return row;
  if (row.version > toVersion || !snapshot) return null;
  return { ...row, version: toVersion, payload: snapshot };
}

/**
 * PURE "Make default" rule. Releases apply in order and each snapshot is the
 * FULL payload at its version, so flipping to N carries every earlier release
 * with it (skipping 15 to reach 16 loses nothing). The catalog never moves
 * backward: Make default on a release whose to-version is BELOW the catalog
 * is refused (it is superseded), equal is an idempotent no-op.
 */
export function checkCatalogFlip(
  catalogVersion: number,
  toVersion: number,
): { ok: true; flip: boolean } | { ok: false; error: string } {
  if (catalogVersion === toVersion) return { ok: true, flip: false };
  if (catalogVersion > toVersion) {
    return {
      ok: false,
      error: `The catalog is already at v${catalogVersion}; making v${toVersion} the default would move it backward. This release is superseded.`,
    };
  }
  return { ok: true, flip: true };
}

export async function loadReleaseDesign(
  admin: SupabaseClient,
  release: ReleaseRef,
): Promise<TalentThemeDesignRow | null> {
  const row = await loadMaisonCatalogRow(admin, "design", release.design_slug);
  if (!row) return null;
  if (row.version === release.to_version) return row;
  const snapshot = await loadThemeVersionPayload(admin, release.design_slug, release.to_version);
  return pickReleaseDesign(row, snapshot, release.to_version);
}

/**
 * "Make default": move the catalog row to the release's version from the
 * snapshot. Idempotent (a row already at or past the version is left alone),
 * validates the payload first, and updates only when the row is still at the
 * version we read (no clobbering a concurrent flip).
 */
export async function flipCatalogToRelease(
  admin: SupabaseClient,
  release: ReleaseRef,
): Promise<{ ok: true; flipped: boolean } | { ok: false; error: string }> {
  const row = await loadMaisonCatalogRow(admin, "design", release.design_slug);
  if (!row) return { ok: false, error: "Design not found in the catalog." };
  const rule = checkCatalogFlip(row.version, release.to_version);
  if (!rule.ok) return rule;
  if (!rule.flip) return { ok: true, flipped: false };
  const payload = await loadThemeVersionPayload(admin, release.design_slug, release.to_version);
  if (!payload) return { ok: false, error: `No snapshot for v${release.to_version}; run the catalog sync first.` };
  const check = validateDesign(payload);
  if (!check.ok) return { ok: false, error: `v${release.to_version} payload is invalid: ${check.errors.slice(0, 2).join("; ")}` };
  const { data, error } = await admin
    .from("talent_theme_catalog")
    .update({
      payload,
      version: release.to_version,
      schema_version: TALENT_THEME_SCHEMA_VERSION,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("kind", "design")
    .eq("slug", release.design_slug)
    .eq("version", row.version)
    .select("id");
  if (error) {
    logServerError("themeReleases.flipCatalog", error);
    return { ok: false, error: error.message };
  }
  return { ok: true, flipped: (data ?? []).length > 0 };
}
