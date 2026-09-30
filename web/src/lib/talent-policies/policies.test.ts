import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_POLICY_ANSWERS, lateCancelRefundCents, parsePolicyAnswers } from "./answers";
import { readPolicyFacts, type PolicyFacts } from "./facts";
import { canonicalJson, policyContentHash } from "./hash";
import { diffPolicyText, renderPolicyText, TULALA_DOC_LINKS } from "./render";
import { policyFakeAdmin } from "./__fixtures__/policy-fake-admin";
import { loadPublishedLateCancelRefund, loadPublishedPolicy, publishPolicy } from "./store";

const PROFILE = "00000000-0000-4000-8000-0000000000aa";

function facts(over: Partial<PolicyFacts> = {}): PolicyFacts {
  return {
    displayName: "Jor",
    depositPct: 30,
    inPersonMethods: ["cash", "card_terminal"],
    cancelHours: 24,
    where: ["studio"],
    zone: "Roma Norte",
    contact: { chat: true, whatsapp: true, email: false },
    ...over,
  };
}

// ---------------------------------------------------------------- facts reader

test("facts: deposit and window come from selling_defaults through the resolver", () => {
  const f = readPolicyFacts({
    displayName: "  Jor  ",
    sellingDefaults: { depositPct: 25, cancelHours: 48, inPersonMethods: ["transfer", "cash", "bogus"], where: ["studio", "remote"] },
    homeCityText: "Ciudad de México, CDMX, Mexico",
    chatEnabled: true,
    phoneE164: "+5215512345678",
  });
  assert.equal(f.displayName, "Jor");
  assert.equal(f.depositPct, 25);
  assert.equal(f.cancelHours, 48);
  // Order follows the catalog, unknown entries dropped.
  assert.deepEqual(f.inPersonMethods, ["cash", "transfer"]);
  assert.deepEqual(f.where, ["studio", "remote"]);
  // D4: the approximate zone is a city only, never an address.
  assert.equal(f.zone, "Ciudad de México");
  assert.deepEqual(f.contact, { chat: true, whatsapp: true, email: false });
});

test("facts: no stored defaults means the platform 24 h window and no deposit", () => {
  const f = readPolicyFacts({ displayName: "Jor", sellingDefaults: {} });
  assert.equal(f.depositPct, null);
  assert.equal(f.cancelHours, 24);
  assert.deepEqual(f.inPersonMethods, []);
  assert.deepEqual(f.where, ["studio"]);
  assert.equal(f.zone, null);
});

test("facts: an explicit 0 window is flexible, and the name is the display name only (D2)", () => {
  const f = readPolicyFacts({ displayName: null, sellingDefaults: { cancelHours: 0 } });
  assert.equal(f.cancelHours, null);
  assert.equal(f.displayName, "");
  // The input type has no legal-name field at all.
  assert.ok(!("legalName" in f));
});

test("facts: a preferred home base name wins over the saved city text", () => {
  const f = readPolicyFacts({ sellingDefaults: {}, homeBaseName: "Condesa", homeCityText: "Mérida, Yucatán" });
  assert.equal(f.zone, "Condesa");
});

// ---------------------------------------------------------------- answers

test("answers: invalid values fall back to the defaults, valid ones survive", () => {
  assert.deepEqual(parsePolicyAnswers(null), DEFAULT_POLICY_ANSWERS);
  assert.deepEqual(parsePolicyAnswers({ late_cancel_refund: "bogus", late_tolerance_min: 999 }), DEFAULT_POLICY_ANSWERS);
  assert.deepEqual(parsePolicyAnswers({ late_cancel_refund: "half", late_tolerance_min: 10.4 }), {
    late_cancel_refund: "half",
    late_tolerance_min: 10,
  });
});

// ---------------------------------------------------------------- partial refund amount

test("late cancel refund: none keeps everything, full returns all paid", () => {
  assert.equal(lateCancelRefundCents({ mode: "none", paidCents: 3000 }), 0);
  assert.equal(lateCancelRefundCents({ mode: "full", paidCents: 3000 }), 3000);
});

test("late cancel refund: half of the deposit, rounded down to a whole cent", () => {
  assert.equal(lateCancelRefundCents({ mode: "half", paidCents: 3000 }), 1500);
  assert.equal(lateCancelRefundCents({ mode: "half", paidCents: 3001 }), 1500);
  assert.equal(lateCancelRefundCents({ mode: "half", paidCents: 1 }), 0);
});

test("late cancel refund: paid beyond the deposit is not counted as deposit", () => {
  // Paid 10000, the deposit was 3000: half of the deposit, not half of everything.
  assert.equal(lateCancelRefundCents({ mode: "half", paidCents: 10000, depositCents: 3000 }), 1500);
  // A deposit larger than what was paid is capped at what was paid.
  assert.equal(lateCancelRefundCents({ mode: "half", paidCents: 2000, depositCents: 3000 }), 1000);
  assert.equal(lateCancelRefundCents({ mode: "half", paidCents: -5 }), 0);
});

