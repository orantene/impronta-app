import "server-only";

/**
 * THEME RELEASES (Phase 3): "Generate items". Fills a release's EMPTY `items`
 * (diff of the from and to version snapshots) and empty `base_payload` from
 * `talent_theme_versions`, and clears the dry-run report (its items hash no
 * longer matches, so channel changes need a new run). Never overwrites items
 * an admin already has.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DesignPayload } from "@/lib/talent-site/theme-catalog/types";
import { diffDesignPayloads } from "../diff-payload";
import { loadThemeVersionPayload } from "../theme-versions.server";
import type { ReleaseItem, ThemeRelease } from "../types";

export interface GeneratePlan {
  items: ReleaseItem[] | null;
  basePayload: DesignPayload | null;
}

/** Pure: what would be filled (null = leave as is). */
export function planGenerate(
  release: Pick<ThemeRelease, "design_slug" | "from_version" | "to_version" | "items" | "base_payload">,
  from: DesignPayload,
  to: DesignPayload,
): GeneratePlan {
  const emptyItems = (release.items ?? []).length === 0;
  return {
    items: emptyItems
      ? diffDesignPayloads(
          release.design_slug,
          { payload: from, version: release.from_version },
          { payload: to, version: release.to_version },
        )
      : null,
    basePayload: release.base_payload == null ? from : null,
  };
}

export async function generateReleaseItems(
  admin: SupabaseClient,
  release: ThemeRelease,
): Promise<{ ok: true; items: number; filledBase: boolean } | { ok: false; error: string }> {
  const [from, to] = await Promise.all([
    loadThemeVersionPayload(admin, release.design_slug, release.from_version),
    loadThemeVersionPayload(admin, release.design_slug, release.to_version),
  ]);
  if (!from || !to) {
    return { ok: false, error: `No saved snapshot for v${!from ? release.from_version : release.to_version}.` };
  }
  const plan = planGenerate(release, from, to);
  if (!plan.items && !plan.basePayload) return { ok: false, error: "Items and base are already filled." };
  const { error } = await admin
    .from("talent_theme_releases")
    .update({
      ...(plan.items ? { items: plan.items, critical: false } : {}),
      ...(plan.basePayload ? { base_payload: plan.basePayload } : {}),
      dry_run_report: null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", release.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, items: plan.items?.length ?? 0, filledBase: plan.basePayload !== null };
}
