/**
 * The shell inspectors' bridge to the FREEFORM tree.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * `resolveShellLandmarkSectionProps` (shipped, live) makes a shell landmark's
 * own inline `props.sectionProps` win over the addressed `cms_page_sections`
 * slot on BOTH render paths. Phase 8B seeds those inline props so the legacy
 * anchor rows can be deleted.
 *
 * The SiteHeaderInspector and SiteFooterInspector autosave to
 * `cms_sections.props_jsonb` — the slot side. The moment a landmark carries
 * inline props, those writes stop reaching the live site: the operator edits
 * header configuration, sees the success state, and nothing changes. This
 * module closes that window by MIRRORING the same computed props onto the
 * landmark node, so the thing the inspector edits is the thing that renders.
 *
 * BOTH STORES ARE WRITTEN, DELIBERATELY
 * -------------------------------------
 * The `cms_sections` write stays exactly where it is, unchanged. It is the
 * spine the inspector's whole contract hangs off: `saveSectionDraftAction`
 * supplies Zod validation, the CAS `expectedVersion` check the inspector's
 * autosave uses to detect a concurrent editor, the audit entry and the revision
 * row. None of that exists for `cms_pages.blocks`, and reinventing four
 * mechanisms to save one write is a far worse trade than the drift risk.
 *
 * The drift risk is also small by construction: this mirror runs inside the
 * same action, from the SAME `nextProps` object the row write used, and only
 * AFTER that row write has committed. The two cannot diverge through the
 * inspector path. What the row buys in exchange is Phase 8B's rollback: while
 * the anchor rows still exist, deleting a landmark's inline `sectionProps`
 * restores slot rendering against a row that is still current rather than one
 * frozen at whenever the migration ran.
 *
 * ORDERING IS LOAD-BEARING: the caller must mirror BEFORE
 * `republishSiteShellSnapshot`, because the republish bakes `cms_pages.blocks`
 * into `published_page_snapshot.builderTree` and the renderer reads the
 * snapshot. Mirroring after the bake would persist correctly and still show the
 * operator nothing until the next unrelated publish.
 *
 * NOT A PROMOTION PATH. See `applyShellLandmarkSectionProps` for why a landmark
 * that does not already own its props is left strictly alone — on every shell
 * alive today that means this module performs NO `cms_pages` write whatsoever
 * and the behaviour is identical to before it existed.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  applyShellLandmarkSectionProps,
  readShellLandmarkInlineSectionProps,
  type ShellSideKey,
} from "@/lib/site-admin/builder-node/shell-render-plan";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

/** The shell page's freeform draft tree, or `null` when there isn't one. */
async function readShellDraftTree(
  supabase: SupabaseClient,
  tenantId: string,
  shellPageId: string,
): Promise<BuilderNodeTree | null> {
  const { data } = await supabase
    .from("cms_pages")
    .select("blocks")
    .eq("id", shellPageId)
    .eq("tenant_id", tenantId)
    .maybeSingle<{ blocks: unknown }>();
  if (!data || !Array.isArray(data.blocks)) return null;
  return data.blocks as BuilderNodeTree;
}

/**
 * The inline `sectionProps` this side's landmark owns, or `null` when it is
 * slot-owned (or the shell has no freeform tree at all).
 *
 * Callers use it as the FIRST source for the inspector's displayed values,
 * falling back to `cms_sections.props_jsonb` — the same precedence the renderer
 * applies, which is the whole point.
 */
export async function readShellLandmarkOwnedProps(
  supabase: SupabaseClient,
  input: { tenantId: string; shellPageId: string; side: ShellSideKey },
): Promise<Record<string, unknown> | null> {
  const tree = await readShellDraftTree(
    supabase,
    input.tenantId,
    input.shellPageId,
  );
  if (!tree) return null;
  return readShellLandmarkInlineSectionProps(tree, input.side);
}

export type ShellLandmarkMirrorResult =
  | { ok: true; mirrored: boolean }
  | { ok: false; error: string };

/**
 * Mirror `nextProps` onto this side's landmark node when — and only when — that
 * landmark already owns its config inline.
 *
 * `mirrored: false` is the ordinary, expected answer for every shell that has
 * not been through Phase 8B: nothing was written, and the `cms_sections` row
 * the caller already saved is what the renderer reads.
 *
 * The UPDATE is surgical. It rewrites `blocks` with a tree in which exactly one
 * node's `props.sectionProps` differs; every other root, every landmark on the
 * other side, and the landmark's own operator-added `children` are carried
 * through by reference.
 */
export async function mirrorShellLandmarkSectionProps(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    shellPageId: string;
    side: ShellSideKey;
    nextProps: Record<string, unknown>;
  },
): Promise<ShellLandmarkMirrorResult> {
  const tree = await readShellDraftTree(
    supabase,
    input.tenantId,
    input.shellPageId,
  );
  if (!tree) return { ok: true, mirrored: false };

  const { tree: nextTree, changed } = applyShellLandmarkSectionProps(
    tree,
    input.side,
    input.nextProps,
  );
  if (!changed) return { ok: true, mirrored: false };

  const { error } = await supabase
    .from("cms_pages")
    .update({ blocks: nextTree })
    .eq("id", input.shellPageId)
    .eq("tenant_id", input.tenantId);
  if (error) {
    // Fail LOUD. A swallowed error here is precisely the silent failure this
    // module exists to remove: the row saved, the node did not, and the live
    // site keeps rendering the old header while the inspector says "saved".
    return {
      ok: false,
      error:
        "Saved the section, but could not update the site shell layout. " +
        "Reload and try again.",
    };
  }
  return { ok: true, mirrored: true };
}
