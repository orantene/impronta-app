import assert from "node:assert/strict";
import { test } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { TalentPolicyDocument } from "@/components/public-booking/TalentPolicyDocument";

import { DEFAULT_POLICY_ANSWERS } from "./answers";
import {
  CUSTOM_CLAUSES_MAX_ITEMS,
  CUSTOM_CLAUSE_MAX_CHARS,
  customClausesFor,
  linesFromText,
  parseCustomClauses,
  validateCustomClauses,
} from "./custom-clauses";
import type { PolicyFacts } from "./facts";
import { policyContentHash } from "./hash";
import { buildPolicyPage } from "./public";
import { renderPolicyText } from "./render";
import { loadPublishedPolicy, publishPolicy, type PublishedPolicy } from "./store";
import { policyFakeAdmin } from "./__fixtures__/policy-fake-admin";

const PROFILE = "00000000-0000-4000-8000-0000000000aa";
const FACTS: PolicyFacts = {
  displayName: "Jor",
  depositPct: 30,
  inPersonMethods: ["cash"],
  cancelHours: 24,
  where: ["studio"],
  zone: "Roma Norte",
  contact: { chat: true, whatsapp: false, email: false },
};

function published(over: Partial<PublishedPolicy> = {}): PublishedPolicy {
  return {
    version: 2,
    contentHash: "h".repeat(32),
    answers: DEFAULT_POLICY_ANSWERS,
    facts: FACTS,
    textEs: renderPolicyText(FACTS, DEFAULT_POLICY_ANSWERS, "es").text,
    textEn: renderPolicyText(FACTS, DEFAULT_POLICY_ANSWERS, "en").text,
    publishedAt: "2026-10-07T10:00:00.000Z",
    customClauses: null,
    ...over,
  };
}

function html(model: ReturnType<typeof buildPolicyPage>): string {
  return renderToStaticMarkup(createElement(TalentPolicyDocument, { model }));
}

const CLAUSES = { es: ["Regla uno", "Regla dos"], en: ["Rule one", "Rule two"] };

// ---- rendering ----

test("render: clauses come AFTER the generated text, numbered, under the heading (ES)", () => {
  const out = html(buildPolicyPage({ doc: "booking", locale: "es", published: published({ customClauses: CLAUSES }) }));
  const generatedEnd = out.lastIndexOf("</ol>", out.indexOf("data-policy-custom"));
  assert.ok(generatedEnd > 0 && out.indexOf("data-policy-custom") > generatedEnd);
  assert.match(out, /Reglas del estudio/);
  assert.match(out, /<ol[^>]*><li[^>]*>Regla uno<\/li><li[^>]*>Regla dos<\/li><\/ol>/);
  assert.doesNotMatch(out, /Rule one/);
});

test("render: EN visitor reads the EN list under 'Studio rules'", () => {
  const out = html(buildPolicyPage({ doc: "booking", locale: "en", published: published({ customClauses: CLAUSES }) }));
  assert.match(out, /Studio rules/);
  assert.match(out, /Rule one/);
  assert.doesNotMatch(out, /Regla uno/);
});

test("render: an empty language falls back to the other list, untranslated", () => {
  const out = html(buildPolicyPage({ doc: "booking", locale: "en", published: published({ customClauses: { es: ["Solo español"], en: [] } }) }));
  assert.match(out, /Studio rules/);
  assert.match(out, /Solo español/);
  assert.deepEqual(customClausesFor({ es: [], en: ["Only English"] }, "es"), ["Only English"]);
  assert.deepEqual(customClausesFor(null, "es"), []);
});

test("render: no clauses is byte-identical to a version published before the field existed", () => {
  const legacy = published();
  delete (legacy as Partial<PublishedPolicy>).customClauses;
  for (const locale of ["es", "en"]) {
    const a = buildPolicyPage({ doc: "booking", locale, published: legacy });
    const b = buildPolicyPage({ doc: "booking", locale, published: published({ customClauses: null }) });
    const c = buildPolicyPage({ doc: "booking", locale, published: published({ customClauses: { es: [], en: [] } }) });
    assert.equal("custom" in a, false);
    assert.equal(html(a), html(b));
    assert.equal(html(a), html(c));
    assert.doesNotMatch(html(a), /data-policy-custom/);
  }
});

