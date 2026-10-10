import assert from "node:assert/strict";
import { test } from "node:test";

import { loadDemoContentFixture } from "./content-fixture";
import { emptySnapshot, planContentRestore, TABLE_SPECS, type ContentSnapshot } from "./content-restore";
import {
  CONTENT_WRITE_TABLES,
  desiredLanguages,
  fieldValuesWanted,
  fixtureHeightCm,
  fixtureHeroFacts,
  fixtureLocation,
  planFaqOps,
  planFieldValues,
  planHasMockupOnly,
  planLanguages,
  planOfferingOps,
  planProfilePatch,
  plannedTables,
  unmappedStats,
  type ExistingOffering,
} from "./fixture-plan";

const alba = loadDemoContentFixture("maison-v2");
const mateo = loadDemoContentFixture("folio");

/** What the DB holds after the planned inserts were applied (ids made up). */
function applied(f: typeof alba): ExistingOffering[] {
  return planOfferingOps(f, []).map((op, i) => {
    if (op.op !== "insert") throw new Error("expected insert");
    return {
      ...op.row,
      id: `o${i}`,
      title: op.row.title as string,
      status: "published",
      sort_order: i,
      variants: op.variants.map((v, j) => ({ ...v, id: `v${i}-${j}` })),
      addons: op.addons.map((a, j) => ({ ...a, id: `a${i}-${j}` })),
    };
  });
}

test("fresh demo: one insert per fixture service, quote maps to inquiry, no invented durations", () => {
  const ops = planOfferingOps(alba, []);
  assert.equal(ops.length, alba.services.length);
  const rows = ops.map((o) => (o.op === "insert" ? o.row : {}));
  const bridal = rows[rows.length - 1]!;
  assert.equal(bridal.booking_mode, "inquiry");
  assert.equal(bridal.price_display, "quote");
  assert.equal(bridal.amount_cents, null);
  const art = rows.find((r) => r.title === "Nail art a mano alzada")!;
  assert.equal(art.duration_minutes, null);
  assert.equal(art.amount_cents, 12000);
  const lash = ops[0]!;
  assert.ok(lash.op === "insert" && lash.variants.length === 3 && lash.addons.length === 2);
  if (lash.op === "insert") {
    assert.equal(lash.variants[2]!.amount_cents, 155000); // 1250 + 300 delta
    assert.equal(lash.row.reserve_mode, "deposit");
    assert.equal(lash.row.deposit_pct, 25);
  }
});

test("rerun on applied state plans zero ops (both references)", () => {
  for (const f of [alba, mateo]) assert.deepEqual(planOfferingOps(f, applied(f)), []);
});

test("extra demo offerings are archived, never deleted; changed fields update in place", () => {
  const have = applied(alba);
  have.push({ id: "extra", title: "Servicio viejo", status: "published", sort_order: 99, variants: [], addons: [] });
  have[1]!.amount_cents = 1;
  const ops = planOfferingOps(alba, have);
  assert.ok(ops.some((o) => o.op === "archive" && o.id === "extra"));
  assert.ok(!ops.some((o) => (o as { op: string }).op === "delete"));
  const upd = ops.find((o) => o.op === "update");
  assert.ok(upd && upd.op === "update" && upd.id === "o1" && upd.patch.amount_cents === 90000);
  assert.equal(ops.length, 2);
});

test("an archived demo offering with a fixture name is revived, not duplicated", () => {
  const have = applied(mateo);
  have[0]!.status = "archived";
  const ops = planOfferingOps(mateo, have);
  assert.deepEqual(ops.map((o) => o.op), ["update"]);
  assert.ok(ops[0]!.op === "update" && ops[0].patch.status === "published");
});

test("folio: inquiry keeps its price, free instant casting is a zero price", () => {
  const rows = planOfferingOps(mateo, []).map((o) => (o.op === "insert" ? o.row : {}));
  assert.equal(rows[0]!.booking_mode, "inquiry");
  assert.equal(rows[0]!.amount_cents, 950000);
  assert.equal(rows[1]!.price_display, "from");
  assert.equal(rows[3]!.booking_mode, "instant");
  assert.equal(rows[3]!.amount_cents, 0);
});

test("folio Mateo: Spanish primary offering titles + EN title_i18n (W2-5 C3)", () => {
  assert.equal(mateo.statsTitle, "Medidas · Ficha");
  assert.doesNotMatch(mateo.statsTitle ?? "", /Comp card/);
  const rows = planOfferingOps(mateo, []).map((o) => (o.op === "insert" ? o.row : {}));
  assert.equal(rows[0]!.title, "Sesión editorial, media jornada");
  assert.equal(rows[1]!.title, "Reserva de pasarela");
  assert.equal(rows[2]!.title, "Día lookbook / e-commerce");
  assert.equal((rows[0]!.title_i18n as { es?: string; en?: string }).es, "Sesión editorial, media jornada");
  assert.equal((rows[0]!.title_i18n as { es?: string; en?: string }).en, "Editorial shoot, half day");
  assert.equal((rows[1]!.title_i18n as { es?: string; en?: string }).en, "Runway show booking");
  assert.equal((rows[1]!.category_i18n as { es?: string; en?: string }).es, "Pasarela");
  assert.equal((rows[1]!.category_i18n as { es?: string; en?: string }).en, "Runway");
  for (const row of rows.slice(0, 3)) {
    assert.doesNotMatch(String(row.title), /Editorial shoot|Runway show|Lookbook \/ e-commerce day/);
  }
});