// ---------------------------------------------------------------- preview rendering

test("render: numbered clauses, ES and EN from the same facts", () => {
  const es = renderPolicyText(facts(), DEFAULT_POLICY_ANSWERS, "es");
  const en = renderPolicyText(facts(), DEFAULT_POLICY_ANSWERS, "en");
  assert.equal(es.clauses.length, en.clauses.length);
  assert.deepEqual(es.clauses.map((c) => c.n), es.clauses.map((_, i) => i + 1));
  assert.match(es.text, /^1\. Reserva y anticipo\n/);
  assert.match(es.text, /anticipo del 30%/);
  assert.match(en.text, /deposit of 30%/);
  assert.match(en.text, /24 hours before/);
  assert.match(en.text, /cash or card on their own terminal/);
  assert.match(en.text, /in the Roma Norte area/);
});

test("render: each late-cancel answer changes the sentence, and the no-show keeps the deposit", () => {
  const text = (mode: "none" | "half" | "full") =>
    renderPolicyText(facts(), { ...DEFAULT_POLICY_ANSWERS, late_cancel_refund: mode }, "en").text;
  assert.match(text("none"), /the deposit is not returned\./);
  assert.match(text("half"), /half of the deposit is returned\./);
  assert.match(text("full"), /everything you paid is returned\./);
  for (const mode of ["none", "half", "full"] as const) {
    assert.match(text(mode), /If you do not show up, the deposit is not returned\./);
  }
});

test("render: no deposit, no window and no methods drop the clauses that would be empty", () => {
  const f = facts({ depositPct: null, cancelHours: null, inPersonMethods: [] });
  const en = renderPolicyText(f, DEFAULT_POLICY_ANSWERS, "en");
  assert.match(en.text, /No deposit is asked/);
  assert.match(en.text, /Cancelling is flexible/);
  assert.ok(!en.clauses.some((c) => c.title === "Paying in person"));
  assert.ok(!en.clauses.some((c) => c.title === "Late cancellation and no-show"));
});

test("render: tolerance 0 asks for punctuality", () => {
  const en = renderPolicyText(facts(), { ...DEFAULT_POLICY_ANSWERS, late_tolerance_min: 0 }, "en").text;
  assert.match(en, /Please arrive on time/);
  const tol = renderPolicyText(facts(), { ...DEFAULT_POLICY_ANSWERS, late_tolerance_min: 20 }, "es").text;
  assert.match(tol, /20 minutos de tolerancia/);
});

test("render: no em dashes, Tulala documents link off-host (D3), studio shows only the zone (D4)", () => {
  for (const locale of ["es", "en"] as const) {
    const { text } = renderPolicyText(facts(), DEFAULT_POLICY_ANSWERS, locale);
    assert.ok(!text.includes("—"), "no em dash");
    assert.ok(text.includes(TULALA_DOC_LINKS.terms));
    assert.ok(text.includes(TULALA_DOC_LINKS.privacy));
    assert.ok(TULALA_DOC_LINKS.terms.startsWith("https://tulala.digital/"));
  }
  const es = renderPolicyText(facts(), DEFAULT_POLICY_ANSWERS, "es").text;
  assert.match(es, /en su estudio, en la zona de Roma Norte/);
  assert.ok(!/calle|street|avenida/i.test(es));
});

test("render: is deterministic", () => {
  assert.equal(
    renderPolicyText(facts(), DEFAULT_POLICY_ANSWERS, "en").text,
    renderPolicyText(facts(), DEFAULT_POLICY_ANSWERS, "en").text,
  );
});

test("diff: names the clauses that changed and skips the rest", () => {
  const before = renderPolicyText(facts(), DEFAULT_POLICY_ANSWERS, "en").text;
  const after = renderPolicyText(facts(), { ...DEFAULT_POLICY_ANSWERS, late_cancel_refund: "half" }, "en").text;
  const changes = diffPolicyText(before, after);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].title, "Late cancellation and no-show");
  assert.match(changes[0].before ?? "", /not returned/);
  assert.match(changes[0].after ?? "", /half of the deposit/);
  // First publish: every clause is new.
  const first = diffPolicyText(null, after);
  assert.ok(first.length > 3 && first.every((c) => c.before === null));
});

// ---------------------------------------------------------------- version hashing

test("hash: stable across key order, sensitive to any client-visible change", () => {
  assert.equal(canonicalJson({ b: 1, a: { d: 2, c: [1, { z: 1, y: 2 }] } }), canonicalJson({ a: { c: [1, { y: 2, z: 1 }], d: 2 }, b: 1 }));
  const a = policyContentHash(facts(), DEFAULT_POLICY_ANSWERS);
  assert.equal(a, policyContentHash(facts(), { ...DEFAULT_POLICY_ANSWERS }));
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, policyContentHash(facts({ depositPct: 40 }), DEFAULT_POLICY_ANSWERS));
  assert.notEqual(a, policyContentHash(facts(), { ...DEFAULT_POLICY_ANSWERS, late_cancel_refund: "half" }));
  assert.notEqual(a, policyContentHash(facts(), { ...DEFAULT_POLICY_ANSWERS, late_tolerance_min: 30 }));
});

