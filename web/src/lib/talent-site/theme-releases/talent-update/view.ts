/**
 * THEME RELEASES (Phase 4): the talent side of an update, pure.
 *
 * - which update rows show a notice (only `available`)
 * - the What's new groups (automatic / new blocks / layout / critical)
 * - the "kept your edits" summary read from a merge report
 * - placing an added block after a chosen section
 * - the token-origin map after a merge (keys the update wrote hash to the new value)
 *
 * No I/O: the server module and the tests share it.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { hashString, propsOf } from "../origin";
import { countParts, editedKept, partsOf } from "../parts";
import { findKeyPath, keyOf, updateAt } from "../tree-ops";
import type { DesignMergeReport, ReleaseItem, ReleaseItemType, SiteUpdateState } from "../types";

/**
 * States that still offer the update: `available` (new), `previewed` (she looked
 * at it, measurement only) and `undone` (she took it back and may want it again,
 * F83). `applied` and `dismissed` stay quiet.
 */
export const OPEN_UPDATE_STATES: readonly SiteUpdateState[] = ["available", "previewed", "undone"];

/** Only an open update shows the banner; every other state is quiet. */
export function isNoticeVisible(state: SiteUpdateState | string | null | undefined): boolean {
  return OPEN_UPDATE_STATES.includes(state as SiteUpdateState);
}

/** Items Tulala applies on its own (untouched parts only) once a release is default. */
export const AUTO_ITEM_TYPES: readonly ReleaseItemType[] = ["code", "token-default", "variant-default"];

export function isAutoItem(item: Pick<ReleaseItem, "type">): boolean {
  return AUTO_ITEM_TYPES.includes(item.type);
}

export function autoImproveItems(items: ReadonlyArray<ReleaseItem>): ReleaseItem[] {
  return items.filter(isAutoItem);
}

/**
 * F78: what "Apply" merges. Automatic improvements (code, token and variant
 * defaults), critical fixes and layout changes she opts into by applying.
 * New blocks are NEVER part of Apply: they arrive only through "Add this
 * block" with a placement, as the sheet promises.
 */
/** Item identity across releases (the merge engine's default id). */
const itemId = (i: ReleaseItem) => i.id ?? `${i.type}:${i.key}`;

/**
 * F110: ONE combined item list for a site behind several releases. `releases`
 * in ascending to-version order; the same item changed twice is listed once
 * and the LATER release's version wins.
 */
export function combineReleaseItems(releases: ReadonlyArray<{ items?: ReleaseItem[] | null }>): ReleaseItem[] {
  const byId = new Map<string, ReleaseItem>();
  for (const r of releases) {
    for (const i of Array.isArray(r.items) ? r.items : []) byId.set(itemId(i), i);
  }
  return [...byId.values()];
}

/**
 * F111: one banner state for several rows. Any row still waiting keeps the
 * banner up; "dismissed" only when EVERY covered row is dismissed.
 */
export function combinedUpdateState<S extends string>(states: ReadonlyArray<S>): S {
  for (const s of ["available", "undone", "previewed"] as const) {
    if (states.includes(s as S)) return s as S;
  }
  return states[0]!;
}

export function applyItemsOf(items: ReadonlyArray<ReleaseItem>): ReleaseItem[] {
  return items.filter((i) => i.type !== "new-block");
}

/**
 * F87: a site with NO exact merge base (built before origin stamps, or pinned
 * to a version with no snapshot) is only offered new blocks. The merge cannot
 * tell her edits from the design, so automatic improvements and layout changes
 * are hidden and Apply is unavailable.
 */
export function offeredItems(items: ReadonlyArray<ReleaseItem>, noBase: boolean): ReleaseItem[] {
  return noBase ? items.filter((i) => i.type === "new-block") : [...items];
}

export type WhatsNewGroup = "auto" | "blocks" | "layout" | "critical";

export const WHATS_NEW_GROUP_ORDER: readonly WhatsNewGroup[] = ["critical", "auto", "blocks", "layout"];

