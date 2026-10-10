/**
 * TUL-403: pure guards, planner, restore planner and report formatter for the
 * "assign each demo talent to its workbook theme" script. No database client
 * and no app imports beyond the demo-account marker: every read and write goes
 * through the runner (assign-demo-themes.mts), so the tests drive this with
 * plain data and nothing in here can reach production.
 *
 * "No theme" = `talent_sites.theme_design_slug IS NULL`: a demo seeded with a
 * draft site but never given a Design, so the theme gallery cannot show it.
 *
 * The talent-to-theme mapping is the committed demo-theme-map.json (derived
 * from the owner's Demo-Foundation workbook, column "Primary theme"). Only
 * FINISHED designs are assigned; a demo whose workbook theme is not finished
 * yet is listed as "queued until theme finished" and is not touched.
 */
import { isDemoAccount } from "../../src/lib/talent-site/theme-catalog/demo-account";

/** Designs the gallery ships today (FINISHED_GALLERY_SLUGS minus Maison v1, which is never assigned). */
export const FINISHED_DESIGN_SLUGS: readonly string[] = ["maison-v2", "folio", "gridline"];

/** Never a target, even if somebody adds them to the map or --only. */
export const FORBIDDEN_PROFILE_CODES: readonly string[] = [
  "TAL-93938", // Jorgelina, REAL
  "TAL-93900", // QA/test talent
  "TAL-93901",
  "TAL-93939",
];
export const FORBIDDEN_SITE_SLUGS: readonly string[] = ["book-jorgelina"];

export class RefusedError extends Error {}

// ---------------------------------------------------------------- the map

export interface ThemeMapEntry {
  demoId: string;
  profileCode: string;
  siteSlug: string | null;
  displayName: string;
  /** Workbook "Primary theme" cell, e.g. "Maison". */
  workbookTheme: string;
}

export interface ThemeMapFile {
  workbookThemeToDesign: Readonly<Record<string, string>>;
  entries: readonly ThemeMapEntry[];
}

/** Workbook theme name to design slug ("Maison" is Maison v2; v1 is never assigned). */
export function designSlugFor(workbookTheme: string, overrides: Readonly<Record<string, string>>): string {
  const exact = overrides[workbookTheme];
  if (exact) return exact;
  return workbookTheme.trim().toLowerCase().replace(/\s+/g, "-");
}

export function isFinishedDesign(slug: string): boolean {
  return FINISHED_DESIGN_SLUGS.includes(slug);
}

/** Throws on a malformed map: duplicate codes, a code outside the demo range, a forbidden code. */
export function validateMap(map: ThemeMapFile): void {
  const seen = new Set<string>();
  for (const e of map.entries) {
    if (!/^TAL-93\d{3}$/.test(e.profileCode)) throw new RefusedError(`map entry ${e.demoId}: ${e.profileCode} is outside the demo range`);
    if (FORBIDDEN_PROFILE_CODES.includes(e.profileCode)) throw new RefusedError(`map lists forbidden code ${e.profileCode}`);
    if (e.siteSlug !== null && FORBIDDEN_SITE_SLUGS.includes(e.siteSlug)) throw new RefusedError(`map lists forbidden site ${e.siteSlug}`);
    if (seen.has(e.profileCode)) throw new RefusedError(`map lists ${e.profileCode} twice`);
    seen.add(e.profileCode);
    if (!e.workbookTheme.trim()) throw new RefusedError(`map entry ${e.profileCode} has no workbook theme`);
  }
  for (const [theme, slug] of Object.entries(map.workbookThemeToDesign)) {
    if (slug === "maison") throw new RefusedError(`workbook theme ${theme} maps to Maison v1; never assigned`);
  }
}

export interface ThemeCount { workbookTheme: string; designSlug: string; finished: boolean; demos: number }

/** Counts per workbook theme, straight from the committed map (no database). */
export function themeCounts(map: ThemeMapFile): ThemeCount[] {
  const by = new Map<string, ThemeCount>();
  for (const e of map.entries) {
    const designSlug = designSlugFor(e.workbookTheme, map.workbookThemeToDesign);
    const cur = by.get(e.workbookTheme) ?? { workbookTheme: e.workbookTheme, designSlug, finished: isFinishedDesign(designSlug), demos: 0 };
    cur.demos++;
    by.set(e.workbookTheme, cur);
  }
  return [...by.values()].sort((a, b) => Number(b.finished) - Number(a.finished) || a.workbookTheme.localeCompare(b.workbookTheme));
}

