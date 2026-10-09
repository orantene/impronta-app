/**
 * TUL-420 L2 matrix: one test per behaviour row in
 * docs/plans/theme-lifecycle/l2-customized-site-update.md
 *
 * Pure merge / upgrade / summary / draft-only rules. No release, no DB write
 * beyond the in-memory talent-update fake for L2-8 / L2-9.
 */
import test from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { upgradeSiteDesign } from "@/lib/talent-site/design-upgrade";
import { isLiveEqualToDraft } from "@/lib/talent-site/design-upgrade.server";
import { buildDesignTrees, fallbackHydrationTokens } from "@/lib/talent-site/server/theme-apply-core";
import type { DesignPayload } from "@/lib/talent-site/theme-catalog/types";

import { mergeDesignUpdate } from "./merge";
import { propsOf, readOrigin } from "./origin";
import {
  addNode,
  built,
  edit,
  plain,
  prop,
  removeKey,
  topKeys,
} from "./test-fixtures";
import type { DesignSide, ReleaseItem } from "./types";
import { combineReleaseItems, summarizeReport } from "./talent-update/view";
import {
  decisionsLine,
  keptLine,
  keptRemovedLine,
  UPDATE_COPY,
} from "./talent-update/copy";
import {
  applyThemeUpdate,
  type MergeFn,
  type TalentRelease,
  type UpdateDeps,
} from "./talent-update/talent-update.server";
import { makeFakeDb, type FakeDb } from "./talent-update/fake-db.test-helper";

const base = built(1);
const run = (ours: DesignSide, theirs: DesignSide, items?: ReleaseItem[], b: DesignSide = base) =>
  mergeDesignUpdate({ base: b, ours, theirs, ...(items ? { items } : {}) });
const asSide = (r: ReturnType<typeof run>): DesignSide => ({ trees: r.trees, tokens: r.tokens });

// ── L2-1: edited text kept ───────────────────────────────────────────────────

test("L2-1: talent-edited design text is kept when the update changes the same default", () => {
  const ours = edit(built(1), "home", "hero/button", "label", "Reserva ya");
  const r = run(ours, built(2, { ctaLabel: "Book a visit" }));
  assert.equal(prop(asSide(r), "home", "hero/button", "label"), "Reserva ya");
  assert.ok(r.report.kept.some((e) => e.key === "hero/button" || e.key.startsWith("hero")));
  const summary = summarizeReport(r.report);
  assert.match(keptLine(summary, "en"), /keep/i);
  assert.match(keptLine(summary, "es"), /Conservamos/i);
});

// ── L2-2: untouched text updates (label today; es+en via #2911 copy item) ───

test("L2-2: untouched design label takes the new default; content-owned text never moves", () => {
  const ours = built(1);
  const r = run(ours, built(2, { ctaLabel: "Book a visit", heroVariant: "stacked" }));
  assert.equal(prop(asSide(r), "home", "hero/button", "label"), "Book a visit");
  // Content-owned {{tagline}} stays hers (hydrated value), never rewritten by design.
  assert.equal(prop(asSide(r), "home", "hero/paragraph", "text"), "Nails in Roma Norte");
  const heading = (() => {
    const at = asSide(r).trees.home!;
    const hero = at.find((n) => readOrigin(n)?.key === "hero");
    return (hero as { children?: BuilderNode[] } | undefined)?.children?.find((c) => c.kind === "heading");
  })();
  assert.ok(heading);
  assert.ok((readOrigin(heading!)?.cp ?? []).includes("text"), "displayName heading stays content-owned");
});

// ── L2-3: token overrides kept; untouched tokens update ──────────────────────

