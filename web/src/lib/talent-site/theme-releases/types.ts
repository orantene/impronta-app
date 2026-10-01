/** Shared theme-release contract (Phase 1A merge engine + Phase 1B data layer). */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import type { DesignOrigin } from "@/lib/site-admin/builder-node/design-origin";

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
  /** Merge engine (1A): stable item id; defaults to `${type}:${key}`. */
  id?: string;
  /** Tree the item touches (`shell` | `home`); omitted = any. `key` may also be `tree:key`. */
  tree?: string;
  /** Several design keys; overrides `key`. `key: "*"` with no `keys` covers every key. */
  keys?: string[];
  /** Token keys (token-default / critical); overrides `key` for tokens. */
  tokenKeys?: string[];
  /**
   * Layout key swap (old key removed + new keyed node in the same parent and
   * slot): both halves carry the same `swap` and `group`, and the merge treats
   * them as ONE atomic choice. Keys are unqualified design keys.
   */
  swap?: { from: string; to: string; ensure?: boolean };
  /** Items sharing a group are one choice for the talent (What's new shows one). */
  group?: string;
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
  /** Design payload at from_version; admin-only (not granted to talents). */
  base_payload?: unknown | null;
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
  /** 1A: changes the chosen items did not cover (offered later). */
  pending?: MergeReportEntry[];
  /** 1A: nodes carried to the new version with no prop change (undo re-pins them). */
  restamped?: MergeReportEntry[];
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

// ── Phase 1A merge engine ────────────────────────────────────────────────────

/** One side of the merge: named trees (`shell`, `home`) plus design tokens. */
export interface DesignSide {
  trees: Record<string, BuilderNode[]>;
  tokens?: Record<string, string>;
}

export type MergeChangeKind =
  | "props"
  | "kind"
  | "order"
  | "insert"
  | "remove"
  | "restore"
  | "token"
  | "restamp"
  | "swap";

export interface LeafChange {
  path: string;
  hadBefore: boolean;
  before?: unknown;
  hasAfter: boolean;
  after?: unknown;
}

export interface MergeEntry extends MergeReportEntry {
  /** Monotonic order the merge produced the entry in (reverse walks it back). */
  seq: number;
  change: MergeChangeKind;
  /** Tree name; omitted for tokens. */
  tree?: string;
  /** Design key (node) or token key. */
  key: string;
  /** Parent design key for insert / remove / order (null = tree root). */
  parentKey?: string | null;
  /** Design key of the sibling the node sits after (null = first). */
  anchor?: string | null;
  changes?: LeafChange[];
  /** Node snapshot: inserted (after) or removed (before). */
  node?: BuilderNode;
  /** The node's stamp before a props change (reverse restores it). */
  originBefore?: DesignOrigin;
  /** The stamp the update wrote (a restamp reverts only while it is still there). */
  originAfter?: DesignOrigin;
  /** Node snapshot before a kind swap or a layout key swap. */
  beforeNode?: BuilderNode;
  /** Layout key swap: the old key the new node replaced. */
  fromKey?: string;
  beforeOrder?: string[];
  afterOrder?: string[];
  /** Why it was kept / pending / conflicting. */
  reason?:
    | "edited"
    | "removed"
    | "not_in_release"
    | "no_base"
    | "your_order"
    | "critical"
    | "inherits_default"
    | "moved_edits";
  itemId?: string;
}

/** The engine's full report: a MergeReport whose entries carry undo data. */
export interface DesignMergeReport extends MergeReport {
  applied: MergeEntry[];
  kept: MergeEntry[];
  conflicts: MergeEntry[];
  added: MergeEntry[];
  removed: MergeEntry[];
  pending: MergeEntry[];
  restamped: MergeEntry[];
}

export interface MergeInput {
  base: DesignSide;
  ours: DesignSide;
  theirs: DesignSide;
  /** Chosen release items; omitted = the whole update. */
  items?: ReadonlyArray<ReleaseItem>;
  /** `talent_sites.theme_token_origin` (key → hash of the default as applied). */
  tokenOrigin?: Readonly<Record<string, string>>;
  /**
   * Demo sites (`is_demo`): demo content is ours, so a design change the
   * items allow is FORCED like a critical item, even where the node no longer
   * hashes to its stamp (seeded demo copy reads as an edit). Talents: never.
   */
  forceDesign?: boolean;
}

export interface MergeResult {
  trees: Record<string, BuilderNode[]>;
  tokens: Record<string, string>;
  report: DesignMergeReport;
}

export function emptyReport(): DesignMergeReport {
  return { applied: [], kept: [], conflicts: [], added: [], removed: [], pending: [], restamped: [] };
}