// ---------------------------------------------------------------- planner

/** What the runner read for one demo-looking site. */
export interface SiteFacts {
  siteId: string;
  siteSlug: string | null;
  profileId: string;
  profileCode: string;
  displayName: string | null;
  themeDesignSlug: string | null;
  isDemo: boolean | null;
  /** Auth user email and app_metadata.demo_batch (the demo-account markers). */
  email: string | null;
  demoBatch: unknown;
  hasHomePage: boolean;
}

export type SkipReason =
  | "forbidden"
  | "not_demo"
  | "not_demo_account"
  | "unmapped"
  | "site_slug_mismatch"
  | "no_home_page"
  | "not_in_only"
  | "no_palette";

export type QueueReason = "theme_unfinished" | "design_not_released" | "needs_content_fixture";

export type Decision =
  | { action: "assign"; facts: SiteFacts; designSlug: string; palette: string; workbookTheme: string }
  | { action: "noop"; facts: SiteFacts; designSlug: string | null; workbookTheme: string | null; matchesWorkbook: boolean }
  | { action: "queue"; facts: SiteFacts; reason: QueueReason; designSlug: string; workbookTheme: string }
  | { action: "skip"; facts: SiteFacts; reason: SkipReason };

export interface PlanContext {
  map: ThemeMapFile;
  /** Codes passed to --only (empty = all). */
  only: readonly string[];
  /** Designs the demos channel can actually load (a finished theme never released cannot be applied). */
  releasedDesigns: ReadonlySet<string>;
  /** Gallery palette keys per design, in gallery order. */
  palettesFor: (designSlug: string) => readonly string[];
  /** A registered demo's own palette (registry), or null. */
  registryPaletteFor: (profileCode: string) => string | null;
  /** True when a content fixture exists for the code (Gridline needs one to fill its empty text). */
  hasContentFixture: (profileCode: string) => boolean;
}

/** Deterministic palette: the registry's own, else rotated by the demo number so --only never changes it. */
export function pickPalette(
  profileCode: string,
  palettes: readonly string[],
  registryPalette: string | null,
): string | null {
  if (palettes.length === 0) return null;
  if (registryPalette && palettes.includes(registryPalette)) return registryPalette;
  const n = Number(/(\d+)$/.exec(profileCode)?.[1] ?? 0);
  return palettes[n % palettes.length] ?? null;
}

export function isForbidden(f: Pick<SiteFacts, "profileCode" | "siteSlug">): boolean {
  return FORBIDDEN_PROFILE_CODES.includes(f.profileCode) || (f.siteSlug !== null && FORBIDDEN_SITE_SLUGS.includes(f.siteSlug));
}

export function planAssignments(facts: readonly SiteFacts[], ctx: PlanContext): Decision[] {
  const onlySet = new Set(ctx.only.map((c) => c.toUpperCase()));
  const byCode = new Map(ctx.map.entries.map((e) => [e.profileCode, e]));
  const out = facts.map((f): Decision => {
    const skip = (reason: SkipReason): Decision => ({ action: "skip", facts: f, reason });
    if (isForbidden(f)) return skip("forbidden");
    if (onlySet.size > 0 && !onlySet.has(f.profileCode.toUpperCase())) return skip("not_in_only");
    // Per row, before anything else: only a flagged demo account is ever a target.
    if (f.isDemo !== true) return skip("not_demo");
    if (!isDemoAccount(f.email, f.demoBatch)) return skip("not_demo_account");
    const entry = byCode.get(f.profileCode);
    const assigned = f.themeDesignSlug !== null && f.themeDesignSlug.trim() !== "";
    if (!entry) {
      return assigned
        ? { action: "noop", facts: f, designSlug: f.themeDesignSlug, workbookTheme: null, matchesWorkbook: false }
        : skip("unmapped");
    }
    const designSlug = designSlugFor(entry.workbookTheme, ctx.map.workbookThemeToDesign);
    if (entry.siteSlug !== null && f.siteSlug !== entry.siteSlug) return skip("site_slug_mismatch");
    if (assigned) {
      return { action: "noop", facts: f, designSlug: f.themeDesignSlug, workbookTheme: entry.workbookTheme, matchesWorkbook: f.themeDesignSlug === designSlug };
    }
    const queue = (reason: QueueReason): Decision => ({ action: "queue", facts: f, reason, designSlug, workbookTheme: entry.workbookTheme });
    if (!isFinishedDesign(designSlug)) return queue("theme_unfinished");
    if (!ctx.releasedDesigns.has(designSlug)) return queue("design_not_released");
    if (designSlug === "gridline" && !ctx.hasContentFixture(f.profileCode)) return queue("needs_content_fixture");
    if (!f.hasHomePage) return skip("no_home_page");
    const palette = pickPalette(f.profileCode, ctx.palettesFor(designSlug), ctx.registryPaletteFor(f.profileCode));
    if (!palette) return skip("no_palette");
    return { action: "assign", facts: f, designSlug, palette, workbookTheme: entry.workbookTheme };
  });
  return out.sort((a, b) => a.facts.profileCode.localeCompare(b.facts.profileCode));
}

