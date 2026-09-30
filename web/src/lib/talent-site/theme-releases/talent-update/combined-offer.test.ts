/**
 * F110 / F111: a site behind several open releases gets ONE combined offer
 * (pinned -> newest), one apply, one undoable history entry, and "Not now"
 * covers every row. Runs the real server modules over the in-memory client.
 */
import test from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { undoThemeUpdateEntry } from "@/lib/talent-site/history/history.server";
import { mergeDesignUpdate } from "../merge";
import { built } from "../test-fixtures";
import type { DesignSide, ReleaseItem } from "../types";
import { makeFakeDb, type FakeDb } from "./fake-db.test-helper";
import {
  addThemeUpdateBlock,
  applyThemeUpdate,
  dismissThemeUpdate,
  loadAvailableBlocks,
  loadTalentUpdateNotices,
  loadUpdateContext,
  previewThemeUpdate,
  type MergeFn,
  type TalentRelease,
  type UpdateDeps,
} from "./talent-update.server";
import { combineReleaseItems, combinedUpdateState, isNoticeVisible, isQuietEntry } from "./view";

const PROFILE = "11111111-1111-4111-8111-111111111111";
const SITE = "22222222-2222-4222-8222-222222222222";
const HOME = "33333333-3333-4333-8333-333333333333";
const R2 = "44444444-4444-4444-8444-000000000002";
const R3 = "44444444-4444-4444-8444-000000000003";
const U2 = "55555555-5555-4555-8555-000000000002";
const U3 = "55555555-5555-4555-8555-000000000003";

const TOKENS = { "space.row": "8px" };
const THEIRS = (): DesignSide => built(3, { heroVariant: "stacked", menuLayout: "grid", withGallery: true }, { "space.row": "12px" });

const I_BLOCK_A: ReleaseItem = { type: "new-block", key: "gallery", tree: "home", note: { en: "Before / After", es: "Antes / Después" } };
const I_LAYOUT: ReleaseItem = { type: "layout", key: "hero", note: { en: "Hero inset" } };
const I_CODE_V2: ReleaseItem = { type: "code", key: "price-wrap", note: { en: "v2 wording" } };
const I_CODE_V3: ReleaseItem = { type: "code", key: "price-wrap", note: { en: "v3 wording" } };
const I_ROW: ReleaseItem = { type: "variant-default", key: "*", note: { en: "Menu row gap" } };

function rel(id: string, from: number, to: number, items: ReleaseItem[]): TalentRelease {
  return {
    id, design_slug: "maison-v2", from_version: from, to_version: to, channel: "optin", status: "published",
    notes: { en: `notes ${to}`, es: `notas ${to}` }, items, critical: false, published_at: "2026-09-30T00:00:00Z",
  };
}

function world(states: [string, string] = ["available", "available"], pinned = 1): FakeDb {
  const ours = built(1, {}, TOKENS);
  return makeFakeDb({
    talent_site_theme_updates: [
      { id: U2, release_id: R2, talent_site_id: SITE, talent_profile_id: PROFILE, state: states[0] },
      { id: U3, release_id: R3, talent_site_id: SITE, talent_profile_id: PROFILE, state: states[1] },
    ],
    talent_theme_releases: [
      rel(R2, 1, 2, [I_BLOCK_A, I_LAYOUT, I_CODE_V2]),
      rel(R3, 2, 3, [I_CODE_V3, I_ROW]),
    ],
    talent_sites: [
      {
        id: SITE, talent_profile_id: PROFILE, site_slug: "valeria", draft_rev: 7, theme_design_slug: "maison-v2",
        theme_design_version: pinned, theme_token_origin: null, shell_tree: ours.trees.shell,
        shell_published: ours.trees.shell, design_tokens_draft: { ...TOKENS }, design_tokens: { ...TOKENS },
        site_published_at: null,
      },
    ],
    talent_pages: [
      { id: HOME, talent_profile_id: PROFILE, slug: "home", title: "Home", is_home: true, sort_order: 0,
        blocks: ours.trees.home, blocks_published: ours.trees.home },
    ],
    talent_profiles: [{ id: PROFILE, display_name: "Valeria", user_id: "u-1" }],
    talent_theme_catalog: [{ kind: "design", slug: "maison-v2", title: "Maison v2" }],
    talent_site_history: [],
  });
}