export function groupOf(type: ReleaseItemType): WhatsNewGroup {
  if (type === "critical") return "critical";
  if (type === "new-block") return "blocks";
  if (type === "layout") return "layout";
  return "auto";
}

/** One release item as the talent sees it (never admin-only fields). */
export interface TalentReleaseItem {
  id: string;
  type: ReleaseItemType;
  key: string;
  tree: string | null;
  noteEn: string;
  noteEs: string;
  screenshotUrl: string | null;
  /** Release item ids behind this row (a grouped layout swap shows once). */
  itemIds?: string[];
}

function https(v: unknown): string | null {
  if (typeof v !== "string") return null;
  try {
    return new URL(v).protocol === "https:" ? v : null;
  } catch {
    return null;
  }
}

export function toTalentItem(item: ReleaseItem): TalentReleaseItem {
  return {
    id: item.id ?? `${item.type}:${item.key}`,
    type: item.type,
    key: item.key,
    tree: item.tree ?? null,
    noteEn: item.note?.en?.trim() ?? "",
    noteEs: item.note?.es?.trim() ?? "",
    screenshotUrl: https(item.detail?.screenshotUrl),
  };
}

/**
 * F73: releases generated before the layout grouping fix list one change as
 * several items that share a note (the two hero-inset layout entries). Collapse
 * items of the same type with an identical, non-empty note at READ time so the
 * talent sees one row. Apply still merges every stored item.
 */
