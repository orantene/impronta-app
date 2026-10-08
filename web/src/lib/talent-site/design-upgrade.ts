/**
 * DESIGN RELEASE UPGRADE (ticket "Design releases don't reach existing sites").
 *
 * Pure. Given ONE site's rows and the latest RELEASED version of its design,
 * return the upgraded shell / home / tokens / pinned version. It is a thin,
 * deterministic wrapper over the three-way merge the opt-in "What's new" flow
 * already uses (`mergeDesignUpdate`), so "design default vs talent edit" is
 * decided by exactly one definition:
 *
 *   node props   `props.__origin.fp` (hash of the design-owned props as seeded)
 *                vs the node's current design-owned props. Different = the
 *                talent edited it: kept. Same = still the design's: replaced.
 *                Content-owned props (`{{token}}` leaves, `i18n`) never move.
 *   tokens       the value equals the OLD release default, or hashes to
 *                `talent_sites.theme_token_origin[key]` = design default:
 *                replaced. Anything else is hers: kept.
 *   sections     a design key missing from her tree stays removed (reason
 *                "removed"); a node with no design key is hers (talent-added)
 *                and is never touched; keys new in the release are inserted.
 *
 * `theme_version` is NOT the design version. It is the publish CAS counter
 * (`publishSiteTheme`); the pinned design version is `theme_design_version`.
 *
 * Idempotent: a site already at (or past) the target returns unchanged, and
 * merging the output again changes nothing.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { designPaletteTokens, paletteKeyForLook } from "@/lib/talent-site/theme-catalog/design-palettes";
import type { DesignPayload } from "@/lib/talent-site/theme-catalog/types";
import type { TalentProfileTokens } from "@/lib/talent-site/default-talent-tree";
import { buildDesignTrees, coerceTokenMap } from "@/lib/talent-site/server/theme-apply-core";
import { indexTree } from "./theme-releases/classify";
import { mergeDesignUpdate } from "./theme-releases/merge";
import { stampFromBase } from "./theme-releases/stamp-existing";
import { nextTokenOrigin } from "./theme-releases/talent-update/view";
import type { DesignMergeReport, MergeEntry } from "./theme-releases/types";

export interface UpgradeSiteInput {
  /** `talent_sites.theme_design_slug` */
  designSlug: string;
  /** `talent_sites.theme_design_version` (null = never pinned). */
  pinnedVersion: number | null;
  /** `talent_sites.shell_tree` (the draft shell). */
  shellTree: unknown;
  /** Home page `talent_pages.blocks` (the draft). */
  homeBlocks: unknown;
  /** `talent_sites.design_tokens_draft` */
  designTokensDraft: unknown;
  /** `talent_sites.theme_token_origin` */
  themeTokenOrigin: unknown;
  /** `talent_sites.theme_look_slug` */
  themeLookSlug: string | null;
  isDemo?: boolean;
}

export interface UpgradeTarget {
  version: number;
  payload: DesignPayload;
}

export interface UpgradeInput {
  site: UpgradeSiteInput;
  /** The latest RELEASED version of the design (never a draft/demo version). */
  target: UpgradeTarget;
  /** The design as the site's pinned version had it. null = unknown base. */
  basePayload: DesignPayload | null;
  /** The talent's own content tokens (profile name, photos, services...). */
  hydration: TalentProfileTokens;
}

export interface KeptEdit {
  kind: "token" | "node" | "removed-section" | "order";
  key: string;
  prop?: string;
}

export interface UpgradeSummary {
  tokensChanged: number;
  /** Sections whose design props changed, plus inserted and removed ones. */
  sectionsChanged: number;
  sectionsAdded: number;
  sectionsRemoved: number;
  keptEdits: KeptEdit[];
  conflicts: number;
}

export type UpgradeResult =
  | { ok: true; upToDate: true; fromVersion: number | null; toVersion: number }
  | {
      ok: true;
      upToDate: false;
      fromVersion: number | null;
      toVersion: number;
      /** No exact base: only new sections are offered, nothing else moves. */
      noBase: boolean;
      /** The value for `talent_sites.theme_design_version`. */
      themeDesignVersion: number;
      shell: BuilderNode[];
      home: BuilderNode[];
      tokens: Record<string, string>;
      tokenOrigin: Record<string, string>;
      report: DesignMergeReport;
      summary: UpgradeSummary;
    }
  | { ok: false; error: string };

const asTree = (v: unknown): BuilderNode[] => (Array.isArray(v) ? (v as BuilderNode[]) : []);

