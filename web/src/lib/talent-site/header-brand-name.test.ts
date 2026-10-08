import test from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { COLLECTION_DESIGNS } from "./theme-catalog/collection/designs";
import { buildDesignTrees, fallbackHydrationTokens } from "./server/theme-apply-core";
import { resolveHeaderBrandName, withHeaderBrandName, withShellBrandName } from "./header-brand-name";

type Rec = Record<string, unknown>;

const header = (sp: Rec): BuilderNode =>
  ({ id: "h", kind: "section", props: { sectionTypeKey: "site_header", slotKey: "header", sectionProps: sp }, children: [] }) as unknown as BuilderNode;
const spOf = (n: BuilderNode): Rec => ((n.props as unknown as Rec).sectionProps ?? {}) as Rec;
const barOf = (n: BuilderNode): BuilderNode | undefined =>
  n.kind === "utility_bar" ? n : ((n as { children?: BuilderNode[] }).children ?? []).map(barOf).find(Boolean);
const labelOf = (n: BuilderNode): string => {
  const bar = barOf(n);
  return bar ? String((bar.props as unknown as Rec).name ?? "") : String(((spOf(n).brand ?? {}) as Rec).label ?? "");
};
const findHeader = (tree: BuilderNode[]): BuilderNode | undefined =>
  tree.find((n) => (n.props as unknown as Rec).sectionTypeKey === "site_header" || !!barOf(n));

test("resolver chain: display name, then slug, never an unresolved token", () => {
  assert.equal(resolveHeaderBrandName(["  Lupe Rivera ", "lupe-rivera"]), "Lupe Rivera");
  assert.equal(resolveHeaderBrandName(["", "{{displayName}}", "lupe-rivera"]), "lupe-rivera");
  assert.equal(resolveHeaderBrandName([null, undefined, " "]), "");
});

test("blank brand label gets the business / display name (workspace owner fixture)", () => {
  const out = withHeaderBrandName(header({ brand: { label: "" }, brandDisplay: "text" }), "Studio Bella");
  assert.equal(labelOf(out), "Studio Bella");
});

test("talent with only a display name: missing brand node is created", () => {
  const out = withShellBrandName([header({ regions: { left: [], center: [{ type: "nav" }], right: [] } })], ["Lupe Rivera"]);
  assert.equal(labelOf(out[0]), "Lupe Rivera");
  assert.deepEqual((spOf(out[0]).regions as Rec).left, [{ type: "wordmark" }]);
});

test("nothing set falls back to the site slug", () => {
  const out = withShellBrandName([header({ brand: {} })], ["", "qa-fresh-studio"]);
  assert.equal(labelOf(out[0]), "qa-fresh-studio");
});

test("an existing brand label or logo is kept", () => {
  const named = header({ brand: { label: "My Own Name" } });
  assert.equal(withHeaderBrandName(named, "Other"), named);
  const logo = header({ brand: { label: "", logoUrl: "https://x/y.png" }, brandDisplay: "image" });
  assert.equal(withHeaderBrandName(logo, "Other"), logo);
});

test("image-only display with no logo switches to text so the slot is never empty", () => {
  const out = withHeaderBrandName(header({ brand: {}, brandDisplay: "image" }), "Lupe");
  assert.equal(spOf(out).brandDisplay, "text");
});

for (const d of COLLECTION_DESIGNS) {
  test(`${d.slug}: a fresh personal site whose display name baked blank still shows a name`, () => {
    const tokens = { ...fallbackHydrationTokens("x"), displayName: "" };
    const built = buildDesignTrees(d.buildPayload(), tokens);
    assert.equal(built.ok, true);
    if (!built.ok) return;
    const fixed = withShellBrandName(built.shellTree, ["Lupe Rivera", "lupe-rivera"]);
    const h = findHeader(fixed);
    assert.ok(h, "design has a site_header");
    assert.equal(labelOf(h), "Lupe Rivera");
    const slugOnly = findHeader(withShellBrandName(built.shellTree, ["", "lupe-rivera"]));
    assert.equal(labelOf(slugOnly!), "lupe-rivera");
  });
}
