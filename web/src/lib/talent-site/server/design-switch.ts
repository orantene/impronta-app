/**
 * L3 / TUL-421 + TUL-527: pure plan for switching Designs on a talent site draft.
 *
 * - Matched design keys: content-owned props + i18n carry (`carryContent`).
 * - Unmatched stamped (theme) sections: dropped and warned. Keeping them across
 *   A→B→C stacked every prior design on the page (TUL-527). Restore the old
 *   design from Design options / history when she wants those sections back.
 * - Talent-added (unstamped) top-level nodes: kept (appended) and warned.
 * - Does not touch business tables or published columns (caller's job).
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { kidsOf } from "@/lib/talent-site/theme-releases/origin";
import { carryContent } from "@/lib/talent-site/theme-releases/swap";
import { keyOf, keyedMap } from "@/lib/talent-site/theme-releases/tree-ops";

export type DesignSwitchTree = "shell" | "home";

export type DesignSwitchWarn = {
  tree: DesignSwitchTree;
  /** Design origin key when stamped; omitted for talent-added nodes. */
  key?: string;
  kind: string;
  reason: "no_match" | "talent_added";
};

/** History kinds that are only Design gallery switches (not content edits). */
export const DESIGN_SWITCH_ONLY_HISTORY_KINDS = ["design_apply"] as const;

export type DesignSwitchReport = {
  fromSlug: string | null;
  toSlug: string;
  fromVersion: number | null;
  toVersion: number;
  mappedKeys: string[];
  warned: DesignSwitchWarn[];
};

export type DesignSwitchPlan = {
  shell: BuilderNode[];
  home: BuilderNode[];
  mappedKeys: string[];
  warned: DesignSwitchWarn[];
  report: DesignSwitchReport;
};

function mapList(
  from: ReadonlyArray<BuilderNode>,
  to: ReadonlyArray<BuilderNode>,
  tree: DesignSwitchTree,
  keepOrphans: boolean,
): { nodes: BuilderNode[]; mappedKeys: string[]; warned: DesignSwitchWarn[] } {
  const fromMap = keyedMap(from);
  const toMap = keyedMap(to);
  const mappedKeys: string[] = [];
  const warned: DesignSwitchWarn[] = [];

  const mapped = to.map((node) => {
    const k = keyOf(node);
    if (!k) return node;
    const prev = fromMap.get(k);
    if (!prev) return node;
    mappedKeys.push(k);
    const carried = carryContent(prev, node);
    const prevKids = kidsOf(prev);
    const nextKids = kidsOf(carried);
    if (prevKids.length === 0 || nextKids.length === 0) return carried;
    const child = mapList(prevKids, nextKids, tree, keepOrphans);
    // Child origin keys are already absolute (`hero/heading`), so push as-is.
    mappedKeys.push(...child.mappedKeys);
    warned.push(...child.warned);
    return { ...carried, children: child.nodes } as BuilderNode;
  });

  const orphans: BuilderNode[] = [];
  const seenTo = new Set(toMap.keys());
  // A site that was never on a Design has only the starter tree: nothing of hers to keep.
  for (const node of keepOrphans ? from : []) {
    const k = keyOf(node);
    if (!k) {
      orphans.push(node);
      warned.push({ tree, kind: node.kind, reason: "talent_added" });
      continue;
    }
    if (seenTo.has(k)) continue;
    // Theme-stamped, no match in the new Design: drop (TUL-527). Still warn so
    // the apply report can list what did not carry.
    warned.push({ tree, key: k, kind: node.kind, reason: "no_match" });
  }

  return { nodes: [...mapped, ...orphans], mappedKeys, warned };
}

/**
 * Build the draft trees for a Design switch: new layout with her content
 * carried where keys match; talent-added nodes kept; unmatched theme sections dropped.
 */