test("L2-3: talent colour/font overrides stay; untouched tokens take the new default", () => {
  const tokensBase = { "space.row": "12px", "font.body": "Inter" };
  const tokensNew = { "space.row": "16px", "font.body": "Inter", "shadow.card": "soft" };
  const r = mergeDesignUpdate({
    base: { ...built(1), tokens: tokensBase },
    ours: { ...built(1), tokens: { "space.row": "40px", "font.body": "Inter" } },
    theirs: { ...built(2), tokens: tokensNew },
  });
  assert.equal(r.tokens["space.row"], "40px");
  assert.equal(r.tokens["font.body"], "Inter");
  assert.equal(r.tokens["shadow.card"], "soft");
  assert.ok(r.report.kept.some((e) => e.key === "space.row" && e.change === "token"));
  assert.ok(r.report.applied.some((e) => e.key === "shadow.card" && e.change === "token"));
});

// ── L2-4: replaced photo kept ────────────────────────────────────────────────

test("L2-4: talent photo (content-owned image src) is never overwritten by a new default", () => {
  const ours = edit(built(1), "home", "about/image", "src", "https://img.test/her-photo.jpg");
  const theirs = built(2, { heroVariant: "stacked" });
  // Target about/image still content-owned via {{headshotUrl}} → hydrated URL.
  const r = run(ours, theirs);
  assert.equal(prop(asSide(r), "home", "about/image", "src"), "https://img.test/her-photo.jpg");
  assert.ok(
    !r.report.applied.some((e) => e.key === "about/image" && (e.changes ?? []).some((c) => c.path === "src")),
  );
});

// ── L2-5: reorder/hide + new section ─────────────────────────────────────────

test("L2-5: new section lands in a sensible place; hidden/removed stay hidden; her order wins", () => {
  // Pin base = design v1 order. She reordered + hid FAQ. v2 adds gallery and
  // changes FAQ so kept(removed) is reported (F122).
  const baseSide = built(1, { order: ["hero", "menu", "about", "faq"] });
  const ours = removeKey(built(1, { order: ["menu", "hero", "about", "faq"] }), "home", "faq");
  const theirs = edit(
    built(2, {
      withGallery: true,
      heroVariant: "stacked",
      order: ["hero", "about", "menu", "gallery", "faq"],
    }),
    "home",
    "faq",
    "layout",
    "cards",
  );
  const r = mergeDesignUpdate({ base: baseSide, ours, theirs });
  const keys = topKeys(asSide(r), "home");
  assert.ok(!keys.includes("faq"), "hidden/removed stays gone");
  assert.ok(keys.includes("gallery"), "new section inserted");
  assert.ok(r.report.kept.some((e) => e.change === "order" && e.reason === "your_order"));
  assert.equal(keys[0], "menu", "her order kept at the front");
  const summary = summarizeReport(r.report);
  assert.ok(summary.removedKeys.includes("faq"));
  assert.ok(keptRemovedLine(summary, "en"));
});

// ── L2-6: edited section + kind remove/rename → preserve + warn ──────────────

test("L2-6: edited section survives a design kind rename; talent is warned via kept/conflict summary", () => {
  const ours = edit(built(1), "home", "about", "layout", "stack");
  const r = run(ours, built(2, { aboutKind: "section", heroVariant: "stacked" }));
  const at = asSide(r).trees.home!.findIndex((n) => readOrigin(n)?.key === "about");
  assert.ok(at >= 0, "about not silently dropped");
  assert.equal(asSide(r).trees.home![at]!.kind, "container", "her kind kept when edited");
  assert.equal(prop(asSide(r), "home", "about", "layout"), "stack");
  assert.ok(r.report.kept.some((e) => e.key === "about" && (e.change === "kind" || e.reason === "edited")));
  const summary = summarizeReport(r.report);
  assert.ok(summary.kept > 0, "sheet can show we keep her section");
  // Kind-kept without a prop conflict still surfaces under "what we keep".
  assert.equal(decisionsLine({ ...summary, conflicts: 0 }, "en"), null);
});

// ── L2-7: talent-added section untouched ─────────────────────────────────────

test("L2-7: a section she added herself is untouched by the update", () => {
  const ours = addNode(built(1), "home", null, plain("paragraph", { text: "My own note" }), 1);
  const r = run(ours, built(2, { heroVariant: "stacked", withGallery: true }));
  const keys = topKeys(asSide(r), "home");
  assert.ok(keys.includes("+paragraph"), keys.join());
  const note = asSide(r).trees.home!.find((n) => !readOrigin(n) && n.kind === "paragraph");
  assert.ok(note);
  assert.equal((propsOf(note!).text as string) ?? "", "My own note");
});

