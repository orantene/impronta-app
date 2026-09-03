/**
 * WHICH STORE a shell landmark's inspector-editable configuration lives in,
 * decided purely — no Supabase, no React, no server runtime.
 *
 * THE GAP THIS CLOSES (and what #1509 already closed)
 * --------------------------------------------------------------------------
 * `resolveShellLandmarkSectionProps` is NODE-FIRST: a `site_header` /
 * `site_footer` landmark carrying inline `props.sectionProps` renders from the
 * TREE, and the addressed `cms_page_sections` slot is only the fallback.
 *
 * #1509 taught both inspectors to follow that on the SEEDED shell: the read
 * prefers the node's inline props, and the save mirrors the same computed props
 * onto the node after writing the section row. That fixed the "saved and
 * invisible" window, and it is kept here wholesale.
 *
 * What it could not fix is the state AFTER Phase 8B deletes the anchors.
 * `resolveHeaderSection` / `resolveFooterSection` still began at the slot
 * pointer, so with no pointer they returned `null` and both inspectors failed
 * with `NOT_FOUND` — the shell editor dies on a real agency's live site the
 * moment the migration completes. A mirror has nothing to mirror onto when
 * there is no row write to mirror FROM.
 *
 * So the resolution has to start from "who owns this landmark" rather than from
 * "find the slot row". That decision is this function, pure so all five states
 * are testable without a database:
 *
 *   - slot only               → `section` (every tenant today; unchanged)
 *   - node + slot, no inline  → `section` (the renderer reads the slot too)
 *   - node + slot, inline set → `section` (the row is still the CAS spine and
 *                               8B's rollback target; the caller MIRRORS to the
 *                               node — #1509's design, kept deliberately)
 *   - node only               → `node`    (no row to write; the node is it)
 *   - neither                 → `none`    (an honest empty state, never a
 *                                          success that saves nowhere)
 *
 * WHY THE THIRD ROW IS `section` AND NOT `node`
 * --------------------------------------------------------------------------
 * This is the one place the two designs actually disagreed, and #1509 is right
 * for the window where a row still exists. `saveSectionDraftAction` supplies
 * Zod validation, the `expectedVersion` CAS the inspector's autosave contract
 * hangs off, an audit entry and a revision row; none of that exists for
 * `cms_pages.blocks`. And while the anchors are still there, keeping the row
 * CURRENT is what makes 8B's rollback lossless — deleting a landmark's inline
 * `sectionProps` restores slot rendering against a live row rather than one
 * frozen at whenever the seed ran.
 *
 * Routing the save to the node ALONE in that window (the first cut of this
 * change) would have thrown all four away to save one write. It is only once
 * the row is gone that there is nothing left to throw away — and that is
 * exactly when `node` is returned. The two write paths are therefore selected
 * by a mutually exclusive condition (a section row exists, or it does not), not
 * by taste, so they cannot drift into disagreeing about the same input.
 */

import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import { readShellLandmarkInlineSectionProps } from "@/lib/site-admin/builder-node/shell-render-plan";
import type { ShellSideKey } from "@/lib/site-admin/builder-node/shell-render-plan";

export type { ShellSideKey };

/**
 * The inline `sectionProps` this side's landmark owns, or `null`.
 *
 * A thin re-export of the renderer's own reader — deliberately NOT a second
 * implementation. `readShellLandmarkInlineSectionProps` lives next to
 * `resolveShellLandmarkSectionProps` so the read precedence and the ownership
 * test can never drift; duplicating its "is this a plain object" rule here
 * would recreate exactly that drift.
 */
export function readLandmarkInlineProps(
  tree: BuilderNodeTree | null | undefined,
  side: ShellSideKey,
): Record<string, unknown> | null {
  if (!Array.isArray(tree)) return null;
  return readShellLandmarkInlineSectionProps(tree, side);
}

/** What the shell `cms_pages` row offers as a write target. */
export interface ShellLandmarkNodeCandidate {
  pageId: string;
  /**
   * `cms_pages.version`. It is a REAL optimistic-lock token on this row, not a
   * decorative counter: `republishSiteShellSnapshot` both filters on it
   * (`.eq("version", shell.version)`) and bumps it on every publish.
   */
  pageVersion: number;
  locale: string;
  /** `null` when the landmark is absent or does not own its config. */
  inlineProps: Record<string, unknown> | null;
}

/** What the legacy anchor row offers as a write target. */
export interface ShellLandmarkSectionCandidate {
  sectionId: string;
  sectionTypeKey: string;
  schemaVersion: number;
  name: string;
  /** `cms_sections.version` — the CAS token `saveSectionDraftAction` uses. */
  version: number;
  locale: string;
  props: Record<string, unknown>;
}

export type ShellLandmarkTarget =
  | {
      kind: "node";
      pageId: string;
      version: number;
      locale: string;
      props: Record<string, unknown>;
    }
  | ({ kind: "section" } & ShellLandmarkSectionCandidate & {
        /**
         * The landmark's inline props when it owns them. The section row is
         * still the write spine, and the caller mirrors this store too — but
         * the inspector must DISPLAY this, because it is what the renderer
         * reads. Showing the row's value here would put a stale header in the
         * drawer and then save it back over the node.
         */
        nodeInlineProps: Record<string, unknown> | null;
        pageId: string;
      })
  /** Nothing owns this landmark: no node, no row. An honest empty state. */
  | { kind: "none" };

/**
 * THE ownership rule. It must stay a mirror of
 * `resolveShellLandmarkSectionProps` on the READ side (node inline props win),
 * while the WRITE spine stays the section row for as long as one exists.
 *
 * Getting either half backwards is a silent failure: pick the row for reading
 * and the drawer shows what the site does not render; refuse the node when
 * there is no row and the editor is simply dead.
 */
export function pickShellLandmarkTarget(input: {
  node?: ShellLandmarkNodeCandidate | null;
  section?: ShellLandmarkSectionCandidate | null;
}): ShellLandmarkTarget {
  const { node, section } = input;
  if (section) {
    return {
      kind: "section",
      ...section,
      // Node-first for DISPLAY, exactly as the renderer resolves it.
      props: node?.inlineProps ?? section.props,
      nodeInlineProps: node?.inlineProps ?? null,
      pageId: node?.pageId ?? "",
    };
  }
  if (node && node.inlineProps) {
    return {
      kind: "node",
      pageId: node.pageId,
      version: node.pageVersion,
      locale: node.locale,
      props: node.inlineProps,
    };
  }
  return { kind: "none" };
}
