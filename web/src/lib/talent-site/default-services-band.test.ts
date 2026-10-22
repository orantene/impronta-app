import { test } from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { DEFAULT_SERVICES_BAND_ID, hasPublicPublishedService, withDefaultServicesBand } from "./default-services-band";

const node = (id: string, kind: string, extra: Record<string, unknown> = {}) =>
  ({ id, kind, props: {}, ...extra }) as unknown as BuilderNode;

const hero = node("hero", "container");
const about = node("about", "container", { anchorId: "about" });
const contact = node("contact", "form");
const ids = (b: readonly BuilderNode[]) => b.map((n) => n.id);

test("a tree without a services band gets one default band after the hero when a public service exists", () => {
  const out = withDefaultServicesBand([hero, contact], { isHome: true, hasPublicServices: true });
  assert.deepEqual(ids(out), ["hero", DEFAULT_SERVICES_BAND_ID, "contact"]);
  assert.equal(out[1]!.kind, "services_catalog");
});

test("the band lands after an about block that follows the hero", () => {
  assert.deepEqual(ids(withDefaultServicesBand([hero, about, contact], { isHome: true, hasPublicServices: true })), ["hero", "about", DEFAULT_SERVICES_BAND_ID, "contact"]);
});

test("an explicit services block wins (nested too, selectionMode untouched) and no second band is added", () => {
  const explicit = node("svc", "services_catalog", { props: { selectionMode: "ids", selectedOfferingIds: ["x"] } });
  const tree = [hero, node("wrap", "container", { children: [explicit] })];
  assert.equal(withDefaultServicesBand(tree, { isHome: true, hasPublicServices: true }), tree);
});

test("no band without a public service, off the home page, or when the tree opts out", () => {
  const tree = [hero, contact];
  assert.equal(withDefaultServicesBand(tree, { isHome: true, hasPublicServices: false }), tree);
  assert.equal(withDefaultServicesBand(tree, { isHome: false, hasPublicServices: true }), tree);
  const optOut = [node("hero", "container", { props: { hideDefaultServices: true } }), contact];
  assert.equal(withDefaultServicesBand(optOut, { isHome: true, hasPublicServices: true }), optOut);
});

test("public published service check", () => {
  assert.equal(hasPublicPublishedService([{ status: "published", visibility: "public" }]), true);
  assert.equal(hasPublicPublishedService([{ status: "published", visibility: "on_request" }, { status: "draft", visibility: "public" }]), false);
});

import { recordServicesHiddenIntent } from "./default-services-band";
import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";

test("removing the last services block sets the flag, so no default band returns; re-adding clears it", () => {
  const svc = node("svc", "services_catalog");
  const before = [hero, svc, contact];
  const removed = recordServicesHiddenIntent(before, [hero, contact]);
  assert.equal((removed[0] as unknown as { props: Record<string, unknown> }).props.hideDefaultServices, true);
  assert.equal(withDefaultServicesBand(removed, { isHome: true, hasPublicServices: true }), removed);

  const readded = recordServicesHiddenIntent(removed, [...removed.slice(0, 1), svc, contact].map((n) => n));
  assert.equal(JSON.stringify(readded).includes("hideDefaultServices"), false);
});

test("a save that never had services leaves the tree alone; a remaining services block means no flag", () => {
  const tree = [hero, contact];
  assert.equal(recordServicesHiddenIntent(tree, tree), tree);
  const other = node("svc2", "services_catalog");
  const out = recordServicesHiddenIntent([hero, node("svc", "services_catalog"), other], [hero, other]);
  assert.equal(JSON.stringify(out).includes("hideDefaultServices"), false);
});

test("the flag survives validateBuilderNodeTree so publish keeps it", () => {
  const box = node("box", "container", { props: { layout: "stack" }, children: [] });
  const flagged = recordServicesHiddenIntent([box, node("svc", "services_catalog")], [box]);
  const res = validateBuilderNodeTree(JSON.parse(JSON.stringify(flagged)));
  assert.equal(res.ok, true);
  assert.equal((res.tree[0] as unknown as { props: Record<string, unknown> }).props.hideDefaultServices, true);
});
