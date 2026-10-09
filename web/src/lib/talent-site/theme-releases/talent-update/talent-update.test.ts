/**
 * Theme releases Phase 4: the talent update experience.
 * Notice per state, preview writes nothing, apply = one history entry + state
 * `applied`, dismiss, add-block placement, auto-improve on untouched nodes only,
 * undo sets `undone`. Drives the real server modules over an in-memory client.
 */
import test from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { undoThemeUpdateEntry } from "@/lib/talent-site/history/history.server";
import { mergeDesignUpdate } from "../merge";
import { built, edit, prop, topKeys } from "../test-fixtures";
import type { DesignSide, ReleaseItem } from "../types";
import type { SiteRef } from "../manager/merge-site.server";
import { planFanOut } from "../manager/notify";
import { resolveNotificationDrawerTarget } from "@/components/admin/shell/internal/notification-drawer-targets";
import { runAutoImprove } from "./auto-improve.server";
import { sectionNameForKey } from "@/lib/talent-site/history/draft-diff";
import { GROUP_COPY, UPDATE_COPY, appliedToast, quietEntryTitle, applyLabel, bannerTitle, keptLine } from "./copy";
import { fakeId, makeFakeDb, type FakeDb } from "./fake-db.test-helper";
import {
  NOTICE_RELEASE_COLUMNS,
  TALENT_RELEASE_COLUMNS,
  addThemeUpdateBlock,
  applyThemeUpdate,
  dismissThemeUpdate,
  loadAvailableBlocks,
  loadTalentUpdateNotices,
  loadThemeUpdatePreviewSnapshot,
  previewThemeUpdate,
  type MergeFn,
  type TalentRelease,
  type UpdateDeps,
} from "./talent-update.server";
import { applyItemsOf, groupItems, isNoticeVisible, isQuietEntry, placeKeyAfter, summarizeReport } from "./view";

const PROFILE = "11111111-1111-4111-8111-111111111111";
const SITE = "22222222-2222-4222-8222-222222222222";
const HOME = "33333333-3333-4333-8333-333333333333";
const RELEASE = "44444444-4444-4444-8444-444444444444";
const UPDATE = "55555555-5555-4555-8555-555555555555";

const TOKENS_V1 = { "space.row": "8px" };
const TOKENS_V2 = { "space.row": "12px" };
const THEIRS = (): DesignSide => built(2, { heroVariant: "stacked", menuLayout: "grid", withGallery: true }, TOKENS_V2);

const ITEMS: ReleaseItem[] = [
  { type: "variant-default", key: "*", note: { en: "Menu rows breathe more", es: "Más aire en el menú" } },
  { type: "new-block", key: "gallery", tree: "home", note: { en: "New gallery block", es: "Nuevo bloque de galería" } },
  { type: "code", key: "price-wrap", note: { en: "Prices wrap cleanly", es: "Los precios se ajustan bien" } },
  { type: "token-default", key: "*", tokenKeys: ["space.row"] },
];

function release(over: Partial<TalentRelease> = {}): TalentRelease {
  return {
    id: RELEASE,
    design_slug: "maison-v2",
    from_version: 1,
    to_version: 2,
    channel: "optin",
    status: "published",
    notes: { en: "Spring polish", es: "Pulido de primavera" },
    items: ITEMS,
    critical: false,
    published_at: "2026-09-30T00:00:00Z",
    ...over,
  };
}

/** Her draft: v1 with the hero edited (her change) and her own colour token. */
function world(state = "available", rel: TalentRelease = release()): FakeDb {
  const ours = edit(built(1, {}, TOKENS_V1), "home", "hero", "style.paddingY", "xl");
  return makeFakeDb({
    talent_site_theme_updates: [
      { id: UPDATE, release_id: RELEASE, talent_site_id: SITE, talent_profile_id: PROFILE, state },
    ],
    talent_theme_releases: [{ ...rel, base_payload: { secret: true }, dry_run_report: { others: 3 } }],
    talent_sites: [
      {
        id: SITE,
        talent_profile_id: PROFILE,
        site_slug: "valeria",
        draft_rev: 7,
        theme_design_slug: "maison-v2",
        theme_design_version: 1,
        theme_token_origin: null,
        shell_tree: ours.trees.shell,
        shell_published: ours.trees.shell,
        design_tokens_draft: { ...TOKENS_V1 },
        design_tokens: { ...TOKENS_V1 },
        site_published_at: null,
      },
    ],
    talent_pages: [
      {
        id: HOME,
        talent_profile_id: PROFILE,
        slug: "home",
        title: "Home",
        is_home: true,
        sort_order: 0,
        blocks: ours.trees.home,
        blocks_published: ours.trees.home,
      },
    ],
    talent_profiles: [{ id: PROFILE, display_name: "Valeria", user_id: "u-1" }],
    talent_theme_catalog: [{ kind: "design", slug: "maison-v2", title: "Maison v2" }],
    talent_site_history: [],
  });
}

function mergeOver(db: FakeDb, theirs: () => DesignSide = THEIRS): MergeFn {
  return async (ctx, items) => {
    const site = db.tables.talent_sites!.find((s) => s.id === ctx.siteId)!;
    const home = db.tables.talent_pages!.find((p) => p.talent_profile_id === ctx.talentProfileId && p.is_home)!;
    const result = mergeDesignUpdate({
      base: built(1, {}, TOKENS_V1),
      ours: {
        trees: { shell: site.shell_tree as BuilderNode[], home: home.blocks as BuilderNode[] },
        tokens: site.design_tokens_draft as Record<string, string>,
      },
      theirs: theirs(),
      ...(items ? { items } : {}),
    });
    return { ok: true, result, noBase: false, homePageId: home.id as string };
  };
}

