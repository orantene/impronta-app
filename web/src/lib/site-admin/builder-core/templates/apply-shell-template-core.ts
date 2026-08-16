/**
 * apply-shell-template-core.ts — PURE tree helpers for WS-A A7's
 * "apply a shell template to a tenant" flow. No I/O, no "use server", no Next
 * imports, so the node test runner can import it directly.
 *
 * A shell `builder_templates` row of kind `shell_header` / `shell_footer`
 * carries a freeform `builder_tree`. Applying it to a tenant writes that tree
 * onto the ONE targeted landmark of the tenant's `site_shell` `blocks` tree —
 * the header landmark for `shell_header`, the footer landmark for
 * `shell_footer` — leaving the OTHER landmark exactly as it was. The result is
 * always the slim two-landmark shape the shell edit surface + `renderBuilderNodes`
 * expect (see site-shell-surface-tree.ts).
 *
 * GUARDRAIL: this module never touches `cms_page_sections` or `composition[]`
 * (it only reshapes a freeform `BuilderNodeTree`), and is reached only behind the
 * shell edit flag (OFF by default) via the super-admin apply action.
 */

import { cloneNodeWithFreshIds } from "@/lib/site-admin/builder-node/operations";
import type {
  BuilderNode,
  BuilderNodeTree,
  BuilderSectionNode,
} from "@/lib/site-admin/builder-node/types";
import {
  buildSlimShellSectionNode,
  isShellLandmarkNode,
  SHELL_SLOT_ORDER,
  slimShellTree,
  type ShellSlotKey,
} from "@/lib/site-admin/builder-core/adapters/site-shell-surface-tree";
import type { BuilderTemplateKind } from "./registry-rows";

/** The two shell template kinds, and the landmark slot each one targets. */
export const SHELL_TEMPLATE_KINDS = ["shell_header", "shell_footer"] as const;
export type ShellTemplateKind = (typeof SHELL_TEMPLATE_KINDS)[number];

/** Narrow a generic template kind to a shell template kind (or null). */
export function asShellTemplateKind(
  kind: BuilderTemplateKind | string,
): ShellTemplateKind | null {
  return kind === "shell_header" || kind === "shell_footer" ? kind : null;
}

/** Which landmark slot a shell template kind writes onto. */
export function slotForShellTemplateKind(kind: ShellTemplateKind): ShellSlotKey {
  return kind === "shell_header" ? "header" : "footer";
}

/**
 * A7 follow-up — the `gallery_tab` a draft of `kind` must carry so the Lab
 * "+ New" / template-manager create flow produces a coherent row:
 *   - shell templates (`shell_header` / `shell_footer`) live ONLY on the "shell"
 *     tab (gated by the shell surface's allowedTabs).
 *   - `element` → "elements", `connected` → "connected", everything else
 *     (`section` / `page_template` / `starter_kit`) → its natural tab.
 * Pure so the create-draft kind wiring is unit-testable without React.
 */
export function galleryTabForTemplateKind(
  kind: BuilderTemplateKind,
): "sections" | "elements" | "connected" | "page_templates" | "shell" {
  switch (kind) {
    case "shell_header":
    case "shell_footer":
      return "shell";
    case "element":
      return "elements";
    case "connected":
      return "connected";
    case "page_template":
    case "starter_kit":
      return "page_templates";
    case "section":
    default:
      return "sections";
  }
}

/**
 * Re-mint the template's `builder_tree` into the freeform CHILDREN of the target
 * landmark. The template tree is shared/immutable, so every node id is freshly
 * minted (no collision with the tenant's other landmark or a prior apply). The
 * template may itself ship a `site_header` / `site_footer` landmark wrapper (when
 * it was authored from a backfilled shell): in that case we unwrap to its
 * children so we never nest a landmark inside a landmark.
 */
export function templateTreeToLandmarkChildren(
  templateTree: ReadonlyArray<BuilderNode>,
  slotKey: ShellSlotKey,
): BuilderNodeTree {
  // Unwrap a matching landmark wrapper (template authored from a shell) so its
  // children become the new landmark children directly.
  const unwrapped: BuilderNode[] = [];
  for (const node of templateTree) {
    if (isShellLandmarkNode(node)) {
      const nodeSlot =
        (node.props.slotKey as ShellSlotKey | undefined) ??
        (node.props.sectionTypeKey === "site_header" ? "header" : "footer");
      // Only unwrap the landmark that matches the slot we're filling; a
      // mismatched landmark (footer tree carrying a header wrapper) is dropped
      // so we never cross-pollinate slots.
      if (nodeSlot === slotKey) {
        unwrapped.push(...(node.children ?? []));
      }
      continue;
    }
    unwrapped.push(node);
  }
  return unwrapped.map((child) => cloneNodeWithFreshIds(child));
}

/**
 * Merge a shell template's tree onto the tenant's current shell `blocks` tree.
 *
 * - The CURRENT tree is first slimmed to the canonical two-landmark shape
 *   (header then footer); a missing landmark is synthesized empty so a partial
 *   tenant tree never drops a slot.
 * - The TARGET landmark's children are replaced with the re-minted template
 *   children. The OTHER landmark is preserved verbatim.
 * - The output is always `[header, footer]` in render order — exactly what the
 *   shell surface (and the published overlay) consume.
 *
 * Pure + idempotent given the same inputs (ids differ only because the template
 * children are re-minted on every call, which is the desired behaviour).
 */
export function applyShellTemplateToTree(input: {
  currentTree: BuilderNodeTree;
  templateTree: ReadonlyArray<BuilderNode>;
  kind: ShellTemplateKind;
}): BuilderSectionNode[] {
  const targetSlot = slotForShellTemplateKind(input.kind);
  const slimmed = slimShellTree(input.currentTree);
  const bySlot = new Map<ShellSlotKey, BuilderSectionNode>();
  for (const node of slimmed) {
    const slot = (node.props.slotKey as ShellSlotKey | undefined) ?? "header";
    bySlot.set(slot, node);
  }

  const newChildren = templateTreeToLandmarkChildren(
    input.templateTree,
    targetSlot,
  );

  const out: BuilderSectionNode[] = [];
  for (const slot of SHELL_SLOT_ORDER) {
    const existing = bySlot.get(slot);
    if (slot === targetSlot) {
      out.push(
        buildSlimShellSectionNode({
          id: existing?.id ?? `shell-${slot}`,
          slotKey: slot,
          children: newChildren,
          label: existing?.props.label ?? null,
          // Preserve the existing landmark's slot address across the apply.
          // Without it the freshly-applied template children are un-addressable
          // and never paint on the published site.
          sectionId:
            typeof existing?.props.sectionId === "string"
              ? existing.props.sectionId
              : null,
        }),
      );
    } else if (existing) {
      out.push(existing);
    } else {
      // The non-target landmark is absent in a partial tree — synthesize it
      // empty so the shell always carries both landmarks.
      out.push(
        buildSlimShellSectionNode({ id: `shell-${slot}`, slotKey: slot }),
      );
    }
  }
  return out;
}