function deps(db: FakeDb, seen: Array<{ pinned: number | null; to: number; items: ReleaseItem[] | undefined }> = []): UpdateDeps {
  const merge: MergeFn = async (ctx, items) => {
    seen.push({ pinned: ctx.pinnedVersion, to: ctx.release.to_version, items: items as ReleaseItem[] | undefined });
    const site = db.tables.talent_sites!.find((s) => s.id === ctx.siteId)!;
    const home = db.tables.talent_pages!.find((p) => p.is_home)!;
    const result = mergeDesignUpdate({
      base: built(1, {}, TOKENS),
      ours: {
        trees: { shell: site.shell_tree as BuilderNode[], home: home.blocks as BuilderNode[] },
        tokens: site.design_tokens_draft as Record<string, string>,
      },
      theirs: THEIRS(),
      ...(items ? { items } : {}),
    });
    return { ok: true, result, noBase: false, homePageId: home.id as string };
  };
  return { admin: db.admin, merge, checkTree: async () => null };
}

const states = (db: FakeDb) => db.tables.talent_site_theme_updates!.map((r) => r.state);

test("combineReleaseItems: deduped, later release wins, every release's new blocks kept", () => {
  const out = combineReleaseItems([
    { items: [I_BLOCK_A, I_LAYOUT, I_CODE_V2] },
    { items: [I_CODE_V3, I_ROW] },
  ]);
  assert.equal(out.length, 4);
  assert.equal(out.find((i) => i.key === "price-wrap")!.note!.en, "v3 wording");
  assert.ok(out.some((i) => i.type === "new-block"));
});

test("combinedUpdateState: dismissed only when every row is", () => {
  assert.equal(combinedUpdateState(["dismissed", "available"]), "available");
  assert.equal(combinedUpdateState(["dismissed", "undone"]), "undone");
  assert.equal(combinedUpdateState(["previewed", "dismissed"]), "previewed");
  assert.equal(combinedUpdateState(["dismissed", "dismissed"]), "dismissed");
});

test("one notice labelled pinned -> newest, from the newest row", async () => {
  const db = world();
  const notices = await loadTalentUpdateNotices(db.admin, PROFILE, { lazyFanOut: false });
  assert.equal(notices.length, 1);
  assert.equal(notices[0]!.fromVersion, 1);
  assert.equal(notices[0]!.toVersion, 3);
  assert.equal(notices[0]!.updateId, U3);
  assert.equal(notices[0]!.state, "available");
});

test("the context covers both rows with combined items and from = her pin", async () => {
  const db = world();
  const ctx = await loadUpdateContext(db.admin, PROFILE, U2); // clicked the OLDER row
  assert.ok(ctx);
  assert.deepEqual([...ctx!.coveredUpdateIds].sort(), [U2, U3]);
  assert.equal(ctx!.updateId, U3);
  assert.equal(ctx!.release.from_version, 1);
  assert.equal(ctx!.release.to_version, 3);
  assert.equal(ctx!.release.items.length, 4);
});

test("a site already on the newest release keeps the single-release context", async () => {
  const db = world(["available", "available"], 3);
  const ctx = await loadUpdateContext(db.admin, PROFILE, U3);
  assert.deepEqual(ctx!.coveredUpdateIds, [U3]);
  assert.equal(ctx!.release.items.length, 2);
});

test("preview lists every release's items and the combined new blocks", async () => {
  const db = world();
  const seen: Array<{ pinned: number | null; to: number; items: ReleaseItem[] | undefined }> = [];
  const res = await previewThemeUpdate(deps(db, seen), PROFILE, U3);
  assert.ok(res.ok);
  const listed = res.value.groups.flatMap((g) => g.items);
  assert.equal(listed.length, 4);
  assert.ok(listed.some((i) => i.noteEn === "Before / After"));
  assert.ok(seen.every((s) => s.pinned === 1 && s.to === 3));
});

