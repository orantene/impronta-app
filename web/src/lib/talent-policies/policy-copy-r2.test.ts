/**
 * R2: the late-cancel clause must agree with the deposit clause for every
 * deposit x answer x language, and policy pages default to the talent's primary.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import type { LateCancelRefund } from "./answers";
import type { PolicyFacts } from "./facts";
import { choosePolicyLocale } from "./public";
import { renderPolicyText, type PolicyLocale } from "./render";

const ANSWERS: LateCancelRefund[] = ["none", "half", "full"];
const DEPOSITS: Array<{ name: string; pct: number | null }> = [
  { name: "none", pct: null },
  { name: "partial", pct: 30 },
  { name: "full", pct: 100 },
];

function facts(pct: number | null): PolicyFacts {
  return {
    displayName: "Valeria",
    depositPct: pct,
    inPersonMethods: [],
    cancelHours: 24,
    where: ["studio"],
    zone: null,
    contact: { chat: true, whatsapp: false, email: false },
  };
}

function clauses(pct: number | null, mode: LateCancelRefund, locale: PolicyLocale) {
  const r = renderPolicyText(facts(pct), { late_cancel_refund: mode, late_tolerance_min: 15 }, locale);
  const byTitle = (re: RegExp) => r.clauses.find((c) => re.test(c.title))?.body ?? "";
  return { deposit: r.clauses[0].body, late: byTitle(/Cancelación tardía|Late cancellation/), all: r.text };
}

test("no deposit: the late clause never talks about a deposit being kept or returned", () => {
  for (const mode of ANSWERS) {
    const es = clauses(null, mode, "es");
    assert.match(es.deposit, /no se pide anticipo/i);
    assert.match(es.late, /no se te cobra nada/);
    assert.match(es.late, /tampoco se cobra nada/);
    assert.match(es.late, /puede pedir un anticipo en tu próxima reserva/);
    assert.doesNotMatch(es.late, /devuelve|devuelto/);
    const en = clauses(null, mode, "en");
    assert.match(en.deposit, /No deposit is asked/);
    assert.match(en.late, /nothing is charged\./);
    assert.match(en.late, /may ask for a deposit on your next booking/);
    assert.doesNotMatch(en.late, /returned/);
  }
});

test("partial deposit: the answer is about the deposit", () => {
  const expected: Record<LateCancelRefund, [RegExp, RegExp]> = {
    none: [/el anticipo no se devuelve/, /the deposit is not returned/],
    half: [/se devuelve la mitad del anticipo/, /half of the deposit is returned/],
    full: [/se te devuelve todo lo pagado/, /everything you paid is returned/],
  };
  for (const mode of ANSWERS) {
    assert.match(clauses(30, mode, "es").late, expected[mode][0]);
    assert.match(clauses(30, mode, "en").late, expected[mode][1]);
    assert.match(clauses(30, mode, "es").deposit, /anticipo del 30%/);
  }
  assert.match(clauses(30, "none", "es").late, /Si no te presentas a la cita, el anticipo no se devuelve/);
});

test("everything paid up front: the answer is about what was paid", () => {
  const expected: Record<LateCancelRefund, [RegExp, RegExp]> = {
    none: [/lo pagado no se devuelve/, /what you paid is not returned/],
    half: [/la mitad de lo pagado/, /half of what you paid is returned/],
    full: [/todo lo pagado/, /everything you paid is returned/],
  };
  for (const mode of ANSWERS) {
    assert.match(clauses(100, mode, "es").late, expected[mode][0]);
    assert.match(clauses(100, mode, "en").late, expected[mode][1]);
    assert.doesNotMatch(clauses(100, mode, "es").late, /anticipo/);
  }
});

test("matrix: 3 deposits x 3 answers x 2 languages are all distinct where they should be, with no em dash", () => {
  const seen = new Set<string>();
  for (const d of DEPOSITS) {
    for (const mode of ANSWERS) {
      for (const locale of ["es", "en"] as const) {
        const c = clauses(d.pct, mode, locale);
        assert.ok(c.late.length > 0, `${d.name}/${mode}/${locale} has a late clause`);
        assert.doesNotMatch(c.all, /—/);
        seen.add(`${d.name}|${locale}|${mode === "none" || d.pct != null ? mode : "any"}`);
      }
    }
  }
  assert.ok(seen.size >= 10);
});

test("the settings preview and the publish sheet read the same renderer", () => {
  const view = readFileSync(join(__dirname, "..", "..", "components", "talent", "website-settings", "PoliciesView.tsx"), "utf8");
  assert.match(view, /renderPolicyText\(data\.facts, answers, "es"\)/);
  assert.match(view, /data-policy-no-deposit-note/);
});

test("policy pages default to the talent's primary language", () => {
  const base = { primary: "es", supported: ["es", "en"] } as const;
  // Browser/cookie English never decides: nothing explicit in the URL means primary.
  assert.equal(choosePolicyLocale({ ...base, prefixLocale: null, queryLocale: null }), "es");
  assert.equal(choosePolicyLocale({ ...base, prefixLocale: null, queryLocale: "en" }), "en");
  assert.equal(choosePolicyLocale({ ...base, prefixLocale: "en", queryLocale: null }), "en");
  assert.equal(choosePolicyLocale({ ...base, prefixLocale: "en", queryLocale: "es" }), "en", "the path prefix wins");
  assert.equal(choosePolicyLocale({ ...base, prefixLocale: null, queryLocale: "EN " }), "en");
  // Bounded by the languages she offers.
  assert.equal(choosePolicyLocale({ primary: "es", supported: ["es"], prefixLocale: "en", queryLocale: "en" }), "es");
  assert.equal(choosePolicyLocale({ ...base, prefixLocale: null, queryLocale: "fr" }), "es");
  assert.equal(choosePolicyLocale({ primary: "en", supported: ["en", "es"], prefixLocale: null, queryLocale: null }), "en");
});

test("/t/[code] policy routes use the talent locale, not the request cookie locale", () => {
  const route = readFileSync(join(__dirname, "..", "..", "app", "t", "[profileCode]", "_shared", "policy-route.tsx"), "utf8");
  assert.doesNotMatch(route, /getRequestLocale/);
  assert.match(route, /choosePolicyLocale\(/);
  assert.match(route, /loadTalentLocaleSettings\(talentProfileId\)/);
  for (const slug of ["politicas", "privacidad"]) {
    const page = readFileSync(join(__dirname, "..", "..", "app", "t", "[profileCode]", slug, "page.tsx"), "utf8");
    assert.match(page, /searchParams/);
  }
});