export function planDesignSwitch(input: {
  fromShell: ReadonlyArray<BuilderNode>;
  fromHome: ReadonlyArray<BuilderNode>;
  toShell: ReadonlyArray<BuilderNode>;
  toHome: ReadonlyArray<BuilderNode>;
  fromSlug: string | null;
  toSlug: string;
  fromVersion: number | null;
  toVersion: number;
}): DesignSwitchPlan {
  // First apply on a fresh site (no Design pinned yet, e.g. onboarding): the old tree is the unstamped starter
  // (default-talent-*), so it is REPLACED by the design. Keeping it as "talent-added" orphans stacked a second
  // header, hero, about, services and footer under Maison v2 and buried the booking CTAs (TUL-421 follow-up).
  const keepOrphans = input.fromSlug != null && input.fromSlug.trim() !== "";
  const shell = mapList(input.fromShell, input.toShell, "shell", keepOrphans);
  const home = mapList(input.fromHome, input.toHome, "home", keepOrphans);
  const mappedKeys = [...shell.mappedKeys, ...home.mappedKeys];
  const warned = [...shell.warned, ...home.warned];
  return {
    shell: shell.nodes,
    home: home.nodes,
    mappedKeys,
    warned,
    report: {
      fromSlug: input.fromSlug,
      toSlug: input.toSlug,
      fromVersion: input.fromVersion,
      toVersion: input.toVersion,
      mappedKeys,
      warned,
    },
  };
}

/** True when a history report is an L3 design-switch carry report. */
export function isDesignSwitchReport(value: unknown): value is DesignSwitchReport {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  return typeof r.toSlug === "string" && Array.isArray(r.mappedKeys) && Array.isArray(r.warned);
}

/** Read the design slug a pre-switch snapshot was taken from. */
export function snapshotDesignSlug(snapshot: {
  design?: { slug?: string | null } | null;
}): string | null {
  const slug = snapshot.design?.slug;
  return typeof slug === "string" && slug.trim() ? slug.trim() : null;
}

/**
 * Gallery re-pick may restore-exact when the draft has not moved since the
 * leave entry was written (`talent_site_history.draft_rev` == current
 * `talent_sites.draft_rev`).
 */
export function draftUnchangedSinceSwitch(
  currentDraftRev: number,
  leaveEntryDraftRev: number | null | undefined,
): boolean {
  return typeof leaveEntryDraftRev === "number" && currentDraftRev === leaveEntryDraftRev;
}

/**
 * TUL-527: A→B→C→A with no content edits must restore A exactly. Intermediate
 * gallery switches bump `draft_rev`, so equality alone is not enough. When every
 * history row with `draft_rev` after the leave is a `design_apply`, she only
 * tried other Designs — restore-exact is safe. Any edit/colors/etc. → carry-over.
 */
export function onlyDesignAppliesSinceLeave(
  entriesAfterLeave: ReadonlyArray<{ kind?: string | null }>,
): boolean {
  if (entriesAfterLeave.length === 0) return false;
  const allowed = new Set<string>(DESIGN_SWITCH_ONLY_HISTORY_KINDS);
  return entriesAfterLeave.every((e) => typeof e.kind === "string" && allowed.has(e.kind));
}

/** True when gallery re-pick of a prior Design may restore-exact. */
export function canRestoreExactSinceLeave(input: {
  currentDraftRev: number;
  leaveEntryDraftRev: number | null | undefined;
  entriesAfterLeave: ReadonlyArray<{ kind?: string | null }>;
}): boolean {
  if (draftUnchangedSinceSwitch(input.currentDraftRev, input.leaveEntryDraftRev)) return true;
  if (typeof input.leaveEntryDraftRev !== "number") return false;
  if (input.currentDraftRev <= input.leaveEntryDraftRev) return false;
  return onlyDesignAppliesSinceLeave(input.entriesAfterLeave);
}

/** Site patch keys a Design apply may write (draft-first: never published columns). */
export const DESIGN_APPLY_DRAFT_SITE_KEYS = [
  "shell_tree",
  "theme_design_slug",
  "theme_design_version",
  "theme_token_origin",
  "design_tokens_draft",
  "theme_look_slug",
  "updated_by",
] as const;
