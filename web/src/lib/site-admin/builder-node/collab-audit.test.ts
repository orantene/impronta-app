import test from "node:test";
import assert from "node:assert/strict";

import {
  createBuilderMutationAuditEvent,
  createEditorDispatchAuditEvent,
} from "./collab-audit";
import type { BuilderNodeTree } from "./types";

test("createBuilderMutationAuditEvent includes operation metadata and metrics", () => {
  const tree: BuilderNodeTree = [
    {
      id: "section-1",
      kind: "section",
      props: { sectionId: "section-1", sectionTypeKey: "hero" },
      children: [
        {
          id: "heading-1",
          kind: "heading",
          props: { text: "Headline", level: 2 },
        },
      ],
    },
  ];
  const event = createBuilderMutationAuditEvent({
    operation: "insert",
    nodeId: "heading-1",
    parentId: "section-1",
    tree,
    now: new Date("2026-05-08T22:00:00.000Z"),
  });

  assert.equal(event.operation, "insert");
  assert.equal(event.category, "builder-node");
  assert.equal(event.nodeId, "heading-1");
  assert.equal(event.parentId, "section-1");
  assert.equal(event.sectionId, "section-1");
  assert.deepEqual(event.details, {
    sourceNodeId: "heading-1",
    targetParentId: "section-1",
    resultNodeId: null,
    ownerSectionId: "section-1",
    ownerSectionTypeKey: "hero",
    activeSelectionSectionId: null,
    activeSelectionNodeId: null,
  });
  assert.equal(event.sectionCount, 1);
  assert.equal(event.nodeCount, 2);
  assert.equal(event.maxDepth, 2);
  assert.equal(event.beforeSectionCount, 1);
  assert.equal(event.beforeNodeCount, 2);
  assert.equal(event.beforeMaxDepth, 2);
  assert.equal(event.deltaSectionCount, 0);
  assert.equal(event.deltaNodeCount, 0);
  assert.equal(event.deltaMaxDepth, 0);
  assert.equal(event.occurredAt, "2026-05-08T22:00:00.000Z");
});

test("createEditorDispatchAuditEvent captures composition/section mutation metadata", () => {
  const tree: BuilderNodeTree = [
    {
      id: "section-1",
      kind: "section",
      props: { sectionTypeKey: "hero" },
      children: [
        {
          id: "heading-1",
          kind: "heading",
          props: { text: "Headline", level: 2 },
        },
      ],
    },
  ];
  const event = createEditorDispatchAuditEvent({
    mutationKind: "composition.move",
    sectionId: "11111111-1111-4111-8111-111111111111",
    tree,
    now: new Date("2026-05-08T22:00:00.000Z"),
  });

  assert.equal(event.category, "editor-dispatch");
  assert.equal(event.operation, "composition.move");
  assert.equal(event.nodeId, null);
  assert.equal(event.parentId, null);
  assert.equal(event.sectionId, "11111111-1111-4111-8111-111111111111");
  assert.deepEqual(event.details, {
    mutationDomain: "composition",
  });
  assert.equal(event.sectionCount, 1);
  assert.equal(event.nodeCount, 2);
  assert.equal(event.maxDepth, 2);
  assert.equal(event.beforeSectionCount, 1);
  assert.equal(event.beforeNodeCount, 2);
  assert.equal(event.beforeMaxDepth, 2);
  assert.equal(event.deltaSectionCount, 0);
  assert.equal(event.deltaNodeCount, 0);
  assert.equal(event.deltaMaxDepth, 0);
  assert.equal(event.occurredAt, "2026-05-08T22:00:00.000Z");
});

test("createBuilderMutationAuditEvent resolves owner section from inserted result node", () => {
  const tree: BuilderNodeTree = [
    {
      id: "section-1",
      kind: "section",
      props: { sectionId: "sec-1", sectionTypeKey: "hero" },
      children: [
        {
          id: "heading-1",
          kind: "heading",
          props: { text: "Headline", level: 2 },
        },
      ],
    },
  ];
  const event = createBuilderMutationAuditEvent({
    operation: "insert",
    parentId: "section-1",
    resultNodeId: "heading-1",
    tree,
    now: new Date("2026-05-08T22:00:00.000Z"),
  });

  assert.equal(event.sectionId, "sec-1");
  assert.equal(event.details?.ownerSectionTypeKey, "hero");
  assert.equal(event.details?.activeSelectionSectionId, null);
  assert.equal(event.details?.activeSelectionNodeId, null);
});

test("createBuilderMutationAuditEvent captures before/after metric deltas", () => {
  const previousTree: BuilderNodeTree = [
    {
      id: "section-1",
      kind: "section",
      props: { sectionId: "sec-1", sectionTypeKey: "hero" },
      children: [],
    },
  ];
  const tree: BuilderNodeTree = [
    {
      id: "section-1",
      kind: "section",
      props: { sectionId: "sec-1", sectionTypeKey: "hero" },
      children: [
        {
          id: "heading-1",
          kind: "heading",
          props: { text: "Headline", level: 2 },
        },
      ],
    },
  ];
  const event = createBuilderMutationAuditEvent({
    operation: "insert",
    nodeId: "heading-1",
    parentId: "section-1",
    previousTree,
    tree,
    now: new Date("2026-05-08T22:00:00.000Z"),
  });

  assert.equal(event.beforeSectionCount, 1);
  assert.equal(event.beforeNodeCount, 1);
  assert.equal(event.beforeMaxDepth, 1);
  assert.equal(event.sectionCount, 1);
  assert.equal(event.nodeCount, 2);
  assert.equal(event.maxDepth, 2);
  assert.equal(event.deltaSectionCount, 0);
  assert.equal(event.deltaNodeCount, 1);
  assert.equal(event.deltaMaxDepth, 1);
});
