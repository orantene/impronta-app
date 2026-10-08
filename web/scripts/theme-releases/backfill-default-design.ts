/**
 * TUL-376: pure guards, planner, restore planner and report formatter for the
 * "backfill a default design" script. No database client and no app imports:
 * every read and write goes through the injected `Io` in the runner, so the
 * tests drive it with plain data and nothing in here can reach production.
 *
 * "Null design" = `talent_sites.theme_design_slug IS NULL`: the site was
 * provisioned (starter home page + default shell) but no Design was ever
 * applied, so the publish gate (`maisonDesignBlocker`) refuses it with
 * "Apply a design before publishing" (TUL-89).
 *
 * A site is TOUCHED only when it is still an untouched starter:
 *   - design is null,
 *   - never published (`site_published_at` null) and no page has a live body,
 *   - no talent edit in its history (`talent_site_history.kind = 'edit'`),
 *   - not a demo or test account (unless --include-test),
 *   - not TAL-93938 / book-jorgelina, ever.
 * Everything else is listed with its reason, so the card's "0 rows or each
 * deliberately excluded with a reason" can be answered from the report.
 */

export const FORBIDDEN_PROFILE_CODES: readonly string[] = ["TAL-93938"];
export const FORBIDDEN_SITE_SLUGS: readonly string[] = ["book-jorgelina"];
/** Known QA site, reported and skipped unless --include-test. */
export const KNOWN_TEST_PROFILE_CODES: readonly string[] = ["TAL-93900"];

export class RefusedError extends Error {}

export interface SiteCandidate {
  siteId: string;
  siteSlug: string | null;
  profileId: string;
  profileCode: string;
  displayName: string | null;
  themeDesignSlug: string | null;
  sitePublishedAt: string | null;
  /** Any talent_pages row with a non-empty live body (`blocks_published`) or status published. */
  hasLivePages: boolean;
  /** Any talent_site_history row of kind 'edit'. */
  hasTalentEdits: boolean;
  isDemo: boolean | null;
  isTestAccount: boolean | null;
}

export type SkipReason =
  | "forbidden"
  | "already_has_design"
  | "published_site"
  | "live_pages"
  | "talent_edited_draft"
  | "demo_or_test"
  | "not_in_only";

export interface PlanEntry {
  candidate: SiteCandidate;
  action: "touch" | "skip";
  reason?: SkipReason;
}

export interface Options {
  apply: boolean;
  yes: boolean;
  only: string[];
  includeTest: boolean;
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
    if (!["--apply", "--yes", "--include-test", "--force-restore"].includes(a)) throw new RefusedError(`unknown argument ${a}`);
    flags.add(a);
  }
  const apply = flags.has("--apply");
  const yes = flags.has("--yes");
  if (yes && !apply && restore === null) throw new RefusedError("--yes without --apply does nothing; refusing");
  if (apply && !yes) throw new RefusedError("--apply needs --yes as well (dry run is the default)");
  if (restore !== null && apply) throw new RefusedError("--restore and --apply are separate modes; run one at a time");
  if (flags.has("--force-restore") && restore === null) throw new RefusedError("--force-restore only goes with --restore");
  for (const code of only) {
    if (FORBIDDEN_PROFILE_CODES.includes(code.toUpperCase())) throw new RefusedError(`refusing --only ${code}: never a target`);
  }
  return { apply, yes, only, includeTest: flags.has("--include-test"), restore, forceRestore: flags.has("--force-restore") };
}

export function isForbidden(c: Pick<SiteCandidate, "profileCode" | "siteSlug">): boolean {
  return FORBIDDEN_PROFILE_CODES.includes(c.profileCode) || (c.siteSlug !== null && FORBIDDEN_SITE_SLUGS.includes(c.siteSlug));
}

export function isDemoOrTest(c: SiteCandidate): boolean {
  return c.isDemo === true || c.isTestAccount === true || KNOWN_TEST_PROFILE_CODES.includes(c.profileCode);
}