test("render: clauses with no generated text render alone, with no platform placeholder", () => {
  const model = buildPolicyPage({ doc: "booking", locale: "es", published: published({ textEs: "", textEn: "", customClauses: CLAUSES }) });
  assert.equal(model.isDefault, false);
  assert.equal(model.clauses.length, 0);
  const out = html(model);
  assert.match(out, /Regla uno/);
  assert.doesNotMatch(out, /Las condiciones de cada servicio/);
  assert.match(out, /data-policy-default="false"/);
});

test("render: the privacy page never shows booking clauses", () => {
  const model = buildPolicyPage({ doc: "privacy", locale: "es", published: published({ customClauses: CLAUSES }) });
  assert.equal(model.custom, undefined);
});

// ---- validation ----

test("validate: trims, drops blanks, empty both = null, enforces limits", () => {
  assert.deepEqual(validateCustomClauses({ es: [" a ", "", "  "], en: [] }), { ok: true, value: { es: ["a"], en: [] } });
  assert.deepEqual(validateCustomClauses({ es: ["", " "], en: [] }), { ok: true, value: null });
  assert.deepEqual(validateCustomClauses(null), { ok: true, value: null });
  const twenty = Array.from({ length: CUSTOM_CLAUSES_MAX_ITEMS }, (_, i) => `r${i}`);
  assert.equal(validateCustomClauses({ es: twenty, en: [] }).ok, true);
  assert.deepEqual(validateCustomClauses({ es: [...twenty, "x"], en: [] }), { ok: false, error: "too_many" });
  assert.equal(validateCustomClauses({ es: ["a".repeat(CUSTOM_CLAUSE_MAX_CHARS)], en: [] }).ok, true);
  assert.deepEqual(validateCustomClauses({ es: [], en: ["a".repeat(CUSTOM_CLAUSE_MAX_CHARS + 1)] }), { ok: false, error: "too_long" });
  assert.deepEqual(linesFromText("a\r\n\n b \n"), ["a", "b"]);
});

test("parse: malformed stored values fail closed", () => {
  assert.equal(parseCustomClauses(null), null);
  assert.equal(parseCustomClauses("x"), null);
  assert.equal(parseCustomClauses([]), null);
  assert.equal(parseCustomClauses({ es: [1, null], en: "no" }), null);
  assert.deepEqual(parseCustomClauses({ es: ["a", 3], en: [] }), { es: ["a"], en: [] });
});

// ---- hash ----

test("hash: no clauses leaves the hash exactly as before; clauses move it", () => {
  const a = DEFAULT_POLICY_ANSWERS;
  assert.equal(policyContentHash(FACTS, a), policyContentHash(FACTS, a, null));
  assert.notEqual(policyContentHash(FACTS, a), policyContentHash(FACTS, a, CLAUSES));
});

// ---- version creation ----

