import {
  buildLegacySectionBuilderTree,
  deriveLegacySectionChildNodes,
  type LegacySnapshotSlot,
} from "./snapshot-slot-bridge";
import { BUILDER_NODE_REGISTRY } from "./registry";
import { resolveBuilderNodeRole, type BuilderNodeRole } from "./role-bindings";
import { sectionEmbedTypeLabel } from "./section-embed-presets";
import type { BuilderNode, BuilderNodeTree } from "./types";
import {
  validateBuilderNodeTree,
  type BuilderNodeValidationIssue,
} from "./validate";

export type BuilderTreeSource = "snapshot_builder_tree" | "legacy_slots";

export interface SnapshotBuilderTreeResolution {
  source: BuilderTreeSource;
  tree: BuilderNodeTree;
  issues: ReadonlyArray<BuilderNodeValidationIssue>;
}

export type PublishBuilderTreeResolution =
  | { ok: true; source: BuilderTreeSource; tree: BuilderNodeTree }
  | { ok: false; issues: ReadonlyArray<BuilderNodeValidationIssue> };

export interface SnapshotWithBuilderTree {
  slots: ReadonlyArray<LegacySnapshotSlot>;
  builderTree?: unknown;
}

export interface BuilderSectionNodeAddress {
  sectionId: string;
  slotKey?: string | null;
  sortOrder?: number;
}

export interface BuilderSectionChildNode {
  id: string;
  kind: BuilderNode["kind"];
  depth: number;
  parentId: string;
  label: string;
  role: BuilderNodeRole | null;
}

