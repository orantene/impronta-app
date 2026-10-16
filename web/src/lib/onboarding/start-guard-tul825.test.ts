import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { attentionSummary, photoOnlyTip, type AttentionCounts } from "@/components/talent/services/attention-summary";

/** The line ServicesHome prints above the list: the optional tip when photos are the only gap, else the summary. */
const shown = (c: AttentionCounts, locale: string) => photoOnlyTip(c, locale) ?? attentionSummary(c, locale);

// A brand-new account: services just created in onboarding, priced, in stock, no photos yet.
const brandNew: AttentionCounts = { total: 2, noPhoto: 2, noPrice: 0, soldOut: 0 };

test("TUL-825 (es): a brand-new account sees no '2 sin foto' nag or 'atención' alarm", () => {
  const line = shown(brandNew, "es");
  assert.doesNotMatch(line, /sin foto/i);
  assert.doesNotMatch(line, /atenci[oó]n|necesitan/i);
  assert.match(line, /^Tip opcional/);
});

test("TUL-825 (en): a brand-new account sees no '2 have no photo' nag or 'attention' alarm", () => {
  const line = shown(brandNew, "en");
  assert.doesNotMatch(line, /no photo/i);
  assert.doesNotMatch(line, /attention|need/i);
  assert.match(line, /^Optional tip/);
});

test("TUL-825: real gaps still get the attention summary (photo plus price, or sold out)", () => {
  assert.match(shown({ total: 2, noPhoto: 1, noPrice: 1, soldOut: 0 }, "es"), /sin foto/);
  assert.match(shown({ total: 2, noPhoto: 1, noPrice: 1, soldOut: 0 }, "en"), /attention/);
  assert.match(shown({ total: 1, noPhoto: 1, noPrice: 0, soldOut: 1 }, "en"), /sold out/);
});

test("TUL-825: no gaps, no line from the tip", () => {
  assert.equal(photoOnlyTip({ total: 0, noPhoto: 0, noPrice: 0, soldOut: 0 }, "es"), null);
});

test("TUL-825: the Services page prefers the tip over the summary", () => {
  const src = readFileSync(join(process.cwd(), "src/components/talent/services/ServicesHome.tsx"), "utf8");
  assert.match(src, /photoOnlyTip\([^)]*\)\s*\?\?\s*attentionSummary\(/);
});
