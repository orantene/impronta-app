/**
 * TUL-121 theme18: home pricing teaser must not leak English CTAs / cadence
 * / "Most popular" on Spanish marketing pages.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { getMarketingCopy } from "./copy";
import { getPricingLaddersCopy } from "./pricing-ladders-copy";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const COMPONENT = join(
  root,
  "src/components/marketing/pricing-teaser-section.tsx",
);

test("pricing teaser wires mostPopular + ladders CTA/cadence (no EN hardcodes)", () => {
  const src = readFileSync(COMPONENT, "utf8");
  assert.match(
    src,
    /copy\.mostPopular/,
    "Featured badge must read mostPopular from getMarketingCopy.",
  );
  assert.match(
    src,
    /getPricingLaddersCopy/,
    "CTA labels and cadence must come from getPricingLaddersCopy.",
  );
  assert.doesNotMatch(
    src,
    />Most popular</,
    "Hardcoded English Most popular badge must not remain.",
  );
  assert.doesNotMatch(
    src,
    /label:\s*"Start free"/,
    "Hardcoded English Start free CTA must not remain in TIER_CTA.",
  );
});

test("ES pricing teaser copy is Spanish (badge, CTAs, cadence)", () => {
  const esPricing = getMarketingCopy("es").pricing;
  assert.equal(esPricing.mostPopular, "Más popular");

  const es = getPricingLaddersCopy("es");
  assert.equal(es.cadence.month, "al mes");
  assert.equal(es.cadence.free, "para siempre");
  assert.equal(es.salesLed, "Hablemos");
  assert.equal(es.workspace.free.cta, "Empieza gratis");
  assert.equal(es.workspace.studio.cta, "Empieza con Studio");
  assert.equal(es.workspace.agency.cta, "Prueba de 14 días");
  assert.equal(es.workspace.hub.cta, "Agenda un recorrido");

  const en = getPricingLaddersCopy("en");
  assert.equal(getMarketingCopy("en").pricing.mostPopular, "Most popular");
  assert.equal(en.cadence.month, "per month");
  assert.equal(en.workspace.free.cta, "Start free");
});
