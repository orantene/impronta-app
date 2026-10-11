import assert from "node:assert/strict";
import { test } from "node:test";

import { demoContentFixtureKeys, loadAuthoredDemoContentFixture, loadDemoContentFixture } from "./content-fixture";
import { addCurrencyCode, withCurrencyCodes } from "./demo-money-copy";

test("bare amounts get the code; coded, US$ and non-prices are left alone", () => {
  assert.equal(addCurrencyCode("$550", "MXN"), "$550 MXN");
  assert.equal(addCurrencyCode("Desde $500", "MXN"), "Desde $500 MXN");
  assert.equal(addCurrencyCode("$350 por pieza", "MXN"), "$350 MXN por pieza");
  assert.equal(addCurrencyCode("-$50", "MXN"), "-$50 MXN");
  assert.equal(addCurrencyCode("+$250", "MXN"), "+$250 MXN");
  assert.equal(addCurrencyCode("$1,500, then $95.50.", "USD"), "$1,500 USD, then $95.50 USD.");
  assert.equal(addCurrencyCode("$550 MXN", "MXN"), "$550 MXN");
  assert.equal(addCurrencyCode("$1,250 MXN", "MXN"), "$1,250 MXN");
  assert.equal(addCurrencyCode("$95.50 USD", "USD"), "$95.50 USD");
  assert.equal(addCurrencyCode("$700 MXN ≈ US$38", "MXN"), "$700 MXN ≈ US$38");
  assert.equal(addCurrencyCode("MX$400", "MXN"), "MX$400");
  assert.equal(addCurrencyCode("-5% por pieza", "MXN"), "-5% por pieza");
  assert.equal(addCurrencyCode("24 h", "MXN"), "24 h");
});

test("deep copy: every string coded, input untouched", () => {
  const input = { a: "$10", b: ["x", { c: "Visita $400" }], n: 400, z: null };
  const out = withCurrencyCodes(input, "MXN");
  assert.deepEqual(out, { a: "$10 MXN", b: ["x", { c: "Visita $400 MXN" }], n: 400, z: null });
  assert.equal(input.a, "$10");
});

test("alex (gridline reference) hero writes '$550 MXN' in ES and EN, like the services table", () => {
  const authored = loadAuthoredDemoContentFixture("gridline");
  assert.equal(authored.hero.facts?.[3]?.value, "$550");
  const f = loadDemoContentFixture("gridline");
  assert.equal(f.hero.facts?.[3]?.value, "$550 MXN");
  assert.equal(f.hero.factsI18n?.en?.[3]?.value, "$550 MXN");
  assert.equal(f.services.find((s) => s.id === "rev")?.priceLabel, "$550 MXN");
});

test("no loaded demo fixture keeps a bare '$<digits>'", () => {
  const bare = /(^|[^\w$])[+-]?\$\d[\d,.]*(?!\d|[.,]\d|\s*(?:MXN|USD)\b)/;
  const hits: string[] = [];
  const walk = (key: string, path: string, v: unknown) => {
    if (typeof v === "string") {
      if (bare.test(v)) hits.push(`${key}${path}: ${v}`);
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(key, `${path}[${i}]`, x));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(key, `${path}.${k}`, x);
  };
  for (const key of demoContentFixtureKeys()) walk(key, "", loadDemoContentFixture(key));
  assert.deepEqual(hits, []);
});
