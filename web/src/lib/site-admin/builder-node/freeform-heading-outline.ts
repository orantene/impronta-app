/**
 * Heading outline for freeform full-page designs.
 *
 * Curated CMS pages use composition slots (`flat` in the navigator). Freeform
 * one-click designs (e.g. Impronta homepage) have no slots — headings live on
 * `section_embed` config and standalone `heading` blocks in `builderTree`.
 * This walker mirrors document order so Outline mode works without slots.
 */

import {
  headingNodeFromSectionType,
  type HeadingNode,
} from "@/lib/site-admin/a11y/heading-hierarchy";

import type { BuilderNode, BuilderNodeTree } from "./types";

export function buildHeadingOutlineFromBuilderTree(
  tree: BuilderNodeTree,
): HeadingNode[] {
  const out: HeadingNode[] = [];

  const visit = (node: BuilderNode) => {
    if (node.kind === "section_embed") {
      const config = (node.props.config ?? {}) as Record<string, unknown>;
      const heading = headingNodeFromSectionType(
        node.props.sectionTypeKey,
        config,
        node.id,
      );
      if (heading) out.push(heading);
    } else if (node.kind === "heading") {
      const text = node.props.text.trim();
      if (text) {
        out.push({
          level: node.props.level,
          text,
          sectionId: node.id,
          sectionTypeKey: "heading",
        });
      }
    }

    if ("children" in node && Array.isArray(node.children)) {
      for (const child of node.children) visit(child);
    }
  };

  for (const root of tree) visit(root);
  return out;
}
