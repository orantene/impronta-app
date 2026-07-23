import assert from "node:assert/strict";
import { test } from "node:test";

import { collectMobileOverflowPreflightIssues } from "./publish-preflight-mobile-overflow";
import type {
  BuilderContainerNode,
  BuilderNodeTree,
} from "@/lib/site-admin/builder-node/types";

// A fixed 1120px-wide container inside a section — the canonical mobile-broken page.
function treeWithFixedWidthContainer(widthPx: number): BuilderNodeTree {
  const container: BuilderContainerNode = {
    id: "offender",
    kind: "container",
    props: { layout: "stack", style: { width: `${widthPx}px` } },
    children: [],
  };
  return [
    {
      id: "sec",
      kind: "section",
      props: { sectionId: "sec-1", sectionTypeKey: "hero" },
      children: [container],
    },
  ];
}

test("a fixed 1120px container becomes a blocking mobile_overflow error", () => {
  const issues = collectMobileOverflowPreflightIssues(
    treeWithFixedWidthContainer(1120),
  );
  assert.equal(issues.length, 1);
  const [issue] = issues;
  assert.equal(issue!.severity, "error");
  assert.equal(issue!.category, "mobile_overflow");
  assert.equal(issue!.nodeId, "offender");
  assert.equal(issue!.sectionId, "sec-1");
  assert.ok(issue!.message.includes("1120px"));
  assert.ok(/horizontal scrolling/i.test(issue!.message));
});

test("every emitted overflow issue is severity=error (a page that overflows cannot ship)", () => {
  const issues = collectMobileOverflowPreflightIssues(
    treeWithFixedWidthContainer(900),
  );
  assert.ok(issues.length > 0);
  assert.ok(issues.every((i) => i.severity === "error"));
  assert.ok(issues.every((i) => i.category === "mobile_overflow"));
});

test("a clean responsive tree yields zero blocking overflow issues (publishes normally)", () => {
  const clean: BuilderNodeTree = [
    {
      id: "root",
      kind: "container",
      props: {
        layout: "stack",
        style: { width: "100%", maxWidthFree: "1120px" },
      },
      children: [
        { id: "h", kind: "heading", props: { text: "Hi", level: 2 } },
        { id: "p", kind: "paragraph", props: { text: "Body copy" } },
      ],
    },
  ];
  assert.deepEqual(collectMobileOverflowPreflightIssues(clean), []);
});

test("soft heuristics (3-col grid, non-collapsing split) do NOT block publish", () => {
  const tree: BuilderNodeTree = [
    {
      id: "grid",
      kind: "container",
      props: { layout: "grid", columns: 3 },
      children: [],
    },
    {
      id: "split",
      kind: "split",
      props: { collapseOnMobile: false },
      children: [],
    },
  ];
  // These are advisory in MobileHealthPanel; they must never reach the blocking
  // preflight tier.
  assert.deepEqual(collectMobileOverflowPreflightIssues(tree), []);
});

test("multiple offenders each surface with their own node id", () => {
  const tree: BuilderNodeTree = [
    {
      id: "a",
      kind: "container",
      props: { layout: "stack", style: { width: "1200px" } },
      children: [
        {
          id: "b",
          kind: "container",
          props: { layout: "stack", style: { minWidth: "600px" } },
          children: [],
        },
      ],
    },
  ];
  const issues = collectMobileOverflowPreflightIssues(tree);
  assert.equal(issues.length, 2);
  assert.deepEqual(issues.map((i) => i.nodeId).sort(), ["a", "b"]);
  assert.ok(issues.every((i) => i.severity === "error"));
});
