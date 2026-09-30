/**
 * Theme releases Phase 2: "What will go live" diff + the revisions backfill mapping.
 */
import test from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { diffDraftAgainstLive, sectionKey, sectionText } from "./draft-diff";
import { mapPageRevisions, mapSiteRevision } from "./backfill";

const sec = (id: string, kind: string, props: Record<string, unknown>, children?: BuilderNode[]): BuilderNode =>
  ({ id, kind, props, ...(children ? { children } : {}) }) as unknown as BuilderNode;
const labels = { header: "Header and footer", colours: "Colours and fonts" };

test("section key: origin key, then slotKey, then id (reorders still line up)", () => {
  assert.equal(sectionKey(sec("n1", "hero", { __origin: { key: "hero" }, slotKey: "x" })), "hero");
  assert.equal(sectionKey(sec("n1", "hero", { slotKey: "about" })), "about");
  assert.equal(sectionKey(sec("n1", "hero", {})), "n1");
});

test("section text: first readable prop, then descendants", () => {
  assert.equal(sectionText(sec("a", "hero", { title: "  Hello   there " })), "Hello there");
  assert.equal(sectionText(sec("a", "box", {}, [sec("b", "p", { text: "Inside" })])), "Inside");
  assert.equal(sectionText(sec("a", "box", {})), null);
});

test("diff: added, removed and changed sections with before/after", () => {
  const live = [
    sec("1", "hero", { slotKey: "hero", title: "Old title" }),
    sec("2", "faq", { slotKey: "faq", title: "Questions" }),
  ];
  const draft = [
    sec("1", "hero", { slotKey: "hero", title: "New title" }),
    sec("3", "gallery", { slotKey: "gallery", title: "My work" }),
  ];
  const out = diffDraftAgainstLive(
    { shell: { draft: [], live: [] }, pages: [{ id: "p1", title: "Home", draft, live }], tokens: { draft: {}, live: {} } },
    labels,
  );
  const by = Object.fromEntries(out.map((c) => [c.key, c]));
  assert.equal(by.hero!.change, "changed");
  assert.equal(by.hero!.before, "Old title");
  assert.equal(by.hero!.after, "New title");
  assert.equal(by.gallery!.change, "added");
  assert.equal(by.faq!.change, "removed");
  assert.equal(by.hero!.scopeLabel, "Home");
});

test("diff: reordering alone or a re-stamped origin is not a change", () => {
  const a = sec("1", "hero", { __origin: { key: "hero", fp: "x" }, title: "T" });
  const b = sec("2", "about", { __origin: { key: "about", fp: "y" }, title: "A" });
  const restamped = sec("1", "hero", { __origin: { key: "hero", fp: "z" }, title: "T" });
  const out = diffDraftAgainstLive(
    { shell: { draft: [b, restamped], live: [a, b] }, pages: [], tokens: { draft: {}, live: {} } },
    labels,
  );
  assert.equal(out.length, 0);
});

test("diff: token changes are listed under colours", () => {
  const out = diffDraftAgainstLive(
    {
      shell: { draft: [], live: [] },
      pages: [],
      tokens: { draft: { accent: "rose", font: "Inter" }, live: { accent: "gold", radius: "8px" } },
    },
    labels,
  );
  const by = Object.fromEntries(out.map((c) => [c.key, c]));
  assert.equal(by.accent!.change, "changed");
  assert.equal(by.accent!.before, "gold");
  assert.equal(by.font!.change, "added");
  assert.equal(by.radius!.change, "removed");
  assert.ok(out.every((c) => c.scopeLabel === "Colours and fonts"));
});

test("diff: a never-published site lists every draft section as added", () => {
  const out = diffDraftAgainstLive(
    { shell: { draft: [sec("h", "header", {})], live: null }, pages: [], tokens: { draft: {}, live: {} } },
    labels,
  );
  assert.equal(out.length, 1);
  assert.equal(out[0]!.change, "added");
});

