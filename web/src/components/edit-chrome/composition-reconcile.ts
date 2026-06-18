// Composition-reconcile pure helpers — peeled out of edit-context.tsx (Phase 6
// Tier-3 god-file decomposition). These transform composition snapshot/slot data
// into the builder-tree shapes the editor saves/renders. They are pure: every
// function depends only on its arguments plus imported helpers, and none close
// over EditProvider component state, refs, or setState. Behavior is byte-identical
// to the original definitions; edit-context.tsx imports them back in.

import type { CompositionSectionRef } from "@/lib/site-admin/edit-mode/composition-actions";
import {
  buildLegacySectionBuilderTree,
  deriveLegacySectionChildNodes,
  isCompositionOwnedSectionType,
  reconcileBuilderTreeWithLegacySlots,
  type BuilderNode,
  type BuilderNodeTree,
  type LegacySnapshotSlot,
} from "@/lib/site-admin/builder-node";

import { normalizeCompositionSlots } from "./composition-slots";
import type { CompositionSnapshot } from "./edit-context";

export function stripSnapshotForSave(s: CompositionSnapshot) {
  const normalized = normalizeCompositionSlots(s.slots);
  const slots: Record<string, Array<{ sectionId: string; sortOrder: number }>> =
    {};
  for (const [k, v] of Object.entries(normalized)) {
    slots[k] = v.map((e) => ({ sectionId: e.sectionId, sortOrder: e.sortOrder }));
  }
  return {
    metadata: s.metadata,
    slots,
  };
}

export function toLegacySnapshotSlots(
  slots: Record<string, CompositionSectionRef[]>,
): LegacySnapshotSlot[] {
  return Object.entries(slots).flatMap(([slotKey, entries]) =>
    entries.map((entry) => ({
      slotKey,
      sortOrder: entry.sortOrder,
      sectionId: entry.sectionId,
      sectionTypeKey: entry.sectionTypeKey,
      name: entry.name,
    })),
  );
}

export function buildBuilderTreeFromSlots(
  slots: Record<string, CompositionSectionRef[]>,
): BuilderNodeTree {
  return buildLegacySectionBuilderTree(toLegacySnapshotSlots(slots));
}

export function reconcileBuilderTreeFromSlots(
  previousTree: BuilderNodeTree,
  slots: Record<string, CompositionSectionRef[]>,
): BuilderNodeTree {
  // A freeform full-page design (one-click starter design) has a builderTree
  // with NO curated slots. Reconciling it against zero slots strips the whole
  // tree (no section maps to any slot), leaving the editor with an empty tree
  // and an unselectable canvas — the root cause of "clicking a freeform block
  // does nothing". There is nothing to reconcile when there are no slots, so
  // keep the freeform tree intact.
  if (Object.keys(slots).length === 0) return previousTree;
  return reconcileBuilderTreeWithLegacySlots(
    previousTree,
    toLegacySnapshotSlots(slots),
  );
}

export function syncBuilderTreeSectionChildren(
  tree: BuilderNodeTree,
  input: {
    sectionId: string;
    sectionTypeKey: string;
    props: Record<string, unknown>;
  },
): BuilderNodeTree {
  let changed = false;

  const visit = (node: BuilderNode): BuilderNode => {
    if (node.kind === "section" && node.props.sectionId === input.sectionId) {
      // "2018 bye-bye" — an ejected section owns its roleless freeform children;
      // never re-derive curated role nodes over them on a field edit.
      if (node.props.ejected) {
        return node;
      }
      if (isCompositionOwnedSectionType(input.sectionTypeKey)) {
        return node;
      }
      const nextChildren = deriveLegacySectionChildNodes(node.id, {
        slotKey: node.props.slotKey ?? "body",
        sortOrder: node.props.sortOrder ?? 0,
        sectionId: input.sectionId,
        sectionTypeKey: input.sectionTypeKey,
        name: node.props.label ?? input.sectionTypeKey,
        props: input.props,
      });
      const currentChildren = Array.isArray(node.children) ? node.children : [];
      const equalLength = currentChildren.length === nextChildren.length;
      const equalNodes =
        equalLength &&
        currentChildren.every((current, index) => {
          const next = nextChildren[index];
          if (!next) return false;
          return (
            current.id === next.id &&
            current.kind === next.kind &&
            JSON.stringify(current.props) === JSON.stringify(next.props)
          );
        });
      if (equalNodes) return node;
      changed = true;
      if (nextChildren.length === 0) {
        const sectionWithoutChildren = { ...node };
        delete sectionWithoutChildren.children;
        return sectionWithoutChildren;
      }
      return {
        ...node,
        children: nextChildren,
      };
    }

    if ("children" in node && Array.isArray(node.children) && node.children.length > 0) {
      const currentChildren = node.children;
      const nextChildren = currentChildren.map(visit);
      const childrenChanged = nextChildren.some(
        (child, index) => child !== currentChildren[index],
      );
      if (!childrenChanged) return node;
      changed = true;
      return {
        ...node,
        children: nextChildren,
      };
    }

    return node;
  };

  const nextTree = tree.map(visit);
  return changed ? nextTree : tree;
}
