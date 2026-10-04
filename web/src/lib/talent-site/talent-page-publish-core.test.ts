import assert from "node:assert/strict";
import { test } from "node:test";

import {
  publicPageBody,
  publishPageBodies,
  type PublishPageBodiesActions,
  type PublishablePageRow,
} from "./talent-page-publish-core";

/**
 * Draft/publish split for talent pages, driven through an in-memory
 * `talent_pages` table that behaves like the real one:
 *   - a SAVE writes `blocks` + `updated_at` (what `saveTalentPageAction` writes),
 *   - PUBLISH runs the real `publishPageBodies` core,
 *   - a VISITOR reads through `publicPageBody` (what both public loaders do).
 *
 * Reproduced before the fix on the isolated qa-journeys project: a visitor saw
 * "Version B" the moment it was saved to a published page, without Publish.
 */

const tree = (text: string) => [{ id: "h1", kind: "heading", props: { text } }];
const textOf = (body: unknown) => (body as Array<{ props: { text: string } }>)[0]?.props.text;

interface Row {
  id: string;
  status: string;
  blocks: unknown;
  blocks_published: unknown;
  updated_at: string;
}

class FakeTalentPages {
  rows = new Map<string, Row>();
  private clock = 0;
  tick() {
    this.clock += 1;
    return `2026-09-27T12:00:${String(this.clock).padStart(2, "0")}.000000+00:00`;
  }
  insert(id: string, blocks: unknown) {
    this.rows.set(id, { id, status: "draft", blocks, blocks_published: null, updated_at: this.tick() });
  }
  /** The builder's save: draft body + updated_at, nothing else. */
  save(id: string, blocks: unknown) {
    const r = this.rows.get(id)!;
    this.rows.set(id, { ...r, blocks, updated_at: this.tick() });
  }
  visitor(id: string) {
    const r = this.rows.get(id)!;
    if (r.status !== "published") return null;
    return publicPageBody({ blocks: r.blocks, blocksPublished: r.blocks_published }, { draftPreview: false });
  }
  ownerPreview(id: string) {
    const r = this.rows.get(id)!;
    return publicPageBody({ blocks: r.blocks, blocksPublished: r.blocks_published }, { draftPreview: true });
  }
  actions(scope: { pageId?: string }, hooks: { beforeWrite?: (id: string, attempt: number) => void } = {}) {
    const attempts = new Map<string, number>();
    const toRow = (r: Row): PublishablePageRow => ({ id: r.id, blocks: r.blocks, updatedAt: r.updated_at });
    const a: PublishPageBodiesActions = {
      readPages: async () => ({
        ok: true,
        rows: [...this.rows.values()].filter((r) => !scope.pageId || r.id === scope.pageId).map(toRow),
      }),
      readPage: async (id) => {
        const r = this.rows.get(id);
        return r ? toRow(r) : null;
      },
      writePublished: async ({ id, blocks, expectedUpdatedAt, now }) => {
        const n = (attempts.get(id) ?? 0) + 1;
        attempts.set(id, n);
        hooks.beforeWrite?.(id, n);
        const r = this.rows.get(id);
        if (!r || r.updated_at !== expectedUpdatedAt) return { ok: true, matched: false };
        this.rows.set(id, { ...r, status: "published", blocks_published: blocks, updated_at: now });
        return { ok: true, matched: true, publishedAt: now, updatedAt: now };
      },
    };
    return a;
  }
}

test("publicPageBody: owner draft preview → draft; visitor → published body", () => {
  const page = { blocks: tree("draft"), blocksPublished: tree("live") };
  assert.equal(textOf(publicPageBody(page, { draftPreview: true })), "draft");
  assert.equal(textOf(publicPageBody(page, { draftPreview: false })), "live");
});

test("publicPageBody: no published body (column absent or null) → the only body there is", () => {
  assert.equal(textOf(publicPageBody({ blocks: tree("only") }, { draftPreview: false })), "only");
  assert.equal(
    textOf(publicPageBody({ blocks: tree("only"), blocksPublished: null }, { draftPreview: false })),
    "only",
  );
});