// ── L2-8: unpublished draft → apply draft only, never auto-publish ───────────

const PROFILE = "11111111-1111-4111-8111-111111111111";
const SITE = "22222222-2222-4222-8222-222222222222";
const HOME = "33333333-3333-4333-8333-333333333333";
const RELEASE = "44444444-4444-4444-8444-444444444444";
const UPDATE = "55555555-5555-4555-8555-555555555555";

function release(): TalentRelease {
  return {
    id: RELEASE,
    design_slug: "maison-v2",
    from_version: 1,
    to_version: 2,
    channel: "optin",
    status: "published",
    notes: { en: "Polish", es: "Pulido" },
    items: [
      { type: "variant-default", key: "*", note: { en: "Menu", es: "Menú" } },
      { type: "token-default", key: "*", tokenKeys: ["space.row"] },
    ],
    critical: false,
    published_at: "2026-09-30T00:00:00Z",
  };
}

function draftWorld(): FakeDb {
  const ours = edit(built(1, {}, { "space.row": "8px" }), "home", "hero", "style.paddingY", "xl");
  const liveHome = built(1, {}, { "space.row": "8px" }).trees.home;
  return makeFakeDb({
    talent_site_theme_updates: [
      { id: UPDATE, release_id: RELEASE, talent_site_id: SITE, talent_profile_id: PROFILE, state: "available" },
    ],
    talent_theme_releases: [{ ...release(), base_payload: null, dry_run_report: null }],
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
        shell_published: built(1).trees.shell,
        design_tokens_draft: { "space.row": "8px" },
        design_tokens: { "space.row": "8px" },
        site_published_at: "2026-01-01T00:00:00Z",
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
        blocks_published: liveHome,
      },
    ],
    talent_profiles: [{ id: PROFILE, display_name: "Valeria", user_id: "u-1" }],
    talent_theme_catalog: [{ kind: "design", slug: "maison-v2", title: "Maison v2" }],
    talent_site_history: [],
  });
}

test("L2-8: update with unpublished draft edits applies to draft only; never auto-publishes; does not overwrite her draft edit", async () => {
  assert.equal(
    isLiveEqualToDraft({
      shellTree: [{ a: 1 }],
      shellPublished: [{ a: 1 }],
      designTokensDraft: { x: "1" },
      designTokens: { x: "1" },
      pagesUnpublished: 1,
    }),
    false,
    "unpublished page edits block safe auto-publish",
  );
  assert.equal(UPDATE_COPY.draftOnly.en.includes("draft"), true);
  assert.equal(UPDATE_COPY.draftOnly.es.includes("borrador"), true);

  const db = draftWorld();
  const theirs = (): DesignSide => built(2, { heroVariant: "stacked", menuLayout: "grid" }, { "space.row": "12px" });
  const merge: MergeFn = async (ctx, items) => {
    const site = db.tables.talent_sites!.find((s) => s.id === ctx.siteId)!;
    const page = db.tables.talent_pages!.find((p) => p.talent_profile_id === ctx.talentProfileId && p.is_home)!;
    const result = mergeDesignUpdate({
      base: built(1, {}, { "space.row": "8px" }),
      ours: {
        trees: { shell: site.shell_tree as BuilderNode[], home: page.blocks as BuilderNode[] },
        tokens: site.design_tokens_draft as Record<string, string>,
      },
      theirs: theirs(),
      ...(items ? { items: items as ReleaseItem[] } : {}),
    });
    return { ok: true, result, noBase: false, homePageId: page.id as string };
  };
  const deps: UpdateDeps = {
    admin: db.admin,
    merge,
    checkTree: async () => null,
  };
  const beforePadding = prop(
    { trees: { home: db.tables.talent_pages![0]!.blocks as BuilderNode[] } },
    "home",
    "hero",
    "style.paddingY",
  );
  const res = await applyThemeUpdate(deps, {
    talentProfileId: PROFILE,
    updateId: UPDATE,
    expectedDraftRev: 7,
    actorId: "u-1",
  });
  assert.equal(res.ok, true);
  const page = db.tables.talent_pages![0]!;
  assert.equal(prop({ trees: { home: page.blocks as BuilderNode[] } }, "home", "hero", "style.paddingY"), beforePadding);
  assert.equal(
    prop({ trees: { home: page.blocks_published as BuilderNode[] } }, "home", "menu/services_catalog", "layout"),
    "rows",
    "live published blocks unchanged",
  );
  assert.equal((db.tables.talent_sites![0]!.design_tokens as Record<string, string>)["space.row"], "8px");
  assert.equal((db.tables.talent_sites![0]!.design_tokens_draft as Record<string, string>)["space.row"], "12px");
});

