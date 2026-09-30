import "server-only";

/**
 * THEME RELEASES (Phase 3): build the three merge sides for ONE site and run
 * `mergeDesignUpdate` in memory (dry run) or write the result (demos only).
 *
 *   base   the Design at the SITE'S pinned version: its `talent_theme_versions`
 *          snapshot (or the release's saved from_version payload when the site
 *          sits on from_version), built with the talent's own content. No exact
 *          base = `noBase` (unknownBase: stamps read edited, only new blocks are
 *          offered; the merge never guesses)
 *   ours   the site draft (shell_tree + home page blocks + design_tokens_draft),
 *          stamped from base first when it predates origin stamps
 *   theirs the current catalog Design (= to_version) built the same way
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { loadTemplateHydrationTokens } from "@/lib/talent-site/server/apply-template-core";
import {
  buildDesignTrees,
  coerceTokenMap,
  fallbackHydrationTokens,
} from "@/lib/talent-site/server/theme-apply-core";
import type { DesignPayload, TalentThemeDesignRow } from "@/lib/talent-site/theme-catalog/types";
import type { BaseResolver } from "./base-resolver.server";
import { writeThemeTokenOrigin } from "../token-origin-store";
import { indexTree } from "../classify";
import { mergeDesignUpdate } from "../merge";
import { stampFromBase } from "../stamp-existing";
import { tokenOriginMap } from "../origin";
import type { MergeResult, ReleaseItem, ThemeRelease } from "../types";

export interface SiteRef {
  siteId: string;
  talentProfileId: string;
  userId: string;
  profileCode: string;
  displayName: string;
  locale: string | null;
  pinnedVersion: number | null;
  isDemo: boolean;
  /** talent_sites.site_published_at is set. */
  published: boolean;
}

export type SiteMergeOutcome =
  | { ok: true; result: MergeResult; noBase: boolean; homePageId: string | null }
  | { ok: false; error: string };

const asTree = (v: unknown): BuilderNode[] => (Array.isArray(v) ? (v as BuilderNode[]) : []);

/** Stamp a tree that has no design keys at all (built before origin stamps). */
function ensureStamped(
  tree: BuilderNode[],
  baseTree: BuilderNode[],
  hasBase: boolean,
): BuilderNode[] {
  if (tree.length === 0 || indexTree(tree).byKey.size > 0) return tree;
  return stampFromBase(tree, baseTree, { unknownBase: !hasBase }).tree;
}

export async function mergeSite(
  admin: SupabaseClient,
  release: Pick<ThemeRelease, "design_slug" | "from_version" | "to_version" | "base_payload">,
  design: TalentThemeDesignRow,
  site: SiteRef,
  items: ReadonlyArray<ReleaseItem> | undefined,
  resolveBase: BaseResolver,
): Promise<SiteMergeOutcome> {
  if (design.version !== release.to_version) {
    return { ok: false, error: `Catalog is at v${design.version}, release targets v${release.to_version}.` };
  }
  const { data: row, error } = await admin
    .from("talent_sites")
    .select("shell_tree, design_tokens_draft, theme_token_origin")
    .eq("id", site.siteId)
    .maybeSingle();
  if (error || !row) return { ok: false, error: error?.message ?? "Site not found." };
  const { data: home, error: hErr } = await admin
    .from("talent_pages")
    .select("id, blocks")
    .eq("talent_profile_id", site.talentProfileId)
    .eq("is_home", true)
    .maybeSingle();
  if (hErr) return { ok: false, error: hErr.message };

  const tokens =
    (await loadTemplateHydrationTokens(site.talentProfileId)) ?? fallbackHydrationTokens(site.displayName);
  const theirs = buildDesignTrees(design.payload, tokens, undefined, {
    design: design.slug,
    version: release.to_version,
  });
  if (!theirs.ok) return { ok: false, error: `Target build failed: ${theirs.errors.slice(0, 2).join("; ")}` };

  const basePayload = await resolveBase(site.pinnedVersion);
  const baseBuilt = basePayload
    ? buildDesignTrees(basePayload, tokens, undefined, { design: design.slug, version: site.pinnedVersion as number })
    : null;
  if (baseBuilt && !baseBuilt.ok) {
    return { ok: false, error: `Base build failed: ${baseBuilt.errors.slice(0, 2).join("; ")}` };
  }
  const base = baseBuilt?.ok ? baseBuilt : null;
  const hasBase = base !== null;
  const stampAgainst = base ?? theirs;

  const oursShell = ensureStamped(asTree(row.shell_tree), stampAgainst.shellTree, hasBase);
  const oursHome = ensureStamped(asTree(home?.blocks), stampAgainst.homeTree, hasBase);

  const result = mergeDesignUpdate({
    base: {
      trees: { shell: base?.shellTree ?? [], home: base?.homeTree ?? [] },
      tokens: basePayload?.tokenDefaults ?? {},
    },
    ours: {
      trees: { shell: oursShell, home: oursHome },
      tokens: coerceTokenMap(row.design_tokens_draft),
    },
    theirs: {
      trees: { shell: theirs.shellTree, home: theirs.homeTree },
      tokens: design.payload.tokenDefaults ?? {},
    },
    ...(items && items.length > 0 ? { items } : {}),
    ...(row.theme_token_origin && typeof row.theme_token_origin === "object"
      ? { tokenOrigin: row.theme_token_origin as Record<string, string> }
      : {}),
  });
  return { ok: true, result, noBase: !hasBase, homePageId: (home?.id as string | undefined) ?? null };
}

/**
 * Write a merge result to a site DRAFT and pin it to the release version.
 * Callers must only pass verified demo accounts (Phase 4 owns talent applies).
 */
export async function writeMergedDraft(
  admin: SupabaseClient,
  site: SiteRef,
  homePageId: string | null,
  result: MergeResult,
  design: TalentThemeDesignRow,
  toVersion: number,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await admin
    .from("talent_sites")
    .update({
      shell_tree: result.trees.shell ?? [],
      design_tokens_draft: result.tokens,
      theme_design_version: toVersion,
      draft_updated_at: now,
      updated_at: now,
    })
    .eq("id", site.siteId)
    .eq("talent_profile_id", site.talentProfileId);
  if (error) throw new Error(`${site.profileCode}: ${error.message}`);
  if (homePageId) {
    const { error: pErr } = await admin
      .from("talent_pages")
      .update({ blocks: result.trees.home ?? [], updated_at: now })
      .eq("id", homePageId)
      .eq("talent_profile_id", site.talentProfileId);
    if (pErr) throw new Error(`${site.profileCode}: ${pErr.message}`);
  }
  // Keys the merge took from the new defaults now hash to the new default.
  const fresh = tokenOriginMap(design.payload.tokenDefaults);
  const origin: Record<string, string> = {};
  for (const [k, v] of Object.entries(result.tokens)) {
    const h = fresh[k];
    if (h !== undefined && tokenOriginMap({ [k]: v })[k] === h) origin[k] = h;
  }
  await writeThemeTokenOrigin(admin, site.siteId, origin);
}
