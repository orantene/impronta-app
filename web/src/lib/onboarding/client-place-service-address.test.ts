import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { planOfferingWrites, type EssentialService } from "./essentials";
import { serviceAddressRule } from "../scheduling/service-address";

// TUL-531 (Batch 2 retest): a talent who chose "Voy con el cliente" in
// onboarding got services that never asked the client for an address and said
// "pay at the studio". The choice lived only on the profile (booking_terms.place);
// the booking sheet reads `attributes.where` on the OFFERING.

const svc: EssentialService = { name: "Limpieza", durationMin: 60, priceCents: 50000, quote: false, currency: "MXN" };

test("a go-to-the-client talent's new services carry where=[client], so the sheet asks for an address", () => {
  const plan = planOfferingWrites([], [svc], { mode: "client", area: null });
  assert.equal(plan.insert.length, 1);
  assert.deepEqual(plan.insert[0]!.attributes, { where: ["client"] });
  assert.equal(serviceAddressRule(plan.insert[0]!.attributes!.where), "required");
});

test("an AI draft upgraded in place also gets it", () => {
  const plan = planOfferingWrites([{ id: "d1", title: "Limpieza", status: "draft" }], [svc], { mode: "client", area: null });
  assert.equal(plan.update.length, 1);
  assert.deepEqual(plan.update[0]!.patch.attributes, { where: ["client"] });
});

test("no place choice leaves the row's attributes alone", () => {
  for (const place of [null, undefined] as const) {
    const plan = planOfferingWrites([], [svc], place);
    assert.equal("attributes" in plan.insert[0]!, false, String(place));
  }
});

test("the store merges attributes on update instead of replacing a draft's matrix or intake", () => {
  const src = readFileSync(join(process.cwd(), "src", "lib", "onboarding", "essentials.server.ts"), "utf8");
  assert.match(src, /attributes: \{ \.\.\.base, \.\.\.patch\.attributes \}/);
});
