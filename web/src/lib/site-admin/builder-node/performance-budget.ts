import type { BuilderNodeTree } from "./types";

export interface BuilderPerformanceMetrics {
  sectionCount: number;
  nodeCount: number;
  maxDepth: number;
}

export interface BuilderPerformanceIssue {
  id: "section-count" | "node-count" | "depth";
  message: string;
  severity: "warn" | "error";
}

export const BUILDER_PERFORMANCE_BUDGET = Object.freeze({
  sectionCountWarn: 20,
  sectionCountError: 36,
  nodeCountWarn: 160,
  nodeCountError: 280,
  depthWarn: 6,
  depthError: 8,
});

export function collectBuilderPerformanceMetrics(
  tree: BuilderNodeTree,
): BuilderPerformanceMetrics {
  let sectionCount = 0;
  let nodeCount = 0;
  let maxDepth = 0;

  const walk = (nodes: BuilderNodeTree, depth: number) => {
    if (depth > maxDepth) maxDepth = depth;
    for (const node of nodes) {
      nodeCount += 1;
      if (node.kind === "section") sectionCount += 1;
      if ("children" in node && Array.isArray(node.children) && node.children.length) {
        walk(node.children, depth + 1);
      }
    }
  };

  walk(tree, 1);
  return { sectionCount, nodeCount, maxDepth };
}

export function collectBuilderPerformanceIssues(
  metrics: BuilderPerformanceMetrics,
): BuilderPerformanceIssue[] {
  const issues: BuilderPerformanceIssue[] = [];
  if (metrics.sectionCount > BUILDER_PERFORMANCE_BUDGET.sectionCountError) {
    issues.push({
      id: "section-count",
      severity: "error",
      message: `Navigator has ${metrics.sectionCount} sections. Reduce active sections before publish for stable editor performance.`,
    });
  } else if (metrics.sectionCount > BUILDER_PERFORMANCE_BUDGET.sectionCountWarn) {
    issues.push({
      id: "section-count",
      severity: "warn",
      message: `Navigator has ${metrics.sectionCount} sections. Consider collapsing unused sections while editing.`,
    });
  }
  if (metrics.nodeCount > BUILDER_PERFORMANCE_BUDGET.nodeCountError) {
    issues.push({
      id: "node-count",
      severity: "error",
      message: `Builder tree has ${metrics.nodeCount} nodes. Trim nested blocks before publish to protect editing responsiveness.`,
    });
  } else if (metrics.nodeCount > BUILDER_PERFORMANCE_BUDGET.nodeCountWarn) {
    issues.push({
      id: "node-count",
      severity: "warn",
      message: `Builder tree has ${metrics.nodeCount} nodes. Large trees can slow navigator updates.`,
    });
  }
  if (metrics.maxDepth > BUILDER_PERFORMANCE_BUDGET.depthError) {
    issues.push({
      id: "depth",
      severity: "error",
      message: `Builder tree depth is ${metrics.maxDepth}. Flatten deep nesting before publish to avoid unstable interactions.`,
    });
  } else if (metrics.maxDepth > BUILDER_PERFORMANCE_BUDGET.depthWarn) {
    issues.push({
      id: "depth",
      severity: "warn",
      message: `Builder tree depth is ${metrics.maxDepth}. Deep nesting can hurt editing responsiveness.`,
    });
  }
  return issues;
}
