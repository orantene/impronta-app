/**
 * Services Phase 0 (PR A, checkout gate): static guards for the parts that cannot be driven
 * without a live database or a server-action session.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const web = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("the signed-choice mint and the draft seed both apply the guest-sellable rule", () => {
  for (const file of ["src/lib/messaging/mint-talent-offering-intent.ts", "src/lib/messaging/seed-talent-offering-draft.ts"]) {
    const src = web(file);
    assert.match(src, /isGuestSellableOffering\(/, `${file} must gate on published + approved + public`);
    assert.match(src, /moderation_state, visibility/, `${file} must select the columns the rule reads`);
    assert.doesNotMatch(src, /off\.status !== "published"/, `${file} must not fall back to status alone`);
  }
});

test("createPurchase gates on channel and only the staff desk passes staff", () => {
  assert.match(web("src/lib/orders/purchase.ts"), /refuseUnsellableOfferings\(catalog, offeringIds, input\.channel\)/);
  const instant = web("src/lib/scheduling/instant-purchase.ts");
  assert.match(instant, /channel: staffDesk \? "staff" : "guest"/);
  // No other caller opts into the staff channel.
  for (const file of ["src/lib/reservations/reserve.ts", "src/lib/storefront/cart-checkout.core.ts", "src/lib/storefront/class-timetable.core.ts"]) {
    assert.doesNotMatch(web(file), /channel:\s*"staff"/, `${file} must not use the staff channel`);
  }
});
