/**
 * TUL-402: pure guards, planner and report formatter for seeding a starter
 * home page on old talent sites that have a `talent_sites` row but no
 * `talent_pages` row with `is_home = true` (signup never created the site
 * home). No database client and no app imports: the runner injects I/O, so
 * tests drive this with plain data and nothing here can reach production.
 *
 * Default allow-list is the nine profile codes named on the card. After a
 * home page is seeded the runner also applies the onboarding default design
 * (maison-v2 / rose) the same way TUL-376 does — draft only, never published.
 *
 * Never TAL-93938 / book-jorgelina.
 */

/** The nine September signups named on TUL-402. */
export const DEFAULT_TARGET_CODES: readonly string[] = [
  "TAL-92001",
  "TAL-92026",
  "TAL-92048",
  "TAL-92074",
  "TAL-92125",
  "TAL-92126",
  "TAL-92145",
  "TAL-92149",
  "TAL-92156",
];

export const FORBIDDEN_PROFILE_CODES: readonly string[] = ["TAL-93938"];
export const FORBIDDEN_SITE_SLUGS: readonly string[] = ["book-jorgelina"];
/** Known QA site, reported and skipped unless --include-test. */
export const KNOWN_TEST_PROFILE_CODES: readonly string[] = ["TAL-93900"];

export class RefusedError extends Error {}

export interface SiteCandidate {
  profileCode: string;
  profileId: string | null;
  displayName: string | null;
  siteId: string | null;
  siteSlug: string | null;
  themeDesignSlug: string | null;
  sitePublishedAt: string | null;
  /** A talent_pages row with is_home = true. */
  hasHomePage: boolean;
  /** A talent_pages row with slug = "home" but is_home false (legacy). */
  hasHomeSlugPage: boolean;
  homeSlugPageId: string | null;
  /** Any page with status published or a non-empty blocks_published body. */
  hasLivePages: boolean;
  /** Any talent_site_history row of kind 'edit'. */
  hasTalentEdits: boolean;
  pageCount: number;
  isDemo: boolean | null;
  isTestAccount: boolean | null;
}

export type SkipReason =
  | "forbidden"
  | "missing_profile"
  | "no_site"
  | "already_has_home"
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
  /** When true, seed the home page but do not apply the default design. */
  skipDesign: boolean;
}

function splitCodes(v: string | undefined): string[] {
  return (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseArgs(argv: readonly string[]): Options {
  const flags = new Set<string>();
  const only: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--only") {
      only.push(...splitCodes(argv[++i]));
      continue;
    }
    if (a.startsWith("--only=")) {
      only.push(...splitCodes(a.slice("--only=".length)));
      continue;
    }
    if (!["--apply", "--yes", "--include-test", "--skip-design"].includes(a)) {
      throw new RefusedError(`unknown argument ${a}`);
    }
    flags.add(a);
  }
  const apply = flags.has("--apply");
  const yes = flags.has("--yes");
  if (yes && !apply) throw new RefusedError("--yes without --apply does nothing; refusing");
  if (apply && !yes) throw new RefusedError("--apply needs --yes as well (dry run is the default)");
  for (const code of only) {
    if (FORBIDDEN_PROFILE_CODES.includes(code.toUpperCase())) {
      throw new RefusedError(`refusing --only ${code}: never a target`);
    }
  }
  return {
    apply,
    yes,
    only,
    includeTest: flags.has("--include-test"),
    skipDesign: flags.has("--skip-design"),
  };
}

export function isForbidden(c: Pick<SiteCandidate, "profileCode" | "siteSlug">): boolean {
  return (
    FORBIDDEN_PROFILE_CODES.includes(c.profileCode) ||
    (c.siteSlug !== null && FORBIDDEN_SITE_SLUGS.includes(c.siteSlug))
  );
}

export function isDemoOrTest(c: SiteCandidate): boolean {
  return (
    c.isDemo === true ||
    c.isTestAccount === true ||
    KNOWN_TEST_PROFILE_CODES.includes(c.profileCode)
  );
}

/**
 * Plan which of the named targets get a starter home page.
 * Default scope = DEFAULT_TARGET_CODES; `--only` narrows further.
 */
