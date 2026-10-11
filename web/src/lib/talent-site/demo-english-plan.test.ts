import assert from "node:assert/strict";
import test from "node:test";

import { DEMO_ENGLISH_SLUGS, planDemoEnglish } from "./demo-english-plan";

const row = (slug: string, over: Partial<{ isDemo: boolean; preferred: string | null; secondary: string[] }> = {}) => ({ slug, id: `id-${slug}`, isDemo: true, preferred: "es", secondary: [], ...over });

test("TUL-516 B1: allow-listed Spanish-only demos are skipped (explicit notice, not enable EN)", () => {
  const [p] = planDemoEnglish([row("karla-beltran", { secondary: ["pt"] })]);
  assert.equal(p?.action, "skip");
  assert.match((p as { reason: string }).reason, /spanish-only|TUL-516 B1/);
});

test("skips: not a demo, or not on the allow-list", () => {
  const plan = planDemoEnglish([
    row("tomas-retratos", { isDemo: false }),
    row("jorgelina-real"),
  ]);
  assert.deepEqual(plan.map((p) => p.action), ["skip", "skip"]);
  assert.match((plan[0] as { reason: string }).reason, /not a demo/);
  assert.match((plan[1] as { reason: string }).reason, /allow-list/);
});

test("the allow-list is exactly the five demos found read-only on production", () => {
  assert.deepEqual([...DEMO_ENGLISH_SLUGS].sort(), ["diego-navarro-dj", "karla-beltran", "saul-tapia-ortega", "tomas-retratos", "valeria-baila"]);
});
