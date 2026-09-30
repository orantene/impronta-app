/**
 * THEME RELEASES (Phase 3): dry-run aggregation and the channel guard. Pure.
 *
 * A dry run merges the release into every site on the design IN MEMORY and
 * keeps only counts + a trimmed drill-down per site. A channel change needs a
 * FRESH report for this exact release and item list (editing items after the
 * run makes it stale) with no failed sites.
 */
import { hashString, stableStringify } from "../origin";
import type { DesignMergeReport, MergeReportEntry, ReleaseChannel, ReleaseItem, ThemeRelease } from "../types";

export type SiteDryRunStatus = "clean" | "kept" | "conflicts" | "error";

export interface DryRunEntry {
  key: string;
  prop?: string;
  reason?: string;
  itemType?: string;
}

export interface SiteDryRunResult {
  siteId: string;
  profileCode: string;
  displayName: string;
  isDemo: boolean;
  pinnedVersion: number | null;
  status: SiteDryRunStatus;
  /** True when the merge base (design at the pinned version) was unavailable. */
  noBase: boolean;
  counts: { applied: number; kept: number; conflicts: number; added: number; pending: number; removed: number };
  kept: DryRunEntry[];
  conflicts: DryRunEntry[];
  error?: string;
}

export interface DryRunSummary {
  total: number;
  clean: number;
  kept: number;
  conflicts: number;
  errors: number;
  noBase: number;
  demos: { total: number; clean: number; kept: number; conflicts: number; errors: number };
}

export interface DryRunReport {
  releaseId: string;
  toVersion: number;
  itemsHash: string;
  generatedAt: string;
  summary: DryRunSummary;
  sites: SiteDryRunResult[];
}

const DRILL_LIMIT = 24;

export function hashItems(items: ReadonlyArray<ReleaseItem>): string {
  return hashString(stableStringify(items));
}

function trim(entries: ReadonlyArray<MergeReportEntry & { reason?: string }>): DryRunEntry[] {
  return entries.slice(0, DRILL_LIMIT).map((e) => ({
    key: e.key,
    ...(e.prop ? { prop: e.prop } : {}),
    ...(e.reason ? { reason: e.reason } : {}),
    ...(e.itemType ? { itemType: e.itemType } : {}),
  }));
}

/** Status of one site from its merge report: conflicts > kept edits > clean. */
export function classifySiteReport(report: Pick<DesignMergeReport, "kept" | "conflicts">): SiteDryRunStatus {
  if (report.conflicts.length > 0) return "conflicts";
  if (report.kept.length > 0) return "kept";
  return "clean";
}

export function siteResultFromReport(
  meta: Pick<SiteDryRunResult, "siteId" | "profileCode" | "displayName" | "isDemo" | "pinnedVersion" | "noBase">,
  report: DesignMergeReport,
): SiteDryRunResult {
  return {
    ...meta,
    status: classifySiteReport(report),
    counts: {
      applied: report.applied.length,
      kept: report.kept.length,
      conflicts: report.conflicts.length,
      added: report.added.length,
      pending: report.pending.length,
      removed: report.removed.length,
    },
    kept: trim(report.kept),
    conflicts: trim(report.conflicts),
  };
}

export function siteResultFromError(
  meta: Pick<SiteDryRunResult, "siteId" | "profileCode" | "displayName" | "isDemo" | "pinnedVersion">,
  error: string,
): SiteDryRunResult {
  return {
    ...meta,
    noBase: false,
    status: "error",
    counts: { applied: 0, kept: 0, conflicts: 0, added: 0, pending: 0, removed: 0 },
    kept: [],
    conflicts: [],
    error,
  };
}

/** Demos first, then by profile code (stable review order). */
export function orderDemosFirst<T extends { isDemo: boolean; profileCode: string }>(rows: ReadonlyArray<T>): T[] {
  return [...rows].sort(
    (a, b) => Number(b.isDemo) - Number(a.isDemo) || a.profileCode.localeCompare(b.profileCode),
  );
}

export function aggregateDryRun(results: ReadonlyArray<SiteDryRunResult>): DryRunSummary {
  const tally = (rows: ReadonlyArray<SiteDryRunResult>) => ({
    total: rows.length,
    clean: rows.filter((r) => r.status === "clean").length,
    kept: rows.filter((r) => r.status === "kept").length,
    conflicts: rows.filter((r) => r.status === "conflicts").length,
    errors: rows.filter((r) => r.status === "error").length,
  });
  const all = tally(results);
  return {
    ...all,
    noBase: results.filter((r) => r.noBase).length,
    demos: tally(results.filter((r) => r.isDemo)),
  };
}

export function buildDryRunReport(
  release: Pick<ThemeRelease, "id" | "to_version" | "items">,
  results: ReadonlyArray<SiteDryRunResult>,
  now: string = new Date().toISOString(),
): DryRunReport {
  const sites = orderDemosFirst(results);
  return {
    releaseId: release.id,
    toVersion: release.to_version,
    itemsHash: hashItems(release.items ?? []),
    generatedAt: now,
    summary: aggregateDryRun(sites),
    sites,
  };
}

const RANK: Record<ReleaseChannel, number> = { draft: 0, demos: 1, optin: 2, default: 3 };

export type ChannelGuard = { ok: true } | { ok: false; error: string };

/** True when the stored report belongs to this release + its current items. */
export function dryRunIsFresh(
  release: Pick<ThemeRelease, "id" | "to_version" | "items" | "dry_run_report">,
): { ok: true; report: DryRunReport } | { ok: false; error: string } {
  const r = release.dry_run_report as Partial<DryRunReport> | null | undefined;
  if (!r || typeof r !== "object" || !r.summary) {
    return { ok: false, error: "Run a dry run first. No channel change without a report." };
  }
  if (r.releaseId !== release.id || r.toVersion !== release.to_version) {
    return { ok: false, error: "The dry run belongs to another release. Run it again." };
  }
  if (r.itemsHash !== hashItems(release.items ?? [])) {
    return { ok: false, error: "Items changed after the dry run. Run it again." };
  }
  return { ok: true, report: r as DryRunReport };
}

/**
 * The guard behind every channel button. Forward one step at a time
 * (draft, demos, optin, default), a fresh dry run each time, and no failed
 * sites in it. Only `published` releases can move forward (a paused or
 * archived release must be reopened first).
 */
export function checkChannelChange(
  release: Pick<ThemeRelease, "id" | "to_version" | "items" | "dry_run_report" | "channel" | "status">,
  target: ReleaseChannel,
): ChannelGuard {
  if (release.status === "archived") return { ok: false, error: "This release is archived." };
  if (release.status === "paused" && target !== release.channel) {
    return { ok: false, error: "This release is paused. Resume it first." };
  }
  if (RANK[target] !== RANK[release.channel] + 1) {
    return { ok: false, error: `Move one step at a time: ${release.channel} to the next channel.` };
  }
  const fresh = dryRunIsFresh(release);
  if (!fresh.ok) return fresh;
  if (fresh.report.summary.errors > 0) {
    return { ok: false, error: `${fresh.report.summary.errors} site(s) failed the dry run. Fix or rerun.` };
  }
  return { ok: true };
}
