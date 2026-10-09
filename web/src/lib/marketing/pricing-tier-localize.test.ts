import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  getPricingLaddersCopy,
  localizeTierCadence,
  localizeTierName,
  localizeTierPrice,
} from "./pricing-ladders-copy";
import { getMarketingCopy } from "./copy";

// Bucket TUL-518 J1: Spanish pricing cards printed English catalog names,
// "Most popular", and English CTAs (Start 14-day trial / Book a walkthrough).
test("Spanish pricing localizes the catalog plan names and the Free price", () => {
  assert.equal(localizeTierName("Free", "es"), "Gratis");
  assert.equal(localizeTierName("Website", "es-MX"), "Sitio web");
  assert.equal(localizeTierName("Portfolio", "es"), "Portafolio");
  assert.equal(localizeTierName("Agency", "es"), "Agencia");
  assert.equal(localizeTierName("Studio", "es"), "Studio");
  assert.equal(localizeTierPrice("Free", "es"), "Gratis");
  assert.equal(localizeTierPrice("$29", "es"), "$29");
  assert.equal(localizeTierCadence("per month", "es"), "al mes");
  assert.equal(localizeTierCadence("forever", "es"), "para siempre");
});

test("English is untouched and unknown names pass through", () => {
  assert.equal(localizeTierName("Free", "en"), "Free");
  assert.equal(localizeTierPrice("Free", "en"), "Free");
  assert.equal(localizeTierName("Enterprise", "es"), "Enterprise");
  assert.equal(localizeTierCadence("per month", "en"), "per month");
});

test("marketing i18n core has ES CTAs and Most popular / Sale for teaser cards", () => {
  const es = getPricingLaddersCopy("es");
  assert.equal(es.workspace.agency.cta, "Prueba de 14 días");
  assert.equal(es.workspace.hub.cta, "Agenda un recorrido");
  assert.equal(es.workspace.free.cta, "Empieza gratis");
  const pricing = getMarketingCopy("es").pricing;
  assert.equal(pricing.mostPopular, "Más popular");
  assert.equal(pricing.sale, "Oferta");
  assert.equal(getMarketingCopy("en").pricing.mostPopular, "Most popular");
});

test("ladders and teaser render names, prices, cadence and CTAs through marketing i18n", () => {
  const ladders = readFileSync(
    join(process.cwd(), "src/components/marketing/pricing-ladders-section.tsx"),
    "utf8",
  );
  assert.match(ladders, /name: localizeTierName\(t\.name, locale\)/);
  assert.match(ladders, /localizeTierPrice\(t\.price, locale\)/);
  assert.match(ladders, /localizeTierCadence\(t\.cadence, locale\)/);

  const teaser = readFileSync(
    join(process.cwd(), "src/components/marketing/pricing-teaser-section.tsx"),
    "utf8",
  );
  assert.match(teaser, /getPricingLaddersCopy\(locale\)/);
  assert.match(teaser, /localizeTierName/);
  assert.match(teaser, /localizeTierPrice/);
  assert.match(teaser, /localizeTierCadence/);
  assert.match(teaser, /copy\.mostPopular/);
  assert.doesNotMatch(teaser, /Most popular/);
  assert.doesNotMatch(teaser, /Start 14-day trial/);
  assert.doesNotMatch(teaser, /Book a walkthrough/);
});
