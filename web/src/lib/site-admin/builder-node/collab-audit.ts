import { collectBuilderPerformanceMetrics } from "./performance-budget";
import type { BuilderNodeOperationKind } from "./operations";
import type { BuilderNodeTree } from "./types";
import type { EditorMutation } from "../edit-mode/editor-mutations";

const BUILDER_MUTATION_AUDIT_WINDOW_KEY = "__improntaBuilderMutationAudit";
const BUILDER_MUTATION_AUDIT_LIMIT = 300;

export interface BuilderMutationAuditEvent {
  category: "builder-node";
  operation: BuilderNodeOperationKind;
  nodeId: string | null;
  parentId: string | null;
  sectionId: string | null;
  details: {
    sourceNodeId: string | null;
    targetParentId: string | null;
    resultNodeId: string | null;
    ownerSectionId: string | null;
    ownerSectionTypeKey: string | null;
    activeSelectionSectionId: string | null;
    activeSelectionNodeId: string | null;
  } | null;
  sectionCount: number;
  nodeCount: number;
  maxDepth: number;
  beforeSectionCount: number;
  beforeNodeCount: number;
  beforeMaxDepth: number;
  deltaSectionCount: number;
  deltaNodeCount: number;
  deltaMaxDepth: number;
  occurredAt: string;
}

export interface EditorDispatchAuditEvent {
  category: "editor-dispatch";
  operation: EditorMutation["kind"];
  nodeId: null;
  parentId: null;
  sectionId: string | null;
  details: {
    mutationDomain: "section" | "composition";
  } | null;
  sectionCount: number;
  nodeCount: number;
  maxDepth: number;
  beforeSectionCount: number;
  beforeNodeCount: number;
  beforeMaxDepth: number;
  deltaSectionCount: number;
  deltaNodeCount: number;
  deltaMaxDepth: number;
  occurredAt: string;
}

export type BuilderAuditEvent = BuilderMutationAuditEvent | EditorDispatchAuditEvent;

interface ResolvedSectionOwner {
  sectionId: string | null;
  sectionTypeKey: string | null;
}

function resolveSectionOwnerByNodeId(
  tree: BuilderNodeTree,
  nodeId: string | null | undefined,
): ResolvedSectionOwner {
  if (!nodeId) {
    return { sectionId: null, sectionTypeKey: null };
  }

  const walk = (
    nodes: BuilderNodeTree,
    currentSection: ResolvedSectionOwner,
  ): ResolvedSectionOwner | null => {
    for (const node of nodes) {
      const nextSection =
        node.kind === "section"
          ? {
              sectionId:
                typeof node.props.sectionId === "string" ? node.props.sectionId : null,
              sectionTypeKey:
                typeof node.props.sectionTypeKey === "string"
                  ? node.props.sectionTypeKey
                  : null,
            }
          : currentSection;
      if (node.id === nodeId) {
        return nextSection;
      }
      if ("children" in node && Array.isArray(node.children)) {
        const nested = walk(node.children, nextSection);
        if (nested) return nested;
      }
    }
    return null;
  };

  return (
    walk(tree, { sectionId: null, sectionTypeKey: null }) ?? {
      sectionId: null,
      sectionTypeKey: null,
    }
  );
}

