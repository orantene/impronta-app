/**
 * Pins: offer-total major-to-minor conversions go through offer-minor-units
 * (currency divisor), never a hard-coded `* 100`.
 * Run: node --require ./scripts/register-server-only-test.cjs --import tsx --test src/lib/inquiry/offer-minor-units-wiring.static.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { WEB_ROOT } from "../quality/supabase-unchecked-read";

const read = (rel: string) => readFileSync(join(WEB_ROOT, rel), "utf8");

describe("offer minor-unit wiring (charge side)", () => {
  it("updateOfferDraft converts the reconciled total with the offer currency", () => {
    const src = read("src/lib/inquiry/inquiry-engine-offers.ts");
    assert.match(src, /majorToMinor\(reconciledTotal, ctx\.currency_code\)/);
    assert.doesNotMatch(src, /reconciledTotal \* 100/);
    assert.doesNotMatch(src, /unit_price \?\? 0\) \* 100/);
    assert.match(src, /offer_currency_unreadable/);
  });
  it("booking reconcile and terms snapshot use the offer currency divisor", () => {
    const src = read("src/lib/inquiry/inquiry-engine-booking.ts");
    assert.doesNotMatch(src, /offerTotal \* 100\)\s*\)?\s*\{/);
    assert.doesNotMatch(src, /Math\.round\(bookedRevenue \* 100\) !==/);
    assert.match(src, /tryMajorToMinor\(offerTotal, offerCurrency\)/);
    assert.match(src, /select\("total_client_price, currency_code"\)/);
  });
});

describe("offer minor-unit wiring (display / card side)", () => {
  it("no display site converts an offer total with a bare * 100", () => {
    const sites: Array<[string, RegExp]> = [
      ["src/lib/messages-v5/confirm-view.ts", /totalClientPrice \* 100/],
      ["src/lib/messages-v5/payment-view.ts", /totalClientPrice \* 100/],
      ["src/lib/messaging/client-link.ts", /total_client_price\) \* 100|total_price\) \* 100/],
      ["src/lib/messaging/payment-card-sync.ts", /major \* 100/],
      ["src/lib/messaging/talent-actor.ts", /major \* 100/],
    ];
    for (const [rel, bad] of sites) {
      const src = read(rel);
      assert.doesNotMatch(src, bad, rel);
      assert.match(src, /offer-minor-units/, rel);
    }
  });
});
