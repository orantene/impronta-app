import test from "node:test";
import assert from "node:assert/strict";

import {
  collectBuilderPerformanceIssues,
  collectBuilderPerformanceMetrics,
} from "./performance-budget";
import type { BuilderNodeTree } from "./types";

test("collectBuilderPerformanceMetrics counts sections, nodes, and depth", () => {
  const tree: BuilderNodeTree = [
    {
      id: "section-1",
      kind: "section",
      props: { sectionTypeKey: "hero" },
      children: [
        {
          id: "container-1",
          kind: "container",
          props: { layout: "stack" },
          children: [
            {
              id: "heading-1",
              kind: "heading",
              props: { text: "Hello", level: 2 },
            },
          ],
        },
      ],
    },
  ];

  const metrics = collectBuilderPerformanceMetrics(tree);
  assert.equal(metrics.sectionCount, 1);
  assert.equal(metrics.nodeCount, 3);
  assert.equal(metrics.maxDepth, 3);
});

test("collectBuilderPerformanceIssues warns only when thresholds are exceeded", () => {
  const issues = collectBuilderPerformanceIssues({
    sectionCount: 25,
    nodeCount: 190,
    maxDepth: 8,
  });

  assert.deepEqual(
    issues.map((issue) => issue.id).sort(),
    ["depth", "node-count", "section-count"],
  );
  assert.ok(issues.every((issue) => issue.severity === "warn"));
});

test("collectBuilderPerformanceIssues escalates to errors past hard thresholds", () => {
  const issues = collectBuilderPerformanceIssues({
    sectionCount: 40,
    nodeCount: 320,
    maxDepth: 10,
  });
  assert.deepEqual(
    issues.map((issue) => issue.id).sort(),
    ["depth", "node-count", "section-count"],
  );
  assert.ok(issues.every((issue) => issue.severity === "error"));
});

test("collectBuilderPerformanceIssues returns empty list under budget", () => {
  const issues = collectBuilderPerformanceIssues({
    sectionCount: 8,
    nodeCount: 42,
    maxDepth: 4,
  });
  assert.equal(issues.length, 0);
});
