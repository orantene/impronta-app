import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { talentDisplayNameFor } from "./talent-display-name";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("TUL-1839: a solo pro's page carries the person's own name, even with a business name", () => {
  assert.equal(talentDisplayNameFor({ choice: "myself", businessName: " Casa Limpia ", personName: "Ana" }), "Ana");
  assert.equal(talentDisplayNameFor({ choice: "myself", businessName: "QA Valeria Brillo Caribe", personName: " Valeria " }), "Valeria");
});

test("TUL-1839: the business name only stands in when the person gave no name", () => {
  assert.equal(talentDisplayNameFor({ choice: "myself", businessName: "Casa Limpia", personName: null }), "Casa Limpia");
  assert.equal(talentDisplayNameFor({ choice: "myself", businessName: "  ", personName: "Ana" }), "Ana");
  assert.equal(talentDisplayNameFor({ choice: "myself", businessName: null, personName: null }), null);
  assert.equal(talentDisplayNameFor({ choice: "both", businessName: "Studio X", personName: null }), null);
});

test("TUL-1839: provisioning names the page from the person's brief facts, not essentials.name", () => {
  const prov = read("src/lib/onboarding/provision-for-choice.server.ts");
  assert.match(prov, /personName: stringFact\(brief, "person\.professional_name"\) \?\? stringFact\(brief, "person\.name"\)/);
  assert.doesNotMatch(prov, /personName: input\.essentials\?\.name/);
  const build = read("src/lib/onboarding/build.server.ts");
  assert.doesNotMatch(build, /essentialsName: essentials\?\.name/);
});

test("TUL-810: on 'both' the talent page keeps the person's name (the business names the workspace)", () => {
  assert.equal(talentDisplayNameFor({ choice: "both", businessName: "Studio X", personName: "Ana" }), "Ana");
});

test("TUL-810: the talent essentials screen offers an optional business name, saved as business.name", () => {
  const step = read("src/components/onboarding/steps/essentials-step.tsx");
  assert.match(step, /onb-business-name-input/);
  assert.match(step, /businessName: !business/);
  const action = read("src/lib/server-actions/onboarding-module.ts");
  assert.match(action, /input\.businessName/);
  const prov = read("src/lib/onboarding/provision-for-choice.server.ts");
  assert.match(prov, /talentDisplayNameFor\(/);
  for (const l of ["en", "es"]) {
    const e = JSON.parse(read(`messages/${l}.json`)).public.onboarding.essentials;
    assert.ok(e.soloBusinessName && e.soloBusinessNameHint, l);
  }
});
