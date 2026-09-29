/**
 * Mexico / USA / Argentina support: the loader reads both the old (Mexico only,
 * Spanish) and the localized file shape, and the seeder writes each demo in its
 * own country, language, currency and time zone. Run:
 *   npx tsx --test scripts/demo-talents/foundation-locale.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DEFAULT_FOUNDATION_DIR, loadFoundation, parseSiteLanguage } from "./foundation-load";
import {
  buildFieldValuePlan,
  buildLanguageRows,
  buildOfferingRows,
  buildProfilePatch,
  buildServicesMenu,
  checkDemoData,
  demoCurrency,
  deriveHours,
  warnDemoData,
} from "./foundation-plan";
import { SUPPORTED_LOCALES_TARGET, applySupportedLocales, findLocationId, loadAuthUsers, readOnly, seedDemo, validateDemo } from "./foundation-seed-core";
import { verifyDemo } from "./foundation-verify";
import { addExistingLive } from "./test-fixtures";
import { harness, makeDefs, makeDemo, svc } from "./test-fixtures";

const HUB = "hub-1";
const NOW = "2026-09-29T15:00:00.000Z";

function usDemo(over: Parameters<typeof makeDemo>[0] = {}) {
  return makeDemo({
    demoId: "DEMO010",
    profileCode: "TAL-93110",
    email: "demo-nails-010@demo.tulala.digital",
    displayName: "Jordan Lee",
    firstName: "Jordan",
    lastName: "Lee",
    country: "US",
    localePrimary: "en",
    defaultLocale: "en",
    supportedLocales: ["en", "es"],
    city: "Chicago",
    neighbourhood: "Logan Square",
    state: "Illinois",
    languages: ["English", "Spanish"],
    tagline: "Manicuras y nail art en Chicago",
    taglineEn: "Manicures and nail art in Chicago",
    bio: "Hago manicuras en mi estudio de Logan Square.",
    bioEn: "I do manicures at my Logan Square studio.",
    services: [
      svc({ name: "Manicura en gel", nameEn: "Gel manicure", description: "Color liso.", descriptionEn: "Solid color.", category: "Manicura", currency: "USD", price: 65.5, mode: "instant", durationMin: 60 }),
      svc({ name: "Set acrilico", nameEn: "Acrylic set", currency: "USD", price: 95, priceDisplay: "from" }),
      svc({ name: "Nail art", nameEn: "Nail art", currency: "USD", price: 8 }),
      svc({ name: "Evento", nameEn: "Event", currency: "USD", price: 300, mode: "quote", priceDisplay: "quote", pricingUnit: "event" }),
    ],
    hours: { days: [2, 3, 4, 5, 6], startMin: 600, endMin: 1140, timezone: "America/Chicago" },
    universal: { ...makeDemo().universal, nationality: "US", homeCountry: "US", languages: ["English", "Spanish"], travelTo: ["Milwaukee"], availabilityNoteEs: "Atiendo martes a sabado." },
    ...over,
  });
}

function arDemo() {
  return makeDemo({
    demoId: "DEMO020",
    profileCode: "TAL-93120",
    email: "demo-nails-020@demo.tulala.digital",
    displayName: "Lucas Ferrari",
    firstName: "Lucas",
    lastName: "Ferrari",
    gender: "male",
    country: "AR",
    localePrimary: "es",
    city: "Rosario",
    state: "Santa Fe",
    languages: ["Español", "English"],
    services: [
      svc({ name: "Clase", nameEn: "Class", currency: "USD", price: 20, priceArsReference: 24000, mode: "instant" }),
      svc({ name: "B", nameEn: "B", currency: "USD", price: 30, priceArsReference: 36000 }),
      svc({ name: "C", nameEn: "C", currency: "USD", price: 40, priceArsReference: 48000 }),
      svc({ name: "D", nameEn: "D", currency: "USD", price: 50, priceArsReference: 60000 }),
    ],
    hours: { days: [1, 2, 3], startMin: 540, endMin: 1020, timezone: "America/Argentina/Buenos_Aires" },
    universal: { ...makeDemo().universal, nationality: "AR", homeCountry: "AR", languages: ["Español", "English"], travelTo: [] },
  });
}

// ── Loader: old and new file shapes ─────────────────────────────────────────

type Over = Record<string, unknown>;
function writeDir(opts: { outDir: string; fieldsDir: string; demos: { id: string; out?: Over; service?: Over; universal?: Over }[] }): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "foundation-loc-"));
  fs.mkdirSync(path.join(dir, opts.outDir));
  fs.mkdirSync(path.join(dir, opts.fieldsDir));
  const svcBase = (extra: Over = {}) => ({ name_es: "Servicio", description_es: "Descripcion", category_es: "Categoria", mode: "request", price_mxn: 100, price_display: "exact", pricing_unit: "session", duration_min: 60, prep_min: 0, cleanup_min: 0, notice_hours: 12, location: "studio", ...extra });
  const outRows = opts.demos.map((d) => ({
    demo_id: d.id, email: `demo-${d.id.toLowerCase()}@demo.tulala.digital`, first_name: "Ana", last_name: "Ruiz", display_name: "Ana Ruiz", gender: "female", age: 30, city: "Puebla", state: "Puebla",
    languages: ["Español"], locale: "es", taxonomy_slug: "nail-artist", tagline_es: "t", tagline_en: "t", bio_es: "b",
    services: [svcBase(d.service), svcBase(d.service), svcBase(d.service), svcBase(d.service)],
    hours: { days: [1], start: "09:00", end: "17:00", timezone: "America/Mexico_City" },
    ...d.out,
  }));
  fs.writeFileSync(path.join(dir, opts.outDir, "batch-1.json"), JSON.stringify(outRows));
  fs.writeFileSync(path.join(dir, opts.fieldsDir, "batch-1.json"), JSON.stringify(opts.demos.map((d) => ({ demo_id: d.id, universal: { pronouns: "ella", bio_en: "Universal English bio", languages: ["Español"], work_eligibility: ["MX"], restrictions: [], ...d.universal }, type_fields: {}, media_plan: { gallery: [], albums: [] } }))));
  const tf = { chain: ["nail-artist", "beauty-services", "wellness-beauty"], type_fields: [] };
  fs.writeFileSync(path.join(dir, "demo-type-fields.json"), JSON.stringify(Object.fromEntries(opts.demos.map((d) => [d.id, tf]))));
  fs.writeFileSync(path.join(dir, "live-accounts-export.json"), JSON.stringify([]));
  fs.writeFileSync(path.join(dir, "foundation.json"), JSON.stringify({ "Demo Profiles": { rows: opts.demos.map((d) => ({ "Demo ID": d.id, "Primary theme": "Maison" })) } }));
  return dir;
}

test("loader reads the OLD file shape defensively: Mexico, Spanish, MXN, English falls back to Spanish", () => {
  const dir = writeDir({ outDir: "out", fieldsDir: "fields-out", demos: [{ id: "DEMO005" }] });
  const [d] = loadFoundation({ dir });
  assert.equal(d.country, "MX");
  assert.equal(d.localePrimary, "es");
  assert.equal(d.bioEn, "Universal English bio", "falls back to the fields-out English bio");
  const s = d.services[0];
  assert.equal(s.currency, "MXN");
  assert.equal(s.price, 100, "price_mxn is read as the price");
  assert.equal(s.nameEn, "Servicio");
  assert.equal(s.descriptionEn, "Descripcion");
  assert.equal(s.priceArsReference, null);
  assert.equal(s.categoryEn, null);
  assert.deepEqual(checkDemoData(d), []);
});

test("loader reads the NEW localized shape: country, locale_primary, currency, price, English texts, ARS reference", () => {
  const usSvc = { currency: "USD", price: 65.5, price_mxn: undefined, name_en: "Gel manicure", description_en: "Solid color", category_en: "Manicure" };
  const dir = writeDir({
    outDir: "out-loc",
    fieldsDir: "fields-out-loc",
    demos: [
      { id: "DEMO010", out: { country: "US", locale_primary: "en", city: "Chicago", state: "Illinois", bio_en: "Primary English bio", languages: ["English", "Spanish"], hours: { days: [2], start: "10:00", end: "18:00", timezone: "America/Chicago" } }, service: usSvc, universal: { nationality: "US", home_country: "US", bio_en: "Universal bio" } },
      { id: "DEMO020", out: { country: "AR", locale_primary: "es", city: "Rosario", state: "Santa Fe", hours: { days: [1], start: "09:00", end: "17:00", timezone: "America/Argentina/Buenos_Aires" } }, service: { currency: "USD", price: 20, price_mxn: undefined, price_ars_reference: 24000, name_en: "Class", description_en: "One hour" } },
    ],
  });
  const [us, ar] = loadFoundation({ dir, outDir: "out-loc", fieldsDir: "fields-out-loc" });
  assert.equal(us.country, "US");
  assert.equal(us.localePrimary, "en");
  assert.equal(us.state, "Illinois");
  assert.equal(us.bioEn, "Primary English bio", "the out file's bio_en wins over the fields-out one");
  assert.equal(us.hours!.timezone, "America/Chicago");
  assert.deepEqual(us.services[0], { ...us.services[0], currency: "USD", price: 65.5, nameEn: "Gel manicure", descriptionEn: "Solid color", categoryEn: "Manicure", priceArsReference: null });
  assert.deepEqual(checkDemoData(us), []);
  assert.equal(ar.country, "AR");
  assert.equal(ar.services[0].currency, "USD");
  assert.equal(ar.services[0].priceArsReference, 24000);
  assert.equal(ar.hours!.timezone, "America/Argentina/Buenos_Aires");
  assert.deepEqual(checkDemoData(ar), []);
});

test("loader: the default folders are out/ and fields-out/ (the localized files replace them in place)", () => {
  const dir = writeDir({ outDir: "out", fieldsDir: "fields-out", demos: [{ id: "DEMO005", out: { country: "AR", locale_primary: "es" }, service: { currency: "USD", price: 12, price_ars_reference: 1, price_mxn: undefined } }] });
  const [d] = loadFoundation({ dir });
  assert.equal(d.country, "AR");
  assert.equal(d.services[0].price, 12);
});

// ── Data checks ─────────────────────────────────────────────────────────────

test("checkDemoData: currency and country must agree, only MXN/USD, ARS reference only on Argentina, live demos stay in Mexico", () => {
  assert.deepEqual(checkDemoData(makeDemo()), []);
  assert.deepEqual(checkDemoData(usDemo()), []);
  assert.deepEqual(checkDemoData(arDemo()), []);
  assert.match(checkDemoData(makeDemo({ services: makeDemo().services.map((s) => ({ ...s, currency: "USD" as const })) })).join(";"), /MX demos are priced in MXN/);
  assert.match(checkDemoData(usDemo({ services: usDemo().services.map((s) => ({ ...s, currency: "MXN" as const })) })).join(";"), /US demos are priced in USD/);
  assert.match(checkDemoData(usDemo({ services: [{ ...usDemo().services[0], currency: "ARS" as never }] })).join(";"), /currency ARS is not supported/);
  assert.match(checkDemoData(usDemo({ services: [usDemo().services[0], { ...usDemo().services[1], currency: "MXN" as const }] })).join(";"), /mix currencies/);
  assert.match(checkDemoData(usDemo({ isLive: true })).join(";"), /live demo must stay in Mexico/);
  assert.match(checkDemoData(makeDemo({ country: "BR" as never })).join(";"), /unknown country BR/);
  assert.match(checkDemoData({ ...arDemo(), services: arDemo().services.map((s) => ({ ...s, priceArsReference: null })) }).join(";"), /no price_ars_reference/);
  assert.match(checkDemoData(usDemo({ services: usDemo().services.map((s) => ({ ...s, priceArsReference: 5 })) })).join(";"), /only belongs on Argentine/);
});

test("warnDemoData: an English-primary demo without English texts is flagged, not blocked", () => {
  const bare = usDemo({ bioEn: null, services: usDemo().services.map((s) => ({ ...s, nameEn: s.name })) });
  const w = warnDemoData(bare).join(";");
  assert.match(w, /no English bio/);
  assert.match(w, /no separate English name/);
  assert.deepEqual(warnDemoData(makeDemo()), []);
});

// ── Offerings, menu, profile ────────────────────────────────────────────────

test("US offerings: USD cents (decimals rounded), English primary text, Spanish kept in i18n, currency per row", () => {
  const plan = buildOfferingRows(usDemo(), "tp", HUB, NOW);
  const [a, b, , q] = plan.rows;
  assert.equal(a.currency, "USD");
  assert.equal(a.amount_cents, 6550);
  assert.equal(a.title, "Gel manicure");
  assert.equal(a.description, "Solid color.");
  assert.deepEqual(a.title_i18n, { es: "Manicura en gel", en: "Gel manicure" });
  assert.deepEqual(a.description_i18n, { es: "Color liso.", en: "Solid color." });
  assert.equal(b.price_display, "from");
  assert.equal(q.price_display, "quote");
  assert.equal(q.amount_cents, 30000, "quote floor in USD cents");
  assert.ok(plan.rows.every((r) => r.currency === "USD"));
  assert.equal(plan.rows[0].attributes.price_ars_reference, undefined);
  // No English category text in the data: no group label rather than a Spanish one on an English site.
  assert.ok(plan.rows.every((r) => r.category === null));
  const withCat = buildOfferingRows(usDemo({ services: usDemo().services.map((s) => ({ ...s, categoryEn: "Manicure" })) }), "tp", HUB, NOW).rows;
  assert.ok(withCat.every((r) => r.category === "Manicure"));
});

test("Argentine offerings: priced in USD, the ARS reference is kept in attributes and nowhere else", () => {
  const plan = buildOfferingRows(arDemo(), "tp", HUB, NOW);
  assert.deepEqual(plan.rows.map((r) => r.attributes.price_ars_reference), [24000, 36000, 48000, 60000]);
  assert.ok(plan.rows.every((r) => r.currency === "USD" && r.amount_cents !== null));
  assert.equal(plan.rows[0].amount_cents, 2000);
  assert.equal(plan.rows[0].title, "Clase", "Spanish-primary demos keep the Spanish title");
  assert.deepEqual(plan.rows[0].title_i18n, { es: "Clase", en: "Class" });
});

test("Mexican Spanish-primary offering with no English text stores Spanish only", () => {
  const [r] = buildOfferingRows(makeDemo(), "tp", HUB, NOW).rows;
  assert.deepEqual(r.title_i18n, { es: "Manicure en gel" });
  assert.equal(r.currency, "MXN");
});

test("services_menu carries the currency and the primary-language text", () => {
  const rows = buildOfferingRows(usDemo(), "tp", HUB, NOW).rows;
  const menu = buildServicesMenu(rows);
  assert.ok(menu.every((m) => m.currency === "USD"));
  assert.equal(menu[0].name, "Gel manicure");
  assert.equal(menu[0].amountCents, 6550);
  assert.equal(menu[3].amountCents, null, "a quote has no amount in the menu");
});

function patchOf(d: ReturnType<typeof usDemo>) {
  const plan = buildOfferingRows(d, "tp", HUB, NOW);
  return buildProfilePatch(d, { userId: "u", nowIso: NOW, instantCount: plan.instantCount, hasHours: !!d.hours, servicesMenu: buildServicesMenu(plan.rows) });
}

test("US profile: English primary, USD, United States, both bios, English tagline, no Spanish availability note", () => {
  const p = patchOf(usDemo());
  assert.equal(p.preferred_locale, "en");
  assert.equal(p.default_currency, "USD");
  assert.equal(p.home_country_text, "United States");
  assert.equal(p.nationality, "United States");
  assert.deepEqual(p.bio_i18n, { es: "Hago manicuras en mi estudio de Logan Square.", en: "I do manicures at my Logan Square studio." });
  assert.equal(p.short_bio, "Manicures and nail art in Chicago");
  assert.equal(p.booking_note, null);
  assert.equal(p.home_city_text, "Chicago");
  assert.deepEqual(p.booking_terms, { directBookingOptIn: true });
});

test("Argentine profile: Spanish primary, USD, Argentina", () => {
  const p = patchOf(arDemo());
  assert.equal(p.preferred_locale, "es");
  assert.equal(p.default_currency, "USD");
  assert.equal(p.home_country_text, "Argentina");
  assert.equal(p.nationality, "Argentina");
  assert.equal(p.short_bio, arDemo().tagline);
  assert.equal(p.booking_note, arDemo().universal.availabilityNoteEs);
});

test("Mexican profile keeps México and MXN", () => {
  const p = patchOf(makeDemo());
  assert.equal(p.home_country_text, "México");
  assert.equal(p.default_currency, "MXN");
  assert.equal(demoCurrency(makeDemo()), "MXN");
});

test("hours keep the demo's own time zone; nothing assumes Mexico", () => {
  assert.equal(deriveHours(usDemo())!.timezone, "America/Chicago");
  assert.equal(deriveHours(arDemo())!.timezone, "America/Argentina/Buenos_Aires");
  assert.equal(deriveHours(makeDemo())!.timezone, "America/Cancun");
});

test("field values for an English-primary demo: English tagline and English bio first", () => {
  const plan = buildFieldValuePlan(usDemo(), makeDefs());
  const v = Object.fromEntries(plan.values.map((x) => [x.fieldKey, x.value]));
  assert.equal(v["identity.tagline"], "Manicures and nail art in Chicago");
  assert.deepEqual((v["bios"] as { locale: string }[]).map((b) => b.locale), ["en", "es"]);
});

test("an unmapped language is a problem in the dry run, not a crash", async () => {
  const h = await harness();
  const r = await validateDemo(h.ctx, usDemo({ universal: { ...usDemo().universal, languages: ["English", "Klingon"] } }));
  assert.ok(r.problems.some((p) => /no language mapping for "Klingon"/.test(p)));
  assert.equal(r.counts.talent_languages, 0);
});

test("languages accept the English names used by US demos", () => {
  assert.deepEqual(buildLanguageRows(usDemo()).map((l) => [l.language_code, l.speaking_level]), [["en", "native"], ["es", "conversational"]]);
  const many = usDemo({ universal: { ...usDemo().universal, languages: ["English", "Mandarin", "Korean", "Tagalog", "Tamil", "Urdu", "Vietnamese"] } });
  assert.deepEqual(buildLanguageRows(many).map((l) => l.language_code), ["en", "zh", "ko", "tl", "ta", "ur", "vi"]);
});

// ── Locations by country ────────────────────────────────────────────────────

test("service-area lookup is per country: Santa Fe US is not Santa Fe Argentina; New York City finds New York", () => {
  const idx = new Map([["US:santafe", "us"], ["AR:santafe", "ar"], ["US:newyork", "nyc"], ["MX:mexicocity", "mx-city"]]);
  assert.equal(findLocationId(idx, "Santa Fe", "US"), "us");
  assert.equal(findLocationId(idx, "Santa Fe", "AR"), "ar");
  assert.equal(findLocationId(idx, "Santa Fe", "MX"), null);
  assert.equal(findLocationId(idx, "New York City", "US"), "nyc");
  assert.equal(findLocationId(idx, "Ciudad de México"), "mx-city");
});

// ── End to end on the fake database ─────────────────────────────────────────

test("seeding a US and an Argentine demo writes each in its own country, language, currency and time zone", async () => {
  const h = await harness();
  await seedDemo(h.ctx, usDemo());
  await seedDemo(h.ctx, { ...arDemo(), hours: arDemo().hours });
  const [us, ar] = h.db.table("talent_profiles");
  assert.equal(us.preferred_locale, "en");
  assert.equal(us.default_currency, "USD");
  assert.equal(us.home_country_text, "United States");
  assert.equal(ar.preferred_locale, "es");
  assert.equal(ar.home_country_text, "Argentina");
  const offers = h.db.table("talent_offerings");
  assert.equal(offers.length, 8);
  assert.ok(offers.every((o) => o.currency === "USD"));
  assert.equal(offers[0].amount_cents, 6550);
  assert.equal(offers[4].attributes && (offers[4].attributes as { price_ars_reference: number }).price_ars_reference, 24000);
  assert.deepEqual(h.db.table("talent_booking_hours").map((r) => r.timezone), ["America/Chicago", "America/Argentina/Buenos_Aires"]);
  assert.equal(h.db.table("talent_pages")[0].nav_label, "Home");
  assert.equal(h.db.table("talent_pages")[1].nav_label, "Inicio");
  // Chicago has no location row in the fixture registry: home city text only, no service area.
  assert.equal(h.db.table("talent_service_areas").length, 0);
  assert.ok(h.logs.some((l) => l.includes("no location for city")));
  // Sites are still drafts.
  assert.ok(h.db.table("talent_sites").every((s) => s.status === "draft"));
});

test("a demo priced in the wrong currency for its country stops the seed and shows in the dry run", async () => {
  const h = await harness();
  const bad = usDemo({ services: usDemo().services.map((s) => ({ ...s, currency: "MXN" as const })) });
  await assert.rejects(() => seedDemo(h.ctx, bad), /US demos are priced in USD/);
  assert.equal(h.db.ops.length, 0);
  const report = await validateDemo(h.ctx, bad);
  assert.ok(report.problems.some((p) => /US demos are priced in USD/.test(p)));
});

test("dry run reports locale warnings for an English-primary demo with no English category", async () => {
  const h = await harness();
  const r = await validateDemo(h.ctx, usDemo());
  assert.deepEqual(r.problems, []);
  assert.ok(r.warnings.some((w) => /categories have no English text/.test(w)));
});

// ── Site languages ──────────────────────────────────────────────────────────

function withLangs(langs: Record<string, unknown>[], demos = [{ id: "DEMO005" }, { id: "DEMO006" }]) {
  const dir = writeDir({ outDir: "out", fieldsDir: "fields-out", demos: demos.map((d) => ({ ...d, out: { locale_primary: "es" } })) });
  fs.writeFileSync(path.join(dir, "site-languages.json"), JSON.stringify({ demos: langs }));
  return dir;
}

test("site-languages.json overrides locale_primary for new demos; absent file falls back to locale_primary", () => {
  const dir = withLangs([
    { id: "DEMO005", default_locale: "en", supported_locales: ["en", "es"] },
    { id: "DEMO006", default_locale: "es", supported_locales: ["es"] },
  ]);
  const [a, b] = loadFoundation({ dir });
  assert.equal(a.localePrimary, "en");
  assert.equal(a.defaultLocale, "en");
  assert.deepEqual(a.supportedLocales, ["en", "es"]);
  assert.equal(b.localePrimary, "es");
  const none = writeDir({ outDir: "out", fieldsDir: "fields-out", demos: [{ id: "DEMO005", out: { locale_primary: "en" } }] });
  const [c] = loadFoundation({ dir: none });
  assert.equal(c.defaultLocale, "en");
  assert.deepEqual(c.supportedLocales, ["en"]);
});

test("site languages: a live demo keeps its locale_primary", () => {
  const dir = writeDir({ outDir: "out", fieldsDir: "fields-out", demos: [{ id: "DEMO001", out: { locale_primary: "es", email: "demo-camila-unas@impronta.test" } }] });
  fs.writeFileSync(path.join(dir, "live-accounts-export.json"), JSON.stringify([{ email: "demo-camila-unas@impronta.test", profile: { profile_code: "TAL-93003" }, site: { site_slug: "camila-nails" } }]));
  fs.writeFileSync(path.join(dir, "site-languages.json"), JSON.stringify({ demos: [{ id: "DEMO001", default_locale: "en", supported_locales: ["en", "es"] }] }));
  const [d] = loadFoundation({ dir });
  assert.equal(d.isLive, true);
  assert.equal(d.localePrimary, "es");
  assert.equal(d.defaultLocale, "en", "recorded, but only written with --include-live-content");
});

test("site languages are validated: en/es only, default first, no duplicates, every demo present, code matches", () => {
  const bad = (e: Record<string, unknown>) => () => parseSiteLanguage("DEMO005", e);
  assert.deepEqual(parseSiteLanguage("D", { default_locale: "es", supported_locales: ["es", "en"] }), { defaultLocale: "es", supportedLocales: ["es", "en"], forced: false });
  assert.throws(bad({ default_locale: "fr", supported_locales: ["fr"] }), /must be "en" or "es"/);
  assert.throws(bad({ default_locale: "es", supported_locales: ["es", "fr"] }), /supported_locales must list/);
  assert.throws(bad({ default_locale: "es", supported_locales: [] }), /supported_locales must list/);
  assert.throws(bad({ default_locale: "es", supported_locales: ["en", "es"] }), /must be first/);
  assert.throws(bad({ default_locale: "es", supported_locales: ["es", "es"] }), /at most two|duplicate/);
  assert.throws(() => loadFoundation({ dir: withLangs([{ id: "DEMO005", default_locale: "es", supported_locales: ["es"] }]) }), /DEMO006: missing from site-languages/);
  assert.throws(() => loadFoundation({ dir: withLangs([{ id: "DEMO005", code: "TAL-99999", default_locale: "es", supported_locales: ["es"] }, { id: "DEMO006", default_locale: "es", supported_locales: ["es"] }]) }), /differs from/);
});

test("real site-languages.json (skipped when absent): 224 valid entries; a demo who lacks English can still list en", { skip: !fs.existsSync(path.join(DEFAULT_FOUNDATION_DIR, "site-languages.json")) }, () => {
  const demos = loadFoundation();
  const c = { es: 0, en: 0, both: 0 };
  for (const d of demos) {
    assert.equal(d.supportedLocales[0], d.defaultLocale);
    if (d.supportedLocales.length === 2) c.both += 1;
    else c[d.defaultLocale] += 1;
    if (!d.isLive) assert.equal(d.localePrimary, d.defaultLocale);
  }
  assert.deepEqual(c, { es: 59, en: 78, both: 87 });
  const d112 = demos.find((d) => d.demoId === "DEMO112")!;
  assert.ok(d112.supportedLocales.includes("en"));
  assert.ok(!d112.languages.some((l) => /english|ingl/i.test(l)), "spoken languages do not gate site languages");
});

// ── Seeder and verify ───────────────────────────────────────────────────────

test("seeding writes preferred_locale = default_locale, default-language text first, and records supported_locales", async () => {
  const h = await harness();
  const es = makeDemo({ defaultLocale: "es", supportedLocales: ["es", "en"] });
  const en = usDemo({ supportedLocales: ["en", "es"] });
  await seedDemo(h.ctx, es);
  await seedDemo(h.ctx, en);
  const [pEs, pEn] = h.db.table("talent_profiles");
  assert.equal(pEs.preferred_locale, "es");
  assert.equal(pEn.preferred_locale, "en");
  assert.deepEqual(Object.keys(pEs.bio_i18n as object), ["es", "en"]);
  assert.deepEqual(Object.keys(pEn.bio_i18n as object), ["en", "es"]);
  const bios = (id: string) => (h.db.table("talent_profile_field_values").find((r) => r.talent_profile_id === id && Array.isArray(r.value) && (r.value as { locale?: string }[])[0]?.locale) ?.value as { locale: string }[]).map((b) => b.locale);
  assert.deepEqual(bios(pEs.id as string), ["es", "en"]);
  assert.deepEqual(bios(pEn.id as string), ["en", "es"]);
  assert.equal(h.manifest.entries["TAL-93103"].defaultLocale, "es");
  assert.deepEqual(h.manifest.entries["TAL-93103"].supportedLocales, ["es", "en"]);
  assert.deepEqual(h.manifest.entries["TAL-93110"].supportedLocales, ["en", "es"]);
  assert.deepEqual(h.statuses.map((s) => [s.default_locale, s.supported_locales]), [["es", ["es", "en"]], ["en", ["en", "es"]]]);
  // No schema invented: no column was written for supported locales.
  assert.ok(h.db.ops.every((o) => !JSON.stringify(o.patch ?? o.rows ?? "").includes("supported_locales")));
});

test("applySupportedLocales writes secondary languages only (primary excluded) to talent_profiles.secondary_locales", async () => {
  const h = await harness();
  h.db.table("talent_profiles").push({ id: "tp-x" }, { id: "tp-y" });
  assert.deepEqual(SUPPORTED_LOCALES_TARGET, { table: "talent_profiles", key: "id", column: "secondary_locales" });
  assert.deepEqual(await applySupportedLocales(h.admin, { profileId: "tp-x", supportedLocales: ["en", "es"] }), { applied: true });
  assert.deepEqual(h.db.table("talent_profiles")[0].secondary_locales, ["es"]);
  await applySupportedLocales(h.admin, { profileId: "tp-y", supportedLocales: ["es"] });
  assert.deepEqual(h.db.table("talent_profiles")[1].secondary_locales, [], "single-language demos get an empty list");
  assert.deepEqual(await applySupportedLocales(h.admin, { profileId: "tp-x", supportedLocales: ["en", "es"] }, null), { applied: false });
});

test("a demo who does not speak English can still list en as a supported site language", async () => {
  const h = await harness();
  const d = makeDemo({ languages: ["Español"], defaultLocale: "es", supportedLocales: ["es", "en"], universal: { ...makeDemo().universal, languages: ["Español"] } });
  await seedDemo(h.ctx, d);
  assert.deepEqual(h.manifest.entries["TAL-93103"].supportedLocales, ["es", "en"]);
  assert.equal(h.db.table("talent_languages").length, 1);
});

test("live demos: preferred_locale is not written by default, only with --include-live-content", async () => {
  const live = () => makeDemo({ isLive: true, profileCode: "TAL-93003", email: "demo-camila-unas@impronta.test", defaultLocale: "en", supportedLocales: ["en", "es"] });
  const h = await harness();
  const ids = addExistingLive(h.db, live());
  h.db.table("talent_profiles").find((r) => r.id === ids.profileId)!.preferred_locale = "es";
  h.ctx.auth = await loadAuthUsers(h.admin);
  await seedDemo(h.ctx, live());
  assert.equal(h.db.table("talent_profiles")[0].preferred_locale, "es");
  assert.equal(h.manifest.entries["TAL-93003"], undefined);
  h.ctx.includeLiveContent = true;
  await seedDemo(h.ctx, live());
  assert.equal(h.db.table("talent_profiles")[0].preferred_locale, "en");
});

test("verify: preferred_locale must equal default_locale for new demos; supported_locales come from the manifest", async () => {
  const h = await harness();
  const d = usDemo({ supportedLocales: ["en", "es"] });
  await seedDemo(h.ctx, d);
  const info: string[] = [];
  const ctx = {
    admin: readOnly(h.admin), hubTenantId: h.ctx.hubTenantId, termIds: h.ctx.termIds, fieldDefs: h.ctx.fieldDefs,
    authByEmail: new Map(h.db.users.map((u) => [u.email.toLowerCase(), u as never])), locations: h.ctx.locations, now: h.ctx.now,
    manifest: h.manifest, info: (l: string) => info.push(l),
  };
  assert.deepEqual(await verifyDemo(ctx, d), []);
  assert.match(info.join("\n"), /site language en; supported_locales \["en","es"\] \(manifest\)/);
  h.db.table("talent_profiles")[0].preferred_locale = "es";
  assert.match((await verifyDemo(ctx, d)).join("\n"), /preferred_locale is es, expected en/);
  h.db.table("talent_profiles")[0].preferred_locale = "en";
  h.manifest.entries["TAL-93110"].supportedLocales = ["en"];
  assert.match((await verifyDemo(ctx, d)).join("\n"), /manifest supported_locales \["en"\]/);
});