export function createBuilderMutationAuditEvent(input: {
  operation: BuilderNodeOperationKind;
  nodeId?: string;
  parentId?: string | null;
  resultNodeId?: string | null;
  activeSelectionSectionId?: string | null;
  activeSelectionNodeId?: string | null;
  previousTree?: BuilderNodeTree;
  tree: BuilderNodeTree;
  now?: Date;
}): BuilderMutationAuditEvent {
  const previousMetrics = collectBuilderPerformanceMetrics(
    input.previousTree ?? input.tree,
  );
  const metrics = collectBuilderPerformanceMetrics(input.tree);
  const ownerFromResult = resolveSectionOwnerByNodeId(input.tree, input.resultNodeId);
  const ownerFromNode = resolveSectionOwnerByNodeId(input.tree, input.nodeId ?? null);
  const ownerFromParent = resolveSectionOwnerByNodeId(input.tree, input.parentId ?? null);
  const owner =
    ownerFromResult.sectionId || ownerFromNode.sectionId || ownerFromParent.sectionId
      ? ownerFromResult.sectionId
        ? ownerFromResult
        : ownerFromNode.sectionId
          ? ownerFromNode
          : ownerFromParent
      : { sectionId: null, sectionTypeKey: null };
  return {
    category: "builder-node",
    operation: input.operation,
    nodeId: input.nodeId ?? null,
    parentId: input.parentId ?? null,
    sectionId: owner.sectionId,
    details: {
      sourceNodeId: input.nodeId ?? null,
      targetParentId: input.parentId ?? null,
      resultNodeId: input.resultNodeId ?? null,
      ownerSectionId: owner.sectionId,
      ownerSectionTypeKey: owner.sectionTypeKey,
      activeSelectionSectionId: input.activeSelectionSectionId ?? null,
      activeSelectionNodeId: input.activeSelectionNodeId ?? null,
    },
    sectionCount: metrics.sectionCount,
    nodeCount: metrics.nodeCount,
    maxDepth: metrics.maxDepth,
    beforeSectionCount: previousMetrics.sectionCount,
    beforeNodeCount: previousMetrics.nodeCount,
    beforeMaxDepth: previousMetrics.maxDepth,
    deltaSectionCount: metrics.sectionCount - previousMetrics.sectionCount,
    deltaNodeCount: metrics.nodeCount - previousMetrics.nodeCount,
    deltaMaxDepth: metrics.maxDepth - previousMetrics.maxDepth,
    occurredAt: (input.now ?? new Date()).toISOString(),
  };
}

export function createEditorDispatchAuditEvent(input: {
  mutationKind: EditorMutation["kind"];
  sectionId?: string | null;
  previousTree?: BuilderNodeTree;
  tree: BuilderNodeTree;
  now?: Date;
}): EditorDispatchAuditEvent {
  const previousMetrics = collectBuilderPerformanceMetrics(
    input.previousTree ?? input.tree,
  );
  const metrics = collectBuilderPerformanceMetrics(input.tree);
  return {
    category: "editor-dispatch",
    operation: input.mutationKind,
    nodeId: null,
    parentId: null,
    sectionId: input.sectionId ?? null,
    details: {
      mutationDomain: input.mutationKind.startsWith("section.")
        ? "section"
        : "composition",
    },
    sectionCount: metrics.sectionCount,
    nodeCount: metrics.nodeCount,
    maxDepth: metrics.maxDepth,
    beforeSectionCount: previousMetrics.sectionCount,
    beforeNodeCount: previousMetrics.nodeCount,
    beforeMaxDepth: previousMetrics.maxDepth,
    deltaSectionCount: metrics.sectionCount - previousMetrics.sectionCount,
    deltaNodeCount: metrics.nodeCount - previousMetrics.nodeCount,
    deltaMaxDepth: metrics.maxDepth - previousMetrics.maxDepth,
    occurredAt: (input.now ?? new Date()).toISOString(),
  };
}

export function recordBuilderMutationAuditEvent(
  event: BuilderAuditEvent,
): void {
  if (typeof window === "undefined") return;
  // W4-T4(e): this is a DEV/QA audit aid (a `window.__improntaBuilderMutationAudit`
  // ring buffer inspected from the console). In production it is pure hot-path
  // cost — a full array spread + slice + window-write on EVERY mutation — with no
  // consumer. Drop it in prod so a busy edit session never pays for it.
  if (process.env.NODE_ENV === "production") return;
  const target = window as Window & {
    [BUILDER_MUTATION_AUDIT_WINDOW_KEY]?: BuilderAuditEvent[];
  };
  const current = target[BUILDER_MUTATION_AUDIT_WINDOW_KEY] ?? [];
  const next = [...current, event];
  target[BUILDER_MUTATION_AUDIT_WINDOW_KEY] =
    next.length > BUILDER_MUTATION_AUDIT_LIMIT
      ? next.slice(next.length - BUILDER_MUTATION_AUDIT_LIMIT)
      : next;
}
