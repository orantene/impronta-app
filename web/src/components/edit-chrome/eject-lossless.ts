// W4-T3 — client-side wiring for the LOSSLESS eject. The per-role
// `nodePresentation` a user set in the Design panel lives in the section's
// SAVED props, so it must be fetched before `ejectSectionInTree` runs; this
// wrapper binds the tree lookup + server action to the pure resolver so
// edit-context stays a one-call site. Best-effort by contract: any miss
// resolves undefined and the caller falls through to the lossy eject.
import { loadSectionForEditAction } from "@/lib/site-admin/edit-mode/section-actions";
import {
  ejectSectionInTree,
  unejectSectionInTree,
  resolveEjectRolePresentation,
  type EjectRolePresentation,
} from "@/lib/site-admin/builder-node/section-eject";
import { findBuilderNodeById } from "./inspectors/builder-node-content-utils";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

export async function resolveEjectRolePresentationForNode(
  tree: BuilderNodeTree,
  sectionNodeId: string,
): Promise<EjectRolePresentation | undefined> {
  return resolveEjectRolePresentation(
    findBuilderNodeById(tree, sectionNodeId),
    async (sectionId) => {
      const loaded = await loadSectionForEditAction(sectionId);
      return loaded.ok
        ? (loaded.section.props as Record<string, unknown>)
        : null;
    },
  );
}

// The shared commit spine, structurally typed so this module needs no import
// from edit-context (which would be a cycle).
type ExecuteBuilderNodeOperation = (input: {
  operation: "patch";
  nodeId: string;
  run: (tree: BuilderNodeTree) => { ok: true; tree: BuilderNodeTree };
}) => Promise<{ ok: boolean; error?: string }>;

/** Full lossless-eject flow: resolve saved styling, then commit the 3-arg
 * `ejectSectionInTree(tree, sectionNodeId, rolePresentation)` patch. */
export async function runEjectSection(
  tree: BuilderNodeTree,
  sectionNodeId: string,
  execute: ExecuteBuilderNodeOperation,
): Promise<{ ok: boolean; error?: string; ejected?: boolean }> {
  const rolePresentation = await resolveEjectRolePresentationForNode(
    tree,
    sectionNodeId,
  );
  let didEject = false;
  const result = await execute({
    operation: "patch",
    nodeId: sectionNodeId,
    run: (current) => {
      const out = ejectSectionInTree(current, sectionNodeId, rolePresentation);
      didEject = out.ejected;
      return { ok: true, tree: out.tree };
    },
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, ejected: didEject };
}

/** Reverse: clear the ejected flag so the curated design re-derives. The
 * caller is responsible for confirming — this destroys freeform children. */
export async function runUnejectSection(
  sectionNodeId: string,
  execute: ExecuteBuilderNodeOperation,
): Promise<{ ok: boolean; error?: string; ejected?: boolean }> {
  let didUneject = false;
  const result = await execute({
    operation: "patch",
    nodeId: sectionNodeId,
    run: (current) => {
      const out = unejectSectionInTree(current, sectionNodeId);
      didUneject = out.ejected;
      return { ok: true, tree: out.tree };
    },
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, ejected: didUneject };
}