test("Add this block works for a block from the older release", async () => {
  const db = world();
  const res = await addThemeUpdateBlock(deps(db), {
    talentProfileId: PROFILE, updateId: U3, itemId: "new-block:gallery", afterId: null, expectedDraftRev: 7, actorId: "u-1",
  });
  assert.ok(res.ok, JSON.stringify(res));
  const avail = await loadAvailableBlocks(db.admin, PROFILE);
  assert.ok(!avail.blocks.some((b) => b.item.id === "new-block:gallery"));
});

test("apply merges pinned -> newest once, marks EVERY row applied, one history entry", async () => {
  const db = world();
  const seen: Array<{ pinned: number | null; to: number; items: ReleaseItem[] | undefined }> = [];
  const res = await applyThemeUpdate(deps(db, seen), { talentProfileId: PROFILE, updateId: U2, expectedDraftRev: 7, actorId: "u-1" });
  assert.ok(res.ok, JSON.stringify(res));
  assert.deepEqual(states(db), ["applied", "applied"]);
  assert.equal(db.tables.talent_sites![0]!.theme_design_version, 3);
  const hist = db.tables.talent_site_history!;
  assert.equal(hist.length, 1);
  const report = hist[0]!.report as { fromVersion: number; toVersion: number; updateIds: string[] };
  assert.equal(report.fromVersion, 1);
  assert.equal(report.toVersion, 3);
  assert.deepEqual([...report.updateIds].sort(), [U2, U3]);
  assert.equal(seen[0]!.items!.some((i) => i.type === "new-block"), false, "new blocks are not auto-applied");
});

test("undo restores the pin and sets every covered row to undone", async () => {
  const db = world();
  const applied = await applyThemeUpdate(deps(db), { talentProfileId: PROFILE, updateId: U3, expectedDraftRev: 7, actorId: "u-1" });
  assert.ok(applied.ok);
  const undo = await undoThemeUpdateEntry(db.admin, {
    talentProfileId: PROFILE, entryId: db.tables.talent_site_history![0]!.id as string, expectedDraftRev: 8, actorId: "u-1",
  });
  assert.ok(undo.ok, JSON.stringify(undo));
  assert.deepEqual(states(db), ["undone", "undone"]);
  assert.equal(db.tables.talent_sites![0]!.theme_design_version, 1);
});

test("F111: Not now dismisses both rows; the quiet entry stays; partial dismissal keeps the banner", async () => {
  const db = world();
  const r = await dismissThemeUpdate(db.admin, PROFILE, U3);
  assert.ok(r.ok);
  assert.deepEqual(states(db), ["dismissed", "dismissed"]);
  const [n] = await loadTalentUpdateNotices(db.admin, PROFILE, { lazyFanOut: false });
  assert.ok(n);
  assert.equal(n!.state, "dismissed");
  assert.equal(isNoticeVisible(n!.state), false);
  assert.equal(isQuietEntry(n!.state), true);

  // The exact QA Free shape: 2.2 dismissed, 2.1 still available -> banner stays.
  const half = world(["available", "dismissed"]);
  const [h] = await loadTalentUpdateNotices(half.admin, PROFILE, { lazyFanOut: false });
  assert.equal(h!.state, "available");
  assert.equal(isNoticeVisible(h!.state), true);
});

// ── F116: noBase survives the combined offer ─────────────────────────────────

test("F116: the combined context keeps the newest release's own from-version for the base", async () => {
  const { makeBaseResolver } = await import("../manager/base-resolver.server");
  const db = world(["available", "available"], 1);
  const ctx = (await loadUpdateContext(db.admin, PROFILE, U3))!;
  assert.equal(ctx.release.from_version, 1, "label = her pin");
  assert.equal(ctx.baseFromVersion, 2, "base_payload belongs to the newest release's own from-version");
  // No snapshot for v1: the saved v2 payload must NOT be taken as her v1 base.
  const resolve = makeBaseResolver(db.admin, {
    design_slug: "maison-v2",
    from_version: ctx.baseFromVersion,
    base_payload: { v: 2 } as never,
  });
  assert.equal(await resolve(1), null);
  assert.deepEqual(await resolve(2), { v: 2 });
});