// ---------------------------------------------------------------- publish

function seedProfile(store: Record<string, Array<Record<string, unknown>>>) {
  store.talent_profiles = [
    {
      id: PROFILE,
      display_name: "Jor",
      selling_defaults: { depositPct: 30, cancelHours: 24 },
      home_city_text: "Ciudad de México, CDMX, Mexico",
      phone: null,
      phone_e164: null,
      social_links: [],
    },
  ];
  store.talent_service_areas = [];
  store.talent_sites = [{ talent_profile_id: PROFILE, chat_enabled: true }];
}

test("publish: first publish writes version 1 with both languages and the frozen facts", async () => {
  const fake = policyFakeAdmin({});
  seedProfile(fake.store);
  const res = await publishPolicy(fake.admin, { talentProfileId: PROFILE, userId: null, answers: { late_cancel_refund: "half", late_tolerance_min: 10 } });
  assert.deepEqual({ ok: res.ok, version: res.ok ? res.version : 0, unchanged: res.ok ? res.unchanged : null }, { ok: true, version: 1, unchanged: false });
  const row = fake.store.talent_policy_versions[0];
  assert.equal(row.version, 1);
  assert.match(String(row.rendered_text_es), /mitad del anticipo/);
  assert.match(String(row.rendered_text_en), /half of the deposit/);
  assert.equal((row.facts as PolicyFacts).depositPct, 30);
  assert.equal((row.answers as { late_cancel_refund: string }).late_cancel_refund, "half");
  // The working copy follows the publish.
  assert.equal((fake.store.talent_policy_settings[0].answers as { late_tolerance_min: number }).late_tolerance_min, 10);
});

test("publish: identical content does not burn a version; a change makes the next one", async () => {
  const fake = policyFakeAdmin({});
  seedProfile(fake.store);
  const answers = { late_cancel_refund: "none", late_tolerance_min: 15 };
  await publishPolicy(fake.admin, { talentProfileId: PROFILE, userId: null, answers });
  const again = await publishPolicy(fake.admin, { talentProfileId: PROFILE, userId: null, answers });
  assert.ok(again.ok && again.unchanged && again.version === 1);
  assert.equal(fake.store.talent_policy_versions.length, 1);
  const next = await publishPolicy(fake.admin, { talentProfileId: PROFILE, userId: null, answers: { ...answers, late_cancel_refund: "full" } });
  assert.ok(next.ok && !next.unchanged && next.version === 2);
  // A changed FACT (deposit moved) is a new version even with the same answers.
  fake.store.talent_profiles[0].selling_defaults = { depositPct: 50, cancelHours: 24 };
  const factChange = await publishPolicy(fake.admin, { talentProfileId: PROFILE, userId: null, answers: { ...answers, late_cancel_refund: "full" } });
  assert.ok(factChange.ok && factChange.version === 3);
  assert.equal((await loadPublishedPolicy(fake.admin, PROFILE))?.version, 3);
});

test("publish: a race for the same version re-reads and takes the next number", async () => {
  const fake = policyFakeAdmin({}, { failInsertOnce: true });
  seedProfile(fake.store);
  const res = await publishPolicy(fake.admin, { talentProfileId: PROFILE, userId: null, answers: DEFAULT_POLICY_ANSWERS });
  assert.ok(res.ok && res.version === 2, JSON.stringify(res));
});

test("publish: a missing profile refuses instead of stamping an empty version", async () => {
  const fake = policyFakeAdmin({ talent_profiles: [] });
  const res = await publishPolicy(fake.admin, { talentProfileId: PROFILE, userId: null, answers: DEFAULT_POLICY_ANSWERS });
  assert.deepEqual(res, { ok: false, reason: "facts_unavailable" });
  assert.equal((fake.store.talent_policy_versions ?? []).length, 0);
});

test("engine reads the PUBLISHED answer only: no version means none", async () => {
  const fake = policyFakeAdmin({});
  seedProfile(fake.store);
  assert.equal(await loadPublishedLateCancelRefund(fake.admin, PROFILE), "none");
  // An unpublished working copy never moves money.
  fake.store.talent_policy_settings = [{ talent_profile_id: PROFILE, answers: { late_cancel_refund: "full" } }];
  assert.equal(await loadPublishedLateCancelRefund(fake.admin, PROFILE), "none");
  await publishPolicy(fake.admin, { talentProfileId: PROFILE, userId: null, answers: { late_cancel_refund: "half", late_tolerance_min: 15 } });
  assert.equal(await loadPublishedLateCancelRefund(fake.admin, PROFILE), "half");
});
