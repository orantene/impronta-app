/**
 * History rows → the revisions drawer's row shape (the talent adapter's
 * `loadRevisions` returns this timeline). Pure.
 */
import type {
  RevisionListRow,
  RevisionsLoadResult,
} from "@/lib/site-admin/edit-mode/revisions-actions";
import type { HistoryRow } from "./types";

export interface TimelinePreviewTarget {
  /** `/t/site/<slug>` base; null when the site has no slug yet. */
  siteBasePath: string | null;
  /** Page slug to preview (null = home). */
  pageSlug: string | null;
}

/** Owner-only read-only render of one entry (see `renderTalentMaxSite`). */
export function historyPreviewUrl(entryId: string, target: TimelinePreviewTarget): string | null {
  if (!target.siteBasePath) return null;
  const page = target.pageSlug ? `/${encodeURIComponent(target.pageSlug)}` : "";
  return `${target.siteBasePath}${page}?preview=draft&history=${encodeURIComponent(entryId)}`;
}

function rowKind(kind: HistoryRow["kind"]): RevisionListRow["kind"] {
  if (kind === "publish") return "published";
  if (kind === "restore") return "rollback";
  return "draft";
}

export function mapHistoryRowsToRevisions(
  rows: ReadonlyArray<HistoryRow>,
  target: TimelinePreviewTarget,
  names: ReadonlyMap<string, string | null> = new Map(),
): RevisionListRow[] {
  return rows.map((r) => ({
    id: r.id,
    kind: rowKind(r.kind),
    version: typeof r.draft_rev === "number" ? r.draft_rev : 0,
    createdAt: r.last_at ?? r.at,
    createdBy: r.created_by
      ? { id: r.created_by, displayName: names.get(r.created_by) ?? null }
      : null,
    sectionCount: 0,
    titleAtRevision: r.summary_en || null,
    label: null,
    history: {
      kind: r.kind,
      actor: r.actor,
      summaryEn: r.summary_en,
      summaryEs: r.summary_es,
      undoable: r.kind === "theme_update" || r.kind === "auto_improve" ? r.undoable : false,
      editCount: r.edit_count ?? 1,
      previewUrl: historyPreviewUrl(r.id, target),
    },
  }));
}

/** Entries newer than the latest publish (newest-first input). */
export function countUnpublishedChanges(rows: ReadonlyArray<Pick<HistoryRow, "kind">>): number {
  let n = 0;
  for (const r of rows) {
    if (r.kind === "publish") break;
    n += 1;
  }
  return n;
}

/** Build the drawer payload. `publishedVersion` = the latest publish entry's rev. */
export function buildTimelineResult(
  rows: ReadonlyArray<HistoryRow>,
  draftRev: number,
  target: TimelinePreviewTarget,
  names?: ReadonlyMap<string, string | null>,
): Extract<RevisionsLoadResult, { ok: true }> {
  const revisions = mapHistoryRowsToRevisions(rows, target, names);
  const latestPublish = rows.find((r) => r.kind === "publish");
  return {
    ok: true,
    revisions,
    pageVersion: draftRev,
    publishedVersion:
      latestPublish && typeof latestPublish.draft_rev === "number" ? latestPublish.draft_rev : null,
  };
}

/** Drawer filter: "Published only". */
export function filterPublishedOnly<T extends Pick<RevisionListRow, "kind" | "history">>(
  rows: ReadonlyArray<T>,
): T[] {
  return rows.filter((r) => (r.history ? r.history.kind === "publish" : r.kind === "published"));
}
