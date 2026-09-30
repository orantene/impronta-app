/**
 * Restore + undo-update planning (pure). Both produce a DRAFT write only:
 * restore never deletes history and never touches the live site; undo walks
 * back one theme update with `reverseMerge` so later edits stay.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { reverseMerge } from "@/lib/talent-site/theme-releases/reverse-merge";
import type { DesignMergeReport } from "@/lib/talent-site/theme-releases/types";
import type { DraftPageWrite, DraftSitePatch } from "./writer";
import type { HistorySnapshot, ThemeUpdateHistoryReport } from "./types";

export function isHistorySnapshot(value: unknown): value is HistorySnapshot {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as { v?: unknown }).v === 1
  );
}

function asTree(value: unknown): BuilderNode[] | null {
  return Array.isArray(value) ? (value as BuilderNode[]) : null;
}

function asTokens(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

export interface CurrentDraftState {
  shell: BuilderNode[];
  /** talent_pages.id → current draft blocks (the pages that still exist). */
  pages: Record<string, BuilderNode[]>;
}

export interface RestorePlan {
  site: DraftSitePatch;
  pages: DraftPageWrite[];
  /** Snapshot pages that no longer exist (skipped, never re-created). */
  skippedPages: string[];
}

/**
 * Map a history snapshot onto a draft write. `guardTree` re-applies the save
 * path's chokepoints (admin prop locks, layout normalisation) against the
 * current tree, so a restore can never drop a lock.
 */
export function planRestore(
  snapshot: HistorySnapshot,
  current: CurrentDraftState,
  guardTree: (next: BuilderNode[], prev: BuilderNode[]) => BuilderNode[] = (n) => n,
): RestorePlan {
  const site: DraftSitePatch = {};
  const shell = asTree(snapshot.shell);
  if (shell) site.shell_tree = guardTree(shell, current.shell);
  const tokens = asTokens(snapshot.tokens);
  if (tokens) site.design_tokens_draft = tokens;
  if (snapshot.design && typeof snapshot.design === "object") {
    if (typeof snapshot.design.slug === "string") site.theme_design_slug = snapshot.design.slug;
    if (typeof snapshot.design.version === "number") site.theme_design_version = snapshot.design.version;
    if (typeof snapshot.design.look === "string") site.theme_look_slug = snapshot.design.look;
  }
  const pages: DraftPageWrite[] = [];
  const skippedPages: string[] = [];
  for (const [id, blocks] of Object.entries(snapshot.pages ?? {})) {
    const tree = asTree(blocks);
    if (!tree) continue;
    const prev = current.pages[id];
    if (!prev) {
      skippedPages.push(id);
      continue;
    }
    pages.push({ id, patch: { blocks: guardTree(tree, prev) } });
  }
  return { site, pages, skippedPages };
}

export function isThemeUpdateReport(value: unknown): value is ThemeUpdateHistoryReport {
  if (!value || typeof value !== "object") return false;
  const merge = (value as { merge?: unknown }).merge;
  return !!merge && typeof merge === "object" && Array.isArray((merge as DesignMergeReport).applied);
}

export interface UndoUpdateInput {
  report: ThemeUpdateHistoryReport;
  shell: BuilderNode[];
  home: BuilderNode[];
  homePageId: string;
  tokens: Record<string, string>;
}

export interface UndoUpdatePlan {
  site: DraftSitePatch;
  pages: DraftPageWrite[];
  reverted: number;
  kept: number;
}

/** Undo ONE theme update: reverse its report against today's draft. */
export function planUndoUpdate(input: UndoUpdateInput): UndoUpdatePlan {
  const res = reverseMerge(input.report.merge, {
    trees: { shell: input.shell, home: input.home },
    tokens: input.tokens,
  });
  return {
    site: {
      shell_tree: res.trees.shell ?? input.shell,
      design_tokens_draft: res.tokens,
      // Re-pin the version the update moved the site from.
      ...(typeof input.report.fromVersion === "number"
        ? { theme_design_version: input.report.fromVersion }
        : {}),
    },
    pages: [{ id: input.homePageId, patch: { blocks: res.trees.home ?? input.home } }],
    reverted: res.reverted.length,
    kept: res.kept.length,
  };
}
