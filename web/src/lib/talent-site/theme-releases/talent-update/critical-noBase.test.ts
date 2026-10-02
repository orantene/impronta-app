/**
 * F125: critical fixes reach noBase (old-pin) sites by targeted key match,
 * never a full merge; undoable; the offer closes once applied.
 */
import test from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { undoThemeUpdateEntry } from "@/lib/talent-site/history/history.server";
import { planCriticalFix } from "../critical-targeted";
import { offerActionableFor, noBaseOfferItems } from "../offer-actionable.server";
import { getPath, propsOf } from "../origin";
import { built, edit } from "../test-fixtures";
import type { ReleaseItem } from "../types";
import { findKeyPath } from "../tree-ops";
import { makeFakeDb, type FakeDb } from "./fake-db.test-helper";
import { applyCriticalFix } from "./critical-fix.server";
import { previewThemeUpdate, applyThemeUpdate, type MergeFn, type TalentRelease, type UpdateDeps } from "./talent-update.server";

const PROFILE = "11111111-1111-4111-8111-111111111111";
const SITE = "22222222-2222-4222-8222-222222222222";
const HOME = "33333333-3333-4333-8333-333333333333";
const R = "44444444-4444-4444-8444-000000000009";
const U = "55555555-5555-4555-8555-000000000009";

const CRIT: ReleaseItem = { type: "critical", key: "hero", detail: { props: ["variant"] }, note: { en: "Hero a11y fix", es: "Arreglo de accesibilidad" } };
const THEIRS = () => built(3, { heroVariant: "stacked", heroPadding: "m", menuLayout: "grid" });
const nodeAt = (tree: BuilderNode[], key: string) => tree[findKeyPath(tree, key)![0]!]!;

function ours() {
  // Her v1 site: hero padding is HER edit, and the variant is the old one.
  return edit(built(1, {}), "home", "hero", "style.paddingY", "xl");
}

test("planCriticalFix sets only the named design prop, never her other edits or content", () => {
  const o = ours();
  const fix = planCriticalFix({
    ours: { trees: o.trees, tokens: {} },
    theirs: { trees: THEIRS().trees, tokens: {} },
    items: [CRIT],
  })!;
  assert.ok(fix);
  const hero = nodeAt(fix.trees.home!, "hero");
  assert.equal(propsOf(hero).variant, "stacked");
  assert.equal(getPath(propsOf(hero), "style.paddingY").value, "xl", "her edit is untouched");
  assert.deepEqual(fix.itemIds, ["critical:hero"]);
  assert.equal(fix.entries.length, 1);
  assert.equal(fix.entries[0]!.changes![0]!.path, "variant");
  // the menu layout changed in the design too, but no critical item names it:
  // the only difference from her tree is the hero variant.
  const only = JSON.stringify(fix.trees.home).replace('"variant":"stacked"', '"variant":"split"');
  assert.equal(only, JSON.stringify(o.trees.home));
});

test("a node that cannot be found is skipped silently; nothing to do returns null", () => {
  const miss: ReleaseItem = { type: "critical", key: "no-such-section" };
  assert.equal(planCriticalFix({ ours: { trees: ours().trees, tokens: {} }, theirs: { trees: THEIRS().trees, tokens: {} }, items: [miss] }), null);
  // equal to the design already: nothing changes
  const same = built(1, {});
  assert.equal(planCriticalFix({ ours: { trees: same.trees, tokens: {} }, theirs: { trees: same.trees, tokens: {} }, items: [CRIT] }), null);
});

test("critical token keys take the new default on a noBase site", () => {
  const item: ReleaseItem = { type: "critical", key: "*", tokenKeys: ["color.accent"] };
  const fix = planCriticalFix({
    ours: { trees: ours().trees, tokens: { "color.accent": "#111" } },
    theirs: { trees: THEIRS().trees, tokens: { "color.accent": "#222" } },
    items: [item],
  })!;
  assert.equal(fix.tokens["color.accent"], "#222");
  assert.equal(fix.entries[0]!.change, "token");
});

function world(): FakeDb {
  const o = ours();
  const rel: TalentRelease = {
    id: R, design_slug: "maison-v2", from_version: 15, to_version: 16, channel: "optin", status: "published",
    notes: { en: "n" }, items: [CRIT], critical: true, published_at: "2026-09-30T00:00:00Z",
  };
  return makeFakeDb({
    talent_site_theme_updates: [{ id: U, release_id: R, talent_site_id: SITE, talent_profile_id: PROFILE, state: "available" }],
    talent_theme_releases: [rel],
    talent_sites: [{
      id: SITE, talent_profile_id: PROFILE, site_slug: "jorg", draft_rev: 3, theme_design_slug: "maison-v2",
      theme_design_version: 1, theme_token_origin: null, shell_tree: o.trees.shell, shell_published: o.trees.shell,
      design_tokens_draft: {}, design_tokens: {}, site_published_at: null,
    }],
    talent_pages: [{ id: HOME, talent_profile_id: PROFILE, slug: "home", title: "Home", is_home: true, sort_order: 0, blocks: o.trees.home, blocks_published: o.trees.home }],
    talent_profiles: [{ id: PROFILE, display_name: "Jorg", user_id: "u-1" }],
    talent_theme_catalog: [{ kind: "design", slug: "maison-v2", title: "Maison v2" }],
    talent_site_history: [],
  });
}

