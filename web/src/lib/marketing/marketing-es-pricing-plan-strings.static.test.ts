/**
 * TUL-518 S2 leftovers: /es marketing pricing must not ship English plan
 * strings (HOME teaser CTAs/taglines, ladders, compare Free labels).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { getMarketingCopy } from "./copy";
import { getPricingLaddersCopy } from "./pricing-ladders-copy";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/** English plan/CTA leaks Grok still saw on /es after #3068. */
const ENGLISH_PLAN_LEAKS = [
  "Start free",
  "Start on Studio",
  "Start 14-day trial",
  "Book a walkthrough",
  "Get started",
  "Most popular",
  "per month",
  "Try it free",
  "Up to 5 talent profiles",
  "Up to 15 people. The full pipeline.",
] as const;

test("ES marketing i18n core has no English plan CTAs or cadence", () => {
  const es = getPricingLaddersCopy("es");
  const blob = JSON.stringify(es);
  for (const leak of ENGLISH_PLAN_LEAKS) {
    assert.equal(blob.includes(leak), false, `ES ladders copy still has "${leak}"`);
  }
  assert.equal(es.workspace.free.cta, "Empieza gratis");
  assert.equal(es.workspace.studio.cta, "Empieza con Studio");
  assert.equal(es.cadence.month, "al mes");
  assert.equal(getMarketingCopy("es").pricing.mostPopular, "Más popular");
  assert.equal(getMarketingCopy("es").pricing.sale, "Oferta");
});

test("HOME teaser and /pricing ladders wire plan copy through localizers", () => {
  const teaser = read("src/components/marketing/pricing-teaser-section.tsx");
  assert.match(teaser, /localizeTierName/);
  assert.match(teaser, /localizeTierPrice/);
  assert.match(teaser, /localizeTierCadence/);
  assert.match(teaser, /getPricingLaddersCopy\(locale\)/);
  for (const leak of ["Start free", "Most popular", "Start on Studio", "per month"] as const) {
    assert.doesNotMatch(teaser, new RegExp(leak.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  const ladders = read("src/components/marketing/pricing-ladders-section.tsx");
  assert.match(ladders, /localizeTierCadence\(t\.cadence, locale\)/);
});

test("compare table localizes Free (and other) tier labels — /es/pricing Free x3", () => {
  const compare = read("src/components/marketing/plan-feature-compare-table.tsx");
  assert.match(compare, /localizeTierName\(table\.tierLabels\[slug\]/);
});

test("ES case-study plan chips use Agencia, not Agency", () => {
  const data = read("src/components/marketing/case-studies-data.ts");
  assert.match(data, /Negocio · Agencia/);
  assert.doesNotMatch(data, /Negocio · Agency/);
});