function ensureStamped(tree: BuilderNode[], baseTree: BuilderNode[], hasBase: boolean): BuilderNode[] {
  if (tree.length === 0 || indexTree(tree).byKey.size > 0) return tree;
  return stampFromBase(tree, baseTree, { unknownBase: !hasBase }).tree;
}

const keptKind = (e: MergeEntry): KeptEdit["kind"] =>
  e.change === "token" ? "token" : e.reason === "removed" ? "removed-section" : e.reason === "your_order" ? "order" : "node";

export function summarizeUpgrade(report: DesignMergeReport): UpgradeSummary {
  const nodeApplied = report.applied.filter((e) => e.change !== "token" && e.change !== "restamp");
  return {
    tokensChanged: report.applied.filter((e) => e.change === "token").length,
    sectionsChanged: nodeApplied.length + report.added.length + report.removed.length,
    sectionsAdded: report.added.length,
    sectionsRemoved: report.removed.length,
    keptEdits: report.kept.map((e) => ({ kind: keptKind(e), key: e.key, ...(e.prop ? { prop: e.prop } : {}) })),
    conflicts: report.conflicts.length,
  };
}

export function upgradeSiteDesign(input: UpgradeInput): UpgradeResult {
  const { site, target, basePayload, hydration } = input;
  const pinned = site.pinnedVersion;
  if (pinned !== null && pinned >= target.version) {
    return { ok: true, upToDate: true, fromVersion: pinned, toVersion: target.version };
  }
  const stampOf = (v: number | null) => ({ design: site.designSlug, version: v as number });
  const theirs = buildDesignTrees(target.payload, hydration, undefined, stampOf(target.version));
  if (!theirs.ok) return { ok: false, error: `Target build failed: ${theirs.errors.slice(0, 2).join("; ")}` };
  const baseBuilt = basePayload ? buildDesignTrees(basePayload, hydration, undefined, stampOf(pinned)) : null;
  if (baseBuilt && !baseBuilt.ok) return { ok: false, error: `Base build failed: ${baseBuilt.errors.slice(0, 2).join("; ")}` };
  const base = baseBuilt?.ok ? baseBuilt : null;
  const hasBase = base !== null;
  const stampAgainst = base ?? theirs;

  const oursShell = ensureStamped(asTree(site.shellTree), stampAgainst.shellTree, hasBase);
  const oursHome = ensureStamped(asTree(site.homeBlocks), stampAgainst.homeTree, hasBase);
  const oursTokens = coerceTokenMap(site.designTokensDraft);
  const origin =
    site.themeTokenOrigin && typeof site.themeTokenOrigin === "object" && !Array.isArray(site.themeTokenOrigin)
      ? (site.themeTokenOrigin as Record<string, string>)
      : undefined;

  const paletteKey = paletteKeyForLook(site.designSlug, site.themeLookSlug);
  const paletteBase = paletteKey ? designPaletteTokens(site.designSlug, paletteKey, basePayload?.palettes) : null;
  const paletteTheirs = paletteKey ? designPaletteTokens(site.designSlug, paletteKey, target.payload.palettes) : null;

  const result = mergeDesignUpdate({
    base: {
      trees: { shell: base?.shellTree ?? [], home: base?.homeTree ?? [] },
      tokens: basePayload?.tokenDefaults ?? {},
    },
    ours: { trees: { shell: oursShell, home: oursHome }, tokens: oursTokens },
    theirs: {
      trees: { shell: theirs.shellTree, home: theirs.homeTree },
      tokens: target.payload.tokenDefaults ?? {},
    },
    // Demo content is ours; talents never get forceDesign.
    ...(site.isDemo ? { forceDesign: true } : {}),
    ...(origin ? { tokenOrigin: origin } : {}),
    ...(paletteKey && paletteBase && paletteTheirs
      ? { palette: { key: paletteKey, base: paletteBase, theirs: paletteTheirs } }
      : {}),
  });

  return {
    ok: true,
    upToDate: false,
    fromVersion: pinned,
    toVersion: target.version,
    noBase: !hasBase,
    themeDesignVersion: target.version,
    shell: result.trees.shell ?? [],
    home: result.trees.home ?? [],
    tokens: result.tokens,
    // Same bookkeeping the app's own apply uses (talent-update/view.ts).
    tokenOrigin: nextTokenOrigin(origin, result.report),
    report: result.report,
    summary: summarizeUpgrade(result.report),
  };
}