const deps = (db: FakeDb, theirs?: () => DesignSide): UpdateDeps => ({
  admin: db.admin,
  merge: mergeOver(db, theirs),
  checkTree: async () => null,
});

const draftWrites = (db: FakeDb) => db.writes.filter((w) => w.kind === "rpc" && w.target === "talent_site_write_draft");
const stateOf = (db: FakeDb) => db.tables.talent_site_theme_updates![0]!.state;
const homeSide = (db: FakeDb): DesignSide => ({
  trees: { home: db.tables.talent_pages![0]!.blocks as BuilderNode[] },
});

// ── Notice visibility ────────────────────────────────────────────────────────

test("notice shows for available, previewed and undone (F83), not applied or dismissed", () => {
  for (const s of ["available", "previewed", "undone"]) assert.equal(isNoticeVisible(s), true);
  for (const s of ["applied", "dismissed", null, undefined]) assert.equal(isNoticeVisible(s), false);
});

for (const state of ["available", "previewed", "applied", "dismissed", "undone"]) {
  const open = state === "available" || state === "previewed" || state === "undone" || state === "dismissed";
  test(`notices: a row in state ${state} ${open ? "loads" : "stays out"}`, async () => {
    const db = world(state);
    // F124: an `applied` row only stays closed while her pin is at or past the release.
    if (state === "applied") db.tables.talent_sites![0]!.theme_design_version = 2;
    const notices = await loadTalentUpdateNotices(db.admin, PROFILE);
    assert.equal(notices.length, open ? 1 : 0);
    if (open) assert.equal(notices[0]!.state, state);
  });
}

test("notices: a release not open to talents stays quiet", async () => {
  for (const rel of [release({ channel: "demos", status: "draft" }), release({ status: "paused" })]) {
    const db = world("available", rel);
    assert.equal((await loadTalentUpdateNotices(db.admin, PROFILE)).length, 0);
  }
});

test("notices: another talent's row never shows", async () => {
  const db = world();
  assert.equal((await loadTalentUpdateNotices(db.admin, "99999999-9999-4999-8999-999999999999")).length, 0);
});

test("notices: named release columns only (no base_payload, no dry_run_report)", async () => {
  const db = world();
  const [n] = await loadTalentUpdateNotices(db.admin, PROFILE);
  assert.ok(n);
  assert.equal(n.designTitle, "Maison v2");
  assert.equal(n.draftRev, 7);
  assert.doesNotMatch(TALENT_RELEASE_COLUMNS, /\*|base_payload|dry_run_report/);
  for (const s of db.selects.filter((x) => x.table === "talent_theme_releases")) {
    assert.notEqual(s.cols.trim(), "*");
  }
  assert.ok(!JSON.stringify(n).includes("secret"));
  assert.ok(!JSON.stringify(n).includes("others"));
});

test("F74: the banner read is lean (no items) and the sheet's preview carries the groups", async () => {
  const db = world();
  const [n] = await loadTalentUpdateNotices(db.admin, PROFILE, { lazyFanOut: false });
  assert.ok(n);
  assert.equal("groups" in n, false, "no release body on the notice");
  // F118 adds an actionability check (its own `items` read); the BANNER read stays lean.
  const relSelects = db.selects.filter((x) => x.table === "talent_theme_releases" && x.cols === NOTICE_RELEASE_COLUMNS);
  assert.equal(relSelects.length, 1);
  assert.equal(relSelects[0]!.cols, NOTICE_RELEASE_COLUMNS);
  assert.doesNotMatch(NOTICE_RELEASE_COLUMNS, /items|base_payload|dry_run_report|\*/);
  const res = await previewThemeUpdate(deps(db), PROFILE, UPDATE);
  assert.ok(res.ok);
  assert.deepEqual(res.value.groups.map((g) => g.group), ["auto", "blocks"]);
  assert.equal(res.value.hasApplicable, true);
});

test("F74: notice load is 4 reads with the release, site and title reads in one parallel step", async () => {
  const db = world();
  await loadTalentUpdateNotices(db.admin, PROFILE, { lazyFanOut: false });
  const tables = db.selects.map((x) => x.table);
  assert.deepEqual(tables.slice(0, 3), ["talent_site_theme_updates", "talent_theme_releases", "talent_sites"]);
  assert.equal(tables.filter((t) => t === "talent_theme_catalog").length, 1);
});

test("what's new groups: important, automatic, new blocks, layout", () => {
  const groups = groupItems([...ITEMS, { type: "layout", key: "hero" }, { type: "critical", key: "footer" }]);
  assert.deepEqual(groups.map((g) => g.group), ["critical", "auto", "blocks", "layout"]);
  assert.equal(groups.find((g) => g.group === "auto")!.items.length, 3);
  assert.equal(groups.find((g) => g.group === "blocks")!.items[0]!.noteEs, "Nuevo bloque de galería");
});

