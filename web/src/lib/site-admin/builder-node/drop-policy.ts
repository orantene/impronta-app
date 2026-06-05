import { BUILDER_NODE_REGISTRY } from "./registry";
import type { BuilderNodeKind } from "./types";

export type BuilderDropCode =
  | "ROOT_KIND_NOT_ALLOWED"
  | "PARENT_KIND_UNKNOWN"
  | "PARENT_DOES_NOT_ALLOW_CHILDREN"
  | "CHILD_KIND_NOT_ALLOWED"
  | "SLOT_KIND_NOT_ALLOWED";

export type BuilderDropDecision =
  | { ok: true }
  | { ok: false; code: BuilderDropCode; message: string };

const ROOT_ALLOWED_KINDS: ReadonlySet<BuilderNodeKind> = new Set([
  "section",
  "container",
  "card",
  "cta_group",
  "split",
  "accordion",
  "tabs",
  "carousel",
  "masonry",
  // A lead/contact form is a standalone top-level page block.
  "form",
  // A Tulala component (directory/featured-talent/booking/cta) is a top-level
  // page block, so it may be dropped directly at the page root.
  "section_embed",
]);

export function builderNodeKindAllowedAtRoot(kind: BuilderNodeKind): boolean {
  return ROOT_ALLOWED_KINDS.has(kind);
}

export function canDropBuilderNode(input: {
  nodeKind: BuilderNodeKind;
  parentKind: BuilderNodeKind | null;
  slotAllowedKinds?: ReadonlyArray<BuilderNodeKind> | null;
}): BuilderDropDecision {
  if (input.slotAllowedKinds && !input.slotAllowedKinds.includes(input.nodeKind)) {
    return {
      ok: false,
      code: "SLOT_KIND_NOT_ALLOWED",
      message: `Slot does not allow node kind "${input.nodeKind}".`,
    };
  }

  if (input.parentKind === null) {
    if (builderNodeKindAllowedAtRoot(input.nodeKind)) return { ok: true };
    return {
      ok: false,
      code: "ROOT_KIND_NOT_ALLOWED",
      message: `Root cannot contain node kind "${input.nodeKind}".`,
    };
  }

  const parentEntry = BUILDER_NODE_REGISTRY[input.parentKind];
  if (!parentEntry) {
    return {
      ok: false,
      code: "PARENT_KIND_UNKNOWN",
      message: `Unknown parent kind "${input.parentKind}".`,
    };
  }
  if (parentEntry.children.type === "none") {
    return {
      ok: false,
      code: "PARENT_DOES_NOT_ALLOW_CHILDREN",
      message: `Parent kind "${input.parentKind}" does not allow children.`,
    };
  }
  if (parentEntry.children.type === "allow_list") {
    if (!parentEntry.children.kinds.includes(input.nodeKind)) {
      return {
        ok: false,
        code: "CHILD_KIND_NOT_ALLOWED",
        message: `Child kind "${input.nodeKind}" is not allowed under "${input.parentKind}".`,
      };
    }
  }
  return { ok: true };
}
