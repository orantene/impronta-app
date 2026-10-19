import assert from "node:assert/strict";
import { test } from "node:test";
import { blankOffering, validateOffering } from "@/lib/talent/offerings-types";
import { buildDraftOfferingRows } from "./draft-offering-rows";

/**
 * Services Phase 0, item 5b: blankOffering is `bookingMode: "instant"` and
 * validateOffering refuses instant + quote, so the old inline filter in the
 * talent writer dropped EVERY AI-drafted service at onboarding.
 */
test("the premise: a blank offering turned into a quote is rejected while it stays instant", () => {
  const o = { ...blankOffering({ kind: "talent", talentProfileId: "t1" }, "USD", 0), title: "Cut", priceDisplay: "quote" as const, priceType: "custom" as const, status: "draft" as const };
  assert.equal(o.bookingMode, "instant");
  assert.ok(validateOffering(o).length > 0);
});

test("every stated service becomes a draft quote row (request mode, not instant)", () => {
  const rows = buildDraftOfferingRows({ talentProfileId: "t1", tenantId: "ten1", services: ["Haircut", " Color "], known: new Set() });
  assert.equal(rows.length, 2);
  for (const r of rows) {
    assert.equal(r.status, "draft");
    assert.equal(r.price_display, "quote");
    assert.equal(r.booking_mode, "inquiry");
    assert.equal(r.talent_profile_id, "t1");
    assert.equal(r.tenant_id, "ten1");
  }
  assert.deepEqual(rows.map((r) => r.title), ["Haircut", "Color"]);
});

test("titles already on the profile are skipped, case-insensitively, and duplicates collapse", () => {
  const rows = buildDraftOfferingRows({ talentProfileId: "t1", tenantId: "ten1", services: ["Haircut", "color", "Color"], known: new Set(["haircut"]) });
  assert.deepEqual(rows.map((r) => r.title), ["color"]);
});