test("save does not publish: a saved edit to a published page stays private until Publish", async () => {
  const db = new FakeTalentPages();
  db.insert("p1", tree("Version A"));
  assert.equal(db.visitor("p1"), null, "a draft page is not public");

  const first = await publishPageBodies(db.actions({ pageId: "p1" }), { now: db.tick() });
  assert.equal(first.ok, true);
  assert.equal(textOf(db.visitor("p1")), "Version A");

  db.save("p1", tree("Version B"));
  assert.equal(textOf(db.visitor("p1")), "Version A", "visitors still see the published body");
  assert.equal(textOf(db.ownerPreview("p1")), "Version B", "the owner's draft preview sees the edit");
});

test("publish copies: Publish makes the latest saved draft public", async () => {
  const db = new FakeTalentPages();
  db.insert("p1", tree("Version A"));
  await publishPageBodies(db.actions({ pageId: "p1" }), { now: db.tick() });
  db.save("p1", tree("Version B"));

  const res = await publishPageBodies(db.actions({ pageId: "p1" }), { now: db.tick() });
  assert.equal(res.ok, true);
  assert.equal(textOf(db.visitor("p1")), "Version B");
  assert.deepEqual(db.rows.get("p1")!.blocks_published, db.rows.get("p1")!.blocks);
});

test("publishing one page leaves the other pages' live bodies alone", async () => {
  const db = new FakeTalentPages();
  db.insert("home", tree("Home A"));
  db.insert("about", tree("About A"));
  await publishPageBodies(db.actions({}), { now: db.tick() });
  db.save("home", tree("Home B"));
  db.save("about", tree("About B"));

  await publishPageBodies(db.actions({ pageId: "home" }), { now: db.tick() });
  assert.equal(textOf(db.visitor("home")), "Home B");
  assert.equal(textOf(db.visitor("about")), "About A", "the unpublished edit on another page stays private");
});

test("site publish publishes every page's latest draft", async () => {
  const db = new FakeTalentPages();
  db.insert("home", tree("Home A"));
  db.insert("about", tree("About A"));
  const res = await publishPageBodies(db.actions({}), { now: db.tick() });
  assert.equal(res.ok, true);
  assert.equal(res.ok && res.pages.length, 2);
  assert.equal(textOf(db.visitor("home")), "Home A");
  assert.equal(textOf(db.visitor("about")), "About A");
});

test("a save landing between Publish's read and write: the NEWER draft is what goes live", async () => {
  const db = new FakeTalentPages();
  db.insert("p1", tree("Version A"));
  const res = await publishPageBodies(
    db.actions({ pageId: "p1" }, {
      beforeWrite: (id, attempt) => {
        if (attempt === 1) db.save(id, tree("Version B, saved mid-publish"));
      },
    }),
    { now: db.tick() },
  );
  assert.equal(res.ok, true);
  assert.equal(textOf(db.visitor("p1")), "Version B, saved mid-publish");
});

test("a page that keeps changing fails Publish with a plain message instead of publishing a stale body", async () => {
  const db = new FakeTalentPages();
  db.insert("p1", tree("Version A"));
  const res = await publishPageBodies(
    db.actions({ pageId: "p1" }, { beforeWrite: (id, attempt) => db.save(id, tree(`edit ${attempt}`)) }),
    { now: db.tick(), maxAttempts: 3 },
  );
  assert.equal(res.ok, false);
  assert.equal(db.visitor("p1"), null, "nothing was published");
});

test("a page deleted mid-publish is skipped, the rest still publish", async () => {
  const db = new FakeTalentPages();
  db.insert("home", tree("Home"));
  db.insert("gone", tree("Gone"));
  const res = await publishPageBodies(
    db.actions({}, { beforeWrite: (id) => { if (id === "gone") db.rows.delete("gone"); } }),
    { now: db.tick() },
  );
  assert.equal(res.ok, true);
  assert.equal(textOf(db.visitor("home")), "Home");
});
