import assert from "node:assert/strict";
import { test } from "node:test";

import { ALBA } from "../../../../scripts/demo-talents/alba";
import { HERO_FACTS } from "../../../../scripts/demo-talents/hero-facts";
import type { OfferingBookingMode } from "@/lib/talent/offerings-types";
import { loadDemoContentFixture, validateDemoContentFixture } from "./content-fixture";

const alba = loadDemoContentFixture("maison-v2");
const mateo = loadDemoContentFixture("folio");

test("validator passes on both fixtures", () => {
  assert.deepEqual(validateDemoContentFixture(alba), []);
  assert.deepEqual(validateDemoContentFixture(mateo), []);
  assert.equal(alba.profileCode, "TAL-93020");
  assert.equal(mateo.profileCode, "TAL-93011");
});

test("validator rejects a broken fixture", () => {
  const bad = { ...alba, services: [{ ...alba.services[0], mode: "teleport" }] } as never;
  assert.ok(validateDemoContentFixture(bad).some((p) => p.includes("unknown mode")));
});

test("Alba fixture equals alba.ts / hero-facts.ts wherever both hold the field", () => {
  assert.equal(alba.talent.displayName, ALBA.displayName);
  assert.equal(alba.talent.city, ALBA.city);
  assert.equal(alba.talent.tagline, ALBA.tagline);
  assert.equal(alba.talent.bio, ALBA.bio);
  assert.equal(alba.hero.headline, HERO_FACTS["TAL-93020"].headline);
  assert.equal(alba.talent.yearsOfCraft, HERO_FACTS["TAL-93020"].years);
  assert.equal(alba.services.length, ALBA.services.length);
  alba.services.forEach((s, i) => {
    const r = ALBA.services[i];
    assert.equal(s.name, r.name, `service ${i} name`);
    assert.equal(s.description, r.description, `service ${i} description`);
    assert.equal(s.category, r.category, `service ${i} category`);
    assert.equal(s.priceAmount, r.amountMxn, `service ${i} price`);
    assert.equal(s.mode, r.booking, `service ${i} mode`);
    assert.equal(s.imageKey, r.photo, `service ${i} photo`);
    // The mockup lists no length for request/quote rows; alba.ts invents one.
    if (s.durationMinutes !== null) assert.equal(s.durationMinutes, r.durationMin, `service ${i} minutes`);
  });
  // Order differs by design (alba.ts is newest-first); compare as sets.
  const byAuthor = (a: string[], b: string[]) => a[0].localeCompare(b[0]);
  assert.deepEqual(
    alba.reviews.items.map((r) => [r.author, r.quote]).sort(byAuthor),
    ALBA.reviews!.map((r) => [r.name, r.body]).sort(byAuthor),
  );
  assert.deepEqual(
    alba.faq.items.slice(0, 2).map((q) => [q.q, q.a]),
    ALBA.faq!.slice(0, 2).map((q) => [q.q, q.a]),
  );
});

// Product booking modes (offerings-types). The mockup's "quote" is the product's "inquiry".
const PRODUCT_MODES: readonly OfferingBookingMode[] = ["request", "instant", "inquiry"];
const MOCKUP_TO_PRODUCT: Record<string, OfferingBookingMode> = { quote: "inquiry" };

test("every fixture service has a mode the product supports", () => {
  for (const f of [alba, mateo]) {
    for (const s of f.services) {
      const mapped = MOCKUP_TO_PRODUCT[s.mode] ?? (s.mode as OfferingBookingMode);
      assert.ok(PRODUCT_MODES.includes(mapped), `${f.design}/${s.id}: mode ${s.mode} unsupported`);
    }
  }
});

test("mockupOnly holds the fictional data, never the main body", () => {
  const body = JSON.stringify({ ...alba, mockupOnly: undefined });
  for (const token of ["Calle Ejemplo", "@alba.demo", "reseñas de demo"]) assert.ok(!body.includes(token), token);
  const folioBody = JSON.stringify({ ...mateo, mockupOnly: undefined });
  assert.ok(!folioBody.includes("ficticio"));
});
