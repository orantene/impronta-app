import test from "node:test";
import assert from "node:assert/strict";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { findHeroImageNode, pickStockHero, planStockHero, primaryTypeOf, stockQueryForTalentType, withStockHero } from "./stock-hero";

type Photo = Parameters<typeof pickStockHero>[0][number];
const photo = (id: string, over: Partial<Photo> = {}): Photo => ({
  id, url: `https://cdn.test/${id}.jpg`, width: 1600, height: 1000, alt: { es: `es ${id}`, en: `en ${id}` },
  role: "hero", businessType: null, family: "custom", originTenantId: null, timesPlaced: 0, tags: {}, direction: null, ...over,
});

const node = (id: string, kind: string, props: Record<string, unknown> = {}, children?: BuilderNode[]) =>
  ({ id, kind, props, ...(children ? { children } : {}) }) as unknown as BuilderNode;
const maisonHome = (heroSrc: string) => [
  node("hero", "container", {}, [
    node("copy", "container", {}, [node("h1", "heading", { text: "Rosa" })]),
    node("hero-img", "image", { src: heroSrc, alt: "Rosa", layerLabel: "Hero photo" }),
  ]),
  node("about", "container", {}, [node("about-img", "image", { src: "", alt: "" })]),
];

test("type query: a chip slug that names a catalogue type picks that type and its family", () => {
  assert.deepEqual(stockQueryForTalentType({ slug: "makeup-artist" }), { businessType: "makeup-artist", family: "beauty" });
});

test("type query: no slug and no match falls to the universal pack", () => {
  assert.deepEqual(stockQueryForTalentType({ slug: null }), { businessType: null, family: "custom" });
  assert.deepEqual(stockQueryForTalentType({ slug: "zzqx-unknown", labelEn: "Qqxz Zzv" }), { businessType: null, family: "custom" });
});

test("type query: the English label is the second try when the slug names nothing", () => {
  const q = stockQueryForTalentType({ slug: "zzqx-unknown", labelEn: "Makeup artist" });
  assert.equal(q.businessType, "makeup-artist");
});

test("pick: the talent's type pool beats the family pack, which beats the universal pack", () => {
  const photos = [
    photo("uni", { businessType: null, family: "custom" }),
    photo("fam", { businessType: null, family: "beauty" }),
    photo("typ", { businessType: "makeup-artist", family: "beauty" }),
  ];
  const got = pickStockHero(photos, { businessType: "makeup-artist", family: "beauty" });
  assert.equal(got?.stockId, "typ");
  assert.equal(got?.level, "type");
  assert.equal(pickStockHero(photos.slice(0, 2), { businessType: "makeup-artist", family: "beauty" })?.level, "family");
  assert.equal(pickStockHero(photos.slice(0, 1), { businessType: "makeup-artist", family: "beauty" })?.level, "universal");
});

test("pick: no type match uses the universal pack", () => {
  const got = pickStockHero([photo("uni")], { businessType: null, family: "custom" });
  assert.equal(got?.stockId, "uni");
  assert.equal(got?.src, "https://cdn.test/uni.jpg");
});

test("pick: an empty pool, or only small-frame roles, picks nothing", () => {
  assert.equal(pickStockHero([], { businessType: null, family: "custom" }), null);
  assert.equal(pickStockHero([photo("g", { role: "gallery" }), photo("d", { role: "detail" })], { businessType: null, family: "custom" }), null);
});

test("pick: another tenant's generated image never serves a stranger's hero", () => {
  assert.equal(pickStockHero([photo("t", { originTenantId: "tenant-1" })], { businessType: null, family: "custom" }), null);
});

test("pick: a wide frame is a valid hero; a hero-role frame wins over it at the same level", () => {
  const got = pickStockHero([photo("w", { role: "wide" }), photo("h", { role: "hero" })], { businessType: null, family: "custom" });
  assert.equal(got?.stockId, "h");
  assert.equal(pickStockHero([photo("w", { role: "wide" })], { businessType: null, family: "custom" })?.stockId, "w");
});

test("plan: an owner photo means no stock, whatever the tree and the pool hold", () => {
  const plan = planStockHero({ hasOwnPhoto: true, homeTree: maisonHome(""), photos: [photo("uni")], query: { businessType: null, family: "custom" } });
  assert.deepEqual(plan, { action: "skip", reason: "owner_photo" });
});

test("plan: no photo and an empty hero slot gets the type pick", () => {
  const plan = planStockHero({
    hasOwnPhoto: false, homeTree: maisonHome(""),
    photos: [photo("uni"), photo("typ", { businessType: "makeup-artist", family: "beauty" })],
    query: { businessType: "makeup-artist", family: "beauty" },
  });
  assert.equal(plan.action, "set");
  if (plan.action === "set") {
    assert.equal(plan.nodeId, "hero-img");
    assert.equal(plan.pick.stockId, "typ");
  }
});

