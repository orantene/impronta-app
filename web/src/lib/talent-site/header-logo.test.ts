import assert from "node:assert/strict";
import test from "node:test";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { withHeaderLogo } from "./header-logo";

const header = (sectionProps: Record<string, unknown>) =>
  ({ id: "h", kind: "section", props: { sectionTypeKey: "site_header", sectionProps } }) as unknown as BuilderNode;
type SP = { brand: { logoUrl?: string }; brandDisplay?: string; regions: Record<string, unknown[]> };
const sp = (n: BuilderNode) => (n.props as unknown as { sectionProps: SP }).sectionProps;

test("regions header: wordmark item becomes the logo item, same slot", () => {
  const out = withHeaderLogo(
    header({ brand: { label: "Jor" }, regions: { left: [{ type: "wordmark" }], center: [{ type: "nav" }], right: [{ type: "cta" }] } }),
    "https://x/logo.png",
  );
  assert.equal(sp(out).brand.logoUrl, "https://x/logo.png");
  assert.deepEqual(sp(out).regions.left, [{ type: "logo" }]);
  assert.deepEqual(sp(out).regions.center, [{ type: "nav" }]);
});

test("existing logo item: wordmark is dropped, no duplicate", () => {
  const out = withHeaderLogo(header({ regions: { left: [{ type: "logo" }, { type: "wordmark" }], center: [], right: [] } }), "u");
  assert.deepEqual(sp(out).regions.left, [{ type: "logo" }]);
});

test("talent logo overrides a theme default brand logo", () => {
  const out = withHeaderLogo(header({ brand: { label: "A", logoUrl: "theme.png" }, brandDisplay: "text" }), "mine.png");
  assert.equal(sp(out).brand.logoUrl, "mine.png");
  assert.equal(sp(out).brandDisplay, "image-and-text");
});

test("non-header nodes are untouched", () => {
  const n = { id: "x", kind: "section", props: { sectionTypeKey: "hero" } } as unknown as BuilderNode;
  assert.equal(withHeaderLogo(n, "u"), n);
});
