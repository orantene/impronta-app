// Commit a palette drag-drop onto the canvas.
//
// Extracted from `selection-layer.tsx` because the SAME commit ran in two drop
// handlers (the pointer-driven palette drag and the native HTML5 drop), and
// both inserted into the drop parent WITHOUT unlocking it first. Dropping into
// a still-locked curated section is the same data-loss trap the rail/click path
// (`commitNodeInsert`) fixes: `syncBuilderTreeSectionChildren` re-derives that
// section's children on the next curated field edit, so the dropped block
// silently disappears. One shared entry point means the guard cannot be fixed
// on one path and forgotten on the other.
import { findBuilderNodeById } from "./inspectors/builder-node-content-utils";
import { unlockSectionBeforeInsert } from "./section-unlock-gate";
import {
  performAddGalleryInsertById,
  type AddGalleryInsertDeps,
} from "@/lib/site-admin/add-gallery/perform-insert";
import type { BuilderNodeKind, BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

export type CanvasPaletteDropPayload =
  | { kind: "gallery_item"; itemId: string }
  | { kind: "section_embed"; sectionTypeKey: string }
  | { kind: "element"; elementKind: BuilderNodeKind };

export interface CanvasPaletteDropDeps extends AddGalleryInsertDeps {
  builderTree: BuilderNodeTree;
  ejectSection: (
    sectionNodeId: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  reportMutationError: (message: string) => void;
  selectBuilderNode: (nodeId: string) => void;
}

export async function commitCanvasPaletteDrop(input: {
  payload: CanvasPaletteDropPayload;
  parentNodeId: string | null;
  index: number;
  deps: CanvasPaletteDropDeps;
}): Promise<void> {
  const { payload, parentNodeId, index, deps } = input;
  const unlocked = await unlockSectionBeforeInsert({
    node: parentNodeId ? findBuilderNodeById(deps.builderTree, parentNodeId) : null,
    ejectSection: deps.ejectSection,
  });
  if (!unlocked.ok) {
    deps.reportMutationError(unlocked.error ?? "");
    return;
  }
  const result =
    payload.kind === "gallery_item"
      ? await performAddGalleryInsertById(
          payload.itemId,
          { parentId: parentNodeId, index },
          deps,
        )
      : payload.kind === "section_embed"
        ? await deps.insertBuilderSectionEmbed(
            parentNodeId,
            payload.sectionTypeKey,
            index,
          )
        : await deps.insertBuilderNode(parentNodeId, payload.elementKind, index);
  if (!result.ok && result.error) deps.reportMutationError(result.error);
  else if (result.ok && result.nodeId) deps.selectBuilderNode(result.nodeId);
}