export function dedupeTalentItems(items: ReadonlyArray<TalentReleaseItem>): TalentReleaseItem[] {
  const seen = new Set<string>();
  const out: TalentReleaseItem[] = [];
  for (const item of items) {
    if (item.noteEn === "" && item.noteEs === "") {
      out.push(item);
      continue;
    }
    const sig = `${item.type}|${item.noteEn}|${item.noteEs}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(item);
  }
  return out;
}

/** Items sharing a `group` (a layout key swap) collapse into ONE row: one choice. */
function collapseGroups(items: ReadonlyArray<ReleaseItem>): TalentReleaseItem[] {
  const out: TalentReleaseItem[] = [];
  const byGroup = new Map<string, TalentReleaseItem>();
  for (const item of items) {
    const row = toTalentItem(item);
    const prior = item.group ? byGroup.get(item.group) : undefined;
    if (prior) {
      prior.itemIds = [...(prior.itemIds ?? []), row.id];
      if (!prior.noteEn) prior.noteEn = row.noteEn;
      if (!prior.noteEs) prior.noteEs = row.noteEs;
      if (!prior.screenshotUrl) prior.screenshotUrl = row.screenshotUrl;
      continue;
    }
    if (item.group) {
      const grouped = { ...row, id: item.group, itemIds: [row.id] };
      byGroup.set(item.group, grouped);
      out.push(grouped);
    } else {
      out.push(row);
    }
  }
  return out;
}

export function groupItems(items: ReadonlyArray<ReleaseItem>): Array<{ group: WhatsNewGroup; items: TalentReleaseItem[] }> {
  return WHATS_NEW_GROUP_ORDER.map((group) => ({
    group,
    items: dedupeTalentItems(collapseGroups(items.filter((i) => groupOf(i.type) === group))),
  })).filter((g) => g.items.length > 0);
}

// ── Kept-your-edits summary ──────────────────────────────────────────────────

/** "hero/heading" → "Hero heading"; "about-me" → "About me". */
export function humanKey(key: string): string {
  const words = key
    .replace(/^(shell|home):/, "")
    .split(/[/_\-.]+/)
    .map((w) => w.replace(/\d+$/, "").trim())
    .filter(Boolean);
  if (words.length === 0) return key;
  const text = words.join(" ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export interface UpdateSummary {
  applied: number;
  added: number;
  kept: number;
  conflicts: number;
  /** Layout swaps that carried her edits onto the new layout ("moved your edits"). */
  moved: number;
  /** Distinct top-level parts she kept (for "we kept your hero, colours"). */
  keptLabels: string[];
  /** The same parts as raw design keys ("hero", "colours"); localized at display (F86). */
  keptKeys: string[];
  /**
   * F122: sections she REMOVED (the base had them, her page does not) and the
   * update left removed. Its own line, never "your edits". A block that was
   * never on her page or not in her base produces no entry at all (silent).
   */
  removedKeys: string[];
}

export function summarizeReport(report: Pick<DesignMergeReport, "applied" | "added" | "kept" | "conflicts">): UpdateSummary {
  const edited = editedKept(report.kept);
  const keys = partsOf(edited).slice(0, 6);
  return {
    applied: report.applied.length,
    added: report.added.length,
    kept: countParts(edited),
    removedKeys: partsOf(report.kept.filter((e) => e.reason === "removed")).slice(0, 6),
    conflicts: report.conflicts.length,
    moved: report.applied.filter((e) => e.reason === "moved_edits").length,
    keptLabels: keys.map((k) => (k === "colours" ? k : humanKey(k))),
    keptKeys: keys,
  };
}

// ── Add this block: placement ────────────────────────────────────────────────

export interface PlacementOption {
  /** Node id of the section to insert after. */
  afterId: string;
  label: string;
}

function textOf(node: BuilderNode): string | null {
  const p = propsOf(node);
  for (const k of ["layerLabel", "title", "text", "label"]) {
    const v = p[k];
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, 40);
  }
  return null;
}

export function sectionLabel(node: BuilderNode): string {
  const p = propsOf(node);
  if (typeof p.layerLabel === "string" && p.layerLabel.trim()) return p.layerLabel.trim().slice(0, 40);
  const key = keyOf(node) ?? (typeof p.slotKey === "string" ? p.slotKey : null);
  if (key) return humanKey(key);
  const child = (node as { children?: BuilderNode[] }).children?.map(textOf).find(Boolean);
  return child ?? humanKey(node.kind);
}

/** Top-level sections of her page, in order: the picker's "after" choices. */
export function placementOptions(tree: ReadonlyArray<BuilderNode>): PlacementOption[] {
  return tree.map((n) => ({ afterId: n.id, label: sectionLabel(n) }));
}

/**
 * Move the root-level node keyed `key` to sit right after the node `afterId`
 * (null = the top of the page). A key that is not at the root, or an unknown
 * `afterId`, leaves the tree as the merge placed it.
 */
export function placeKeyAfter(tree: ReadonlyArray<BuilderNode>, key: string, afterId: string | null): BuilderNode[] {
  const at = findKeyPath(tree, key);
  if (!at || at.length !== 1) return [...tree];
  const node = tree[at[0]!]!;
  const rest = updateAt([...tree], at, () => null);
  if (afterId === null) return [node, ...rest];
  const idx = rest.findIndex((n) => n.id === afterId);
  if (idx < 0) return [...tree];
  return [...rest.slice(0, idx + 1), node, ...rest.slice(idx + 1)];
}

// ── Token origin after a merge ───────────────────────────────────────────────

/** Keys the update wrote now hash to their new default (so a later merge reads them untouched). */
export function nextTokenOrigin(
  prev: Readonly<Record<string, string>> | null | undefined,
  report: Pick<DesignMergeReport, "applied">,
): Record<string, string> {
  const out: Record<string, string> = { ...(prev ?? {}) };
  for (const e of report.applied) {
    if (e.change !== "token") continue;
    const c = e.changes?.[0];
    if (!c) continue;
    if (c.hasAfter && typeof c.after === "string") out[e.key] = hashString(c.after);
    else delete out[e.key];
  }
  return out;
}

/** A merge that changed nothing a talent could see. */
export function isEmptyMerge(report: Pick<DesignMergeReport, "applied" | "added" | "removed">): boolean {
  return report.applied.length === 0 && report.added.length === 0 && report.removed.length === 0;
}

/** F92: a dismissed update has no banner but keeps a quiet entry and can still be opened and applied. */
export function isQuietEntry(state: SiteUpdateState | string | null | undefined): boolean {
  return state === "dismissed";
}
