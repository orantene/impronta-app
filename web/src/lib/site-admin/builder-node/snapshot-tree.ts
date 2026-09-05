import { improntaLog } from "@/lib/server/structured-log";
import {
  buildLegacySectionBuilderTree,
  deriveLegacySectionChildNodes,
  type LegacySnapshotSlot,
} from "./snapshot-slot-bridge";
import { builderNodeKindAllowedAtRoot } from "./drop-policy";
import { BUILDER_NODE_REGISTRY } from "./registry";
import { migrateMonolithicTalentTypeGridEmbeds } from "./talent-discipline-freeform";
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
  /**
   * True when the snapshot's tree failed validation and the page is being
   * served from the tree with its invalid nodes REMOVED (see
   * `salvageBuilderTree`). `issues` then names what was dropped, by path.
   */
  salvaged?: boolean;
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
  // `slots` is typed required, but an edit-mode draft snapshot built from a
  // pure builderTree (e.g. the agency homepage in edit mode) can arrive with it
  // undefined — which crashed the canvas at `.some(...)`. Normalize to [] so the
  // resolver never throws and the legacy-slot helpers just see "no legacy slots".
  const slots = snapshot.slots ?? [];
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
      const hasSlotMissingFromTree = slots.some((slot) => {
        const key = builderSectionNodeAddressKey({
          sectionId: slot.sectionId,
          slotKey: slot.slotKey,
          sortOrder: slot.sortOrder,
        });
        return Boolean(key && !sectionIndex.has(key));
      });
      if (hasSlotMissingFromTree) {
        tree = reconcileBuilderTreeWithLegacySlots(tree, slots);
      }
      tree = migrateMonolithicTalentTypeGridEmbeds(
        migrateUnboundGallerySectionsToContainers(
          hydrateLegacySectionChildren(tree, slots),
        ),
      );
      return {
        source: "snapshot_builder_tree",
        tree,
        issues: [],
      };
    }
    // A VALIDATOR THAT REFUSES IS RIGHT; A FALLBACK THAT ANSWERS WITH NOTHING
    // IS NOT. Three blank El Paisa pages on 2026-09-05 had one shape: one bad
    // node somewhere (a repeater the renderer would not accept, an invalid
    // token write, two paragraphs emptied by a stripped placeholder), the
    // whole tree refused here, and the page-less fallback's `slots: []` served
    // a header, a footer and nothing between, silently. So: drop the nodes the
    // validator named, re-validate, and serve the rest. Only when nothing can
    // be salvaged does this fall to the legacy slots, exactly as before.
    const salvaged = salvageBuilderTree(snapshot.builderTree, parsed.issues);
    if (salvaged) {
      reportSalvage(parsed.issues, salvaged.dropped);
      return {
        source: "snapshot_builder_tree",
        tree: salvaged.tree,
        issues: parsed.issues,
        salvaged: true,
      };
    }
    reportSalvage(parsed.issues, []);
    const fallback = buildLegacySectionBuilderTree(slots);
    return {
      source: "legacy_slots",
      tree: fallback,
      issues: parsed.issues,
    };
  }

  return {
    source: "legacy_slots",
    tree: buildLegacySectionBuilderTree(slots),
    issues: [],
  };
}

/** Maximum prune-and-revalidate rounds; a dropped node can expose a new issue in its parent. */
const SALVAGE_ROUNDS = 4;

/**
 * The node path (indices into `children`) named by a validator issue path such
 * as `root.0.children.2.children.0.props.text`, or null when the issue is not
 * about a node (e.g. `root` itself).
 */
export function issueNodePath(issuePath: string): number[] | null {
  const parts = issuePath.split(".");
  if (parts[0] !== "root" || parts.length < 2) return null;
  const out: number[] = [];
  let i = 1;
  while (i < parts.length) {
    const idx = Number(parts[i]);
    if (!Number.isInteger(idx) || idx < 0) break;
    out.push(idx);
    if (parts[i + 1] !== "children") break;
    i += 2;
  }
  return out.length > 0 ? out : null;
}

function removeNodeAtPath(tree: unknown[], path: ReadonlyArray<number>): boolean {
  let siblings: unknown[] = tree;
  for (let d = 0; d < path.length - 1; d++) {
    const node = siblings[path[d]!] as { children?: unknown } | undefined;
    if (!node || !Array.isArray(node.children)) return false;
    siblings = node.children;
  }
  const last = path[path.length - 1]!;
  if (last >= siblings.length) return false;
  siblings.splice(last, 1);
  return true;
}

