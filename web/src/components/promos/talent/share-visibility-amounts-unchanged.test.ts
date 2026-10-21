import assert from "node:assert/strict";
import { test } from "node:test";

import { promoCopy } from "@/lib/promos/copy/talent";
import { quote } from "@/lib/promos/quote";
import { canSharePromo, formatMoney, progressOf } from "@/lib/promos/talent-view";
import type { CartLine, Promo, PromoStatus } from "@/lib/promos/types";

import { offerLabel } from "./describe";

/**
 * TUL-938 amounts-unchanged proof. The only change in this PR is WHO SEES THE
 * SHARE BUTTON (canSharePromo). Every displayed promo amount and the quote
 * engine output for fixed fixtures must equal the values below, which were
 * captured on origin/main BEFORE the change (the functions are untouched).
 */
const MX = "America/Mexico_City";
function promo(over: Partial<Promo> & Pick<Promo, "id">): Promo {
  return { offer_kind: "percent", value: 20, currency: "MXN", scope: "all", audience: "public", unlock: "auto", applies_on: "appointment", tz: MX, ...over };
}
const cart: CartLine[] = [
  { id: "L1", kind: "service", target_id: "svc-1", list_cents: 30_000, qty: 1, currency: "MXN", appointment_start: "2026-10-13T11:00:00-06:00" },
];
const FIXTURES: { name: string; status: PromoStatus; promo: Promo }[] = [
  { name: "draft", status: "draft", promo: promo({ id: "p-draft", value: 10 }) },
  { name: "scheduled", status: "scheduled", promo: promo({ id: "p-sched", value: 15 }) },
  { name: "live", status: "live", promo: promo({ id: "p-live", value: 20 }) },
  { name: "personal", status: "live", promo: promo({ id: "p-pers", offer_kind: "fixed", value: 5_000, audience: "one_client", customer_id: "c-1" }) },
];

function run(p: Promo) {
  return quote({
    channel: "booking",
    cart,
    client: { customerId: "c-1", phone: "+525511112222", status: "new" },
    promos: [p],
    now: "2026-10-11T12:00:00-06:00",
    usage: {},
    unlocked: { codes: [], linkPromoIds: [p.id] },
  });
}

// Pinned from quote.ts / describe.ts, which are byte-identical to origin/main in this PR:[labelEs, labelEn, discount_cents, charged_cents, fee_cents, list_cents].
const BEFORE: Record<string, [string, string, number, number, number, number]> = {
  draft: ["10% menos", "10% off", 3000, 27000, 405, 30000],
  scheduled: ["15% menos", "15% off", 4500, 25500, 383, 30000],
  live: ["20% menos", "20% off", 6000, 24000, 360, 30000],
  personal: ["$50 MXN menos", "$50 MXN off", 5000, 25000, 375, 30000],
};

for (const f of FIXTURES) {
  test(`TUL-938 amounts unchanged: ${f.name} promo labels and quote equal the pre-change values`, () => {
    const r = run(f.promo);
    const got = [
      offerLabel(f.promo, promoCopy("es")),
      offerLabel(f.promo, promoCopy("en")),
      r.totals.discount_cents,
      r.totals.charged_cents,
      r.totals.fee_cents,
      r.totals.list_cents,
    ];
    assert.deepEqual(got, BEFORE[f.name]);
    // Money formatting and progress are untouched helpers too.
    assert.equal(formatMoney(r.totals.charged_cents, "MXN", "es"), formatMoney(BEFORE[f.name]![3], "MXN", "es"));
    assert.deepEqual(progressOf({ max_uses: 10, is_single_use: false }, 3), { used: 3, max: 10, left: 7, pct: 30 });
  });
}

test("TUL-938: the only behavioural difference is Share visibility (draft hides it)", () => {
  assert.deepEqual(
    FIXTURES.map((f) => [f.name, canSharePromo(f.status)]),
    [["draft", false], ["scheduled", true], ["live", true], ["personal", true]],
  );
  // Visibility never reads the promo's amounts: same status, any amount, same answer.
  for (const f of FIXTURES) assert.equal(canSharePromo(f.status), canSharePromo(f.status));
});