test("F73: an old release with two hero-inset layout items shows one row", () => {
  const note = { en: "Hero photo inset moves to the bottom-left. Preview it before you choose.", es: "La foto pequeña del inicio pasa abajo a la izquierda. Míralo antes de elegir." };
  const items: ReleaseItem[] = [
    { type: "layout", key: "hero/container#2/image#2:removed", tree: "home", note },
    { type: "layout", key: "hero/container#2/hero_inset_bl", tree: "home", note },
    { type: "layout", key: "footer", tree: "home", note: { en: "Footer spacing", es: "Espacio del pie" } },
    { type: "code", key: "a" },
    { type: "code", key: "b" },
  ];
  const layout = groupItems(items).find((g) => g.group === "layout")!;
  assert.equal(layout.items.length, 2, "two hero-inset entries collapse, footer stays");
  assert.equal(groupItems(items).find((g) => g.group === "auto")!.items.length, 2, "note-less items are never merged");
});

// ── Preview: no write ────────────────────────────────────────────────────────

test("preview merges in memory and writes nothing", async () => {
  const db = world();
  const before = JSON.stringify(db.tables);
  const res = await previewThemeUpdate(deps(db), PROFILE, UPDATE);
  assert.ok(res.ok);
  assert.equal(res.value.previewUrl, `/t/site/valeria?preview=draft&themeUpdate=${UPDATE}`);
  assert.ok(res.value.summary.kept >= 1, "her hero edit is kept");
  assert.ok(res.value.summary.keptLabels.includes("Hero"));
  assert.ok(res.value.placements.length >= 4);
  assert.equal(db.writes.length, 0);
  assert.equal(JSON.stringify(db.tables), before);
  assert.equal(stateOf(db), "available");
});

test("preview snapshot renders her content with the update, and writes nothing", async () => {
  const db = world();
  const snap = await loadThemeUpdatePreviewSnapshot(PROFILE, UPDATE, deps(db));
  assert.ok(snap);
  const home = snap.pages![HOME]!;
  assert.equal(prop({ trees: { home } }, "home", "menu/services_catalog", "layout"), "grid");
  assert.equal(prop({ trees: { home } }, "home", "hero", "variant"), "split", "her edited hero kept");
  assert.equal(prop({ trees: { home } }, "home", "hero/heading", "text"), "Valeria", "her content");
  // Only the measurement row moves (F76); her site is never written.
  assert.deepEqual(db.writes.map((w) => w.target), ["talent_site_theme_updates"]);
});

test("F76: opening the preview moves available to previewed without touching her site", async () => {
  const db = world();
  const before = JSON.stringify([db.tables.talent_sites, db.tables.talent_pages, db.tables.talent_site_history]);
  const snap = await loadThemeUpdatePreviewSnapshot(PROFILE, UPDATE, deps(db));
  assert.ok(snap);
  assert.equal(stateOf(db), "previewed");
  assert.equal(JSON.stringify([db.tables.talent_sites, db.tables.talent_pages, db.tables.talent_site_history]), before);
  assert.equal(draftWrites(db).length, 0);
  // Still offered, and a second look changes nothing.
  assert.equal((await loadTalentUpdateNotices(db.admin, PROFILE)).length, 1);
  await loadThemeUpdatePreviewSnapshot(PROFILE, UPDATE, deps(db));
  assert.equal(stateOf(db), "previewed");
});

test("F76: previewing never downgrades applied, dismissed or undone", async () => {
  for (const state of ["applied", "dismissed", "undone"]) {
    const db = world(state);
    await loadThemeUpdatePreviewSnapshot(PROFILE, UPDATE, deps(db));
    assert.equal(stateOf(db), state);
  }
});

// ── Apply ────────────────────────────────────────────────────────────────────

test("apply: one atomic draft write with one history entry, state applied", async () => {
  const db = world();
  const res = await applyThemeUpdate(deps(db), { talentProfileId: PROFILE, updateId: UPDATE, expectedDraftRev: 7, actorId: "u-1" });
  assert.ok(res.ok);
  assert.equal(res.value.draftRev, 8);
  assert.ok(res.value.kept >= 1);
  assert.equal(draftWrites(db).length, 1);
  const history = db.tables.talent_site_history!;
  assert.equal(history.length, 1);
  assert.equal(history[0]!.kind, "theme_update");
  assert.equal(history[0]!.undoable, true);
  assert.match(history[0]!.summary_en as string, /You applied the Maison v2 update · kept \d+ of your edits/);
  assert.equal(stateOf(db), "applied");
  const site = db.tables.talent_sites![0]!;
  assert.equal(site.theme_design_version, 2);
  assert.equal((site.design_tokens_draft as Record<string, string>)["space.row"], "12px");
  assert.equal(prop(homeSide(db), "home", "hero/heading", "text"), "Valeria");
  assert.equal(prop(homeSide(db), "home", "hero", "style.paddingY"), "xl", "her edit kept");
  // Nothing goes live until she publishes.
  assert.equal(prop({ trees: { home: db.tables.talent_pages![0]!.blocks_published as BuilderNode[] } }, "home", "menu/services_catalog", "layout"), "rows");
  assert.equal((site.design_tokens as Record<string, string>)["space.row"], "8px");
});

test("apply: a stale draft_rev writes nothing and leaves the state", async () => {
  const db = world();
  const res = await applyThemeUpdate(deps(db), { talentProfileId: PROFILE, updateId: UPDATE, expectedDraftRev: 3, actorId: null });
  assert.equal(res.ok, false);
  assert.equal(!res.ok && res.code, "VERSION_CONFLICT");
  assert.equal(db.tables.talent_site_history!.length, 0);
  assert.equal(stateOf(db), "available");
});