/**
 * Drop the nodes a validation pass named, re-validate, repeat a bounded number
 * of times. Returns the validated remainder and the paths dropped, or null when
 * the input is not a tree at all or nothing could be removed.
 */
export function salvageBuilderTree(
  input: unknown,
  issues: ReadonlyArray<BuilderNodeValidationIssue>,
): { tree: BuilderNodeTree; dropped: string[] } | null {
  if (!Array.isArray(input)) return null;
  const working: unknown[] = structuredClone(input) as unknown[];
  let currentIssues = issues;
  const dropped: string[] = [];
  for (let round = 0; round < SALVAGE_ROUNDS; round++) {
    const paths = currentIssues
      .map((issue) => issueNodePath(issue.path))
      .filter((p): p is number[] => p !== null);
    if (paths.length === 0) return null;
    // Deepest and rightmost first, so earlier splices do not shift later paths.
    const unique = Array.from(new Map(paths.map((p) => [p.join("."), p])).values()).sort(
      (a, b) => b.length - a.length || b.join(".").localeCompare(a.join(".")),
    );
    let removedAny = false;
    for (const p of unique) {
      if (removeNodeAtPath(working, p)) {
        removedAny = true;
        dropped.push(`root.${p.join(".children.")}`);
      }
    }
    if (!removedAny) return null;
    if (working.length === 0) return null;
    const again = validateBuilderNodeTree(working);
    if (again.ok) return { tree: again.tree, dropped };
    currentIssues = again.issues;
  }
  return null;
}

function reportSalvage(
  issues: ReadonlyArray<BuilderNodeValidationIssue>,
  dropped: ReadonlyArray<string>,
): void {
  // The structured logger deliberately avoids `next/headers`, so it is safe on
  // this module's two runtimes (server render path and the editor bundle).
  void improntaLog("site_admin_snapshot_tree.warn", {
    message:
      dropped.length > 0
        ? "[snapshot-tree] builder tree failed validation; serving it WITHOUT the invalid node(s)"
        : "[snapshot-tree] builder tree failed validation and could not be salvaged; serving legacy slots",
    // The structured logger takes scalar fields; the paths travel as one string.
    dropped: dropped.join(", "),
    issues: issues
      .slice(0, 8)
      .map((i) => `${i.path}: ${i.message}`)
      .join(" | "),
  });
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
    snapshot.slots ?? [],
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
 * Legacy Add Gallery root wrapper (`sectionTypeKey: custom`, no slot binding).
 * New templates insert `container` directly — see `migrateUnboundGallerySectionsToContainers`.
 */
export function isUnboundGallerySectionNode(
  node: BuilderNode,
): node is Extract<BuilderNode, { kind: "section" }> {
  return (
    node.kind === "section" &&
    node.props.sectionTypeKey === "custom" &&
    !node.props.sectionId
  );
}

/** Root gallery / freeform blocks not painted by the composition slot loop. */
export function isUnboundRootGalleryBlock(node: BuilderNode): boolean {
  if (node.kind === "section") {
    return isUnboundGallerySectionNode(node);
  }
  return builderNodeKindAllowedAtRoot(node.kind);
}

export function collectUnboundRootGalleryBlocks(
  tree: BuilderNodeTree,
): ReadonlyArray<BuilderNode> {
  return tree.filter(isUnboundRootGalleryBlock);
}

/** @deprecated Prefer {@link collectUnboundRootGalleryBlocks}. */
export function collectUnboundRootGallerySections(
  tree: BuilderNodeTree,
): ReadonlyArray<Extract<BuilderNode, { kind: "section" }>> {
  return tree.filter(isUnboundGallerySectionNode);
}

function migrateUnboundGallerySectionsToContainers(
  tree: BuilderNodeTree,
): BuilderNodeTree {
  let changed = false;
  const next = tree.map((node) => {
    if (!isUnboundGallerySectionNode(node)) return node;
    changed = true;
    const label = node.props.label?.trim() || "Container";
    // Spread `...node` so base-field carriers (locked, lockedProps,
    // visibilityCondition) survive the section→container migration; without it
    // an admin lock silently drops the first time the tree is normalized.
    return {
      ...node,
      kind: "container",
      props: {
        layerLabel: label,
        layout: "stack",
        gap: "m",
        align: "stretch",
      },
      children: node.children ?? [],
    } satisfies BuilderNode;
  });
  return changed ? next : tree;
}

export function unboundGallerySectionIdsSignature(
  tree: BuilderNodeTree,
): string {
  return collectUnboundRootGalleryBlocks(tree)
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