test("F116: a noBase combined offer lists only new blocks, no Apply, and apply is refused", async () => {
  const db = world(["available", "available"], 1);
  const base = deps(db);
  const noBaseDeps: UpdateDeps = {
    ...base,
    merge: async (ctx, items) => {
      const m = await base.merge(ctx, items);
      return m.ok ? { ...m, noBase: true } : m;
    },
  };
  const res = await previewThemeUpdate(noBaseDeps, PROFILE, U3);
  assert.ok(res.ok);
  assert.equal(res.value.noBase, true);
  assert.equal(res.value.hasApplicable, false);
  assert.deepEqual(res.value.groups.map((g) => g.group), ["blocks"]);
  const apply = await applyThemeUpdate(noBaseDeps, { talentProfileId: PROFILE, updateId: U3, expectedDraftRev: 7, actorId: "u-1" });
  assert.equal(apply.ok, false);
  assert.equal(!apply.ok && apply.code, "no_base");
  assert.deepEqual(states(db), ["available", "available"]);
});

// ── F117: never offer a block she already has ────────────────────────────────

test("F117: a block recorded as added on ANY covered row is not offered again", async () => {
  const db = world();
  db.tables.talent_site_theme_updates![0]!.report = { addedBlocks: ["new-block:gallery"] }; // the 2.1 row
  const res = await previewThemeUpdate(deps(db), PROFILE, U3);
  assert.ok(res.ok);
  const ids = res.value.groups.flatMap((g) => g.items).map((i) => i.id);
  assert.ok(!ids.includes("new-block:gallery"));
  assert.ok(ids.includes("layout:hero"), "the rest of the offer is intact");
});

test("F117: a block already on her page by origin key is not offered again", async () => {
  const db = world();
  const withGallery = built(1, { withGallery: true }, TOKENS);
  db.tables.talent_pages![0]!.blocks = withGallery.trees.home;
  const res = await previewThemeUpdate(deps(db), PROFILE, U3);
  assert.ok(res.ok);
  assert.ok(!res.value.groups.flatMap((g) => g.items).some((i) => i.id === "new-block:gallery"));
});

// ── F118: an offer with nothing to do is invisible ───────────────────────────

test("F118: isOfferActionable", async () => {
  const { isOfferActionable } = await import("../offer-actionable.server");
  const blocksOnly = [I_BLOCK_A];
  const mixed = [I_BLOCK_A, I_CODE_V2];
  assert.equal(isOfferActionable({ hasBase: false, items: mixed, addedIds: [], homeBlocks: [] }), true, "a missing block is actionable");
  assert.equal(isOfferActionable({ hasBase: false, items: mixed, addedIds: ["new-block:gallery"], homeBlocks: [] }), false, "noBase + block added");
  assert.equal(isOfferActionable({ hasBase: true, items: mixed, addedIds: ["new-block:gallery"], homeBlocks: [] }), true, "base + applicable items");
  assert.equal(isOfferActionable({ hasBase: true, items: blocksOnly, addedIds: ["new-block:gallery"], homeBlocks: [] }), false, "base but only a block she has");
  assert.equal(isOfferActionable({ hasBase: false, items: [], addedIds: [], homeBlocks: [] }), false);
});

test("F118: Jorg shape (noBase, every new block already added): no notice, rows closed as nothing_applicable", async () => {
  const db = world(["available", "available"], 1); // no snapshot for v1, pin != newest from-version: noBase
  db.tables.talent_site_theme_updates![0]!.report = { addedBlocks: ["new-block:gallery"] };
  const notices = await loadTalentUpdateNotices(db.admin, PROFILE, { lazyFanOut: false });
  assert.equal(notices.length, 0);
  assert.deepEqual(states(db), ["applied", "applied"]);
  const reason = (db.tables.talent_site_theme_updates![1]!.report as { reason?: string }).reason;
  assert.equal(reason, "nothing_applicable");
  // and it stays gone
  assert.equal((await loadTalentUpdateNotices(db.admin, PROFILE, { lazyFanOut: false })).length, 0);
});

test("F118: noBase but a block is still missing keeps the notice", async () => {
  const db = world(["available", "available"], 1);
  const notices = await loadTalentUpdateNotices(db.admin, PROFILE, { lazyFanOut: false });
  assert.equal(notices.length, 1);
  assert.deepEqual(states(db), ["available", "available"]);
});