// ── L2-9: skipped versions → straight to latest, same rules ──────────────────

test("L2-9: skipped versions apply straight to latest with the same keep rules", () => {
  const combined = combineReleaseItems([
    { items: [{ type: "code", key: "price-wrap", note: { en: "v2" } }, { type: "new-block", key: "gallery", tree: "home" }] },
    { items: [{ type: "code", key: "price-wrap", note: { en: "v3" } }, { type: "variant-default", key: "*" }] },
  ]);
  assert.equal(combined.find((i) => i.key === "price-wrap")?.note?.en, "v3");
  assert.ok(combined.some((i) => i.type === "new-block" && i.key === "gallery"));

  const hydration = fallbackHydrationTokens("Valeria");
  const SLUG = "maison-v2";
  let seq = 0;
  const nd = (kind: string, props: Record<string, unknown>, children?: BuilderNode[]): BuilderNode =>
    ({ id: `m-${(seq += 1)}`, kind, props, ...(children ? { children } : {}) }) as unknown as BuilderNode;
  const payload = (heroLayout: string, gallery: boolean, tokens: Record<string, string>): DesignPayload => ({
    shellTree: [nd("container", { slotKey: "footer", layout: "row" }, [nd("paragraph", { text: "{{displayName}}" })])],
    homeTree: [
      nd("container", { slotKey: "hero", layout: heroLayout }, [
        nd("heading", { text: "{{displayName}}", level: 1 }),
        nd("paragraph", { text: "Book now" }),
      ]),
      nd("container", { slotKey: "about", layout: "stack" }, [nd("paragraph", { text: "About" })]),
      ...(gallery ? [nd("container", { slotKey: "gallery", layout: "grid" }, [nd("paragraph", { text: "Gallery" })])] : []),
    ],
    tokenDefaults: tokens,
  });
  const V1 = payload("stack", false, { "space.row": "12px" });
  const V3 = payload("row", true, { "space.row": "20px" });
  const b1 = buildDesignTrees(V1, hydration, undefined, { design: SLUG, version: 1 });
  assert.ok(b1.ok);
  const edited = edit(
    { trees: { shell: b1.shellTree, home: b1.homeTree }, tokens: { "space.row": "40px" } },
    "home",
    "hero",
    "layout",
    "grid",
  );
  const upgraded = upgradeSiteDesign({
    site: {
      designSlug: SLUG,
      pinnedVersion: 1,
      shellTree: edited.trees.shell,
      homeBlocks: edited.trees.home,
      designTokensDraft: { "space.row": "40px" },
      themeTokenOrigin: null,
      themeLookSlug: null,
    },
    target: { version: 3, payload: V3 },
    basePayload: V1,
    hydration,
  });
  assert.ok(upgraded.ok && !upgraded.upToDate);
  assert.equal(upgraded.toVersion, 3);
  assert.equal(upgraded.fromVersion, 1);
  assert.equal(upgraded.tokens["space.row"], "40px");
  assert.equal(prop({ trees: { home: upgraded.home }, tokens: upgraded.tokens }, "home", "hero", "layout"), "grid");
  assert.ok(topKeys({ trees: { home: upgraded.home }, tokens: {} }, "home").includes("gallery"));
});
