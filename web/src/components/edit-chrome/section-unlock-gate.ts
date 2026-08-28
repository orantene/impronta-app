/**
 * The two data-loss traps around "Unlock design", in one place.
 *
 * TRAP 1 — "Add block inside" a LOCKED curated section destroyed the block.
 * `BUILDER_NODE_REGISTRY.section.children` allows 22 child kinds, so the UI
 * happily offered the insert. But `syncBuilderTreeSectionChildren` re-derives a
 * non-ejected section's children from the curated config on the NEXT curated
 * field edit, so the inserted block was silently wiped: no warning, no undo
 * affordance, nothing to notice. That same function already returns early for
 * `props.ejected` sections, so the fix is to make the INSERT PATH UNLOCK FIRST
 * (`unlockSectionBeforeInsert` below) rather than to add another guard.
 *
 * TRAP 2 — unlocking a section whose type derives NO children left it BLANK.
 * `sectionTypeHasDerivableChildren` (single source of truth: the deriver table
 * in `snapshot-slot-bridge.ts`) answers whether unlocking can produce anything;
 * `resolveSectionUnlockGate` turns that into what the UI should render.
 */

import {
  isCompositionOwnedSectionType,
  sectionTypeHasDerivableChildren,
} from "@/lib/site-admin/builder-node/snapshot-slot-bridge";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

/**
 * Section types that may NOT be ejected to freeform: the already-freeform
 * blank_section, and the site-shell sections (header/footer), which render via
 * PublishedShell with no eject gate — ejecting them would double-render.
 */
export const NON_EJECTABLE_SECTION_TYPE_KEYS = new Set<string>([
  "blank_section",
  "site_header",
  "site_footer",
]);

export type SectionUnlockGate =
  /** Full editing is one click away. */
  | "unlockable"
  /** Offer the affordance, DISABLED, with an honest reason: unlocking this
   * type would derive nothing and leave the operator staring at a blank
   * section. */
  | "no-layers"
  /** No affordance at all: already freeform, or shell-owned. */
  | "not-offered";

export function resolveSectionUnlockGate(
  sectionTypeKey: string,
): SectionUnlockGate {
  if (NON_EJECTABLE_SECTION_TYPE_KEYS.has(sectionTypeKey)) return "not-offered";
  return sectionTypeHasDerivableChildren(sectionTypeKey)
    ? "unlockable"
    : "no-layers";
}

/** English keys; the ES side lives in `editor-i18n-es-canvas.ts`. */
export const SECTION_UNLOCK_EMPTY_LABEL = "Nothing to unlock yet";
export const SECTION_UNLOCK_EMPTY_HINT =
  "This section has no separate layers to unlock, so unlocking it would leave it blank.";

/**
 * Would a block dropped inside this node be silently re-derived away?
 *
 * True only for a LOCKED curated section that cannot be unlocked. A locked
 * section that CAN be unlocked is fine — the insert path unlocks it first. A
 * composition-owned `blank_section` is fine too: `syncBuilderTreeSectionChildren`
 * never re-derives over it.
 */
export function sectionRejectsNestedInsert(
  node: BuilderNode | null | undefined,
): boolean {
  if (!node || node.kind !== "section") return false;
  if (node.props.ejected === true) return false;
  if (isCompositionOwnedSectionType(node.props.sectionTypeKey)) return false;
  return resolveSectionUnlockGate(node.props.sectionTypeKey) !== "unlockable";
}

/**
 * TRAP 1's fix. Called immediately before an insert commits into `node`.
 *
 * For a locked curated section it performs the LOSSLESS unlock first (the
 * caller passes `ejectSection`, which is `runEjectSection` from
 * `eject-lossless.ts` bound to the shared undo/commit spine) so the section
 * carries `props.ejected` by the time the block lands — and therefore survives
 * every later curated field edit. For anything else it is a no-op.
 *
 * Unlock is lossless (saved per-role styling is carried across) and reversible
 * (Relock, which asks for confirmation), so it runs SILENTLY: the operator
 * asked to put a block inside, and unlocking is the mechanical precondition,
 * not a decision worth a modal.
 */
export async function unlockSectionBeforeInsert(input: {
  node: BuilderNode | null | undefined;
  ejectSection: (
    sectionNodeId: string,
  ) => Promise<{ ok: boolean; error?: string }>;
}): Promise<{ ok: boolean; error?: string }> {
  const { node, ejectSection } = input;
  if (!node || node.kind !== "section") return { ok: true };
  if (node.props.ejected === true) return { ok: true };
  if (isCompositionOwnedSectionType(node.props.sectionTypeKey)) return { ok: true };
  if (resolveSectionUnlockGate(node.props.sectionTypeKey) !== "unlockable") {
    // Callers must not offer the insert here at all (see
    // `sectionRejectsNestedInsert`); refuse rather than lose the block.
    return { ok: false, error: SECTION_UNLOCK_EMPTY_HINT };
  }
  return ejectSection(node.id);
}