test("apply: toast copy says how many edits were kept (EN + ES, no em dash)", () => {
  assert.equal(appliedToast(3, "en"), "Update applied to your draft · we kept 3 of your edits");
  assert.equal(appliedToast(3, "es"), "Actualización aplicada a tu borrador · conservamos 3 de tus cambios");
  assert.equal(bannerTitle("Maison v2", "es"), "Maison v2 tiene una actualización");
  const line = keptLine(summarizeReport({ applied: [], added: [], kept: [], conflicts: [] }), "en");
  for (const s of [appliedToast(1, "en"), appliedToast(1, "es"), line]) assert.ok(!s.includes("—"));
});

test("F78: Apply merges automatic + layout items only; a new block is never inserted", async () => {
  const db = world();
  const res = await applyThemeUpdate(deps(db), { talentProfileId: PROFILE, updateId: UPDATE, expectedDraftRev: 7, actorId: null });
  assert.ok(res.ok);
  assert.ok(!topKeys(homeSide(db), "home").includes("gallery"), "gallery block not added by Apply");
  assert.equal(prop(homeSide(db), "home", "menu/services_catalog", "layout"), "grid", "automatic change applied");
  const entry = db.tables.talent_site_history![0]!.report as { merge: { added: unknown[] } };
  assert.equal(entry.merge.added.length, 0);
});

test("F78: preview counts and the preview render exclude new blocks", async () => {
  const db = world();
  const withBlock = await previewThemeUpdate(deps(db), PROFILE, UPDATE);
  assert.ok(withBlock.ok);
  assert.equal(withBlock.value.summary.added, 0);
  const snap = await loadThemeUpdatePreviewSnapshot(PROFILE, UPDATE, deps(db));
  assert.ok(!topKeys({ trees: { home: snap!.pages![HOME]! } }, "home").includes("gallery"));
});

test("F78: the block still arrives through Add this block, and Apply after it does not duplicate", async () => {
  const db = world();
  const add = await addThemeUpdateBlock(deps(db), { talentProfileId: PROFILE, updateId: UPDATE, itemId: "new-block:gallery", afterId: null, expectedDraftRev: 7, actorId: null });
  assert.ok(add.ok);
  const rev = db.tables.talent_sites![0]!.draft_rev as number;
  const res = await applyThemeUpdate(deps(db), { talentProfileId: PROFILE, updateId: UPDATE, expectedDraftRev: rev, actorId: null });
  assert.ok(res.ok);
  assert.equal(topKeys(homeSide(db), "home").filter((k) => k === "gallery").length, 1);
});

test("F78: sheet copy states what Apply will do (EN + ES, no em dash)", () => {
  assert.equal(applyLabel(2, "en"), "Apply 2 changes");
  assert.equal(applyLabel(1, "en"), "Apply 1 change");
  assert.equal(applyLabel(2, "es"), "Aplicar 2 cambios");
  assert.equal(applyLabel(null, "en"), "Apply to my draft");
  assert.equal(applyLabel(0, "es"), "Aplicar a mi borrador");
  for (const g of Object.values(GROUP_COPY)) assert.ok(!JSON.stringify(g).includes("—"));
  assert.match(GROUP_COPY.blocks.hintEn, /Apply never adds them/);
  assert.ok(!JSON.stringify(UPDATE_COPY).includes("—"));
  // TUL-325: post-apply Publish CTA (exact EN/ES; em-dash covered above).
  assert.deepEqual(UPDATE_COPY.publishCta, { en: "Publish site", es: "Publicar sitio" });
  assert.deepEqual(UPDATE_COPY.unpublishedPill, { en: "Unpublished changes", es: "Cambios sin publicar" });
});

test("F78: a release of only new blocks has nothing for Apply", async () => {
  const db = world("available", release({ items: [ITEMS[1]!] }));
  const res = await previewThemeUpdate(deps(db), PROFILE, UPDATE);
  assert.ok(res.ok);
  assert.equal(res.value.hasApplicable, false);
  assert.deepEqual(applyItemsOf([ITEMS[1]!]), []);
  assert.equal(applyItemsOf(ITEMS).length, 3);
});

test("F86: the kept-your-edits line uses localized section names shared with the go-live sheet", () => {
  const summary = summarizeReport({
    applied: [],
    added: [],
    conflicts: [],
    kept: [
      { key: "footer", change: "props" },
      { key: "hero/heading", change: "props" },
      { key: "gallery", change: "props" },
      { key: "menu/services_catalog", change: "props" },
      { key: "contact", change: "props" },
      { key: "color.accent", change: "token" },
    ] as never,
  });
  assert.equal(
    keptLine(summary, "es"),
    "Conservamos 6 de tus cambios: Pie de página, Portada, Galería, Servicios, Contacto, colores",
  );
  assert.equal(
    keptLine(summary, "en"),
    "We keep 6 of your edits: Footer, Hero, Gallery, Services, Contact, colours",
  );
  assert.equal(sectionNameForKey("hero", "es"), "Portada");
  assert.ok(!keptLine(summary, "es").includes("—"));
});

/** A merge that reports "no exact base" (site older than origin stamps). */
const noBaseDeps = (db: FakeDb): UpdateDeps => {
  const base = mergeOver(db);
  return { ...deps(db), merge: async (ctx, items) => {
    const out = await base(ctx, items);
    return out.ok ? { ...out, noBase: true } : out;
  } };
};

