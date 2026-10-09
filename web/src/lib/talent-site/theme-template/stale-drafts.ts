/**
 * THEME CORE P1 (audit rec 8): the pure "stale drafts" classifier and the
 * first-publish dry-run summary. No database, no clock reads (the caller
 * passes `now`): the Builder Lab panel loads facts, this decides what to
 * recommend, and the panel only renders the verdict.
 *
 * Recommended actions per open draft:
 *   publish-to-demos : the draft really differs from its base, still sits on
 *                      the newest snapshot, would produce design candidates,
 *                      and is older than the stale window.
 *   discard          : the draft holds nothing to release and is stale.
 *   delete-candidate : a QA design with no content change and no sites. The
 *                      panel can only discard its draft; removing the design
 *                      row itself is a production write that needs PM.
 *   keep             : fresh drafts, drafts behind the newest snapshot (a
 *                      publish would be refused as "design moved"), and
 *                      copy-only drafts (Builder Lab refuses those).
 */
import type { DesignPayload } from "../theme-catalog/types";
import { diffDesignPayloads } from "../theme-releases/diff-payload";
import type { ReleaseItem } from "../theme-releases/types";
import { canonicalDesign, payloadHash } from "./publish-core";

/** A draft older than this many days is stale (audit: "no draft older than 7 days"). */
export const STALE_DRAFT_DAYS = 7;

export type StaleDraftAction = "publish-to-demos" | "discard" | "delete-candidate" | "keep";

export type StaleDraftReason =
  | "stale-with-changes"
  | "stale-no-changes"
  | "fresh"
  | "qa-empty"
  | "behind-latest"
  | "copy-only"
  | "no-base";

export interface StaleDraftFact {
  design: string;
  rev: number;
  baseVersion: number;
  /** ISO timestamp of the last save. */
  updatedAt: string;
  payload: DesignPayload;
  /** Snapshot payload at `baseVersion`, or null when that snapshot is missing. */
  basePayload: DesignPayload | null;
}

export interface DesignHistoryFact {
  design: string;
  /** Highest snapshot version on record (talent_theme_versions), null when none. */
  latestSnapshot: number | null;
  /** Number of non-archived release rows for the design. */
  releaseRows: number;
  /** Highest to_version across those release rows, null when none. */
  latestReleased: number | null;
  realSites: number;
  demoSites: number;
}

export interface StaleDraftRow {
  design: string;
  rev: number;
  ageDays: number;
  stale: boolean;
  baseVersion: number;
  latestSnapshot: number | null;
  latestReleased: number | null;
  releaseRows: number;
  /** The canonical draft differs from its base snapshot (any change, copy included). */
  differs: boolean;
  /** Release items a publish would carry; null when the base is missing. */
  designChanges: number | null;
  realSites: number;
  demoSites: number;
  qa: boolean;
  action: StaleDraftAction;
  reason: StaleDraftReason;
  /** Real sites exist and the design has never had a release row: show the dry run first. */
  needsDryRun: boolean;
}

const QA_SLUG = /(^|-)qa(-|$)/;

export function isQaDesign(slug: string): boolean {
  return QA_SLUG.test(slug);
}

