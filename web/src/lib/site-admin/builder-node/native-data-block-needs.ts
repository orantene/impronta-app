/**
 * Pure walk over a builder tree for native data-block fetch needs.
 *
 * Kept free of server / Next imports so unit tests under
 * `test:builder-node-bindings` (no `server-only` mock) can import it.
 */
import type { BuilderNode } from "./types";

export function collectNativeDataBlockNeeds(nodes: ReadonlyArray<BuilderNode>): {
  needsTalentCount: boolean;
  menuBoard: boolean;
  disciplines: {
    maxItems: number;
    parentCategoryMode: boolean;
    selectedTermIds?: string[];
  } | null;
} {
  let needsTalentCount = false;
  let menuBoard = false;
  let disciplines: {
    maxItems: number;
    parentCategoryMode: boolean;
    selectedTermIds?: string[];
  } | null = null;

  const visit = (node: BuilderNode) => {
    if (
      node.kind === "hero_search" &&
      node.props.statSource === "tenant_talent_count"
    ) {
      needsTalentCount = true;
    }
    if (node.kind === "menu_board") {
      menuBoard = true;
    }
    if (node.kind === "talent_type_grid" && node.props.mode === "dynamic") {
      const maxItems = node.props.maxItems ?? 7;
      const selected = node.props.selectedTermIds ?? [];
      if (!disciplines) {
        disciplines = {
          maxItems,
          parentCategoryMode: node.props.parentCategoryMode === true,
          ...(selected.length > 0 ? { selectedTermIds: [...selected] } : {}),
        };
      } else {
        disciplines.maxItems = Math.max(disciplines.maxItems, maxItems);
        disciplines.parentCategoryMode =
          disciplines.parentCategoryMode || node.props.parentCategoryMode === true;
        if (selected.length === 0) {
          delete disciplines.selectedTermIds;
        } else if (disciplines.selectedTermIds) {
          disciplines.selectedTermIds = [
            ...new Set([...disciplines.selectedTermIds, ...selected]),
          ];
        }
      }
    }
    if ("children" in node && Array.isArray(node.children)) {
      for (const child of node.children) visit(child);
    }
  };
  for (const node of nodes) visit(node);
  return { needsTalentCount, menuBoard, disciplines };
}
