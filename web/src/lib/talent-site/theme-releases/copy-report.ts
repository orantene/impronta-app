/**
 * THEME RELEASES: the per-site COPY dry-run report. Pure.
 *
 * Reads a merge report and lists, per site, which default-copy leaves the
 * update would UPDATE (path, before, after) and which it would KEEP because
 * she changed them (her value vs the new default). The bulk upgrade dry run
 * (`scripts/upgrade-site-designs.mjs`) prints it so the PM can review real
 * sites before any release; it never writes anything.
 */
import type { DesignMergeReport, LeafChange, MergeEntry } from "./types";

export interface CopyUpdateLine {
  tree: string;
  key: string;
  path: string;
  before: string | null;
  after: string | null;
}

export interface CopyKeptLine {
  tree: string;
  key: string;
  path: string;
  /** Her value, which stays. */
  hers: string | null;
  /** The new default the update did not write. */
  next: string | null;
}

export interface SiteCopyReport {
  profileCode: string;
  slug: string | null;
  updates: CopyUpdateLine[];
  kept: CopyKeptLine[];
}

const str = (has: boolean, v: unknown): string | null => (has && typeof v === "string" ? v : null);

function copyChanges(e: MergeEntry): LeafChange[] {
  const all = e.changes ?? [];
  if (e.reason === "copy_applied") return all;
  const only = new Set(e.copyPaths ?? []);
  return all.filter((c) => only.has(c.path));
}

/** Copy updates and kept texts out of one site's merge report. */
export function copyReportFromMerge(
  site: { profileCode: string; slug: string | null },
  report: Pick<DesignMergeReport, "applied" | "conflicts">,
): SiteCopyReport {
  const updates: CopyUpdateLine[] = [];
  for (const e of report.applied) {
    if (e.change !== "props") continue;
    for (const c of copyChanges(e)) {
      updates.push({
        tree: e.tree ?? "",
        key: e.key,
        path: c.path,
        before: str(c.hadBefore, c.before),
        after: str(c.hasAfter, c.after),
      });
    }
  }
  const kept: CopyKeptLine[] = [];
  for (const e of report.conflicts) {
    if (e.reason !== "copy_edited") continue;
    for (const c of e.changes ?? []) {
      kept.push({
        tree: e.tree ?? "",
        key: e.key,
        path: c.path,
        hers: str(c.hadBefore, c.before),
        next: str(c.hasAfter, c.after),
      });
    }
  }
  const order = (a: { tree: string; key: string; path: string }, b: { tree: string; key: string; path: string }) =>
    `${a.tree}/${a.key}/${a.path}`.localeCompare(`${b.tree}/${b.key}/${b.path}`);
  return { ...site, updates: updates.sort(order), kept: kept.sort(order) };
}

const q = (v: string | null): string => (v === null ? "(none)" : JSON.stringify(v));
const where = (l: { tree: string; key: string; path: string }): string => `${l.tree ? `${l.tree}:` : ""}${l.key} ${l.path}`;

/** Plain-text block for one site (stable order, one line per leaf). */
export function formatSiteCopyReport(r: SiteCopyReport): string[] {
  const head = `${r.profileCode}${r.slug ? ` (${r.slug})` : ""}: copy ${r.updates.length} update${r.updates.length === 1 ? "" : "s"}, ${r.kept.length} kept`;
  const lines = [head];
  for (const u of r.updates) lines.push(`    UPDATE ${where(u)}: ${q(u.before)} -> ${q(u.after)}`);
  for (const k of r.kept) lines.push(`    KEPT   ${where(k)}: hers ${q(k.hers)} | new ${q(k.next)}`);
  return lines;
}

/** The whole dry-run section. Empty input prints a single "none" line. */
export function formatCopyReport(sites: ReadonlyArray<SiteCopyReport>): string {
  const touched = sites.filter((s) => s.updates.length > 0 || s.kept.length > 0);
  if (touched.length === 0) return "Copy report: no default-copy leaf would change on any site.";
  const u = touched.reduce((n, s) => n + s.updates.length, 0);
  const k = touched.reduce((n, s) => n + s.kept.length, 0);
  return [
    `Copy report: ${u} leaf update${u === 1 ? "" : "s"}, ${k} kept across ${touched.length} site${touched.length === 1 ? "" : "s"}`,
    ...touched.flatMap(formatSiteCopyReport),
  ].join("\n");
}