const ROLE_LABELS: Readonly<Record<BuilderNodeRole, string>> = {
  headline: "Headline",
  subheadline: "Subheadline",
  copy: "Copy",
  primaryCta: "Primary CTA",
  secondaryCta: "Secondary CTA",
  footerCta: "Footer CTA",
};

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncateLabel(value: string, maxLength = 40): string {
  const compact = compactWhitespace(value);
  if (!compact) return "";
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1)}…`;
}

function humanizeSectionTypeKey(key: string): string {
  return key
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function stripInlineMarkers(value: string): string {
  return value
    .replace(/\{\/?(?:b|i|accent)\}/g, "")
    .replace(/\{color:#[0-9a-fA-F]{3,8}\}/g, "")
    .replace(/\{\/color\}/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

function findFirstHeadingText(
  nodes: readonly BuilderNode[],
  depth: number,
): string | undefined {
  for (const child of nodes) {
    if (child.kind === "heading") {
      const text = stripInlineMarkers(child.props.text).trim();
      if (text) return text;
    }
  }
  if (depth <= 0) return undefined;
  for (const child of nodes) {
    const grandchildren = (child as { children?: BuilderNode[] }).children;
    if (grandchildren && grandchildren.length > 0) {
      const found = findFirstHeadingText(grandchildren, depth - 1);
      if (found) return found;
    }
  }
  return undefined;
}

function resolveBuilderNodeLabel(node: BuilderNode): string {
  const role = resolveBuilderNodeRole(node.id);
  if (role) return ROLE_LABELS[role];

  if (node.kind === "heading") {
    const text = truncateLabel(stripInlineMarkers(node.props.text));
    return text || "Heading";
  }
  if (node.kind === "paragraph") {
    const text = truncateLabel(stripInlineMarkers(node.props.text));
    return text || "Paragraph";
  }
  if (node.kind === "button") {
    const label = truncateLabel(stripInlineMarkers(node.props.label));
    return label ? `Button: ${label}` : "Button";
  }
  if (node.kind === "container") {
    const children = (node as { children?: BuilderNode[] }).children ?? [];
    if (children.length === 1) {
      const only = children[0];
      if (only && (only.kind === "section_embed" || only.kind === "heading")) {
        return resolveBuilderNodeLabel(only);
      }
    }
    const heading = findFirstHeadingText(children, 1);
    if (heading) return truncateLabel(heading);
    return node.props.layout === "row"
      ? "Row"
      : node.props.layout === "grid"
        ? "Grid"
        : "Stack";
  }
  if (node.kind === "section_embed") {
    const key = node.props.sectionTypeKey;
    return (
      sectionEmbedTypeLabel(key) ??
      humanizeSectionTypeKey(key) ??
      BUILDER_NODE_REGISTRY.section_embed.label
    );
  }
  if (node.kind === "image") {
    const alt = truncateLabel(node.props.alt ?? "");
    return alt ? `Image: ${alt}` : "Image";
  }
  if (node.kind === "divider") {
    return node.props.tone === "muted" ? "Divider (muted)" : "Divider";
  }
  if (node.kind === "spacer") {
    return `Spacer (${String(node.props.size).toUpperCase()})`;
  }
  if (node.kind === "accordion_item" || node.kind === "tab_panel") {
    const title = truncateLabel(node.props.title);
    if (title) {
      return node.kind === "accordion_item"
        ? `Accordion item: ${title}`
        : `Tab panel: ${title}`;
    }
  }
  if (node.kind === "section") {
    const sectionLabel = truncateLabel(node.props.label ?? "");
    if (sectionLabel) return sectionLabel;
  }
  return BUILDER_NODE_REGISTRY[node.kind].label;
}

export function builderSectionNodeAddressKey(
  address: BuilderSectionNodeAddress,
): string | null {
  if (!address.sectionId) return null;
  const slotKey = address.slotKey ?? "";
  // Align with `compositionRowsToLegacySlots` / DB (`Number(e.sortOrder ?? 0))`).
  // Section nodes from older clients may omit `sortOrder`; using `""` here
  // produced `sid:slot:` keys that never matched `sid:slot:0` from snapshot
  // slots — composition children (e.g. blank_section) failed to bind on canvas.
  const sortOrder =
    typeof address.sortOrder === "number" && Number.isFinite(address.sortOrder)
      ? address.sortOrder
      : 0;
  return `${address.sectionId}:${slotKey}:${sortOrder}`;
}

export function resolveSnapshotBuilderTree(
  snapshot: SnapshotWithBuilderTree,
): SnapshotBuilderTreeResolution {
  if (snapshot.builderTree != null) {
    const parsed = validateBuilderNodeTree(snapshot.builderTree);
    if (parsed.ok) {
      // Client saves (e.g. create+insert) can send an up-to-date `slots` array
      // while `builderTree` still omits the new section root — the tree stays
      // structurally valid, so we merge against authoritative slots before
      // hydration. Skip when every slot address is already indexed so we do
      // not drop orphan snapshot sections when `slots` is empty (legacy tests).
      let tree = parsed.tree;
      const sectionIndex = indexBuilderSectionNodeIds(tree);
      const hasSlotMissingFromTree = snapshot.slots.some((slot) => {
        const key = builderSectionNodeAddressKey({
          sectionId: slot.sectionId,
          slotKey: slot.slotKey,
          sortOrder: slot.sortOrder,
        });
        return Boolean(key && !sectionIndex.has(key));
      });
      if (hasSlotMissingFromTree) {
        tree = reconcileBuilderTreeWithLegacySlots(tree, snapshot.slots);
      }
      return {
        source: "snapshot_builder_tree",
        tree: hydrateLegacySectionChildren(tree, snapshot.slots),
        issues: [],
      };
    }
    const fallback = buildLegacySectionBuilderTree(snapshot.slots);
    return {
      source: "legacy_slots",
      tree: fallback,
      issues: parsed.issues,
    };
  }

  return {
    source: "legacy_slots",
    tree: buildLegacySectionBuilderTree(snapshot.slots),
    issues: [],
  };
}

export function resolveSnapshotBuilderTreeForPublish(
  snapshot: SnapshotWithBuilderTree,
): PublishBuilderTreeResolution {
  const resolved = resolveSnapshotBuilderTree(snapshot);
  if (resolved.issues.length > 0) {
    return {
      ok: false,
      issues: resolved.issues,
    };
  }
  const alignmentIssues = validateBuilderTreeSectionSlotAlignment(
    resolved.tree,
    snapshot.slots,
  );
  if (alignmentIssues.length > 0) {
    return {
      ok: false,
      issues: alignmentIssues,
    };
  }
  return {
    ok: true,
    source: resolved.source,
    tree: resolved.tree,
  };
}

export function summarizeBuilderTreeIssues(
  issues: ReadonlyArray<Pick<BuilderNodeValidationIssue, "path" | "message">>,
): string {
  return issues
    .slice(0, 3)
    .map((issue) => `${issue.path}: ${issue.message}`)
    .join("; ");
}

function validateBuilderTreeSectionSlotAlignment(
  tree: BuilderNodeTree,
  slots: ReadonlyArray<LegacySnapshotSlot>,
): ReadonlyArray<BuilderNodeValidationIssue> {
  const issues: BuilderNodeValidationIssue[] = [];
  const expectedSlotKeys = new Set<string>();
  for (const slot of slots) {
    const key = builderSectionNodeAddressKey({
      sectionId: slot.sectionId,
      slotKey: slot.slotKey,
      sortOrder: slot.sortOrder,
    });
    if (key) {
      expectedSlotKeys.add(key);
    }
  }

  const sectionIndex = indexBuilderSectionNodeIds(tree);
  const actualSlotKeys = new Set(sectionIndex.keys());

  for (const slotKey of expectedSlotKeys) {
    if (!actualSlotKeys.has(slotKey)) {
      issues.push({
        path: "builderTree",
        message: `missing section node for composition slot "${slotKey}"`,
      });
    }
  }

  for (const [slotKey, nodeId] of sectionIndex.entries()) {
    if (!expectedSlotKeys.has(slotKey)) {
      issues.push({
        path: "builderTree",
        message: `section node "${nodeId}" has no matching composition slot`,
      });
    }
  }

  return issues;
}

function hydrateLegacySectionChildren(
  tree: BuilderNodeTree,
  slots: ReadonlyArray<LegacySnapshotSlot>,
): BuilderNodeTree {
  const slotByAddress = new Map<string, LegacySnapshotSlot>();
  for (const slot of slots) {
    const key = builderSectionNodeAddressKey({
      sectionId: slot.sectionId,
      slotKey: slot.slotKey,
      sortOrder: slot.sortOrder,
    });
    if (key) slotByAddress.set(key, slot);
  }

  return tree.map((node) => {
    if (node.kind !== "section") return node;
    // Ejected ("2018 bye-bye") sections own their content as roleless freeform
    // children — never re-derive curated role nodes into them, even if a user
    // emptied them out.
    if (node.props.ejected) return node;
    if (node.children && node.children.length > 0) return node;
    const key = builderSectionNodeAddressKey({
      sectionId: node.props.sectionId ?? "",
      slotKey: node.props.slotKey,
      sortOrder: node.props.sortOrder,
    });
    if (!key) return node;
    const slot = slotByAddress.get(key);
    if (!slot) return node;
    const children = deriveLegacySectionChildNodes(node.id, slot);
    if (children.length === 0) return node;
    return { ...node, children };
  });
}

/**
 * Root-level custom sections inserted via Add Gallery (`sectionTypeKey: custom`,
 * no `sectionId` / slot binding). These are not rendered by the composition
 * slot loop — callers must paint them separately.
 */
export function collectUnboundRootGallerySections(
  tree: BuilderNodeTree,
): ReadonlyArray<Extract<BuilderNode, { kind: "section" }>> {
  return tree.filter(
    (node): node is Extract<BuilderNode, { kind: "section" }> =>
      node.kind === "section" &&
      node.props.sectionTypeKey === "custom" &&
      !node.props.sectionId,
  );
}

export function unboundGallerySectionIdsSignature(
  tree: BuilderNodeTree,
): string {
  return collectUnboundRootGallerySections(tree)
    .map((node) => node.id)
    .sort()
    .join(",");
}

export function indexBuilderSectionNodeIds(
  tree: BuilderNodeTree,
): ReadonlyMap<string, string> {
  const out = new Map<string, string>();

  function walk(node: BuilderNode): void {
    if (node.kind === "section") {
      const key = builderSectionNodeAddressKey({
        sectionId: node.props.sectionId ?? "",
        slotKey: node.props.slotKey,
        sortOrder: node.props.sortOrder,
      });
      if (key && !out.has(key)) {
        out.set(key, node.id);
      }
      return;
    }
    if ("children" in node) {
      node.children.forEach(walk);
    }
  }

  tree.forEach(walk);
  return out;
}

export function indexBuilderSectionNodes(
  tree: BuilderNodeTree,
): ReadonlyMap<string, Extract<BuilderNode, { kind: "section" }>> {
  const out = new Map<string, Extract<BuilderNode, { kind: "section" }>>();

  function walk(node: BuilderNode): void {
    if (node.kind === "section") {
      const key = builderSectionNodeAddressKey({
        sectionId: node.props.sectionId ?? "",
        slotKey: node.props.slotKey,
        sortOrder: node.props.sortOrder,
      });
      if (key && !out.has(key)) {
        out.set(key, node);
      }
      return;
    }
    if ("children" in node) {
      node.children.forEach(walk);
    }
  }

  tree.forEach(walk);
  return out;
}

export function indexBuilderSectionChildNodeIds(
  tree: BuilderNodeTree,
): ReadonlyMap<string, ReadonlyArray<string>> {
  const out = new Map<string, string[]>();
  const indexed = indexBuilderSectionChildNodes(tree);
  for (const [sectionNodeId, nodes] of indexed.entries()) {
    out.set(
      sectionNodeId,
      nodes.map((node) => node.id),
    );
  }
  return out;
}

export function indexBuilderSectionChildNodes(
  tree: BuilderNodeTree,
): ReadonlyMap<string, ReadonlyArray<BuilderSectionChildNode>> {
  const out = new Map<string, BuilderSectionChildNode[]>();

  function walk(
    node: BuilderNode,
    sectionNodeId: string | null,
    parentId: string | null,
    depth: number,
  ): void {
    if (node.kind === "section") {
      const nextSectionNodeId = node.id;
      if (!out.has(nextSectionNodeId)) {
        out.set(nextSectionNodeId, []);
      }
      if ("children" in node && Array.isArray(node.children)) {
        node.children.forEach((child) =>
          walk(child, nextSectionNodeId, nextSectionNodeId, 1),
        );
      }
      return;
    }

    if (sectionNodeId && parentId) {
      const bucket = out.get(sectionNodeId);
      if (bucket) {
        bucket.push({
          id: node.id,
          kind: node.kind,
          depth,
          parentId,
          label: resolveBuilderNodeLabel(node),
          role: resolveBuilderNodeRole(node.id),
        });
      }
    }

    if ("children" in node && Array.isArray(node.children)) {
      node.children.forEach((child) =>
        walk(
          child,
          sectionNodeId,
          node.id,
          sectionNodeId ? depth + 1 : depth,
        ),
      );
    }
  }

  tree.forEach((node) => walk(node, null, null, 0));
  return out;
}

function collectNodeIds(node: BuilderNode, out: Set<string>): void {
  out.add(node.id);
  if ("children" in node && Array.isArray(node.children)) {
    node.children.forEach((child) => collectNodeIds(child, out));
  }
}

/**
 * Reconcile a section-slot update against an existing builder tree.
 *
 * Phase 4 bridge behavior:
 * - Section nodes are always derived from authoritative slots.
 * - Existing section node ids are preserved by sectionId when possible so
 *   current EditShell selection identity stays stable across reorder/move.
 * - Non-section root nodes are preserved verbatim, allowing future typed
 *   component nodes to coexist while section-first editing remains active.
 */
export function reconcileBuilderTreeWithLegacySlots(
  previousTree: BuilderNodeTree,
  slots: ReadonlyArray<LegacySnapshotSlot>,
): BuilderNodeTree {
  const nextSectionNodes = buildLegacySectionBuilderTree(slots);
  if (previousTree.length === 0) {
    return nextSectionNodes;
  }

  const sectionNodeIdBySectionId = new Map<string, string>();
  const sectionChildrenBySectionId = new Map<string, ReadonlyArray<BuilderNode>>();
  // "2018 bye-bye" — preserve the ejected flag across reconcile; rebuilt section
  // nodes come from slots (which carry no flag), so without this an ejected
  // section would lose `ejected` and double-render (curated + freeform).
  const sectionEjectedBySectionId = new Map<string, boolean>();
  const nonSectionRoots: BuilderNode[] = [];
  const usedIds = new Set<string>();

  function walk(node: BuilderNode): void {
    if (node.kind === "section") {
      const sectionId = node.props.sectionId ?? null;
      if (sectionId && !sectionNodeIdBySectionId.has(sectionId)) {
        sectionNodeIdBySectionId.set(sectionId, node.id);
      }
      if (
        sectionId &&
        !sectionChildrenBySectionId.has(sectionId) &&
        Array.isArray(node.children) &&
        node.children.length > 0
      ) {
        sectionChildrenBySectionId.set(sectionId, node.children);
      }
      if (sectionId && node.props.ejected) {
        sectionEjectedBySectionId.set(sectionId, true);
      }
      return;
    }
    if ("children" in node) {
      node.children.forEach(walk);
    }
  }

  for (const node of previousTree) {
    if (node.kind === "section") {
      walk(node);
      continue;
    }
    nonSectionRoots.push(node);
    collectNodeIds(node, usedIds);
    walk(node);
  }

  const sectionNodesWithStableIds = nextSectionNodes.map((node) => {
    if (node.kind !== "section") return node;
    const sectionId = node.props.sectionId ?? null;
    const preferredId =
      (sectionId ? sectionNodeIdBySectionId.get(sectionId) : null) ?? node.id;
    let nextId = preferredId;
    if (usedIds.has(nextId)) {
      let suffix = 1;
      while (usedIds.has(`${preferredId}:${suffix}`)) {
        suffix += 1;
      }
      nextId = `${preferredId}:${suffix}`;
    }
    usedIds.add(nextId);
    const preservedChildren =
      !Array.isArray(node.children) || node.children.length === 0
        ? (sectionId ? sectionChildrenBySectionId.get(sectionId) : null)
        : null;
    const wasEjected = sectionId
      ? sectionEjectedBySectionId.get(sectionId) === true
      : false;
    let withStableId = nextId === node.id ? node : { ...node, id: nextId };
    if (wasEjected && !withStableId.props.ejected) {
      withStableId = {
        ...withStableId,
        props: { ...withStableId.props, ejected: true },
      };
    }
    if (preservedChildren && preservedChildren.length > 0) {
      return {
        ...withStableId,
        children: [...preservedChildren],
      };
    }
    // BUG-1 fix: a section that was just un-ejected (or any rebuilt section with
    // no derived children) must carry an explicit empty array, never undefined —
    // otherwise downstream tree walks treat the node as structurally malformed
    // and an un-ejected-then-empty section silently drops out of the snapshot.
    if (!Array.isArray(withStableId.children)) {
      return { ...withStableId, children: [] };
    }
    return withStableId;
  });

  return nonSectionRoots.length > 0
    ? [...nonSectionRoots, ...sectionNodesWithStableIds]
    : sectionNodesWithStableIds;
}
