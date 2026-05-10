import assert from "node:assert/strict";
import test from "node:test";

import type { BuilderNodeTree } from "./types";
import {
  assertFreePlanAllowsNestedBuilderMutation,
  collectDescendantNonSectionIdsByCmsSectionId,
  collectDescendantNonSectionNodeIds,
  collectFreePlanPublishNestedViolations,
} from "./free-plan-builder-tree-guard";

const sectionOnly: BuilderNodeTree = [
  {
    id: "sec-a",
    kind: "section",
    props: {
      sectionTypeKey: "hero",
      sectionId: "s1",
      slotKey: "main",
      sortOrder: 0,
    },
    children: [],
  },
];

const withNested: BuilderNodeTree = [
  {
    id: "sec-a",
    kind: "section",
    props: {
      sectionTypeKey: "hero",
      sectionId: "s1",
      slotKey: "main",
      sortOrder: 0,
    },
    children: [
      {
        id: "sec-a:heading:headline",
        kind: "heading",
        props: { level: 1, text: "Hi" },
      },
    ],
  },
];

test("collectDescendantNonSectionNodeIds skips section wrappers", () => {
  const ids = collectDescendantNonSectionNodeIds(sectionOnly);
  assert.equal(ids.size, 0);
});

test("collectDescendantNonSectionNodeIds gathers nested ids", () => {
  const ids = collectDescendantNonSectionNodeIds(withNested);
  assert.ok(ids.has("sec-a:heading:headline"));
});

test("free plan allows patch-only changes when nested ids unchanged", () => {
  const prev = withNested;
  const next = [
    {
      id: "sec-a",
      kind: "section" as const,
      props: {
        sectionTypeKey: "hero",
        sectionId: "s1",
        slotKey: "main",
        sortOrder: 0,
      },
      children: [
        {
          id: "sec-a:heading:headline",
          kind: "heading" as const,
          props: { level: 2, text: "Updated" },
        },
      ],
    },
  ] satisfies BuilderNodeTree;
  assert.deepEqual(assertFreePlanAllowsNestedBuilderMutation(prev, next), {
    ok: true,
  });
});

test("collectDescendantNonSectionIdsByCmsSectionId groups by cms section id", () => {
  const map = collectDescendantNonSectionIdsByCmsSectionId(withNested);
  const bucket = map.get("s1");
  assert.ok(bucket);
  assert.ok(bucket!.has("sec-a:heading:headline"));
});

test("collectFreePlanPublishNestedViolations allows new sections only in draft", () => {
  const published = sectionOnly;
  const draft: BuilderNodeTree = [
    ...published,
    {
      id: "sec-b",
      kind: "section",
      props: {
        sectionTypeKey: "cta",
        sectionId: "s2",
        slotKey: "main",
        sortOrder: 1,
      },
      children: [
        {
          id: "totally-new-id",
          kind: "paragraph",
          props: { text: "New section body" },
        },
      ],
    },
  ];
  assert.deepEqual(
    collectFreePlanPublishNestedViolations(published, draft, new Set(["s1"])),
    [],
  );
});

test("collectFreePlanPublishNestedViolations flags new ids under existing section", () => {
  const published = withNested;
  const draft: BuilderNodeTree = [
    {
      id: "sec-a",
      kind: "section" as const,
      props: {
        sectionTypeKey: "hero",
        sectionId: "s1",
        slotKey: "main",
        sortOrder: 0,
      },
      children: [
        {
          id: "sec-a:heading:headline",
          kind: "heading" as const,
          props: { level: 1, text: "Hi" },
        },
        {
          id: "new-node",
          kind: "paragraph" as const,
          props: { text: "Injected at publish check" },
        },
      ],
    },
  ];
  const violations = collectFreePlanPublishNestedViolations(published, draft, new Set(["s1"]));
  assert.equal(violations.length, 1);
  assert.ok(violations[0]?.includes("nested blocks"));
});

test("free plan rejects new nested node ids", () => {
  const prev = withNested;
  const next = [
    {
      id: "sec-a",
      kind: "section" as const,
      props: {
        sectionTypeKey: "hero",
        sectionId: "s1",
        slotKey: "main",
        sortOrder: 0,
      },
      children: [
        {
          id: "sec-a:heading:headline",
          kind: "heading" as const,
          props: { level: 1, text: "Hi" },
        },
        {
          id: "brand-new-id",
          kind: "paragraph" as const,
          props: { text: "Injected" },
        },
      ],
    },
  ] satisfies BuilderNodeTree;
  const r = assertFreePlanAllowsNestedBuilderMutation(prev, next);
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.message.includes("paid workspace"));
});