test("F87: a no-base site is offered only new blocks and Apply is unavailable", async () => {
  const db = world("available", release({ items: [...ITEMS, { type: "layout", key: "hero", note: { en: "Hero inset", es: "Foto del inicio" } }] }));
  const res = await previewThemeUpdate(noBaseDeps(db), PROFILE, UPDATE);
  assert.ok(res.ok);
  assert.equal(res.value.noBase, true);
  assert.equal(res.value.hasApplicable, false);
  assert.deepEqual(res.value.groups.map((g) => g.group), ["blocks"], "no automatic or layout items");
  assert.equal(UPDATE_COPY.noBase.es, "Tu sitio es anterior a esta versión: puedes agregar los bloques nuevos.");
});

test("F87: Apply on a no-base site is refused server-side and writes nothing", async () => {
  const db = world();
  const res = await applyThemeUpdate(noBaseDeps(db), { talentProfileId: PROFILE, updateId: UPDATE, expectedDraftRev: 7, actorId: null });
  assert.equal(res.ok, false);
  assert.equal(!res.ok && res.code, "no_base");
  assert.equal(draftWrites(db).length, 0);
  assert.equal(stateOf(db), "available");
});

test("F87: a site with an exact base is unchanged (all groups, Apply available)", async () => {
  const db = world();
  const res = await previewThemeUpdate(deps(db), PROFILE, UPDATE);
  assert.ok(res.ok);
  assert.equal(res.value.noBase, false);
  assert.equal(res.value.hasApplicable, true);
});

// ── Undo ─────────────────────────────────────────────────────────────────────

test("undo this update: reverts it, keeps her later edit, state undone", async () => {
  const db = world();
  const res = await applyThemeUpdate(deps(db), { talentProfileId: PROFILE, updateId: UPDATE, expectedDraftRev: 7, actorId: null });
  assert.ok(res.ok && res.value.historyId);
  // A later edit of her own.
  const page = db.tables.talent_pages![0]!;
  page.blocks = edit(homeSide(db), "home", "about", "layout", "stack").trees.home;
  const undo = await undoThemeUpdateEntry(db.admin, {
    talentProfileId: PROFILE,
    entryId: res.value.historyId!,
    expectedDraftRev: 8,
    actorId: null,
  });
  assert.ok(undo.ok);
  assert.equal(stateOf(db), "undone");
  assert.equal(prop(homeSide(db), "home", "menu/services_catalog", "layout"), "rows", "update reverted");
  assert.equal(prop(homeSide(db), "home", "about", "layout"), "stack", "later edit kept");
  assert.equal(db.tables.talent_sites![0]!.theme_design_version, 1, "re-pinned");
  assert.doesNotMatch(db.tables.talent_site_history!.at(-1)!.summary_en as string, /\d+ changes/);
});

test("F83: after undo the update is offered again and re-applying works", async () => {
  const db = world();
  const first = await applyThemeUpdate(deps(db), { talentProfileId: PROFILE, updateId: UPDATE, expectedDraftRev: 7, actorId: null });
  assert.ok(first.ok && first.value.historyId);
  assert.equal((await loadTalentUpdateNotices(db.admin, PROFILE)).length, 0, "quiet while applied");
  const undo = await undoThemeUpdateEntry(db.admin, {
    talentProfileId: PROFILE,
    entryId: first.value.historyId!,
    expectedDraftRev: 8,
    actorId: null,
  });
  assert.ok(undo.ok);
  assert.equal(stateOf(db), "undone");
  const [again] = await loadTalentUpdateNotices(db.admin, PROFILE);
  assert.ok(again, "an undone update is re-offerable");
  assert.equal(again.state, "undone");
  const rev = db.tables.talent_sites![0]!.draft_rev as number;
  const second = await applyThemeUpdate(deps(db), { talentProfileId: PROFILE, updateId: UPDATE, expectedDraftRev: rev, actorId: null });
  assert.ok(second.ok, "re-apply works");
  assert.equal(stateOf(db), "applied");
  assert.equal(db.tables.talent_sites![0]!.theme_design_version, 2);
});

test("F82: undo summary counts what she did (parts), not nodes or props", async () => {
  const db = world();
  const res = await applyThemeUpdate(deps(db), { talentProfileId: PROFILE, updateId: UPDATE, expectedDraftRev: 7, actorId: null });
  assert.ok(res.ok && res.value.historyId);
  // One later edit of a part the update touched (the menu layout it changed).
  db.tables.talent_pages![0]!.blocks = edit(homeSide(db), "home", "menu/services_catalog", "layout", "cards").trees.home;
  const undo = await undoThemeUpdateEntry(db.admin, {
    talentProfileId: PROFILE,
    entryId: res.value.historyId!,
    expectedDraftRev: 8,
    actorId: null,
  });
  assert.ok(undo.ok);
  // History shows no saved edit after the apply: not certain, so no number.
  assert.equal(db.tables.talent_site_history!.at(-1)!.summary_en, "Undid the Maison v2 update · kept your later edits");
  assert.equal(prop(homeSide(db), "home", "menu/services_catalog", "layout"), "cards", "her edit stays");
});

