/** Shared theme-release contract (Phase 1A merge engine + Phase 1B data layer). */

export type ReleaseChannel = "draft" | "demos" | "optin" | "default";
export type ReleaseStatus = "draft" | "published" | "paused" | "archived";
export type SiteUpdateState = "available" | "previewed" | "applied" | "dismissed" | "undone";

export type ReleaseItemType =
  | "code"
  | "token-default"
  | "variant-default"
  | "new-block"
  | "layout"
  | "critical";

/** One typed change inside a release. `key` is the stable design key (slotKey or slotKey/path) or token key. */
export interface ReleaseItem {
  type: ReleaseItemType;
  key: string;
  /** Per-item note, EN/ES. */
  note?: { en?: string; es?: string };
  /** Free-form typed detail (e.g. { from, to } for defaults). */
  detail?: Record<string, unknown>;
}

export interface ReleaseNotes {
  en?: string;
  es?: string;
  [extra: string]: unknown;
}

export interface ThemeRelease {
  id: string;
  design_slug: string;
  from_version: number;
  to_version: number;
  channel: ReleaseChannel;
  status: ReleaseStatus;
  notes: ReleaseNotes;
  items: ReleaseItem[];
  rollout_pct: number;
  critical: boolean;
  dry_run_report: unknown | null;
  created_by: string | null;
  created_at: string;
  published_at: string | null;
  updated_at: string;
}

export interface MergeReportEntry {
  key: string;
  itemType?: ReleaseItemType;
  prop?: string;
  note?: string;
}

/** Plan §1.4 report shape. */
export interface MergeReport {
  applied: MergeReportEntry[];
  kept: MergeReportEntry[];
  conflicts: MergeReportEntry[];
  added: MergeReportEntry[];
  removed: MergeReportEntry[];
}

export interface SiteThemeUpdate {
  id: string;
  talent_site_id: string;
  talent_profile_id: string;
  release_id: string;
  state: SiteUpdateState;
  report: MergeReport | null;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
}
