/**
 * Unit tests for the pure parts of the foundation seeder: code mapping, the
 * identity and password guards, slugs, offerings, hours, field values, profile
 * columns and the loader. Run: npx tsx --test scripts/demo-talents/foundation.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { assertDemoIdentity, demoPasswordStatus, isDemoEmail, readDemoPassword, redact } from "./demo-identity";
import { codeForDemoId, loadFoundation, selectDemos, DEFAULT_FOUNDATION_DIR, LIVE_DEMO_CODES } from "./foundation-load";
import {
  bioToneValue,
  buildAvailabilityCells,
  buildFieldValuePlan,
  buildLanguageRows,
  buildOfferingRows,
  buildProfilePatch,
  buildServicesMenu,
  chooseSiteSlug,
  coerceFieldValue,
  deriveHours,
  emptyNamespace,
  isLabelTaken,
  mergeBookingTerms,
  plannedCounts,
  predictCompleteness,
  priceTypeFor,
  responseTimeValue,
  sellingWhere,
} from "./foundation-plan";
import { makeDefs, makeDemo, svc } from "./test-fixtures";

const HUB = "hub-1";
const NOW = "2026-09-29T15:00:00.000Z";

// ── Code mapping ────────────────────────────────────────────────────────────

test("codes: new demos are TAL-93(100+n), live demos keep their own code", () => {
  assert.equal(codeForDemoId("DEMO003"), "TAL-93103");
  assert.equal(codeForDemoId("DEMO224"), "TAL-93324");
  assert.equal(codeForDemoId("DEMO001"), "TAL-93003");
  assert.equal(codeForDemoId("DEMO044"), "TAL-93001");
  assert.equal(codeForDemoId("DEMO029"), "TAL-93010");
  assert.throws(() => codeForDemoId("DEMO225"));
  assert.throws(() => codeForDemoId("DEMO000"));
  assert.throws(() => codeForDemoId("nope"));
});

test("codes: every produced code fits the demo guard and none collide", () => {
  const codes = new Set<string>();
  for (let n = 1; n <= 224; n += 1) {
    const code = codeForDemoId(`DEMO${String(n).padStart(3, "0")}`);
    assert.match(code, /^TAL-93\d{3}$/);
    assert.ok(!codes.has(code), `duplicate ${code}`);
    codes.add(code);
  }
  assert.equal(codes.size, 224);
  assert.equal(Object.keys(LIVE_DEMO_CODES).length, 10);
});

test("selectDemos explains a code that is never used because its demo is live", () => {
  const demos = [makeDemo()];
  assert.throws(() => selectDemos(demos, ["TAL-93101"]), /DEMO001 is a live demo and keeps TAL-93003/);
  assert.equal(selectDemos(demos, ["TAL-93103"])[0].profileCode, "TAL-93103");
  assert.equal(selectDemos(demos, undefined).length, 1);
});

// ── Identity and password guards ────────────────────────────────────────────

test("identity guard accepts both demo domains and refuses anything else", () => {
  assert.doesNotThrow(() => assertDemoIdentity({ profileCode: "TAL-93004", email: "demo-lucia-modelo@impronta.test" }));
  assert.doesNotThrow(() => assertDemoIdentity({ profileCode: "TAL-93110", email: "demo-x-010@demo.tulala.digital" }));
  assert.ok(isDemoEmail("A@DEMO.TULALA.DIGITAL"));
  assert.throws(() => assertDemoIdentity({ profileCode: "TAL-93110", email: "someone@gmail.com" }), /not a demo email/);
  assert.throws(() => assertDemoIdentity({ profileCode: "TAL-92001", email: "a@impronta.test" }), /not a demo code/);
  assert.throws(() => assertDemoIdentity({ profileCode: "TAL-9310", email: "a@impronta.test" }), /not a demo code/);
});

test("password: one shared DEMO_PASSWORD, 16+ characters with upper, lower and a digit; refuses otherwise and never echoes it", () => {
  const strong = "Throwaway-Pass-1234"; // exists only in this test
  assert.throws(() => readDemoPassword({}), /REFUSE: DEMO_PASSWORD is unset/);
  assert.throws(() => readDemoPassword({ DEMO_PASSWORD: "" }), /REFUSE/);
  const weak = ["Short-1a", "alllowercase-password-1234", "ALLUPPERCASE-PASSWORD-1234", "NoDigitsInThisPassword"];
  for (const w of weak) {
    let message = "";
    try {
      readDemoPassword({ DEMO_PASSWORD: w });
    } catch (e) {
      message = (e as Error).message;
    }
    assert.match(message, /REFUSE: DEMO_PASSWORD is too weak/, w);
    assert.ok(!message.includes(w), "the value is never echoed");
  }
  assert.equal(readDemoPassword({ DEMO_PASSWORD: strong }), strong);
  assert.equal(readDemoPassword({ DEMO_PASSWORD: "Aa1aaaaaaaaaaaaa" }), "Aa1aaaaaaaaaaaaa", "exactly 16 is enough"); // secret-scan:allow: password-length unit test
  assert.throws(() => readDemoPassword({ DEMO_PASSWORD: "Aa1aaaaaaaaaaaa" }), /too weak/, "15 is not"); // secret-scan:allow: password-length unit test
  assert.equal(demoPasswordStatus({}), "unset");
  assert.equal(demoPasswordStatus({ DEMO_PASSWORD: "abc" }), "weak");
  assert.equal(demoPasswordStatus({ DEMO_PASSWORD: strong }), "ok");
  // The old scheme is gone: DEMO_PASSWORD_BASE is not read.
  assert.equal(demoPasswordStatus({ DEMO_PASSWORD_BASE: strong }), "unset");
});

test("redact strips secrets from a message", () => {
  assert.equal(redact("bad Throwaway-Pass-1234 here", ["Throwaway-Pass-1234"]), "bad [redacted] here");
  assert.equal(redact("nothing", ["", "ab"]), "nothing");
});

// ── Slugs ───────────────────────────────────────────────────────────────────

test("slug: ascii first-last, hyphenated, accents folded", () => {
  const ns = emptyNamespace();
  assert.equal(chooseSiteSlug({ firstName: "Itzel", lastName: "Canché", profileCode: "TAL-93103" }, ns), "itzel-canche");
  assert.equal(chooseSiteSlug({ firstName: "Sofía", lastName: "Villaseñor", profileCode: "TAL-93105" }, ns), "sofia-villasenor");
  assert.equal(chooseSiteSlug({ firstName: "Ana Paula", lastName: "Núñez", profileCode: "TAL-93106" }, ns), "ana-paula-nunez");
});

test("slug: -2 on a collision with a site, an agency, a domain, a reservation or a reserved label", () => {
  const ns = emptyNamespace();
  ns.siteSlugs.add("leo-haddad");
  assert.equal(chooseSiteSlug({ firstName: "Leo", lastName: "Haddad", profileCode: "TAL-93104" }, ns), "leo-haddad-2");
  ns.agencySlugs.add("maya-perez");
  assert.equal(chooseSiteSlug({ firstName: "Maya", lastName: "Perez", profileCode: "TAL-93151" }, ns), "maya-perez-2");
  ns.domainLabels.add("ana-lopez");
  assert.equal(chooseSiteSlug({ firstName: "Ana", lastName: "Lopez", profileCode: "TAL-93107" }, ns), "ana-lopez-2");
  ns.reservations.add("rosa-diaz");
  assert.equal(chooseSiteSlug({ firstName: "Rosa", lastName: "Diaz", profileCode: "TAL-93108" }, ns), "rosa-diaz-2");
  assert.ok(isLabelTaken(ns, "admin"));
  assert.ok(isLabelTaken(ns, "DEMO"));
  assert.ok(!isLabelTaken(ns, "free-label"));
});

test("slug: two demos with the same name in one batch get distinct slugs", () => {
  const ns = emptyNamespace();
  const a = chooseSiteSlug({ firstName: "Mar", lastName: "Ruiz", profileCode: "TAL-93120" }, ns);
  const b = chooseSiteSlug({ firstName: "Mar", lastName: "Ruiz", profileCode: "TAL-93121" }, ns);
  const c = chooseSiteSlug({ firstName: "Mar", lastName: "Ruiz", profileCode: "TAL-93122" }, ns);
  assert.deepEqual([a, b, c], ["mar-ruiz", "mar-ruiz-2", "mar-ruiz-3"]);
});

// ── Offerings ───────────────────────────────────────────────────────────────

test("offerings: four rows, modes, prices and the quote floor", () => {
  const d = makeDemo();
  const plan = buildOfferingRows(d, "tp-1", HUB, NOW);
  assert.equal(plan.rows.length, 4);
  const [instant, from, project, quote] = plan.rows;
  assert.equal(instant.booking_mode, "instant");
  assert.equal(instant.price_display, "exact");
  assert.equal(instant.amount_cents, 35000);
  assert.equal(instant.price_type, "per_contact");
  assert.equal(from.booking_mode, "request");
  assert.equal(from.price_display, "from");
  assert.equal(from.amount_cents, 55000);
  // A priced project is a flat package: custom would make the app treat it as quote-only.
  assert.equal(project.price_type, "flat_package");
  assert.equal(project.price_display, "exact");
  assert.equal(project.duration_minutes, null);
  // Quote keeps its floor so "A cotizar" can show "desde".
  assert.equal(quote.price_display, "quote");
  assert.equal(quote.booking_mode, "request");
  assert.equal(quote.amount_cents, 120000);
  assert.equal(quote.price_type, "event");
  for (const r of plan.rows) {
    assert.equal(r.reserve_mode, "free");
    assert.equal(r.allow_pay_in_person, true);
    assert.equal(r.owner_kind, "talent");
    assert.equal(r.status, "published");
    assert.equal(r.tenant_id, HUB);
    assert.equal(r.talent_profile_id, "tp-1");
    assert.equal(r.attributes.demo_batch, "demo-2026-09-28");
    assert.equal(r.currency, "MXN");
  }
  assert.deepEqual(plan.rows.map((r) => r.sort_order), [0, 1, 2, 3]);
  assert.deepEqual(plan.rows.map((r) => r.attributes.where), [["studio"], ["client"], ["agreed"], ["remote"]]);
  assert.equal(plan.instantCount, 1);
});

test("offerings: a quote without a price has no amount; a quote-mode service never books instantly", () => {
  const d = makeDemo({ services: [svc({ mode: "quote", price: 0, priceDisplay: "quote", pricingUnit: "project" }), svc({ name: "Otro" }), svc({ name: "C" }), svc({ name: "D" })] });
  const [q] = buildOfferingRows(d, "tp", HUB, NOW).rows;
  assert.equal(q.amount_cents, null);
  assert.equal(q.price_type, "custom");
  assert.equal(q.booking_mode, "request");
});

test("offerings: an instant service priced 'from' is written as request (the database forbids instant unless exact)", () => {
  const d = makeDemo({ services: [svc({ mode: "instant", priceDisplay: "from" }), svc({ name: "B" }), svc({ name: "C" }), svc({ name: "D" })] });
  const plan = buildOfferingRows(d, "tp", HUB, NOW);
  assert.equal(plan.rows[0].booking_mode, "request");
  assert.equal(plan.rows[0].price_display, "from");
  assert.equal(plan.instantCount, 0);
  assert.equal(plan.notes.length, 1);
  assert.match(plan.notes[0], /written as request/);
});

test("offerings: an instant project with an exact price stays instant as a flat package; zero is a price", () => {
  const d = makeDemo({ services: [svc({ mode: "instant", pricingUnit: "project", price: 0 }), svc({ name: "B" }), svc({ name: "C" }), svc({ name: "D" })] });
  const [r] = buildOfferingRows(d, "tp", HUB, NOW).rows;
  assert.equal(r.booking_mode, "instant");
  assert.equal(r.price_type, "flat_package");
  assert.equal(r.amount_cents, 0);
});

test("offerings: every pricing unit maps to a valid price_type", () => {
  const valid = new Set(["hour", "day", "week", "half_day", "event", "per_person", "per_contact", "flat_package", "custom"]);
  for (const unit of ["session", "hour", "event", "person", "package", "project", "day"] as const) {
    for (const mode of ["instant", "request", "quote"] as const) {
      assert.ok(valid.has(priceTypeFor({ mode, pricingUnit: unit })), `${unit}/${mode}`);
    }
  }
  assert.equal(priceTypeFor({ mode: "request", pricingUnit: "person" }), "per_person");
  assert.equal(priceTypeFor({ mode: "request", pricingUnit: "day" }), "day");
});

test("services_menu follows the offerings and marks only the first instant one", () => {
  const d = makeDemo({ services: [svc({ mode: "instant" }), svc({ name: "B", mode: "instant" }), svc({ name: "C", mode: "quote", priceDisplay: "quote" }), svc({ name: "D" })] });
  const rows = buildOfferingRows(d, "tp", HUB, NOW).rows;
  const menu = buildServicesMenu(rows);
  assert.deepEqual(menu.map((m) => m.isInstantBook), [true, false, false, false]);
  assert.equal(menu[2].pricingType, "custom");
  assert.equal(menu[2].amountCents, null);
});

test("selling_defaults.where is the sorted set of service locations in the app's vocabulary", () => {
  assert.deepEqual(sellingWhere(makeDemo().services), ["agreed", "client", "remote", "studio"]);
  assert.deepEqual(sellingWhere([svc({ location: "studio" }), svc({ location: "studio" })]), ["studio"]);
});

// ── Hours and buffers ───────────────────────────────────────────────────────

test("hours: buffers and notice come from the timed services only", () => {
  const d = makeDemo();
  const plan = buildOfferingRows(d, "tp", HUB, NOW);
  const h = deriveHours(d, plan.instantFlags)!;
  assert.equal(h.buffer_before_min, 10); // largest prep of the three timed services (quote's 60 ignored)
  assert.equal(h.buffer_after_min, 20); // largest cleanup of the timed services (quote's 300 ignored)
  assert.equal(h.min_notice_min, 12 * 60); // smallest notice
  assert.equal(h.horizon_days, 60);
  assert.equal(h.slot_minutes, 60); // the only instant service is 60 minutes
  assert.equal(h.timezone, "America/Cancun");
  assert.deepEqual(h.weekly["0"], []);
  assert.deepEqual(h.weekly["1"], []);
  assert.deepEqual(h.weekly["2"], [{ startMin: 600, endMin: 1140 }]);
  assert.deepEqual(h.weekly["6"], [{ startMin: 600, endMin: 1140 }]);
});

test("hours: buffer_after is capped at 240; 30-minute slots when a duration is not whole hours", () => {
  const d = makeDemo({ services: [svc({ mode: "instant", cleanupMin: 500, durationMin: 90 }), svc({ name: "B" }), svc({ name: "C" }), svc({ name: "D" })] });
  const h = deriveHours(d, [true, false, false, false])!;
  assert.equal(h.buffer_after_min, 240);
  assert.equal(h.slot_minutes, 30);
});

test("hours: none in the workbook means no row", () => {
  assert.equal(deriveHours(makeDemo({ hours: null })), null);
  assert.deepEqual(buildAvailabilityCells(makeDemo({ hours: null }), new Date(NOW)), []);
});

test("availability cells: one open cell per open weekday of the next seven days, note on the first", () => {
  const cells = buildAvailabilityCells(makeDemo(), new Date("2026-09-29T15:00:00Z")); // a Tuesday
  assert.deepEqual(cells.map((c) => c.date), ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"]);
  assert.ok(cells.every((c) => c.status === "open"));
  assert.match(cells[0].note ?? "", /martes a sábado/);
  assert.equal(cells[1].note, undefined);
});

// ── Field values ────────────────────────────────────────────────────────────

test("field values: the universal fields land under the engine's keys in the engine's vocabulary", () => {
  const plan = buildFieldValuePlan(makeDemo(), makeDefs());
  const v = Object.fromEntries(plan.values.map((x) => [x.fieldKey, x.value]));
  assert.equal(v["identity.pronouns"], "she_her");
  assert.equal(v["identity.gender"], "Woman");
  assert.equal(v["identity.ageDisplayMode"], "range");
  assert.equal(v["identity.response_time"], "4h");
  assert.equal(v["identity.tagline"], "Uñas y nail art en Playa del Carmen");
  assert.equal(v["about.bioTone"], "warm");
  assert.deepEqual((v["bios"] as { locale: string }[]).map((b) => b.locale), ["es", "en"], "primary language first");
  assert.equal(v["logistics.passportStatus"], "valid");
  assert.equal(v["logistics.driversLicense"], "standard");
  assert.deepEqual(v["logistics.workEligibility"], ["MX"]);
  assert.deepEqual(v["limits"], { hardLimits: ["Solo una clienta a la vez"], softLimits: [] });
});

test("field values: trade fields keep their kind; empties, sensitive fields and empty lists are skipped; false is kept", () => {
  const plan = buildFieldValuePlan(makeDemo(), makeDefs());
  const keys = plan.values.map((x) => x.fieldKey);
  assert.ok(keys.includes("wellness.modalities"));
  assert.ok(keys.includes("wellness.min_session_duration"));
  assert.ok(keys.includes("equipment.owns_equipment"), "false is a real value");
  assert.equal(plan.values.find((x) => x.fieldKey === "equipment.owns_equipment")!.value, false);
  assert.ok(!keys.includes("wellness.license_country"), "sensitive");
  assert.ok(!keys.includes("wellness.certifications"), "empty list");
  assert.ok(!keys.includes("ops.notes"), "empty string");
  assert.equal(plan.heightCm, 162);
  assert.ok(plan.skipped.some((s) => s.key === "wellness.license_country" && s.reason === "sensitive"));
  assert.deepEqual(plan.missingDefs, []);
  // Every key the seeder owns is listed so a re-run can drop stale rows.
  assert.ok(plan.managedKeys.includes("wellness.certifications"));
  assert.ok(plan.managedKeys.includes("limits"));
});

test("field values: a key without a definition is reported, not written", () => {
  const d = makeDemo({ typeFields: { "made.up_key": "x" } });
  const plan = buildFieldValuePlan(d, makeDefs());
  assert.deepEqual(plan.missingDefs, ["made.up_key"]);
  assert.ok(!plan.values.some((x) => x.fieldKey === "made.up_key"));
});

test("coerceFieldValue: select, multiselect, number, toggle, chips", () => {
  const defs = makeDefs();
  const select = defs.get("wellness.min_session_duration")!;
  assert.deepEqual(coerceFieldValue(select, "90 min"), { value: "90 min" });
  assert.ok("skip" in coerceFieldValue(select, "45 min"), "never invent an option");
  assert.ok("skip" in coerceFieldValue(select, ""));
  const num = defs.get("wellness.max_per_session")!;
  assert.deepEqual(coerceFieldValue(num, "3"), { value: 3 });
  assert.ok("skip" in coerceFieldValue(num, "abc"));
  assert.ok("skip" in coerceFieldValue(num, 99), "outside the field's max");
  assert.deepEqual(coerceFieldValue(defs.get("equipment.owns_equipment")!, true), { value: true });
  assert.ok("skip" in coerceFieldValue(defs.get("equipment.owns_equipment")!, "yes"));
  assert.deepEqual(coerceFieldValue(defs.get("wellness.modalities")!, ["Gel", " Gel2 "]), { value: ["Gel", "Gel2"] });
  const multi = { ...defs.get("wellness.modalities")!, kind: "multiselect", options: ["A", "B"] };
  assert.deepEqual(coerceFieldValue(multi, ["A", "Z"]), { value: ["A"] });
  assert.ok("skip" in coerceFieldValue(multi, ["Z"]));
});

test("universal vocabulary maps", () => {
  assert.equal(responseTimeValue("under_1h"), "1h");
  assert.equal(responseTimeValue("under_4h"), "4h");
  assert.equal(responseTimeValue("same_day"), "24h");
  assert.equal(responseTimeValue("next_day"), "48h");
  assert.equal(responseTimeValue("later"), null);
  assert.equal(bioToneValue("Elegante y cercana"), "warm");
  assert.equal(bioToneValue("preciso y sobrio"), "minimal");
  assert.equal(bioToneValue("juvenil y clara"), "playful");
  assert.equal(bioToneValue("algo raro"), null);
  const el = makeDemo({ universal: { ...makeDemo().universal, pronouns: "elle" } });
  assert.equal(buildFieldValuePlan(el, makeDefs()).values.find((x) => x.fieldKey === "identity.pronouns")!.value, "they_them");
});

test("languages: first is native, others conversational; unknown language fails loudly", () => {
  const rows = buildLanguageRows(makeDemo());
  assert.deepEqual(rows.map((r) => [r.language_code, r.language_name, r.speaking_level, r.is_native]), [
    ["es", "Spanish", "native", true],
    ["en", "English", "conversational", false],
  ]);
  const maya = buildLanguageRows(makeDemo({ universal: { ...makeDemo().universal, languages: ["Español", "Maya"] } }));
  assert.equal(maya[1].language_code, "yua");
  assert.throws(() => buildLanguageRows(makeDemo({ universal: { ...makeDemo().universal, languages: ["Klingon"] } })), /no language mapping/);
});

// ── Profile columns ─────────────────────────────────────────────────────────

function patchFor(d = makeDemo(), over: Partial<Parameters<typeof buildProfilePatch>[1]> = {}) {
  const plan = buildOfferingRows(d, "tp", HUB, NOW);
  return buildProfilePatch(d, {
    userId: "u1",
    nowIso: NOW,
    instantCount: plan.instantCount,
    hasHours: !!d.hours,
    servicesMenu: buildServicesMenu(plan.rows),
    ...over,
  });
}

test("profile patch (new demo): identity, bio in both languages, private dob, travel, unlisted", () => {
  const p = patchFor();
  assert.deepEqual(p.bio_i18n, { es: makeDemo().bio, en: makeDemo().universal.bioEn });
  assert.equal(p.short_bio, makeDemo().tagline);
  assert.equal(p.display_name, "Itzel Canché");
  assert.equal(p.first_name, "Itzel");
  assert.equal(p.last_name, "Canché");
  assert.equal(p.home_city_text, "Playa del Carmen");
  assert.equal(p.gender, "Woman");
  assert.equal(p.date_of_birth, "1997-03-04");
  assert.equal(p.nationality, "Mexico");
  assert.equal(p.home_country_text, "México");
  assert.equal(p.preferred_locale, "es");
  assert.equal(p.default_currency, "MXN");
  assert.deepEqual(p.languages, ["Español", "Inglés"]);
  assert.equal(p.travel_radius_km, 30);
  assert.equal(p.travel_fee_required, true);
  assert.equal(p.remote_only, false);
  assert.equal(p.is_demo, true);
  assert.equal(p.is_publicly_listed, false);
  assert.equal(p.is_discoverable, false);
  assert.equal(p.user_id, "u1");
  assert.deepEqual((p.selling_defaults as { where: string[] }).where, ["agreed", "client", "remote", "studio"]);
});

test("profile patch: directBookingOptIn only with an instant service AND hours; other terms survive", () => {
  assert.deepEqual(patchFor().booking_terms, { directBookingOptIn: true });
  assert.equal(patchFor(makeDemo({ hours: null }), { hasHours: false }).booking_terms, null, "instant but no hours");
  const noInstant = makeDemo({ services: makeDemo().services.map((s) => ({ ...s, mode: "request" as const })) });
  assert.equal(patchFor(noInstant, { instantCount: 0 }).booking_terms, null, "hours but no instant service");
  assert.deepEqual(mergeBookingTerms({ depositPct: 10, directBookingOptIn: true }, false), { depositPct: 10 });
  assert.deepEqual(mergeBookingTerms({ depositPct: 10 }, true), { depositPct: 10, directBookingOptIn: true });
});

test("profile patch (live demo): content only, never name, city, visibility or user", () => {
  const p = patchFor(makeDemo({ isLive: true, profileCode: "TAL-93003", email: "x@impronta.test" }));
  for (const k of ["display_name", "first_name", "last_name", "home_city_text", "visibility", "is_publicly_listed", "is_discoverable", "user_id", "workflow_status", "talent_plan_key", "deleted_at"]) {
    assert.ok(!(k in p), `live patch must not set ${k}`);
  }
  assert.ok("bio_i18n" in p && "services_menu" in p && "short_bio" in p);
});

test("plannedCounts: live demos never plan a site, roster or service-area row", () => {
  const plan = buildFieldValuePlan(makeDemo(), makeDefs());
  const opts = { offerings: 4, languages: 2, hasHours: true, siteExists: false, serviceAreas: 2, rosterExists: false };
  const fresh = plannedCounts(makeDemo(), plan, opts);
  assert.equal(fresh.talent_sites, 1);
  assert.equal(fresh.talent_pages, 1);
  assert.equal(fresh.talent_service_areas, 2);
  assert.equal(fresh.agency_talent_roster, 1);
  assert.equal(fresh.talent_booking_hours, 1);
  assert.equal(fresh.talent_profile_field_values, plan.values.length);
  const live = plannedCounts(makeDemo({ isLive: true }), plan, opts);
  assert.equal(live.talent_sites, 0);
  assert.equal(live.talent_pages, 0);
  assert.equal(live.talent_service_areas, 0);
  assert.equal(live.agency_talent_roster, 0);
});

test("completeness follows the workbook rules: 12/16 for a demo with photos plan, restrictions and hours", () => {
  const c = predictCompleteness(makeDemo());
  assert.equal(c.label, "12/16");
  assert.deepEqual(c.unmet, ["Tarifas", "Creditos", "Archivos", "Clientes anteriores"]);
  const bare = predictCompleteness(makeDemo({ mediaPlan: { gallery: [], albums: [] }, hours: null, universal: { ...makeDemo().universal, availabilityNoteEs: null, restrictions: [] } }));
  assert.equal(bare.label, "8/16");
});

// ── Loader ──────────────────────────────────────────────────────────────────

function writeFixtureDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "foundation-"));
  fs.mkdirSync(path.join(dir, "out"));
  fs.mkdirSync(path.join(dir, "fields-out"));
  const service = { name_es: "S", description_es: "d", category_es: "c", mode: "instant", price_mxn: 100, price_display: "exact", pricing_unit: "session", duration_min: 60, prep_min: 0, cleanup_min: 5, notice_hours: 12, location: "studio" };
  const base = (id: string, first: string, email?: string) => ({
    demo_id: id, first_name: first, ...(email ? { email } : {}), last_name: "Ruiz", display_name: `${first} Ruiz`, gender: "female", age: 30, city: "Puebla", neighbourhood: "Centro",
    state: "Puebla", languages: ["Español"], locale: "es", taxonomy_slug: "nail-artist", tagline_es: "t", tagline_en: "t", bio_es: "b",
    services: [service, service, service, service], hours: { days: [3, 1], start: "09:30", end: "18:00", timezone: "America/Mexico_City" },
  });
  fs.writeFileSync(path.join(dir, "out/batch-1.json"), JSON.stringify([base("DEMO001", "Camila", "demo-camila-unas@impronta.test"), base("DEMO003", "Itzel", "demo-nails-mx-003@demo.tulala.digital")]));
  const fields = (id: string) => ({ demo_id: id, universal: { pronouns: "ella", languages: ["Español"], work_eligibility: ["MX"], restrictions: [] }, type_fields: { "a.b": "x" }, media_plan: { gallery: ["1", "2", "3"], albums: [] } });
  fs.writeFileSync(path.join(dir, "fields-out/batch-1.json"), JSON.stringify([fields("DEMO001"), fields("DEMO003")]));
  const tf = { chain: ["nail-artist", "beauty-services", "wellness-beauty"], type_fields: [{ key: "a.b", label: "AB", kind: "text", options: null, sensitive: false }] };
  fs.writeFileSync(path.join(dir, "demo-type-fields.json"), JSON.stringify({ DEMO001: tf, DEMO003: tf }));
  fs.writeFileSync(path.join(dir, "live-accounts-export.json"), JSON.stringify([{ email: "demo-camila-unas@impronta.test", profile: { profile_code: "TAL-93003" }, site: { site_slug: "camila-nails" } }]));
  fs.writeFileSync(path.join(dir, "foundation.json"), JSON.stringify({ "Demo Profiles": { rows: [{ "Demo ID": "DEMO001", "Primary theme": "Maison" }, { "Demo ID": "DEMO003", "Proposed email": "old-proposed-003@demo.tulala.digital", "Primary theme": "Folio Pro" }] } }));
  return dir;
}

test("loader: live demo keeps its code, email and slug; new demo takes the workbook email; hours become minutes", () => {
  const dir = writeFixtureDir();
  const demos = loadFoundation({ dir });
  assert.equal(demos.length, 2);
  const [live, fresh] = demos;
  assert.equal(live.profileCode, "TAL-93003");
  assert.equal(live.email, "demo-camila-unas@impronta.test");
  assert.equal(live.isLive, true);
  assert.equal(live.siteSlug, "camila-nails");
  assert.equal(fresh.profileCode, "TAL-93103");
  assert.equal(fresh.email, "demo-nails-mx-003@demo.tulala.digital", "the out file email wins; foundation.json Proposed email is ignored");
  assert.equal(fresh.isLive, false);
  assert.equal(fresh.theme, "folio-pro");
  assert.equal(fresh.serviceCategorySlug, "beauty-services");
  assert.deepEqual(fresh.hours, { days: [1, 3], startMin: 570, endMin: 1080, timezone: "America/Mexico_City" });
  assert.equal(fresh.services.length, 4);
  assert.equal(fresh.services[0].cleanupMin, 5);
  assert.deepEqual(fresh.typeFields, { "a.b": "x" });
});

test("loader: a new demo without an email in the out file is refused (foundation.json is not a fallback)", () => {
  const dir = writeFixtureDir();
  const out = JSON.parse(fs.readFileSync(path.join(dir, "out/batch-1.json"), "utf8"));
  delete out[1].email;
  fs.writeFileSync(path.join(dir, "out/batch-1.json"), JSON.stringify(out));
  assert.throws(() => loadFoundation({ dir }), /no email in the out file/);
});

test("loader: an email outside the two demo domains is refused", () => {
  const dir = writeFixtureDir();
  const out = JSON.parse(fs.readFileSync(path.join(dir, "out/batch-1.json"), "utf8"));
  out[1].email = "someone@gmail.com";
  fs.writeFileSync(path.join(dir, "out/batch-1.json"), JSON.stringify(out));
  assert.throws(() => loadFoundation({ dir }), /not a demo email/);
});

test("loader: a live demo's email can never change; a missing one falls back to the live account", () => {
  const dir = writeFixtureDir();
  const out = JSON.parse(fs.readFileSync(path.join(dir, "out/batch-1.json"), "utf8"));
  out[0].email = "changed@demo.tulala.digital";
  fs.writeFileSync(path.join(dir, "out/batch-1.json"), JSON.stringify(out));
  assert.throws(() => loadFoundation({ dir }), /live emails never change/);
  delete out[0].email;
  fs.writeFileSync(path.join(dir, "out/batch-1.json"), JSON.stringify(out));
  assert.equal(loadFoundation({ dir })[0].email, "demo-camila-unas@impronta.test");
});

test("loader: the country-in-address emails are accepted and a duplicate email is refused", () => {
  const dir = writeFixtureDir();
  const out = JSON.parse(fs.readFileSync(path.join(dir, "out/batch-1.json"), "utf8"));
  out[1].email = "demo-hairstylist-us-006@demo.tulala.digital";
  fs.writeFileSync(path.join(dir, "out/batch-1.json"), JSON.stringify(out));
  assert.equal(loadFoundation({ dir })[1].email, "demo-hairstylist-us-006@demo.tulala.digital");
  out[1].email = "DEMO-CAMILA-UNAS@impronta.test";
  fs.writeFileSync(path.join(dir, "out/batch-1.json"), JSON.stringify(out));
  assert.throws(() => loadFoundation({ dir }), /duplicate email/);
});

test("real workbook (skipped when the folder is absent): 224 demos, unique codes and emails, 10 live", { skip: !fs.existsSync(DEFAULT_FOUNDATION_DIR) }, () => {
  const demos = loadFoundation();
  assert.equal(demos.length, 224);
  assert.equal(new Set(demos.map((d) => d.profileCode)).size, 224);
  assert.equal(new Set(demos.map((d) => d.email)).size, 224);
  assert.equal(demos.filter((d) => d.isLive).length, 10);
  for (const d of demos) {
    assert.equal(d.services.length, 4, d.demoId);
    assert.match(d.profileCode, /^TAL-93\d{3}$/);
    assert.ok(isDemoEmail(d.email));
    if (!d.isLive) assert.ok(d.email.endsWith("@demo.tulala.digital"));
    else assert.ok(d.email.endsWith("@impronta.test"));
  }
});