export function planSeed(
  candidates: readonly SiteCandidate[],
  opts: Pick<Options, "only" | "includeTest">,
): PlanEntry[] {
  const only = new Set(
    (opts.only.length > 0 ? opts.only : DEFAULT_TARGET_CODES).map((c) => c.toUpperCase()),
  );
  const entries = candidates.map((c): PlanEntry => {
    const skip = (reason: SkipReason): PlanEntry => ({ candidate: c, action: "skip", reason });
    if (isForbidden(c)) return skip("forbidden");
    if (!only.has(c.profileCode.toUpperCase())) return skip("not_in_only");
    if (!c.profileId) return skip("missing_profile");
    if (!c.siteId) return skip("no_site");
    if (c.hasHomePage) return skip("already_has_home");
    if (isDemoOrTest(c) && !opts.includeTest) return skip("demo_or_test");
    // Live presence: leave alone so the PM can confirm abandoned vs repair by hand.
    if (c.sitePublishedAt) return skip("published_site");
    if (c.hasLivePages) return skip("live_pages");
    if (c.hasTalentEdits) return skip("talent_edited_draft");
    return { candidate: c, action: "touch" };
  });
  return entries.sort((a, b) => a.candidate.profileCode.localeCompare(b.candidate.profileCode));
}

export const REASON_TEXT: Record<SkipReason, string> = {
  forbidden: "never a target (TAL-93938 / book-jorgelina)",
  missing_profile: "profile row not found",
  no_site: "no talent_sites row; nothing to attach a home page to",
  already_has_home: "already has is_home=true (idempotent no-op)",
  published_site:
    "site_published_at is set; leave alone — confirm abandoned or repair by hand",
  live_pages:
    "has a published page or live body; leave alone — confirm abandoned or repair by hand",
  talent_edited_draft: "talent edited the draft; seeding a home could surprise them",
  demo_or_test: "demo or test account (use --include-test to include)",
  not_in_only: "not in the allow-list / --only",
};

export function formatPlan(
  entries: readonly PlanEntry[],
  ctx: { mode: "dry-run" | "apply"; skipDesign: boolean },
): string {
  const touch = entries.filter((e) => e.action === "touch");
  const skipped = entries.filter((e) => e.action === "skip" && e.reason !== "not_in_only");
  const abandoned = skipped.filter(
    (e) => e.reason === "published_site" || e.reason === "live_pages",
  );
  const line = (e: PlanEntry) => {
    const c = e.candidate;
    const site = c.siteSlug ?? (c.siteId ? "(no slug)" : "(no site)");
    const design = c.themeDesignSlug?.trim() ? c.themeDesignSlug : "null";
    return `  ${c.profileCode}  id=${c.profileId ?? "(missing)"}  site=${site}  design=${design}  pages=${c.pageCount}  published_at=${c.sitePublishedAt ?? "null"}  live_pages=${c.hasLivePages}  home_slug=${c.hasHomeSlugPage}`;
  };
  const out: string[] = [];
  out.push(
    `Seed missing starter home pages (${ctx.mode === "dry-run" ? "DRY RUN, nothing is written" : "APPLY"}${ctx.skipDesign ? ", home only (no design apply)" : ", then apply onboarding default design draft"})`,
  );
  out.push(`Default targets: ${DEFAULT_TARGET_CODES.join(", ")}`);
  out.push(`Would seed ${touch.length} site(s) (draft only, nothing is published):`);
  for (const e of touch) out.push(line(e));
  if (touch.length === 0) out.push("  (none)");
  out.push(`Excluded ${skipped.length} target(s), each with a reason:`);
  for (const e of skipped) out.push(`${line(e)}  -> ${REASON_TEXT[e.reason!]}`);
  if (skipped.length === 0) out.push("  (none)");
  out.push(
    `Live-presence / possibly abandoned (published or live pages; PM decides leave vs hand-repair): ${abandoned.length}`,
  );
  for (const e of abandoned) out.push(line(e));
  if (abandoned.length === 0) out.push("  (none)");
  out.push(
    `Note: TAL-92149 may be the Vic first-run test from 2026-09-10 — check the dry-run row before applying.`,
  );
  return out.join("\n");
}

export interface BackupRow {
  profileCode: string;
  profileId: string;
  siteId: string;
  siteSlug: string | null;
  /** true when this run inserted a new home page (restore deletes it). */
  homeCreated: boolean;
  /** Home page id after seed (created or promoted). */
  homePageId: string | null;
  /** Pre-existing slug=home page id that was promoted, if any. */
  promotedFromPageId: string | null;
  /** Site columns before design apply (null when --skip-design). */
  siteBeforeDesign: Record<string, unknown> | null;
  after?: {
    designSlug: string | null;
    designVersion: number | null;
    draftRev: number | null;
  };
}

export interface BackupFile {
  version: 1;
  createdAt: string;
  rows: BackupRow[];
}
