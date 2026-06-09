import { resolveAddGalleryInsertAction } from "./insert";
import { getAddGalleryItemById } from "./registry";
import type { AddGalleryItem } from "./types";

export interface AddGalleryInsertDeps {
  insertBuilderNode: (
    parentId: string | null,
    kind: import("@/lib/site-admin/builder-node/types").BuilderNode["kind"],
    index?: number,
  ) => Promise<{ ok: boolean; error?: string; nodeId?: string }>;
  insertBuilderSectionEmbed: (
    parentId: string | null,
    sectionTypeKey: string,
    index?: number,
  ) => Promise<{ ok: boolean; error?: string; nodeId?: string }>;
  insertBuilderComponent: (
    parentId: string | null,
    subtreeJson: string,
    index?: number,
  ) => Promise<{ ok: boolean; error?: string; nodeId?: string }>;
}

export async function performAddGalleryInsert(
  item: AddGalleryItem,
  target: { parentId: string | null; index?: number },
  deps: AddGalleryInsertDeps,
): Promise<{ ok: boolean; error?: string; nodeId?: string }> {
  const action = resolveAddGalleryInsertAction(item);
  const { parentId, index } = target;

  switch (action.type) {
    case "noop":
      return { ok: false, error: "This item is not available yet." };
    case "nativeNode":
    case "sectionTemplate":
      return deps.insertBuilderComponent(
        parentId,
        JSON.stringify(action.node),
        index,
      );
    case "sectionEmbed":
    case "connectedNode":
      return deps.insertBuilderSectionEmbed(
        parentId,
        action.sectionTypeKey,
        index,
      );
    default:
      return { ok: false, error: "Unsupported insert action." };
  }
}

export async function performAddGalleryInsertById(
  itemId: string,
  target: { parentId: string | null; index?: number },
  deps: AddGalleryInsertDeps,
): Promise<{ ok: boolean; error?: string; nodeId?: string }> {
  const item = getAddGalleryItemById(itemId);
  if (!item) {
    return { ok: false, error: "Gallery item not found." };
  }
  return performAddGalleryInsert(item, target, deps);
}
