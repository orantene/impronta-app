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

export type DuplicateRoute =
  | { route: "section"; sectionId: string }
  | { route: "node" };

export function resolveDuplicateRoute(
  tree: BuilderNodeTree,
  nodeId: string,
): DuplicateRoute {
  const found = findBuilderNodeById(tree, nodeId);
  if (!found || found.kind !== "section") return { route: "node" };
  const sectionId = (found.props as { sectionId?: string | null }).sectionId;
  return typeof sectionId === "string" && sectionId !== ""
    ? { route: "section", sectionId }
    : { route: "node" };
}