test("plan: no type match falls back to family/universal", () => {
  const plan = planStockHero({ hasOwnPhoto: false, homeTree: maisonHome(""), photos: [photo("uni")], query: { businessType: null, family: "custom" } });
  assert.equal(plan.action === "set" && plan.pick.level, "universal");
});

test("plan: an empty pool changes nothing", () => {
  const plan = planStockHero({ hasOwnPhoto: false, homeTree: maisonHome(""), photos: [], query: { businessType: null, family: "custom" } });
  assert.deepEqual(plan, { action: "skip", reason: "empty_pool" });
});

test("plan: a hero slot that already has a picture (src or mediaId) is never replaced", () => {
  const q = { businessType: null, family: "custom" } as const;
  assert.deepEqual(planStockHero({ hasOwnPhoto: false, homeTree: maisonHome("https://x/own.jpg"), photos: [photo("uni")], query: q }), { action: "skip", reason: "slot_filled" });
  const withMedia = [node("img", "image", { src: "", mediaId: "m1", layerLabel: "Hero photo" })];
  assert.deepEqual(planStockHero({ hasOwnPhoto: false, homeTree: withMedia, photos: [photo("uni")], query: q }), { action: "skip", reason: "slot_filled" });
});

test("plan: a tree with no image has no hero slot", () => {
  const plan = planStockHero({ hasOwnPhoto: false, homeTree: [node("a", "heading", { text: "x" })], photos: [photo("uni")], query: { businessType: null, family: "custom" } });
  assert.deepEqual(plan, { action: "skip", reason: "no_hero_slot" });
});

test("hero node: the 'Hero photo' label wins; unlabelled trees use the first image", () => {
  assert.equal(findHeroImageNode(maisonHome(""))?.id, "hero-img");
  const unlabelled = [node("s", "container", {}, [node("first", "image", { src: "" }), node("second", "image", { src: "" })])];
  assert.equal(findHeroImageNode(unlabelled)?.id, "first");
});

test("set: only the hero node changes, in the flow language's alt, and the input tree is untouched", () => {
  const tree = maisonHome("");
  const pick = { src: "https://cdn.test/uni.jpg", alt: { es: "es uni", en: "en uni" }, level: "universal" as const, stockId: "uni" };
  const next = withStockHero(tree, "hero-img", pick, "es");
  const hero = findHeroImageNode(next)!;
  assert.equal((hero.props as Record<string, unknown>).src, "https://cdn.test/uni.jpg");
  assert.equal((hero.props as Record<string, unknown>).alt, "es uni");
  assert.equal((hero.props as Record<string, unknown>).stockSrc, "https://cdn.test/uni.jpg", "marked as a replaceable placeholder");
  assert.equal((hero.props as Record<string, unknown>).layerLabel, "Hero photo");
  assert.equal(next[1], tree[1], "the about section keeps its identity");
  assert.equal((findHeroImageNode(tree)!.props as Record<string, unknown>).src, "", "the input is not mutated");
});

test("primary type: the primary talent_type wins, other kinds are ignored, none gives nulls", () => {
  const term = (kind: string, slug: string, en: string) => ({ kind, slug, name_i18n: { en } });
  const rows = [
    { is_primary: false, display_order: 0, taxonomy_terms: term("talent_type", "photographer", "Photographer") },
    { is_primary: true, display_order: 5, taxonomy_terms: term("talent_type", "makeup-artist", "Makeup Artist") },
    { is_primary: true, display_order: 0, taxonomy_terms: term("skill", "lashes", "Lashes") },
  ];
  assert.deepEqual(primaryTypeOf(rows), { slug: "makeup-artist", labelEn: "Makeup Artist" });
  assert.deepEqual(primaryTypeOf([]), { slug: null, labelEn: null });
  assert.deepEqual(primaryTypeOf(null), { slug: null, labelEn: null });
});

test("plan: with no universal pack and no matching trade, the hero node gets NO image", () => {
  const typedOnly = [
    photo("chef", { businessType: "private-chef", family: "dining" }),
    photo("makeup", { businessType: "makeup-artist", family: "beauty" }),
  ];
  const tree = maisonHome("");
  const plan = planStockHero({ hasOwnPhoto: false, homeTree: tree, photos: typedOnly, query: { businessType: null, family: "custom" } });
  assert.deepEqual(plan, { action: "skip", reason: "empty_pool" });
  const other = planStockHero({ hasOwnPhoto: false, homeTree: tree, photos: typedOnly, query: { businessType: "house-cleaner", family: "professional" } });
  assert.deepEqual(other, { action: "skip", reason: "empty_pool" });
});
