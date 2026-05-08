import assert from "node:assert/strict";
import { test } from "node:test";

import { getBuilderNodeLayoutFindings } from "./layout-health";
import type { BuilderCarouselNode, BuilderContainerNode, BuilderSplitNode } from "./types";

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
  assert.equal(findings[1]?.id, "container-tablet-grid");
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
