import test from "node:test";
import assert from "node:assert/strict";
import type { TalentTypeTerm } from "./type-chip";
import { classifyTrade, NEUTRAL_TRADE_LABEL, resolveTradeType } from "./trade-label";
import { pickStockHero, stockQueryForTalentType } from "./stock-hero";

const term = (id: string, slug: string, en: string, es: string, synonyms: string[] = []): TalentTypeTerm => ({ id, slug, name: { en, es }, aliases: [], synonyms });
const TERMS: TalentTypeTerm[] = [
  term("1", "3d-designer", "3D Designer", "Diseñador 3D", ["house render", "home design"]),
  term("2", "private-chef", "Private Chef", "Chef Privado", ["house chef"]),
  term("3", "makeup-artist", "Makeup Artist", "Maquillador"),
  term("4", "cleaner", "Cleaner", "Limpiador"),
  term("5", "airbnb-cleaning", "Airbnb Cleaning", "Limpieza de Airbnb"),
];

type Photo = Parameters<typeof pickStockHero>[0][number];
const photo = (id: string, over: Partial<Photo> = {}): Photo => ({
  id, url: `https://cdn.test/${id}.jpg`, width: 1600, height: 1000, alt: { es: id, en: id },
  role: "hero", businessType: null, family: "custom", originTenantId: null, timesPlaced: 0, tags: {}, direction: null, ...over,
});

test("house cleaner: a cleaning label, never design, chef or makeup", () => {
  for (const said of ["house cleaner", "House cleaning", "limpieza de casas", "Airbnb cleaning"]) {
    const r = resolveTradeType({ typeSlug: null, discipline: said, terms: TERMS });
    assert.equal(r.trade, "cleaning", said);
    assert.equal(r.confident, true, said);
    assert.ok(/clean|limpi/i.test(`${r.label.en} ${r.label.es}`), `${said} -> ${r.label.en}`);
    assert.ok(!/3d|chef|makeup|maquill/i.test(`${r.label.en} ${r.label.es}`), said);
  }
});

test("house cleaner: the hero image is a cleaning or neutral photo, never chef or makeup", () => {
  const q = stockQueryForTalentType({ slug: "cleaner", labelEn: "Cleaner" });
  assert.equal(q.businessType, "house-cleaner");
  const pool = [
    photo("chef", { businessType: "private-chef", family: "dining" }),
    photo("makeup", { businessType: "makeup-artist", family: "beauty" }),
    photo("beauty-pack", { businessType: null, family: "beauty" }),
    photo("neutral", { businessType: null, family: "custom" }),
  ];
  assert.equal(pickStockHero(pool, q)?.stockId, "neutral");
  const withClean = [...pool, photo("clean", { businessType: "house-cleaner", family: "professional" })];
  assert.equal(pickStockHero(withClean, q)?.stockId, "clean");
  assert.equal(pickStockHero(pool.slice(0, 3), q), null, "only unrelated trades: no photo, not a wrong one");
});

test("deterministic: the same input twice gives the same label and query", () => {
  const a = resolveTradeType({ typeSlug: null, discipline: "house cleaner", terms: TERMS });
  const b = resolveTradeType({ typeSlug: null, discipline: "house cleaner", terms: [...TERMS] });
  assert.deepEqual(a, b);
  assert.deepEqual(stockQueryForTalentType({ slug: a.slug, labelEn: a.label.en }), stockQueryForTalentType({ slug: b.slug, labelEn: b.label.en }));
  assert.equal(classifyTrade("House cleaner"), classifyTrade("House cleaner"));
});

test("no confident trade: the neutral label and no type slug", () => {
  for (const said of [null, "", "astronaut", "zzqx"]) {
    const r = resolveTradeType({ typeSlug: null, discipline: said, terms: TERMS });
    assert.equal(r.confident, false);
    assert.equal(r.slug, null);
    assert.deepEqual(r.label, NEUTRAL_TRADE_LABEL);
  }
});

test("a named trade is never matched to a different trade's term", () => {
  const only = [term("1", "3d-designer", "3D Designer", "Diseñador 3D", ["house cleaner"])];
  const r = resolveTradeType({ typeSlug: null, discipline: "house cleaner", terms: only });
  assert.equal(r.confident, false);
  assert.equal(r.slug, null);
});

test("a tapped chip slug wins over the words", () => {
  const r = resolveTradeType({ typeSlug: "cleaner", discipline: "something else", terms: TERMS });
  assert.equal(r.slug, "cleaner");
});
