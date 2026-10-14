/**
 * Posts v1 (PO1): every talent Design (Maison, Maison v2, the collection, the
 * built-ins) and every agency starter (page design) ships the live
 * `posts_feed` widget in CODE, seeded es + en, valid for the catalog, before
 * the contact band. Deterministic, so built-in payload hashes stay stable.
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' node_modules/.bin/tsx --test src/lib/talent-site/theme-catalog/posts-band.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { PAGE_DESIGNS } from "@/lib/site-admin/builder-node/page-designs";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

import { BUILTIN_DESIGNS } from "./builtins";
import { loadAuthoredOverlay, registeredAuthoredOverlays } from "./collection/authored";
import { COLLECTION_DESIGNS } from "./collection/designs";
import { MAISON_BUILTIN_DESIGN } from "./maison/builtins";
import { withPostsBand } from "./section-kit-bands";
import { validateDesign } from "./validate";

function find(nodes: readonly BuilderNode[], kind: string): BuilderNode | null {
  for (const n of nodes) {
    if (n.kind === kind) return n;
    if ("children" in n && Array.isArray(n.children)) {
      const hit = find(n.children as BuilderNode[], kind);
      if (hit) return hit;
    }
  }
  return null;
}

const slotOf = (n: BuilderNode) => (n.props as { slotKey?: string }).slotKey;

const TALENT_DESIGNS = [...COLLECTION_DESIGNS, ...BUILTIN_DESIGNS, MAISON_BUILTIN_DESIGN];

// Authored overlay: adding the posts band is a theme release, pending approval.
const OVERLAID = new Set(registeredAuthoredOverlays().map(([slug]) => slug));

test("designs with an authored overlay are intentionally excluded from the posts band", () => {
  assert.ok(OVERLAID.has("folio") && OVERLAID.has("maison-v2"));
  for (const design of TALENT_DESIGNS) {
    if (!loadAuthoredOverlay(design.slug)) continue;
    assert.equal(find(design.buildPayload().homeTree, "posts_feed"), null, design.slug);
  }
});

for (const design of TALENT_DESIGNS.filter((d) => !OVERLAID.has(d.slug))) {
  test(`talent design ${design.slug}: ships the posts band, valid, before contact`, () => {
    const payload = design.buildPayload();
    const band = payload.homeTree.find((n) => slotOf(n) === "posts");
    assert.ok(band, "posts band in homeTree");
    const feed = find([band], "posts_feed");
    assert.ok(feed, "posts_feed inside the band");
    const contactAt = payload.homeTree.findIndex((n) => slotOf(n) === "contact");
    if (contactAt >= 0) assert.ok(payload.homeTree.indexOf(band) < contactAt, "before contact");
    const v = validateDesign(payload);
    assert.ok(v.ok, JSON.stringify(v));
    // Deterministic ids: two builds are byte-identical.
    assert.equal(JSON.stringify(design.buildPayload()), JSON.stringify(payload));
  });
}

test("collection designs seed the band heading in es + en", () => {
  for (const design of COLLECTION_DESIGNS.filter((d) => !OVERLAID.has(d.slug))) {
    const feed = find(design.buildPayload().homeTree, "posts_feed")!;
    const i18n = (feed.props as { i18n?: Record<string, Record<string, string>> }).i18n;
    assert.equal(i18n?.es?.title, "Últimos posts", design.slug);
    assert.equal(i18n?.en?.title, "Latest posts", design.slug);
  }
});

test("withPostsBand is idempotent and appends when there is no contact band", () => {
  const once = withPostsBand({ homeTree: [{ id: "h", kind: "container", props: { slotKey: "hero" }, children: [] } as unknown as BuilderNode] }, "x");
  assert.equal(once.homeTree.length, 2);
  assert.equal(slotOf(once.homeTree[1]!), "posts");
  assert.equal(withPostsBand(once, "x").homeTree.length, 2);
});

for (const design of PAGE_DESIGNS) {
  test(`agency starter ${design.id}: ships the posts widget`, () => {
    const feed = find(design.tree, "posts_feed");
    assert.ok(feed);
    assert.equal(feed.id, `${design.id}-posts-feed`);
  });
}
