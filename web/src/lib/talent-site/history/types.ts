/**
 * Talent site history (theme releases Phase 2): one timeline per site.
 * Table `talent_site_history` (migration 20261231299550). Every draft writer
 * appends an entry; edits fold into one entry per 60 s per site.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import type { DesignMergeReport } from "@/lib/talent-site/theme-releases/types";

export type HistoryActor = "talent" | "tulala" | "system";

export type HistoryKind =
  | "edit"
  | "colors"
  | "design_apply"
  | "theme_update"
  | "restore"
  | "publish"
  | "auto_improve";

export const HISTORY_KINDS: readonly HistoryKind[] = [
  "edit",
  "colors",
  "design_apply",
  "theme_update",
  "restore",
  "publish",
  "auto_improve",
] as const;

/** Edits and colour tweaks fold into one entry inside this window. */
export const HISTORY_BATCH_SECONDS = 60;

/** Full site state captured by the database after a change (`snapshot_ref`). */
export interface HistorySnapshot {
  v: 1;
  source: "draft" | "published";
  rev?: number | null;
  shell?: BuilderNode[] | null;
  tokens?: Record<string, string> | null;
  design?: { slug?: string | null; version?: number | null; look?: string | null } | null;
  /** talent_pages.id → blocks (draft or published body). */
  pages?: Record<string, BuilderNode[] | null> | null;
}

/** `report` on a theme_update entry: the merge report plus its release link. */
export interface ThemeUpdateHistoryReport {
  merge: DesignMergeReport;
  releaseId?: string | null;
  updateId?: string | null;
  fromVersion?: number | null;
  toVersion?: number | null;
  /** Set on the entry that undid another one. */
  undoOf?: string | null;
}

/** What a writer hands the database for one entry. */
export interface HistoryEntryInput {
  kind: HistoryKind;
  actor?: HistoryActor;
  summaryEn: string;
  summaryEs: string;
  report?: unknown;
  undoable?: boolean;
  /** Fold into the latest entry of the same kind + actor inside this window. */
  batchSeconds?: number;
  /** Snapshot the published state instead of the draft (publish entries). */
  source?: "draft" | "published";
  createdBy?: string | null;
  /** Backfill only. */
  at?: string;
  sourceRef?: string;
  /** The entry this one reverses (marks it no longer undoable). */
  undoOf?: string;
  /** Backfill only: a caller-built snapshot instead of the live state. */
  snapshot?: HistorySnapshot;
}

/** One `talent_site_history` row as read (snapshot omitted from list reads). */
export interface HistoryRow {
  id: string;
  site_id: string;
  talent_profile_id: string;
  at: string;
  last_at: string;
  actor: HistoryActor;
  kind: HistoryKind;
  summary_en: string;
  summary_es: string;
  report: unknown;
  undoable: boolean;
  draft_rev: number | null;
  edit_count: number;
  created_by: string | null;
  snapshot_ref?: unknown;
}