function deps(db: FakeDb): UpdateDeps {
  const merge: MergeFn = async (ctx, items) => {
    const site = db.tables.talent_sites![0]!;
    const home = db.tables.talent_pages![0]!;
    const critical = planCriticalFix({
      ours: { trees: { shell: site.shell_tree as BuilderNode[], home: home.blocks as BuilderNode[] }, tokens: {} },
      theirs: { trees: THEIRS().trees, tokens: {} },
      items: items ?? [],
    });
    void ctx;
    return {
      ok: true, noBase: true, homePageId: HOME, critical,
      result: { trees: {}, tokens: {}, report: { applied: [], added: [], kept: [], conflicts: [], removed: [], pending: [], restamped: [] } },
    } as never;
  };
  return { admin: db.admin, merge, checkTree: async () => null };
}

test("noBase preview lists the critical item and offers the fix; full Apply stays refused", async () => {
  const db = world();
  const res = await previewThemeUpdate(deps(db), PROFILE, U);
  assert.ok(res.ok);
  assert.equal(res.value.noBase, true);
  assert.equal(res.value.criticalFix, true);
  assert.equal(res.value.hasApplicable, false);
  assert.deepEqual(res.value.groups.map((g) => g.group), ["critical"]);
  const full = await applyThemeUpdate(deps(db), { talentProfileId: PROFILE, updateId: U, expectedDraftRev: 3, actorId: "u-1" });
  assert.equal(!full.ok && full.code, "no_base");
});

test("applying the fix is one atomic write, keeps the pin and the row, closes the offer, and undo restores it", async () => {
  const db = world();
  const res = await applyCriticalFix(deps(db), { talentProfileId: PROFILE, updateId: U, expectedDraftRev: 3, actorId: "u-1" });
  assert.ok(res.ok, JSON.stringify(res));
  const home = db.tables.talent_pages![0]!.blocks as BuilderNode[];
  assert.equal(propsOf(nodeAt(home, "hero")).variant, "stacked");
  assert.equal(getPath(propsOf(nodeAt(home, "hero")), "style.paddingY").value, "xl");
  assert.equal(db.tables.talent_sites![0]!.theme_design_version, 1, "pin does not move");
  assert.equal(db.tables.talent_site_theme_updates![0]!.state, "available");
  assert.deepEqual((db.tables.talent_site_theme_updates![0]!.report as { addedBlocks: string[] }).addedBlocks, ["critical:hero"]);
  assert.equal(db.tables.talent_site_history!.length, 1);

  // a second preview has nothing left to fix
  const again = await previewThemeUpdate(deps(db), PROFILE, U);
  assert.ok(again.ok);
  assert.equal(again.value.criticalFix, false);

  const undo = await undoThemeUpdateEntry(db.admin, {
    talentProfileId: PROFILE, entryId: db.tables.talent_site_history![0]!.id as string, expectedDraftRev: 4, actorId: "u-1",
  });
  assert.ok(undo.ok, JSON.stringify(undo));
  const back = db.tables.talent_pages![0]!.blocks as BuilderNode[];
  assert.equal(propsOf(nodeAt(back, "hero")).variant, "split");
  assert.equal(getPath(propsOf(nodeAt(back, "hero")), "style.paddingY").value, "xl");
  assert.equal(db.tables.talent_sites![0]!.theme_design_version, 1);
});

test("F118 x F125: a noBase offer is NOT closed while a critical fix would change her site", async () => {
  const db = world();
  db.tables.talent_theme_versions = []; // no snapshot for her pin: noBase
  const row = [{ id: U, release_id: R, report: null }];
  const newest = { id: R, from_version: 15 };
  const keep = await offerActionableFor(db.admin, PROFILE, "maison-v2", 1, row, newest, async () => true);
  assert.equal(keep, true);
  const close = await offerActionableFor(db.admin, PROFILE, "maison-v2", 1, row, newest, async () => false);
  assert.equal(close, false, "nothing to change, no missing block: closes");
  // once applied (id remembered) the candidate is gone, so the resolver is not even consulted
  const applied = await offerActionableFor(db.admin, PROFILE, "maison-v2", 1, [{ ...row[0]!, report: { addedBlocks: ["critical:hero"] } }], newest, async () => true);
  assert.equal(applied, false);
});

test("noBaseOfferItems lists missing blocks and only the critical items that change something", () => {
  const block: ReleaseItem = { type: "new-block", key: "gallery", tree: "home" };
  const other: ReleaseItem = { type: "critical", key: "footer" };
  const out = noBaseOfferItems([block, CRIT, other], [], [], ["critical:hero"]);
  assert.deepEqual(out.map((i) => i.key), ["gallery", "hero"]);
});
