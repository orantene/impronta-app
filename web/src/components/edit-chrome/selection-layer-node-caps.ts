/**
 * Chrome-preserving adapters around `resolveNodeCapabilities`.
 *
 * selection-layer.tsx calls the pin at capability gates. Where the pin and
 * today's chrome disagree, these helpers KEEP chrome's observable so adoption
 * is a rewire, not a redesign.
 */

import { gateNestedInsertKinds } from "@/lib/site-admin/builder-node/element-library-policy";
import {
  NODE_CAPABILITY_REASONS,
  resolveNodeCapabilities,
  type NodeCapabilityContext,
  type NodeCapabilityDevice,
  type NodeCapabilities,
} from "@/lib/site-admin/builder-node/node-capabilities";
import { BUILDER_NODE_REGISTRY } from "@/lib/site-admin/builder-node/registry";
import type { BuilderNode, BuilderNodeKind } from "@/lib/site-admin/builder-node/types";

import { sectionRejectsNestedInsert } from "./section-unlock-gate";

export function capabilityContext(input: {
  device: string;
  advancedElementLibraryEnabled: boolean;
  canInsertRawHtmlElements: boolean;
  multiNodeSelectionActive: boolean;
}): NodeCapabilityContext {
  const device: NodeCapabilityDevice =
    input.device === "tablet" || input.device === "mobile"
      ? input.device
      : "desktop";
  return {
    device,
    advancedElementLibraryEnabled: input.advancedElementLibraryEnabled,
    canInsertRawHtmlElements: input.canInsertRawHtmlElements,
    multiNodeSelectionActive: input.multiNodeSelectionActive,
  };
}

export function isSectionShell(
  node: BuilderNode,
  ctx: NodeCapabilityContext,
): boolean {
  return resolveNodeCapabilities(node, ctx).reasons.includes(
    NODE_CAPABILITY_REASONS.sectionNotBlock,
  );
}

/**
 * Drop-parent lock and marquee skip: section OR role-bound OR self-locked.
 * Matches chrome today. Pin `select` is always true (marquee is a gesture
 * filter, not `select`); pin `insertChildren` is true for some sections.
 */
export function isStructuralOrSelfLocked(
  node: BuilderNode,
  ctx: NodeCapabilityContext,
): boolean {
  const caps = resolveNodeCapabilities(node, ctx);
  return caps.propsPanel !== "full" || caps.lockState === "self";
}

/**
 * Nested-insert kinds offered by the chip / insert menu.
 *
 * Pin `insertChildKinds` is [] for self-locked nodes. Chrome still lists
 * kinds; the context menu hides "Add block inside" via `nodeLocked`.
 */
export function chromeInsertChildKinds(
  node: BuilderNode,
  ctx: NodeCapabilityContext,
): BuilderNodeKind[] {
  const caps = resolveNodeCapabilities(node, ctx);
  if (caps.lockState !== "self") return caps.insertChildKinds;
  if (sectionRejectsNestedInsert(node)) return [];
  const policy = BUILDER_NODE_REGISTRY[node.kind]?.children;
  const raw = policy && policy.type === "allow_list" ? [...policy.kinds] : [];
  return gateNestedInsertKinds(
    raw,
    ctx.advancedElementLibraryEnabled === true,
    ctx.canInsertRawHtmlElements === true,
  );
}

/**
 * Section unlock affordance gate. Pin `canUnlock` is false for no-layers
 * (would hide the row); chrome still shows it disabled. Map reasons so the
 * three-state gate stays identical to `resolveSectionUnlockGate`.
 */
export function chromeSectionUnlockGate(
  caps: NodeCapabilities,
): "unlockable" | "no-layers" | "not-offered" {
  if (!caps.reasons.includes(NODE_CAPABILITY_REASONS.sectionNotBlock)) {
    return "not-offered";
  }
  if (caps.reasons.includes(NODE_CAPABILITY_REASONS.unlockNotOffered)) {
    return "not-offered";
  }
  if (caps.reasons.includes(NODE_CAPABILITY_REASONS.unlockNoLayers)) {
    return "no-layers";
  }
  return "unlockable";
}