export function draftAgeDays(updatedAt: string, now: Date): number {
  const t = Date.parse(updatedAt);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

function emptyHistory(design: string): DesignHistoryFact {
  return { design, latestSnapshot: null, releaseRows: 0, latestReleased: null, realSites: 0, demoSites: 0 };
}

function treesEmpty(p: DesignPayload): boolean {
  return (p.homeTree?.length ?? 0) === 0 && (p.shellTree?.length ?? 0) === 0;
}

export function classifyDraft(
  draft: StaleDraftFact,
  history: DesignHistoryFact | undefined,
  now: Date,
  staleDays: number = STALE_DRAFT_DAYS,
): StaleDraftRow {
  const h = history ?? emptyHistory(draft.design);
  const ageDays = draftAgeDays(draft.updatedAt, now);
  const stale = ageDays >= staleDays;
  const qa = isQaDesign(draft.design);

  let differs = true;
  let designChanges: number | null = null;
  if (draft.basePayload) {
    const base = canonicalDesign(draft.basePayload);
    const next = canonicalDesign(draft.payload);
    differs = payloadHash(base) !== payloadHash(next);
    designChanges = differs
      ? diffDesignPayloads(
          draft.design,
          { payload: base, version: draft.baseVersion },
          { payload: next, version: draft.baseVersion + 1 },
        ).length
      : 0;
  }

  const hasSites = h.realSites + h.demoSites > 0;
  const needsDryRun = h.realSites > 0 && h.releaseRows === 0;
  const behind = h.latestSnapshot !== null && draft.baseVersion < h.latestSnapshot;

  let action: StaleDraftAction;
  let reason: StaleDraftReason;
  if (qa && !hasSites && (!differs || treesEmpty(draft.payload))) {
    action = "delete-candidate";
    reason = "qa-empty";
  } else if (draft.basePayload === null) {
    action = "keep";
    reason = "no-base";
  } else if (!differs) {
    action = stale ? "discard" : "keep";
    reason = stale ? "stale-no-changes" : "fresh";
  } else if (behind) {
    action = "keep";
    reason = "behind-latest";
  } else if (designChanges === 0) {
    action = "keep";
    reason = "copy-only";
  } else if (stale) {
    action = "publish-to-demos";
    reason = "stale-with-changes";
  } else {
    action = "keep";
    reason = "fresh";
  }

  return {
    design: draft.design,
    rev: draft.rev,
    ageDays,
    stale,
    baseVersion: draft.baseVersion,
    latestSnapshot: h.latestSnapshot,
    latestReleased: h.latestReleased,
    releaseRows: h.releaseRows,
    differs,
    designChanges,
    realSites: h.realSites,
    demoSites: h.demoSites,
    qa,
    action,
    reason,
    needsDryRun,
  };
}

/** Oldest first, so the drafts that most need a decision lead the list. */
export function classifyStaleDrafts(input: {
  drafts: ReadonlyArray<StaleDraftFact>;
  histories: ReadonlyArray<DesignHistoryFact>;
  now: Date;
  staleDays?: number;
}): StaleDraftRow[] {
  const byDesign = new Map(input.histories.map((h) => [h.design, h]));
  return input.drafts
    .map((d) => classifyDraft(d, byDesign.get(d.design), input.now, input.staleDays))
    .sort((a, b) => b.ageDays - a.ageDays || a.design.localeCompare(b.design));
}

// ── First-publish dry run (read-only) ───────────────────────────────────────

export interface FirstPublishInput {
  design: string;
  releaseRows: number;
  /** Real (non-demo) sites by pinned version; null = unpinned. */
  realSitesByVersion: ReadonlyArray<{ version: number | null; sites: number }>;
  /** Snapshot versions on record for the design. */
  snapshotVersions: ReadonlyArray<number>;
  /** Items from planPublish (the same diff the publish itself would carry). */
  items: ReadonlyArray<ReleaseItem>;
  /** Edits that only reach new sites. */
  contentOnly: ReadonlyArray<string>;
}

export interface FirstPublishSummary {
  design: string;
  /** True when the design has real sites and no release row yet: the dry run must be read first. */
  applies: boolean;
  realSites: number;
  itemCount: number;
  /** Pins with no snapshot: for them only new blocks can be offered. */
  pinsWithoutSnapshot: number[];
  sitesByVersion: Array<{ version: number | null; sites: number }>;
  items: Array<{ type: string; key: string }>;
  contentOnly: string[];
}

/**
 * What the first publish would change for the real sites. Read-only: the
 * items are the plan's diff against the newest snapshot. A publish moves the
 * release to the demos channel only, so real sites see these items as an
 * offer only after the release is opened to talents.
 */
export function summarizeFirstPublish(input: FirstPublishInput): FirstPublishSummary {
  const realSites = input.realSitesByVersion.reduce((n, s) => n + s.sites, 0);
  const snaps = new Set(input.snapshotVersions);
  const pinsWithoutSnapshot = input.realSitesByVersion
    .filter((s) => s.sites > 0 && (s.version === null || !snaps.has(s.version)))
    .map((s) => s.version ?? 0)
    .sort((a, b) => a - b);
  return {
    design: input.design,
    applies: realSites > 0 && input.releaseRows === 0,
    realSites,
    itemCount: input.items.length,
    pinsWithoutSnapshot,
    sitesByVersion: input.realSitesByVersion.map((s) => ({ ...s })),
    items: input.items.map((i) => ({ type: i.type, key: i.key })),
    contentOnly: [...input.contentOnly],
  };
}