export function planBackfill(candidates: readonly SiteCandidate[], opts: Pick<Options, "only" | "includeTest">): PlanEntry[] {
  const only = new Set(opts.only.map((c) => c.toUpperCase()));
  const entries = candidates.map((c): PlanEntry => {
    const skip = (reason: SkipReason): PlanEntry => ({ candidate: c, action: "skip", reason });
    if (isForbidden(c)) return skip("forbidden");
    if (only.size > 0 && !only.has(c.profileCode.toUpperCase())) return skip("not_in_only");
    if (c.themeDesignSlug && c.themeDesignSlug.trim()) return skip("already_has_design");
    if (isDemoOrTest(c) && !opts.includeTest) return skip("demo_or_test");
    if (c.sitePublishedAt) return skip("published_site");
    if (c.hasLivePages) return skip("live_pages");
    if (c.hasTalentEdits) return skip("talent_edited_draft");
    return { candidate: c, action: "touch" };
  });
  return entries.sort((a, b) => a.candidate.profileCode.localeCompare(b.candidate.profileCode));
}

export const REASON_TEXT: Record<SkipReason, string> = {
  forbidden: "never a target (TAL-93938 / book-jorgelina)",
  already_has_design: "already has a design (no-op)",
  published_site: "site is published; a design swap would change the live site, needs a human",
  live_pages: "has a live page body of its own; left alone",
  talent_edited_draft: "talent edited the draft; applying would overwrite their work",
  demo_or_test: "demo or test account (use --include-test to include)",
  not_in_only: "not in --only",
};

export function formatPlan(entries: readonly PlanEntry[], ctx: { designSlug: string; mode: "dry-run" | "apply" }): string {
  const touch = entries.filter((e) => e.action === "touch");
  const skipped = entries.filter((e) => e.action === "skip" && e.reason !== "not_in_only" && e.reason !== "already_has_design");
  const line = (e: PlanEntry) =>
    `  ${e.candidate.profileCode}  id=${e.candidate.profileId}  site=${e.candidate.siteSlug ?? "(no slug)"}`;
  const out: string[] = [];
  out.push(`Backfill default design "${ctx.designSlug}" (${ctx.mode === "dry-run" ? "DRY RUN, nothing is written" : "APPLY"})`);
  out.push(`Would touch ${touch.length} site(s) (draft only, nothing is published):`);
  for (const e of touch) out.push(line(e));
  if (touch.length === 0) out.push("  (none)");
  out.push(`Excluded ${skipped.length} null-design site(s), each with a reason:`);
  for (const e of skipped) out.push(`${line(e)}  -> ${REASON_TEXT[e.reason!]}`);
  if (skipped.length === 0) out.push("  (none)");
  out.push(`Needs publish after apply (talent or PM publishes; this script never does): ${touch.length}`);
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
  after?: { draftRev: number | null; designSlug: string; designVersion: number };
}

export interface BackupFile { version: 1; createdAt: string; designSlug: string; rows: BackupRow[] }

export type RestoreDecision =
  | { action: "restore"; row: BackupRow }
  | { action: "skip"; row: BackupRow; reason: string };

/** Pure: which backed-up rows are safe to restore given the CURRENT draft_rev per site id. */
export function planRestore(backup: BackupFile, currentDraftRev: ReadonlyMap<string, number | null>, force: boolean): RestoreDecision[] {
  return backup.rows.map((row): RestoreDecision => {
    if (FORBIDDEN_PROFILE_CODES.includes(row.profileCode) || (row.siteSlug !== null && FORBIDDEN_SITE_SLUGS.includes(row.siteSlug))) {
      return { action: "skip", row, reason: "forbidden target" };
    }
    if (!row.after) return { action: "skip", row, reason: "apply never completed for this row; nothing to undo" };
    if (!currentDraftRev.has(row.siteId)) return { action: "skip", row, reason: "site no longer exists" };
    if (!force && currentDraftRev.get(row.siteId) !== row.after.draftRev) {
      return { action: "skip", row, reason: "draft changed since the backfill (draft_rev moved); use --force-restore to override" };
    }
    return { action: "restore", row };
  });
}