test("F118: a site WITH a base and applicable items keeps the notice", async () => {
  const db = world(["available", "available"], 2);
  db.tables.talent_theme_releases![1]!.base_payload = { v: 2 }; // R3's saved base = her pin
  const notices = await loadTalentUpdateNotices(db.admin, PROFILE, { lazyFanOut: false });
  assert.equal(notices.length, 1);
  assert.equal(notices[0]!.fromVersion, 2);
});

// ── F122: a fix skipped because the block is absent is not "your edit" ───────

test("F122: summarizeReport keeps absent-block skips out of 'kept your edits'", async () => {
  const { summarizeReport } = await import("./view");
  const { keptLine, keptPartLabel } = await import("./copy");
  const entry = (key: string, reason: string) => ({ seq: 1, change: "props", key, reason }) as never;
  const s = summarizeReport({
    applied: [],
    added: [],
    conflicts: [],
    kept: [entry("before_after", "removed")],
  });
  assert.equal(s.kept, 0);
  assert.deepEqual(s.keptKeys, []);
  assert.equal(s.notApplicable, 1);
  assert.match(keptLine(s, "es"), /No cambiaste nada/);
  // a real edit of hers is still kept, alongside
  const both = summarizeReport({
    applied: [], added: [], conflicts: [],
    kept: [entry("before_after", "removed"), entry("hero/heading", "edited")],
  });
  assert.equal(both.kept, 1);
  assert.deepEqual(both.keptKeys, ["hero"]);
  assert.equal(both.notApplicable, 1);
  // localised section names
  assert.equal(keptPartLabel("before_after", "es"), "Antes / Después");
  assert.equal(keptPartLabel("before_after", "en"), "Before / After");
});

// ── F124: a restore that lowers the pin reopens the rows it had closed ───────

test("F124: rows applied above the new pin go back to available; rows at or below stay", async () => {
  const { ensureSiteThemeUpdates } = await import("../lazy-fan-out.server");
  const db = world(["applied", "applied"], 2); // restored to v2: R2 (to 2) is at the pin, R3 (to 3) is above
  db.tables.talent_site_theme_updates![1]!.report = { addedBlocks: ["new-block:x"], kept: 1 };
  await ensureSiteThemeUpdates(db.admin, PROFILE);
  assert.deepEqual(states(db), ["applied", "available"]);
  const report = db.tables.talent_site_theme_updates![1]!.report as { note?: string; addedBlocks?: string[] };
  assert.equal(report.note, "reopened_after_restore");
  assert.deepEqual(report.addedBlocks, ["new-block:x"], "added blocks are remembered");
});

test("F124: restored to v1, both rows reopen and the combined offer is 1 -> 3 again", async () => {
  const db = world(["applied", "applied"], 1);
  const notices = await loadTalentUpdateNotices(db.admin, PROFILE); // lazy step runs first
  assert.deepEqual(states(db), ["available", "available"]);
  assert.equal(notices.length, 1);
  assert.equal(notices[0]!.fromVersion, 1);
  assert.equal(notices[0]!.toVersion, 3);
});

test("F124: a site still on the newest version keeps its applied rows", async () => {
  const { ensureSiteThemeUpdates } = await import("../lazy-fan-out.server");
  const db = world(["applied", "applied"], 3);
  await ensureSiteThemeUpdates(db.admin, PROFILE);
  assert.deepEqual(states(db), ["applied", "applied"]);
});

test("F124: rows closed as nothing_applicable are not reopened", async () => {
  const { ensureSiteThemeUpdates } = await import("../lazy-fan-out.server");
  const db = world(["applied", "applied"], 1);
  db.tables.talent_site_theme_updates![0]!.report = { reason: "nothing_applicable" };
  await ensureSiteThemeUpdates(db.admin, PROFILE);
  assert.deepEqual(states(db), ["applied", "available"]);
});

test("F118: all blocks present by origin key also closes a noBase offer", async () => {
  const db = world(["available", "available"], 1);
  db.tables.talent_pages![0]!.blocks = built(1, { withGallery: true }, TOKENS).trees.home;
  assert.equal((await loadTalentUpdateNotices(db.admin, PROFILE, { lazyFanOut: false })).length, 0);
  assert.deepEqual(states(db), ["applied", "applied"]);
});