function seed(store: Record<string, Array<Record<string, unknown>>>) {
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

test("version: new clauses make a new version; the same clauses do not", async () => {
  const fake = policyFakeAdmin({});
  seed(fake.store);
  const base = { talentProfileId: PROFILE, userId: null, answers: DEFAULT_POLICY_ANSWERS };
  const v1 = await publishPolicy(fake.admin, base);
  assert.ok(v1.ok && v1.version === 1);
  assert.equal("custom_clauses" in fake.store.talent_policy_versions[0], false);

  const v2 = await publishPolicy(fake.admin, { ...base, customClauses: CLAUSES });
  assert.ok(v2.ok && !v2.unchanged && v2.version === 2);
  assert.deepEqual(fake.store.talent_policy_versions[1].custom_clauses, CLAUSES);

  const same = await publishPolicy(fake.admin, { ...base, customClauses: { es: [" Regla uno ", "Regla dos", ""], en: CLAUSES.en } });
  assert.ok(same.ok && same.unchanged && same.version === 2);
  assert.equal(fake.store.talent_policy_versions.length, 2);

  const changed = await publishPolicy(fake.admin, { ...base, customClauses: { es: ["Otra"], en: [] } });
  assert.ok(changed.ok && changed.version === 3);
  // Earlier versions are untouched (a booking stamped on v2 still reads v2).
  assert.deepEqual(fake.store.talent_policy_versions[1].custom_clauses, CLAUSES);
});

test("version: an answers-only publish keeps the current clauses; null clears them", async () => {
  const fake = policyFakeAdmin({});
  seed(fake.store);
  const base = { talentProfileId: PROFILE, userId: null };
  await publishPolicy(fake.admin, { ...base, answers: DEFAULT_POLICY_ANSWERS, customClauses: CLAUSES });
  const kept = await publishPolicy(fake.admin, { ...base, answers: { late_cancel_refund: "full", late_tolerance_min: 15 } });
  assert.ok(kept.ok && kept.version === 2);
  assert.deepEqual((await loadPublishedPolicy(fake.admin, PROFILE))?.customClauses, CLAUSES);
  const cleared = await publishPolicy(fake.admin, { ...base, answers: { late_cancel_refund: "full", late_tolerance_min: 15 }, customClauses: null });
  assert.ok(cleared.ok && cleared.version === 3);
  assert.equal((await loadPublishedPolicy(fake.admin, PROFILE))?.customClauses, null);
});

test("version: invalid clauses are refused and nothing is written", async () => {
  const fake = policyFakeAdmin({});
  seed(fake.store);
  const res = await publishPolicy(fake.admin, {
    talentProfileId: PROFILE,
    userId: null,
    answers: DEFAULT_POLICY_ANSWERS,
    customClauses: { es: ["a".repeat(CUSTOM_CLAUSE_MAX_CHARS + 1)], en: [] },
  });
  assert.deepEqual(res, { ok: false, reason: "invalid_clauses" });
  assert.equal((fake.store.talent_policy_versions ?? []).length, 0);
});

// ---- missing column tolerance ----

/** The fake, but as a database that has NOT had the migration applied. */
function withoutColumn(admin: { from: (t: string) => unknown }) {
  const missing = { code: "42703", message: 'column "custom_clauses" does not exist' };
  return {
    from: (table: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q = admin.from(table) as any;
      if (table !== "talent_policy_versions") return q;
      return new Proxy(q, {
        get(target, prop) {
          if (prop === "select") {
            return (cols?: string) => {
              if (typeof cols !== "string" || !cols.includes("custom_clauses")) return target.select(cols);
              const dead: Record<string, unknown> = {
                then: (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: missing }).then(res),
              };
              for (const m of ["eq", "order", "limit"]) dead[m] = () => dead;
              return dead;
            };
          }
          if (prop === "insert") {
            return (row: Record<string, unknown>) => ("custom_clauses" in row ? Promise.resolve({ data: null, error: missing }) : target.insert(row));
          }
          return target[prop];
        },
      });
    },
  };
}

test("missing column: reads fall back, policies still load, publishing without clauses still works", async () => {
  const fake = policyFakeAdmin({});
  seed(fake.store);
  const legacy = withoutColumn(fake.admin);
  const v1 = await publishPolicy(legacy, { talentProfileId: PROFILE, userId: null, answers: DEFAULT_POLICY_ANSWERS });
  assert.ok(v1.ok && v1.version === 1);
  const read = await loadPublishedPolicy(legacy, PROFILE);
  assert.equal(read?.version, 1);
  assert.equal(read?.customClauses, null);
});

test("missing column: saving clauses reports clauses_unavailable instead of throwing", async () => {
  const fake = policyFakeAdmin({});
  seed(fake.store);
  const res = await publishPolicy(withoutColumn(fake.admin), {
    talentProfileId: PROFILE,
    userId: null,
    answers: DEFAULT_POLICY_ANSWERS,
    customClauses: CLAUSES,
  });
  assert.deepEqual(res, { ok: false, reason: "clauses_unavailable" });
  assert.equal((fake.store.talent_policy_versions ?? []).length, 0);
});
