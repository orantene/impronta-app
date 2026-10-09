import assert from "node:assert/strict";
import test from "node:test";

import { DEMO_ENGLISH_SLUGS, planDemoEnglish } from "./demo-english-plan";

const row = (slug: string, over: Partial<{ isDemo: boolean; preferred: string | null; secondary: string[] }> = {}) => ({ slug, id: `id-${slug}`, isDemo: true, preferred: "es", secondary: [], ...over });

test("a Spanish-only demo gets 'en' appended, keeping what it had", () => {
  const [p] = planDemoEnglish([row("karla-beltran", { secondary: ["pt"] })]);
  assert.deepEqual(p, { action: "enable", slug: "karla-beltran", id: "id-karla-beltran", before: ["pt"], after: ["pt", "en"] });
});

test("skips: already English, not a demo, or not on the allow-list", () => {
  const plan = planDemoEnglish([
    row("diego-navarro-dj", { secondary: ["en"] }),
    row("saul-tapia-ortega", { preferred: "en" }),
    row("tomas-retratos", { isDemo: false }),
    row("jorgelina-real"),
  ]);
  assert.deepEqual(plan.map((p) => p.action), ["skip", "skip", "skip", "skip"]);
  assert.match((plan[2] as { reason: string }).reason, /not a demo/);
  assert.match((plan[3] as { reason: string }).reason, /allow-list/);
});

test("the allow-list is exactly the five demos found read-only on production", () => {
  assert.deepEqual([...DEMO_ENGLISH_SLUGS].sort(), ["diego-navarro-dj", "karla-beltran", "saul-tapia-ortega", "tomas-retratos", "valeria-baila"]);
});