test("F82: the number is the edits in history between the apply and the undo", async () => {
  const db = world();
  const res = await applyThemeUpdate(deps(db), { talentProfileId: PROFILE, updateId: UPDATE, expectedDraftRev: 7, actorId: null });
  assert.ok(res.ok && res.value.historyId);
  db.tables.talent_pages![0]!.blocks = edit(homeSide(db), "home", "menu/services_catalog", "layout", "cards").trees.home;
  const later = new Date(Date.now() + 5000).toISOString();
  db.tables.talent_site_history!.push(
    { id: "e1", talent_profile_id: PROFILE, at: later, kind: "edit", actor: "talent", edit_count: 3 },
    { id: "e0", talent_profile_id: PROFILE, at: new Date(Date.now() - 60000).toISOString(), kind: "edit", actor: "talent", edit_count: 9 },
    { id: "e2", talent_profile_id: PROFILE, at: later, kind: "edit", actor: "tulala", edit_count: 4 },
  );
  const undo = await undoThemeUpdateEntry(db.admin, { talentProfileId: PROFILE, entryId: res.value.historyId!, expectedDraftRev: 8, actorId: null });
  assert.ok(undo.ok);
  assert.equal(db.tables.talent_site_history!.at(-1)!.summary_en, "Undid the Maison v2 update · kept your 3 later edits");
  assert.equal(db.tables.talent_site_history!.at(-1)!.summary_es, "Deshiciste la actualización Maison v2 · conservamos tus 3 ediciones posteriores");
});

// ── Available blocks ─────────────────────────────────────────────────────────

test("available blocks: a skipped block stays on offer after Apply and can be added later", async () => {
  const db = world();
  const seen: Array<number | null> = [];
  const base = deps(db);
  const spy: UpdateDeps = { ...base, merge: async (ctx, items) => { seen.push(ctx.pinnedVersion); return base.merge(ctx, items); } };
  const applied = await applyThemeUpdate(spy, { talentProfileId: PROFILE, updateId: UPDATE, expectedDraftRev: 7, actorId: null });
  assert.ok(applied.ok);
  assert.equal(stateOf(db), "applied");
  const before = await loadAvailableBlocks(db.admin, PROFILE);
  assert.deepEqual(before.blocks.map((b) => b.item.id), ["new-block:gallery"]);
  assert.equal(before.blocks[0]!.updateId, UPDATE);
  assert.ok(before.placements.length > 0);
  seen.length = 0;
  const add = await addThemeUpdateBlock(spy, { talentProfileId: PROFILE, updateId: UPDATE, itemId: "new-block:gallery", afterId: null, expectedDraftRev: before.draftRev, actorId: null });
  assert.ok(add.ok, "add works on an applied row");
  assert.deepEqual(seen, [1], "merged against the FROM version, so a never-added block is new, not deleted");
  assert.ok(topKeys(homeSide(db), "home").includes("gallery"));
  assert.equal((await loadAvailableBlocks(db.admin, PROFILE)).blocks.length, 0);
});

test("available blocks: removing an ADDED block is explicit and is not offered again", async () => {
  const db = world();
  const applied = await applyThemeUpdate(deps(db), { talentProfileId: PROFILE, updateId: UPDATE, expectedDraftRev: 7, actorId: null });
  assert.ok(applied.ok);
  const rev = db.tables.talent_sites![0]!.draft_rev as number;
  const add = await addThemeUpdateBlock(deps(db), { talentProfileId: PROFILE, updateId: UPDATE, itemId: "new-block:gallery", afterId: null, expectedDraftRev: rev, actorId: null });
  assert.ok(add.ok);
  db.tables.talent_pages![0]!.blocks = (db.tables.talent_pages![0]!.blocks as BuilderNode[]).filter((n) => topKeys({ trees: { home: [n] } }, "home")[0] !== "gallery");
  assert.ok(!topKeys(homeSide(db), "home").includes("gallery"));
  assert.equal((await loadAvailableBlocks(db.admin, PROFILE)).blocks.length, 0, "she removed it herself");
});

test("available blocks: design-agnostic, works for any design that ships new blocks", async () => {
  const db = world("applied", release({ design_slug: "noir-campaign" }));
  const out = await loadAvailableBlocks(db.admin, PROFILE);
  assert.deepEqual(out.blocks.map((b) => b.item.id), ["new-block:gallery"]);
});

test("available blocks: nothing before Apply, dismissed rows and other talents stay out", async () => {
  assert.equal((await loadAvailableBlocks(world().admin, PROFILE)).blocks.length, 0);
  assert.equal((await loadAvailableBlocks(world("dismissed").admin, PROFILE)).blocks.length, 0);
  assert.equal((await loadAvailableBlocks(world("applied").admin, "99999999-9999-4999-8999-999999999999")).blocks.length, 0);
  assert.equal((await loadAvailableBlocks(world("applied").admin, PROFILE)).blocks.length, 1);
});

// ── Dismiss ──────────────────────────────────────────────────────────────────

test("not now: available → dismissed, no draft write", async () => {
  const db = world();
  const res = await dismissThemeUpdate(db.admin, PROFILE, UPDATE);
  assert.ok(res.ok);
  assert.equal(stateOf(db), "dismissed");
  assert.equal(draftWrites(db).length, 0);
  // F92: no banner, but the update stays reachable as a quiet entry.
  const [n] = await loadTalentUpdateNotices(db.admin, PROFILE);
  assert.equal(n!.state, "dismissed");
  assert.equal(isNoticeVisible("dismissed"), false);
  assert.equal(isQuietEntry("dismissed"), true);
});

