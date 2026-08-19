import assert from "node:assert/strict";
import { test } from "node:test";

import { getBuilderNodeLayoutFindings } from "./layout-health";
import type { BuilderNode } from "./types";

/**
 * The two style traps that shipped to production before anyone caught them by
 * eye. Both are authorable in three clicks and render as nothing, which is why
 * they belong in layout health rather than in a code comment.
 */

function container(style: unknown, children: unknown[] = []): never {
  return {
    id: "n1",
    kind: "container",
    props: { layout: "stack", style },
    children,
  } as never;
}

const absoluteChild = (id: string) =>
  ({
    id,
    kind: "image",
    props: { src: "/x.jpg", alt: "", style: { position: "absolute" } },
  }) as unknown as BuilderNode;

const ids = (node: never) => getBuilderNodeLayoutFindings(node).map((f) => f.id);

test("a width beyond the 1120px cap is flagged", () => {
  assert.ok(ids(container({ width: "1400px" })).includes("width-exceeds-container-cap"));
});

test("width:100% is flagged too — the cap eats full-bleed intent", () => {
  assert.ok(ids(container({ width: "100%" })).includes("width-exceeds-container-cap"));
});

test("lifting the cap silences it", () => {
  for (const style of [
    { width: "1400px", maxWidth: "full" },
    { width: "1400px", maxWidthFree: "100%" },
    { width: "1400px", maxWidthFree: "1600px" },
  ]) {
    assert.ok(
      !ids(container(style)).includes("width-exceeds-container-cap"),
      `${JSON.stringify(style)} should not be flagged`,
    );
  }
});

test("a width inside the cap is not flagged", () => {
  assert.ok(!ids(container({ width: "800px" })).includes("width-exceeds-container-cap"));
});

test("the quick fix actually lifts the cap and keeps the other styles", () => {
  const finding = getBuilderNodeLayoutFindings(
    container({ width: "1400px", backgroundColor: "#000" }),
  ).find((f) => f.id === "width-exceeds-container-cap");
  assert.ok(finding?.quickFixPatch);
  const patched = (finding.quickFixPatch as { style: Record<string, unknown> }).style;
  assert.equal(patched.maxWidth, "full");
  assert.equal(patched.backgroundColor, "#000", "the fix must not drop sibling styles");
});

test("all-absolute children with no height source is flagged", () => {
  const found = ids(container(undefined, [absoluteChild("a"), absoluteChild("b")]));
  assert.ok(found.includes("absolute-children-no-height"));
});

test("any height source silences it — ratio, min-height, or the escape hatch", () => {
  for (const style of [
    { aspectRatioFree: "0.78" },
    { aspectRatio: "4:3" },
    { minHeight: "200px" },
    { height: "300px" },
    { customCss: "{ aspect-ratio: 0.78; }" },
  ]) {
    assert.ok(
      !ids(container(style, [absoluteChild("a")])).includes("absolute-children-no-height"),
      `${JSON.stringify(style)} supplies a height and should not be flagged`,
    );
  }
});

test('aspectRatio:"auto" is not a height source — it is the default', () => {
  assert.ok(
    ids(container({ aspectRatio: "auto" }, [absoluteChild("a")])).includes(
      "absolute-children-no-height",
    ),
  );
});

test("one in-flow child is enough to keep the box open", () => {
  const inFlow = { id: "t", kind: "paragraph", props: { text: "hi" } } as unknown as BuilderNode;
  assert.ok(
    !ids(container(undefined, [absoluteChild("a"), inFlow])).includes(
      "absolute-children-no-height",
    ),
  );
});

test("an empty box is not flagged — nothing has gone wrong yet", () => {
  assert.ok(!ids(container(undefined, [])).includes("absolute-children-no-height"));
});