// ── backfill ─────────────────────────────────────────────────────────────────

test("backfill: shell checkpoints map to edit / publish entries with a shell snapshot", () => {
  const draft = mapSiteRevision(
    { id: "r1", kind: "draft", created_at: "2026-09-01T00:00:00Z", created_by: "u", snapshot: { surface: "talent_site_shell", builderTree: [sec("h", "header", {})] } },
    null,
  );
  assert.equal(draft!.kind, "edit");
  assert.equal(draft!.sourceRef, "talent_site_revisions:r1");
  assert.equal(draft!.snapshot!.shell!.length, 1);
  const pub = mapSiteRevision(
    { id: "r2", kind: "published", created_at: "2026-09-02T00:00:00Z", created_by: null, snapshot: { surface: "talent_site_shell", builderTree: [] } },
    null,
  );
  assert.equal(pub!.kind, "publish");
  assert.equal(pub!.snapshot!.source, "published");
});

test("backfill: Maison design versions map to publish entries carrying shell, home and tokens", () => {
  const e = mapSiteRevision(
    {
      id: "r3",
      kind: "published",
      created_at: "2026-09-03T00:00:00Z",
      created_by: null,
      snapshot: {
        surface: "maison_design",
        published_at: "2026-09-03T00:00:05Z",
        design_slug: "maison-v2",
        look_slug: "blush",
        shell_published: [sec("h", "header", {})],
        home_blocks: [sec("a", "hero", {})],
        design_tokens: { accent: "rose", bad: 1 },
      },
    },
    "home-1",
  );
  assert.equal(e!.kind, "publish");
  assert.equal(e!.at, "2026-09-03T00:00:05Z");
  assert.deepEqual(e!.snapshot!.tokens, { accent: "rose" });
  assert.equal(e!.snapshot!.pages!["home-1"]!.length, 1);
  assert.equal(e!.snapshot!.design!.slug, "maison-v2");
});

test("backfill: full-site composition snapshots are skipped", () => {
  assert.equal(
    mapSiteRevision({ id: "r4", kind: "draft", created_at: "2026-09-01T00:00:00Z", created_by: null, snapshot: { composition: [] } }, null),
    null,
  );
});

test("backfill: page autosaves fold per 60 s window, newest row of the window wins", () => {
  const rows = [
    { id: "a", page_id: "p1", created_at: "2026-09-01T10:00:00Z", created_by: null, blocks: [sec("1", "p", { text: "v1" })] },
    { id: "b", page_id: "p1", created_at: "2026-09-01T10:00:30Z", created_by: null, blocks: [sec("1", "p", { text: "v2" })] },
    { id: "c", page_id: "p1", created_at: "2026-09-01T10:05:00Z", created_by: null, blocks: [sec("1", "p", { text: "v3" })] },
    { id: "d", page_id: "p2", created_at: "2026-09-01T10:00:10Z", created_by: null, blocks: "bad" },
  ];
  const out = mapPageRevisions(rows, new Map([["p1", "Home"]]));
  assert.deepEqual(out.map((e) => e.sourceRef), ["talent_page_revisions:b", "talent_page_revisions:c"]);
  assert.equal(out[0]!.summaryEn, "Saved version of Home");
  assert.equal(out[0]!.summaryEs, "Versión guardada de Home");
  assert.ok(out.every((e) => e.batchSeconds === 0 && e.kind === "edit"));
});

test("backfill: keeps only the newest windows per page", () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({
    id: `r${i}`,
    page_id: "p1",
    created_at: new Date(Date.UTC(2026, 8, 1, 10, i * 5)).toISOString(),
    created_by: null,
    blocks: [],
  }));
  const out = mapPageRevisions(rows, new Map(), { limitPerPage: 3 });
  assert.deepEqual(out.map((e) => e.sourceRef), ["talent_page_revisions:r7", "talent_page_revisions:r8", "talent_page_revisions:r9"]);
});