test("F92: a dismissed update can still be previewed and applied", async () => {
  const db = world("dismissed");
  const prev = await previewThemeUpdate(deps(db), PROFILE, UPDATE);
  assert.ok(prev.ok);
  const res = await applyThemeUpdate(deps(db), { talentProfileId: PROFILE, updateId: UPDATE, expectedDraftRev: 7, actorId: null });
  assert.ok(res.ok);
  assert.equal(stateOf(db), "applied");
});

test("F92: the notice shows a quiet entry and opens the sheet for dismissed rows (EN + ES)", async () => {
  const { readFileSync } = await import("node:fs");
  const read = (p: string) => readFileSync(`${process.cwd()}/src/${p}`, "utf8");
  assert.equal(quietEntryTitle("Maison v2", "en"), "Maison v2 update available");
  assert.equal(quietEntryTitle("Maison v2", "es"), "Maison v2: actualización disponible");
  assert.equal(UPDATE_COPY.seeWhatsNew.es, "Ver novedades");
  assert.ok(!quietEntryTitle("Maison v2", "es").includes("—"));
  const src = read("components/talent/site/theme-update/ThemeUpdateNotice.tsx");
  assert.match(src, /data-theme-update-quiet/);
  assert.match(src, /themeUpdate"\) === "open"\) setOpen\(true\)/, "?themeUpdate=open opens the sheet whatever the state");
});

test("not now never overrides an applied update", async () => {
  const db = world("applied");
  await dismissThemeUpdate(db.admin, PROFILE, UPDATE);
  assert.equal(stateOf(db), "applied");
});

test("pinned version still renders when she ignores the update", async () => {
  const db = world("dismissed");
  const site = db.tables.talent_sites![0]!;
  assert.equal(site.theme_design_version, 1);
  assert.equal(prop(homeSide(db), "home", "menu/services_catalog", "layout"), "rows");
  assert.equal(draftWrites(db).length, 0);
});

// ── Add this block ───────────────────────────────────────────────────────────

test("placeKeyAfter: top, after a section, unknown anchor leaves it", () => {
  const home = THEIRS().trees.home!;
  const aboutId = home.find((n) => topKeys({ trees: { home: [n] } }, "home")[0] === "about")!.id;
  assert.deepEqual(topKeys({ trees: { home: placeKeyAfter(home, "gallery", null) } }, "home")[0], "gallery");
  const after = topKeys({ trees: { home: placeKeyAfter(home, "gallery", aboutId) } }, "home");
  assert.equal(after[after.indexOf("about") + 1], "gallery");
  assert.deepEqual(placeKeyAfter(home, "gallery", "nope"), home);
});

test("add this block: inserted after the picked section, one history entry, no re-pin", async () => {
  const db = world();
  const hero = (db.tables.talent_pages![0]!.blocks as BuilderNode[])[0]!;
  const res = await addThemeUpdateBlock(deps(db), {
    talentProfileId: PROFILE,
    updateId: UPDATE,
    itemId: "new-block:gallery",
    afterId: hero.id,
    expectedDraftRev: 7,
    actorId: null,
  });
  assert.ok(res.ok);
  assert.deepEqual(topKeys(homeSide(db), "home"), ["hero", "gallery", "menu", "about", "faq"]);
  assert.equal(db.tables.talent_site_history!.length, 1);
  assert.match(db.tables.talent_site_history![0]!.summary_en as string, /^Added the Gallery block from Maison v2$/);
  assert.equal(db.tables.talent_sites![0]!.theme_design_version, 1, "rest of the update still on offer");
  assert.equal(prop(homeSide(db), "home", "menu/services_catalog", "layout"), "rows", "only the block landed");
  assert.equal(stateOf(db), "available");
});

test("add this block: unknown item or a non-block item is refused", async () => {
  const db = world();
  for (const itemId of ["new-block:nope", "code:price-wrap"]) {
    const res = await addThemeUpdateBlock(deps(db), {
      talentProfileId: PROFILE,
      updateId: UPDATE,
      itemId,
      afterId: null,
      expectedDraftRev: 7,
      actorId: null,
    });
    assert.equal(res.ok, false);
  }
  assert.equal(db.writes.length, 0);
});

// ── Auto improve ─────────────────────────────────────────────────────────────

function siteRef(isDemo: boolean, over: Partial<SiteRef> = {}): SiteRef {
  return {
    siteId: SITE,
    talentProfileId: PROFILE,
    userId: "u-1",
    profileCode: isDemo ? "TAL-DEMO" : "TAL-REAL",
    displayName: "Valeria",
    locale: "es",
    pinnedVersion: 1,
    isDemo,
    published: false,
    ...over,
  };
}

test("auto-improve: only untouched nodes change; one Improved by Tulala entry (demos only)", async () => {
  const db = world();
  const res = await runAutoImprove(
    { admin: db.admin, merge: mergeOver(db) },
    release({ channel: "default" }),
    "Maison v2",
    [siteRef(true)],
    { onlyDemos: true },
  );
  assert.equal(res.improved, 1);
  assert.equal(prop(homeSide(db), "home", "menu/services_catalog", "layout"), "grid", "untouched node improved");
  assert.equal(prop(homeSide(db), "home", "hero", "variant"), "split", "her edited hero untouched");
  assert.ok(!topKeys(homeSide(db), "home").includes("gallery"), "new blocks stay opt-in");
  const h = db.tables.talent_site_history!;
  assert.equal(h.length, 1);
  assert.equal(h[0]!.kind, "auto_improve");
  assert.equal(h[0]!.actor, "tulala");
  assert.equal(h[0]!.undoable, true);
  assert.match(h[0]!.summary_en as string, /^Improved by Tulala/);
  assert.match(h[0]!.summary_es as string, /^Mejorado por Tulala/);
  assert.equal(db.tables.talent_sites![0]!.theme_design_version, 1, "pinned version unchanged");
});

test("auto-improve: idempotent, demos-only skips real sites, needs channel default", async () => {
  const db = world();
  const d = { admin: db.admin, merge: mergeOver(db) };
  const def = release({ channel: "default" });
  assert.equal((await runAutoImprove(d, def, "Maison v2", [siteRef(false)], { onlyDemos: true })).improved, 0);
  assert.equal((await runAutoImprove(d, release(), "Maison v2", [siteRef(true)])).improved, 0);
  assert.equal(draftWrites(db).length, 0);
  assert.equal((await runAutoImprove(d, def, "Maison v2", [siteRef(true)])).improved, 1);
  const again = await runAutoImprove(d, def, "Maison v2", [siteRef(true)]);
  assert.equal(again.improved, 0);
  assert.equal(again.skipped, 1);
  assert.equal(draftWrites(db).length, 1);
  assert.equal((await runAutoImprove(d, def, "Maison v2", [siteRef(true, { siteId: fakeId(), pinnedVersion: 2 })])).skipped, 1);
});

test("auto-improve undo sets nothing on update rows and reverts only its changes", async () => {
  const db = world();
  await runAutoImprove({ admin: db.admin, merge: mergeOver(db) }, release({ channel: "default" }), "Maison v2", [siteRef(true)]);
  const entry = db.tables.talent_site_history![0]!;
  const undo = await undoThemeUpdateEntry(db.admin, { talentProfileId: PROFILE, entryId: entry.id as string, expectedDraftRev: 8, actorId: null });
  assert.ok(undo.ok);
  assert.equal(prop(homeSide(db), "home", "menu/services_catalog", "layout"), "rows");
  assert.equal(stateOf(db), "available");
});

// ── Bell deep link ───────────────────────────────────────────────────────────

test("bell entry deep-links to My presence with the sheet open", () => {
  const { bells } = planFanOut({ id: RELEASE, design_slug: "maison-v2", to_version: 2, rollout_pct: 100 }, [
    { siteId: SITE, talentProfileId: PROFILE, userId: "u-1", designTitle: "Maison v2", locale: "es" },
  ]);
  assert.equal(bells[0]!.target_drawer, "theme-update");
  assert.equal(bells[0]!.title, "Maison v2 tiene una actualización");
  assert.deepEqual(resolveNotificationDrawerTarget("theme-update"), {
    kind: "page",
    surface: "talent",
    path: "/talent/site?themeUpdate=open",
  });
});

// ── Make default triggers auto-improve; the UI is mounted and accessible ─────

test("channel default runs auto-improve after persisting; other channels never do", async () => {
  const { executeChannelChange } = await import("../manager/channel");
  const { buildDryRunReport } = await import("../manager/dry-run");
  const calls: string[] = [];
  const rel = {
    id: RELEASE,
    to_version: 2,
    items: ITEMS,
    dry_run_report: buildDryRunReport({ id: RELEASE, to_version: 2, items: ITEMS }, []),
    channel: "optin" as const,
    status: "published" as const,
    rollout_pct: 100,
  };
  const depsFor = () => ({
    applyToDemos: async () => ({ ok: true as const, applied: 0 }),
    fanOut: async () => ({ updates: 0, bells: 0 }),
    persist: async (c: string) => {
      calls.push(`persist:${c}`);
      return { ok: true as const };
    },
    autoImprove: async () => {
      calls.push("auto");
      return { improved: 1, failures: [] };
    },
  });
  const res = await executeChannelChange(rel, "default", depsFor());
  assert.ok(res.ok);
  assert.deepEqual(calls, ["persist:default", "auto"]);
  calls.length = 0;
  await executeChannelChange({ ...rel, channel: "demos", status: "draft" }, "optin", depsFor());
  assert.ok(!calls.includes("auto"));
});

test("static: notice mounted in My presence and the builder; sheet is an accessible dialog", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const src = join(process.cwd(), "src");
  const read = (p: string) => readFileSync(join(src, p), "utf8");
  assert.match(read("components/admin/shell/internal/talent/pages/PublicPageEditor.tsx"), /<ThemeUpdateNotice surface="presence"/);
  assert.match(read("components/talent/site/TalentPageBuilderScreen.tsx"), /<ThemeUpdateNotice surface="builder"/);
  const sheet = read("components/talent/site/theme-update/ThemeUpdateSheet.tsx");
  assert.match(sheet, /role="dialog"/);
  assert.match(sheet, /aria-modal="true"/);
  assert.match(sheet, /aria-labelledby=/);
  assert.match(sheet, /useFocusTrap/);
  assert.match(sheet, /Escape/);
  assert.match(sheet, /rounded-t-2xl/, "bottom sheet on phones");
  assert.match(sheet, /<legend/, "placement picker is a labelled group");
  for (const f of ["ThemeUpdateSheet.tsx", "ThemeUpdateNotice.tsx"]) {
    const s = read(`components/talent/site/theme-update/${f}`);
    assert.doesNotMatch(s, /#[0-9a-fA-F]{3,8}\b/, `${f}: no hex literals`);
  }
  const copy = read("lib/talent-site/theme-releases/talent-update/copy.ts");
  assert.ok(!copy.includes("—"), "no em dashes");
});
