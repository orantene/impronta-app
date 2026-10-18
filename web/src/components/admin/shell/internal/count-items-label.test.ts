import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { translateDashboardText } from "./dashboard-i18n";
import { countItemsLabel } from "./count-items-label";

const es = (v: string) => translateDashboardText(v, "es");
const en = (v: string) => translateDashboardText(v, "en");

test("TUL-722: one item is singular in Spanish and English", () => {
  assert.equal(countItemsLabel(es, 1), "1 artículo");
  assert.equal(countItemsLabel(es, 3), "3 artículos");
  assert.equal(countItemsLabel(en, 1), "1 item");
  assert.equal(countItemsLabel(en, 0), "0 items");
});

test("TUL-722: no surface glues a count to the plural 'items' word", () => {
  const files = [
    "./talent/agenda/AgendaAttentionPage.tsx",
    "../../../talent/studio/MoreScreen.tsx",
    "../../../talent/services/ServicesHome.tsx",
    "../../../talent/services/OrganizeScreen.tsx",
  ];
  const bad = /\}\s*\{?copy\.t\("items"\)/;
  for (const f of files) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.doesNotMatch(src, bad, f);
  }
});

// TUL-915: the Servicios banner (attention-summary.ts) said "elementos" while the
// subtitle (countItemsLabel) said "artículos". Both must use the one dictionary term.
test("TUL-915: the Servicios attention banner and the subtitle use the same noun (artículo)", async () => {
  const { attentionSummary } = await import("../../../talent/services/attention-summary");
  const banner = attentionSummary({ total: 3, noPhoto: 1, noPrice: 2, soldOut: 0 }, "es");
  const bannerOne = attentionSummary({ total: 1, noPhoto: 0, noPrice: 1, soldOut: 0 }, "es");
  assert.match(banner, /^3 artículos necesitan atención/);
  assert.match(bannerOne, /^1 artículo necesita atención/);
  assert.doesNotMatch(banner + bannerOne, /elemento/i);
  assert.match(countItemsLabel(es, 3), /artículos$/);
  assert.match(countItemsLabel(es, 1), /artículo$/);
});