// ---------------------------------------------------------------- arguments

export interface Options {
  apply: boolean;
  yes: boolean;
  only: string[];
  restore: string | null;
  forceRestore: boolean;
}

function splitCodes(v: string | undefined): string[] {
  return (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

export function parseArgs(argv: readonly string[]): Options {
  const flags = new Set<string>();
  const only: string[] = [];
  let restore: string | null = null;
  const setRestore = (v: string | undefined) => {
    if (!v) throw new RefusedError("--restore needs a backup file path");
    restore = v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--only") { only.push(...splitCodes(argv[++i])); continue; }
    if (a.startsWith("--only=")) { only.push(...splitCodes(a.slice("--only=".length))); continue; }
    if (a === "--restore") { setRestore(argv[++i]); continue; }
    if (a.startsWith("--restore=")) { setRestore(a.slice("--restore=".length)); continue; }
    if (!["--apply", "--yes", "--force-restore"].includes(a)) throw new RefusedError(`unknown argument ${a}`);
    flags.add(a);
  }
  const apply = flags.has("--apply");
  const yes = flags.has("--yes");
  if (yes && !apply && restore === null) throw new RefusedError("--yes without --apply does nothing; refusing");
  if (apply && !yes) throw new RefusedError("--apply needs --yes as well (dry run is the default)");
  if (restore !== null && apply) throw new RefusedError("--restore and --apply are separate modes; run one at a time");
  if (flags.has("--force-restore") && restore === null) throw new RefusedError("--force-restore only goes with --restore");
  for (const code of only) {
    if (!/^TAL-93\d{3}$/i.test(code)) throw new RefusedError(`--only ${code}: not a demo profile code (TAL-93xxx)`);
    if (FORBIDDEN_PROFILE_CODES.includes(code.toUpperCase())) throw new RefusedError(`refusing --only ${code}: never a target`);
  }
  return { apply, yes, only: only.map((c) => c.toUpperCase()), restore, forceRestore: flags.has("--force-restore") };
}

// ---------------------------------------------------------------- report

export const SKIP_TEXT: Record<SkipReason, string> = {
  forbidden: "never a target (Jorgelina / QA talent)",
  not_demo: "profile is not flagged is_demo = true; refused",
  not_demo_account: "auth user is not a demo account; refused",
  unmapped: "not in the workbook map (UNMAPPED); left alone",
  site_slug_mismatch: "site slug differs from the map; identity not confirmed, left alone",
  no_home_page: "no home page; nothing to apply a design to",
  not_in_only: "not in --only",
  no_palette: "design has no gallery palette",
};

export const QUEUE_TEXT: Record<QueueReason, string> = {
  theme_unfinished: "queued until theme finished",
  design_not_released: "queued: finished theme has no demos-channel release yet (release it in Builder Lab first)",
  needs_content_fixture: "queued: Gridline needs a content fixture for this demo, none exists",
};

const line = (f: SiteFacts) => `  ${f.profileCode}  id=${f.profileId}  site=${f.siteSlug ?? "(no slug)"}`;

export function formatPlan(decisions: readonly Decision[], ctx: { mode: "dry-run" | "apply" }): string {
  const assign = decisions.filter((d): d is Extract<Decision, { action: "assign" }> => d.action === "assign");
  const queue = decisions.filter((d): d is Extract<Decision, { action: "queue" }> => d.action === "queue");
  const noop = decisions.filter((d) => d.action === "noop");
  const skipped = decisions.filter((d): d is Extract<Decision, { action: "skip" }> => d.action === "skip" && d.reason !== "not_in_only");
  const out: string[] = [];
  out.push(`Assign demo talents to their workbook theme (${ctx.mode === "dry-run" ? "DRY RUN, nothing is written" : "APPLY"})`);
  out.push(`Would assign ${assign.length} site(s) (draft only, nothing is published):`);
  for (const d of assign) out.push(`${line(d.facts)}  ${d.workbookTheme} -> ${d.designSlug} (palette ${d.palette})`);
  if (assign.length === 0) out.push("  (none)");

  const byTheme = new Map<string, Array<Extract<Decision, { action: "queue" }>>>();
  for (const d of queue) byTheme.set(d.workbookTheme, [...(byTheme.get(d.workbookTheme) ?? []), d]);
  out.push(`Queued, NOT touched: ${queue.length} site(s) in ${byTheme.size} theme(s):`);
  for (const [theme, list] of [...byTheme.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    out.push(`  ${theme} (${list[0]!.designSlug}): ${list.length}  ${QUEUE_TEXT[list[0]!.reason]}${list.some((d) => d.reason !== list[0]!.reason) ? " (mixed reasons)" : ""}`);
  }
  if (queue.length === 0) out.push("  (none)");

  out.push(`Skipped ${skipped.length} site(s), each with a reason:`);
  for (const d of skipped) out.push(`${line(d.facts)}  -> ${SKIP_TEXT[d.reason]}`);
  if (skipped.length === 0) out.push("  (none)");
  const drift = noop.filter((d) => d.action === "noop" && d.workbookTheme !== null && !d.matchesWorkbook);
  out.push(`Already have a theme (no-op): ${noop.length}${drift.length ? `; ${drift.length} differ from the workbook theme (left as is)` : ""}`);
  out.push(`Needs publish after apply (the PM publishes by wave; this script never does): ${assign.length}`);
  return out.join("\n");
}

// ---------------------------------------------------------------- backup / restore

export interface BackupRow {
  profileCode: string;
  profileId: string;
  siteId: string;
  siteSlug: string | null;
  /** Columns the apply path writes, as read before the first write. */
  site: Record<string, unknown>;
  homePage: { id: string; blocks: unknown } | null;
  /** Filled after a successful apply. */
  after?: { draftRev: number | null; designSlug: string; designVersion: number | null };
}

export interface BackupFile { version: 1; createdAt: string; rows: BackupRow[] }

export type RestoreDecision =
  | { action: "restore"; row: BackupRow }
  | { action: "skip"; row: BackupRow; reason: string };

export interface CurrentSite { draftRev: number | null; isDemo: boolean | null }

/** Columns that must not be written back (the revision counter only moves forward). */
export const RESTORE_OMIT_COLUMNS: readonly string[] = ["draft_rev"];

/** Pure: which backed-up rows are safe to restore given the CURRENT state per site id. */
export function planRestore(backup: BackupFile, current: ReadonlyMap<string, CurrentSite>, force: boolean): RestoreDecision[] {
  return backup.rows.map((row): RestoreDecision => {
    if (FORBIDDEN_PROFILE_CODES.includes(row.profileCode) || (row.siteSlug !== null && FORBIDDEN_SITE_SLUGS.includes(row.siteSlug))) {
      return { action: "skip", row, reason: "forbidden target" };
    }
    const cur = current.get(row.siteId);
    if (!cur) return { action: "skip", row, reason: "site no longer exists" };
    if (cur.isDemo !== true) return { action: "skip", row, reason: "profile is not flagged is_demo = true; refused" };
    if (!row.after) return { action: "skip", row, reason: "apply never completed for this row; nothing to undo" };
    if (!force && cur.draftRev !== row.after.draftRev) {
      return { action: "skip", row, reason: "draft changed since the assignment (draft_rev moved); use --force-restore to override" };
    }
    return { action: "restore", row };
  });
}

/** The site columns to write back for one backed-up row. */
export function restorePatch(row: BackupRow): Record<string, unknown> {
  const patch: Record<string, unknown> = { ...row.site };
  for (const c of RESTORE_OMIT_COLUMNS) delete patch[c];
  return patch;
}

export function formatRestore(decisions: readonly RestoreDecision[]): string {
  return decisions
    .map((d) => `${d.action === "restore" ? "RESTORE" : "SKIP   "} ${d.row.profileCode} id=${d.row.profileId} site=${d.row.siteSlug ?? "(no slug)"}${d.action === "skip" ? `  (${d.reason})` : ""}`)
    .join("\n");
}
