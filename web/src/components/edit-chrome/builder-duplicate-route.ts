/**
 * TUL-78 #6 — which duplicate lane a builder node takes.
 *
 * The node-level duplicate refuses `section` nodes (cloning one would copy its
 * `sectionId` and leave two nodes pointing at one DB section), so the floating
 * toolbar's Duplicate on a section-backed block dead-ended in a red "change
 * blocked" toast. A section node that is backed by a real section row now
 * routes to the section duplicate (new row, fresh ids); everything else keeps
 * the node duplicate. Pure so it is unit-testable.
 */

import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import { findBuilderNodeById } from "./inspectors/builder-node-content-utils";

const NESTED_SECTION_MESSAGE =
  "This section sits inside another block, so it cannot be duplicated on its own. Select the outer section and duplicate that, or add a copy from Add.";

export type DuplicateRoute =
  | { route: "section"; sectionId: string }
  | { route: "node" }
  // A section row nested inside another block is not in the page's section
  // slots, so the section duplicate cannot place a copy (it created a row that
  // never reached the canvas: "Duplicate does nothing"). Say so instead.
  | { route: "unsupported"; reason: "nested-section"; message: string };

export function resolveDuplicateRoute(
  tree: BuilderNodeTree,
  nodeId: string,
): DuplicateRoute {
  const found = findBuilderNodeById(tree, nodeId);
  if (!found || found.kind !== "section") return { route: "node" };
  const sectionId = (found.props as { sectionId?: string | null }).sectionId;
  if (typeof sectionId !== "string" || sectionId === "") return { route: "node" };
  const atPageRoot = tree.some((n) => n.id === nodeId);
  return atPageRoot
    ? { route: "section", sectionId }
    : { route: "unsupported", reason: "nested-section", message: NESTED_SECTION_MESSAGE };
}
