import { test } from "node:test";
import assert from "node:assert/strict";

import { computeMonthRollup, computePromoResult, promoTips, type ResultRedemption } from "./compute";
import { homeLineText, money } from "./copy";

function row(over: Partial<ResultRedemption>): ResultRedemption {
  return {
    promo_code_id: "p1",
    status: "confirmed",
    list_cents: 100_00,
    discount_cents: 20_00,
    source_channel: "wa",
    client_status: "new",
    created_at: "2026-10-10T10:00:00Z",
    ...over,
  };
}

test("pairs earned with given, confirmed rows only", () => {
  const r = computePromoResult({
    promoId: "p1",
    rows: [row({}), row({ client_status: "returning", source_channel: null }), row({ status: "held" }), row({ status: "voided" }), row({ promo_code_id: "other" })],
  });
  assert.equal(r.bookings, 2);
  assert.equal(r.earnedCents, 160_00);
  assert.equal(r.givenCents, 40_00);
  assert.equal(r.grossCents, 200_00);
  assert.equal(r.newClients, 1);
  assert.equal(r.returningClients, 1);
  assert.deepEqual(r.bySource, { wa: 1, unknown: 1 });
  assert.equal(r.discountShare, 0.2);
});

test("gifted add-ons are courtesy, not given", () => {
  const r = computePromoResult({ promoId: "p1", rows: [row({ is_price_promo: false, list_cents: 50_00, discount_cents: 10_00 })] });
  assert.equal(r.giftedCents, 10_00);
  assert.equal(r.givenCents, 0);
  assert.equal(r.earnedCents, 50_00);
});

test("link opens count only link_open events of this promo", () => {
  const r = computePromoResult({
    promoId: "p1",
    rows: [],
    events: [
      { promo_id: "p1", kind: "link_open", at: "x" },
      { promo_id: "p1", kind: "view", at: "x" },
      { promo_id: "p2", kind: "link_open", at: "x" },
    ],
  });
  assert.equal(r.linkOpens, 1);
});

test("sold out hours from start to the booking that used the last spot", () => {
  const rows = [
    row({ created_at: "2026-10-10T01:00:00Z" }),
    row({ created_at: "2026-10-10T20:00:00Z" }),
    row({ created_at: "2026-10-11T20:00:00Z" }),
  ];
  const r = computePromoResult({ promoId: "p1", rows, maxUses: 2, startedAt: "2026-10-10T01:00:00Z" });
  assert.equal(r.soldOutHours, 19);
  assert.equal(computePromoResult({ promoId: "p1", rows, maxUses: 5 }).soldOutHours, null);
  assert.equal(computePromoResult({ promoId: "p1", rows }).soldOutHours, null);
});

test("month roll-up respects the window and status", () => {
  const m = computeMonthRollup({
    rows: [row({}), row({ created_at: "2026-09-30T23:00:00Z" }), row({ status: "held" }), row({ client_status: "lapsed" })],
    fromIso: "2026-10-01T00:00:00Z",
    toIso: "2026-11-01T00:00:00Z",
  });
  assert.equal(m.bookings, 2);
  assert.equal(m.earnedCents, 160_00);
  assert.equal(m.returningClients, 1);
});

test("tips follow the rules", () => {
  const base = { soldOutHours: null, discountShare: 0.1, bookings: 4, returningClients: 0, lapsedClients: 0, newClients: 4, grossCents: 1 };
  const mk = (o: Partial<ReturnType<typeof computePromoResult>>) => ({ ...computePromoResult({ promoId: "p", rows: [] }), ...base, ...o });
  assert.deepEqual(promoTips({ result: mk({ soldOutHours: 19 }), maxUses: 4 }).map((t) => t.id), ["sold_out_fast"]);
  assert.deepEqual(promoTips({ result: mk({ soldOutHours: 30 }), maxUses: 4 }), []);
  assert.deepEqual(promoTips({ result: mk({ bookings: 2 }), maxUses: 10, ended: true }).map((t) => t.id), ["low_use"]);
  assert.deepEqual(promoTips({ result: mk({ bookings: 2 }), maxUses: 10 }), []);
  assert.deepEqual(
    promoTips({ result: mk({ returningClients: 3, newClients: 1 }), audience: "new_clients" }).map((t) => t.id),
    ["mostly_returning"],
  );
  assert.deepEqual(promoTips({ result: mk({ returningClients: 3, newClients: 1 }), audience: "public" }), []);
  assert.deepEqual(promoTips({ result: mk({ discountShare: 0.41 }) }).map((t) => t.id), ["discount_heavy"]);
  assert.deepEqual(promoTips({ result: mk({ discountShare: 0.4 }) }), []);
});

test("home line is null with no bookings and pairs earned with given", () => {
  const empty = { bookings: 0, earnedCents: 0, givenCents: 0, giftedCents: 0, newClients: 0, returningClients: 0 };
  assert.equal(homeLineText(empty, "MXN", "es"), null);
  const line = homeLineText({ ...empty, bookings: 3, earnedCents: 1080_00, givenCents: 270_00 }, "USD", "en");
  assert.ok(line && line.includes("3 bookings") && line.includes("earned") && line.includes("given"));
  assert.ok(!line.includes("—"));
  assert.ok(money(1080_00, "USD", "en").includes("1,080"));
});
