import assert from "node:assert/strict";
import { test } from "node:test";

import {
  collectBuilderTreeLayoutFindings,
  getBuilderNodeLayoutFindings,
  isBlockingLayoutFindingId,
} from "./layout-health";
import type {
  BuilderCarouselNode,
  BuilderContainerNode,
  BuilderSplitNode,
} from "./types";

test("flags multi-column containers without mobile stack quick fix", () => {
  const node: BuilderContainerNode = {
    id: "container_1",
    kind: "container",
    props: {
      layout: "grid",
      columns: 3,
    },
    children: [],
  };

  const findings = getBuilderNodeLayoutFindings(node);

  assert.equal(findings[0]?.id, "container-mobile-stack");
  assert.equal(findings[0]?.level, "warning");
  assert.deepEqual(findings[0]?.quickFixPatch, {
    responsive: {
      mobile: { layout: "stack", columns: 1 },
    },
  });
  assert.deepEqual(
    findings.map((finding) => finding.id),
    [
      "container-mobile-stack",
      "container-tablet-grid",
      "container-mobile-overflow",
    ],
  );
});

test("does not flag containers that already have mobile stack", () => {
  const node: BuilderContainerNode = {
    id: "container_1",
    kind: "container",
    props: {
      layout: "grid",
      columns: 3,
      responsive: {
        tablet: { layout: "grid", columns: 2 },
        mobile: { layout: "stack", columns: 1 },
      },
    },
    children: [],
  };

  assert.deepEqual(getBuilderNodeLayoutFindings(node), []);
});

test("flags split layouts that refuse mobile collapse", () => {
  const node: BuilderSplitNode = {
    id: "split_1",
    kind: "split",
    props: {
      collapseOnMobile: false,
    },
    children: [],
  };

  const findings = getBuilderNodeLayoutFindings(node);

  assert.deepEqual(findings.map((finding) => finding.id), [
    "split-mobile-collapse",
  ]);
  assert.deepEqual(findings[0]?.quickFixPatch, { collapseOnMobile: undefined });
});

test("flags autoplay carousels without visible controls", () => {
  const node: BuilderCarouselNode = {
    id: "carousel_1",
    kind: "carousel",
    props: {
      autoplayMs: 5000,
      slidesPerView: 4,
    },
    children: [],
  };

  const findings = getBuilderNodeLayoutFindings(node);

  assert.deepEqual(findings.map((finding) => finding.id), [
    "carousel-controls",
    "carousel-density",
  ]);
  assert.deepEqual(findings[0]?.quickFixPatch, {
    showArrows: true,
    showDots: true,
  });
});

test("flags tabs default panel drift and empty tab sets", () => {
  const findingsMissingDefault = getBuilderNodeLayoutFindings({
    id: "tabs_1",
    kind: "tabs",
    props: {
      defaultTabId: "tab_missing",
    },
    children: [
      {
        id: "tab_1",
        kind: "tab_panel",
        props: { title: "Overview" },
        children: [],
      },
    ],
  });

  assert.equal(findingsMissingDefault[0]?.id, "tabs-default-panel-missing");
  assert.deepEqual(findingsMissingDefault[0]?.quickFixPatch, {
    defaultTabId: "tab_1",
  });

  const findingsNoPanels = getBuilderNodeLayoutFindings({
    id: "tabs_2",
    kind: "tabs",
    props: {},
    children: [],
  });

  assert.ok(findingsNoPanels.some((finding) => finding.id === "tabs-no-panels"));
});

test("flags accordion defaults that reference removed items", () => {
  const findings = getBuilderNodeLayoutFindings({
    id: "accordion_1",
    kind: "accordion",
    props: {
      allowMultiple: false,
      defaultOpenItemIds: ["missing", "item_1"],
    },
    children: [
      {
        id: "item_1",
        kind: "accordion_item",
        props: { title: "Q1" },
        children: [],
      },
      {
        id: "item_2",
        kind: "accordion_item",
        props: { title: "Q2" },
        children: [],
      },
    ],
  });

  assert.ok(
    findings.some((finding) => finding.id === "accordion-default-item-missing"),
  );
  assert.ok(findings.some((finding) => finding.id === "accordion-default-multi"));
});

test("collectBuilderTreeLayoutFindings includes owner section context", () => {
  const findings = collectBuilderTreeLayoutFindings([
    {
      id: "section-1",
      kind: "section",
      props: {
        sectionId: "11111111-1111-4111-8111-111111111111",
        sectionTypeKey: "hero",
      },
      children: [
        {
          id: "container-risky",
          kind: "container",
          props: {
            layout: "grid",
            columns: 3,
          },
          children: [],
        },
      ],
    },
  ]);

  assert.ok(findings.length > 0);
  assert.equal(findings[0]?.nodeId, "container-risky");
  assert.equal(findings[0]?.ownerSectionId, "11111111-1111-4111-8111-111111111111");
});

test("isBlockingLayoutFindingId identifies publish-blocking layout risks", () => {
  assert.equal(isBlockingLayoutFindingId("container-mobile-stack"), true);
  assert.equal(isBlockingLayoutFindingId("container-mobile-overflow"), true);
  assert.equal(isBlockingLayoutFindingId("split-mobile-collapse"), true);
  assert.equal(isBlockingLayoutFindingId("carousel-controls"), true);
  assert.equal(isBlockingLayoutFindingId("carousel-slides-overflow"), true);
  assert.equal(isBlockingLayoutFindingId("tabs-no-panels"), true);
  assert.equal(isBlockingLayoutFindingId("masonry-density"), false);
});