test("faq: positional insert/update, extras go back to draft", () => {
  const items = alba.faq.items;
  assert.equal(planFaqOps(items, []).length, items.length);
  const have = items.map((it, i) => ({ id: `f${i}`, question: it.q, answer: it.a, status: "published", sort_order: i }));
  assert.deepEqual(planFaqOps(items, have), []);
  have.push({ id: "old", question: "x", answer: "y", status: "published", sort_order: 9 });
  have[0]!.answer = "changed";
  const ops = planFaqOps(items, have);
  assert.deepEqual(ops.map((o) => o.op).sort(), ["unpublish", "update"]);
});

test("profile patch, fields and languages are no-ops once applied", () => {
  const have = { short_bio: alba.talent.tagline, bio_i18n: { es: alba.talent.bio }, home_city_text: alba.talent.city };
  assert.deepEqual(planProfilePatch(alba, have), {});
  assert.ok("short_bio" in planProfilePatch(alba, {}));
  const vals = new Map(fieldValuesWanted(mateo));
  assert.deepEqual(planFieldValues(mateo, vals), []);
  assert.equal(fixtureHeightCm(mateo), 188);
  assert.equal(fixtureHeightCm(alba), null);
  const langs = desiredLanguages(mateo);
  assert.deepEqual(langs.map((l) => l.language_code), ["es", "en"]);
  assert.deepEqual(planLanguages(langs, langs), { upsert: [], remove: [] });
  assert.deepEqual(planLanguages(langs, [{ language_code: "fr", display_order: 0 }, ...langs]).remove, ["fr"]);
  assert.deepEqual(unmappedStats(mateo), ["Saco", "Calzado MX"]);
});

test("reference hero facts and location come from the fixture", () => {
  assert.equal(fixtureLocation(alba)?.neighbourhood, "García Ginerés");
  assert.equal(fixtureLocation(mateo), undefined);
  const facts = fixtureHeroFacts(alba, { headline: "x", instagram: "i", languages: ["Spanish"] });
  assert.equal(facts?.headline, "Manos que hablan por ti.");
  assert.equal(facts?.languages, undefined);
});

test("mockupOnly never appears in any planned write", () => {
  for (const f of [alba, mateo]) {
    const everything = [
      planOfferingOps(f, []),
      planFaqOps(f.faq.items, []),
      planProfilePatch(f, {}),
      fieldValuesWanted(f),
      desiredLanguages(f),
      fixtureLocation(f),
    ];
    assert.equal(planHasMockupOnly(everything), false);
    const text = JSON.stringify(everything);
    for (const [k, v] of Object.entries(f.mockupOnly)) {
      if (typeof v === "string" && v.length > 6) assert.ok(!text.includes(v), `mockupOnly.${k} leaked`);
    }
  }
  assert.equal(planHasMockupOnly({ a: [{ mockupOnly: 1 }] }), true);
});

test("restore plan covers every table the content step writes", () => {
  const written = plannedTables({
    offerings: planOfferingOps(alba, []),
    faq: planFaqOps(alba.faq.items, []),
    fields: fieldValuesWanted(alba),
    languages: planLanguages(desiredLanguages(alba), []),
    profilePatch: planProfilePatch(alba, {}),
    location: true,
  });
  for (const t of written) assert.ok((CONTENT_WRITE_TABLES as readonly string[]).includes(t));

  const before: ContentSnapshot = emptySnapshot();
  const current: ContentSnapshot = emptySnapshot();
  for (const t of CONTENT_WRITE_TABLES) {
    if (t === "talent_profiles") continue;
    const spec = TABLE_SPECS[t];
    const mk = (tag: string) => Object.fromEntries(spec.key.map((k) => [k, `${tag}-${k}`]));
    before[t] = [{ ...mk("b"), v: 1 }];
    current[t] = [{ ...mk("c"), v: 2 }, { ...mk("b"), v: 9 }];
  }
  before.talent_profiles = [{ short_bio: "old", bio_i18n: {}, home_city_text: "A", height_cm: null, social_links: [] }];
  current.talent_profiles = [{ short_bio: "new", bio_i18n: {}, home_city_text: "B", height_cm: 188, social_links: [] }];
  const ops = planContentRestore(before, current);
  const covered = new Set(ops.map((o) => o.table));
  for (const t of CONTENT_WRITE_TABLES) assert.ok(covered.has(t), `restore misses ${t}`);
  assert.deepEqual(planContentRestore(before, before), []);
  const del = ops.filter((o) => o.kind === "delete").map((o) => o.table);
  assert.ok(del.indexOf("talent_offering_variants") < del.indexOf("talent_offerings"));
});
