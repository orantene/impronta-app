import { test } from "node:test";
import assert from "node:assert/strict";

import { promoStatus, quote } from "./quote";
import type { CartLine, Client, Promo, QuoteInput, QuoteResult, UsageMap } from "./types";

const MX = "America/Mexico_City";
const NY = "America/New_York";

function promo(over: Partial<Promo> & Pick<Promo, "id">): Promo {
  return {
    offer_kind: "percent",
    value: 20,
    currency: "USD",
    scope: "all",
    audience: "public",
    unlock: "auto",
    applies_on: "appointment",
    tz: MX,
    ...over,
  };
}

function line(over: Partial<CartLine> & Pick<CartLine, "id">): CartLine {
  return {
    kind: "service",
    target_id: "svc-1",
    list_cents: 10_000,
    qty: 1,
    currency: "USD",
    appointment_start: "2026-10-13T11:00:00-06:00", // Tue 11:00 Mexico City
    ...over,
  };
}

const NEW: Client = { customerId: "c-1", phone: "+525511112222", status: "new" };

function run(over: Partial<QuoteInput> & Pick<QuoteInput, "promos">): QuoteResult {
  return quote({
    cart: [line({ id: "L1" })],
    client: NEW,
    now: "2026-10-11T12:00:00-06:00", // Sunday
    usage: {},
    unlocked: { codes: [], linkPromoIds: [] },
    ...over,
  });
}

const reasonOf = (r: QuoteResult, id: string) => r.rejected.find((x) => x.promoId === id)?.reason;

// ---- offer types ----

test("percent: USD half-up to the cent", () => {
  const r = run({ promos: [promo({ id: "p", value: 10 })], cart: [line({ id: "L1", list_cents: 3005 })] });
  assert.equal(r.lines[0]?.final_cents, 2705);
  assert.equal(r.lines[0]?.discount_cents, 300);
});

test("fixed: amount off the line", () => {
  const r = run({ promos: [promo({ id: "p", offer_kind: "fixed", value: 2500 })] });
  assert.equal(r.lines[0]?.final_cents, 7500);
});

test("fixed_price: sets the unit price, times qty", () => {
  const r = run({ promos: [promo({ id: "p", offer_kind: "fixed_price", value: 6000 })], cart: [line({ id: "L1", qty: 2 })] });
  assert.equal(r.lines[0]?.list_cents, 20_000);
  assert.equal(r.lines[0]?.final_cents, 12_000);
});

test("fixed_price above list saves nothing and is not applied", () => {
  const r = run({ promos: [promo({ id: "p", offer_kind: "fixed_price", value: 20_000 })] });
  assert.equal(r.lines[0]?.final_cents, 10_000);
  assert.equal(reasonOf(r, "p"), "not_applicable");
});

test("free_addon: gift result, main price unchanged", () => {
  const r = run({ promos: [promo({ id: "g", offer_kind: "free_addon", addon: { id: "lashes", list_cents: 3000 } })] });
  assert.equal(r.lines[0]?.final_cents, 10_000);
  assert.deepEqual(r.gifts, [{ promoId: "g", addonId: "lashes", value_cents: 3000 }]);
  assert.equal(r.totals.fee_cents, 150); // fee on the charged price only
});

// ---- stacking ----

test("best price wins; the loser is outranked, gifts stack", () => {
  const r = run({
    promos: [
      promo({ id: "pct", value: 20 }),
      promo({ id: "fix", offer_kind: "fixed", value: 3000 }),
      promo({ id: "gift", offer_kind: "free_addon", addon: { id: "a", list_cents: 1000 } }),
    ],
  });
  assert.equal(r.lines[0]?.promoId, "fix");
  assert.equal(r.lines[0]?.final_cents, 7000);
  assert.equal(reasonOf(r, "pct"), "outranked");
  assert.deepEqual(r.applied.map((a) => a.promoId).sort(), ["fix", "gift"]);
});

test("one price promo per line, chosen per line", () => {
  const r = run({
    cart: [line({ id: "S" }), line({ id: "P", kind: "product", target_id: "prod-1", appointment_start: null })],
    promos: [promo({ id: "svc", scope: "services", value: 10 }), promo({ id: "prod", scope: "products", value: 30 })],
  });
  assert.equal(r.lines[0]?.promoId, "svc");
  assert.equal(r.lines[1]?.promoId, "prod");
});

test("tie-break: code beats auto on equal savings", () => {
  const r = run({
    promos: [promo({ id: "a-auto" }), promo({ id: "z-code", unlock: "code", code: "LUZ10" })],
    unlocked: { codes: ["luz10"], linkPromoIds: [] },
  });
  assert.equal(r.lines[0]?.promoId, "z-code");
  assert.equal(reasonOf(r, "a-auto"), "outranked");
});

test("tie-break: personal beats code", () => {
  const r = run({
    promos: [
      promo({ id: "a-code", unlock: "code", code: "X" }),
      promo({ id: "z-pers", audience: "one_client", customer_id: "c-1" }),
    ],
    unlocked: { codes: ["X"], linkPromoIds: [] },
  });
  assert.equal(r.lines[0]?.promoId, "z-pers");
  assert.equal(r.applied[0]?.source, "personal");
});

test("tie-break: ends sooner, then id", () => {
  const r1 = run({ promos: [promo({ id: "a", ends_at: "2026-12-31" }), promo({ id: "b", ends_at: "2026-10-20" })] });
  assert.equal(r1.lines[0]?.promoId, "b");
  const r2 = run({ promos: [promo({ id: "b" }), promo({ id: "a" })] });
  assert.equal(r2.lines[0]?.promoId, "a");
});

// ---- caps and floors ----

test("90% cap on percent, fixed and fixed_price", () => {
  for (const p of [
    promo({ id: "p", value: 95 }),
    promo({ id: "p", offer_kind: "fixed", value: 50_000 }),
    promo({ id: "p", offer_kind: "fixed_price", value: 0 }),
  ]) {
    const r = run({ promos: [p] });
    assert.equal(r.lines[0]?.final_cents, 1000, p.offer_kind);
    assert.ok((r.lines[0]?.final_cents ?? -1) >= 0);
  }
});

// ---- MXN rounding ----

test("MXN: final rounds half-up to whole pesos ($455 at 15% = $387)", () => {
  const r = run({ promos: [promo({ id: "p", value: 15, currency: "MXN" })], cart: [line({ id: "L1", list_cents: 45_500, currency: "MXN" })] });
  assert.equal(r.lines[0]?.final_cents, 38_700);
  assert.equal(r.lines[0]?.discount_cents, 6800);
});

test("MXN: many lines sum exactly to totals, every final a whole peso", () => {
  const cart = [33_333, 45_550, 12_345, 99_999].map((c, i) => line({ id: `L${i}`, list_cents: c, currency: "MXN", qty: i + 1 }));
  const r = run({ promos: [promo({ id: "p", value: 12.5, currency: "MXN" })], cart });
  for (const l of r.lines) {
    assert.equal(l.final_cents % 100, 0);
    assert.equal(l.list_cents - l.discount_cents, l.final_cents);
  }
  const sum = (k: "list_cents" | "discount_cents" | "final_cents") => r.lines.reduce((s, l) => s + l[k], 0);
  assert.equal(r.totals.list_cents, sum("list_cents"));
  assert.equal(r.totals.discount_cents, sum("discount_cents"));
  assert.equal(r.totals.charged_cents, sum("final_cents"));
  assert.equal(r.totals.list_cents - r.totals.discount_cents, r.totals.charged_cents);
});

test("MXN fixed amount with centavos still lands on a whole peso", () => {
  const r = run({ promos: [promo({ id: "p", offer_kind: "fixed", value: 2050, currency: "MXN" })], cart: [line({ id: "L1", list_cents: 50_000, currency: "MXN" })] });
  assert.equal(r.lines[0]?.final_cents, 48_000); // 479.50 -> 480
});

// ---- Stripe minimum and fee ----

test("below the Stripe minimum after a promo: free booking, no charge, no fee", () => {
  const r = run({
    promos: [promo({ id: "p", offer_kind: "fixed_price", value: 500, currency: "MXN" })],
    cart: [line({ id: "L1", list_cents: 5000, currency: "MXN" })],
  });
  assert.equal(r.lines[0]?.final_cents, 500);
  assert.equal(r.free_booking, true);
  assert.equal(r.totals.charged_cents, 0);
  assert.equal(r.totals.waived_cents, 500);
  assert.equal(r.totals.fee_cents, 0);
});

test("exactly the Stripe minimum is charged", () => {
  const r = run({ promos: [promo({ id: "p", value: 50 })], cart: [line({ id: "L1", list_cents: 100 })] });
  assert.equal(r.totals.charged_cents, 50);
  assert.equal(r.free_booking, false);
});

test("no promo, small price: never turned free", () => {
  const r = run({ promos: [], cart: [line({ id: "L1", list_cents: 30 })] });
  assert.equal(r.free_booking, false);
  assert.equal(r.totals.charged_cents, 30);
});

test("fee is 1.5% of the charged (discounted) price", () => {
  const r = run({ promos: [promo({ id: "p", value: 20 })] });
  assert.equal(r.totals.charged_cents, 8000);
  assert.equal(r.totals.fee_cents, 120);
});

// ---- basis and windows ----

const tuesday = { weekdays: [2] };

test("appointment basis: booked Sunday for a Tuesday promo applies", () => {
  const r = run({ promos: [promo({ id: "p", ...tuesday })] });
  assert.equal(r.lines[0]?.promoId, "p");
});

test("appointment basis: a Friday appointment is wrong_day", () => {
  const r = run({ promos: [promo({ id: "p", ...tuesday })], cart: [line({ id: "L1", appointment_start: "2026-10-16T11:00:00-06:00" })] });
  assert.equal(reasonOf(r, "p"), "wrong_day");
});

test("purchase basis uses now, not the appointment", () => {
  const r = run({ promos: [promo({ id: "p", applies_on: "purchase", ...tuesday })] });
  assert.equal(reasonOf(r, "p"), "wrong_day"); // now is Sunday
  const r2 = run({ promos: [promo({ id: "p", applies_on: "purchase", ...tuesday })], now: "2026-10-13T09:00:00-06:00", cart: [line({ id: "L1", appointment_start: "2026-10-16T11:00:00-06:00" })] });
  assert.equal(r2.lines[0]?.promoId, "p");
});

test("purchase basis: use_by date inclusive, after it is use_by_passed", () => {
  const base = promo({ id: "p", applies_on: "purchase", starts_at: "2026-10-01", ends_at: "2026-10-12", use_by_date: "2026-11-30" });
  const ok = run({ promos: [base], cart: [line({ id: "L1", appointment_start: "2026-11-30T23:30:00-06:00" })] });
  assert.equal(ok.lines[0]?.promoId, "p");
  const late = run({ promos: [base], cart: [line({ id: "L1", appointment_start: "2026-12-01T00:30:00-06:00" })] });
  assert.equal(reasonOf(late, "p"), "use_by_passed");
});

test("not_started and expired; end date inclusive to 23:59:59 local", () => {
  assert.equal(reasonOf(run({ promos: [promo({ id: "p", starts_at: "2026-10-14" })] }), "p"), "not_started");
  assert.equal(reasonOf(run({ promos: [promo({ id: "p", ends_at: "2026-10-12" })] }), "p"), "expired");
  const lastMinute = run({ promos: [promo({ id: "p", ends_at: "2026-10-13" })], cart: [line({ id: "L1", appointment_start: "2026-10-13T23:59:30-06:00" })] });
  assert.equal(lastMinute.lines[0]?.promoId, "p");
});

test("time window: start inclusive, end exclusive", () => {
  const p = promo({ id: "p", time_from: "10:00", time_to: "14:00" });
  assert.equal(run({ promos: [p], cart: [line({ id: "L1", appointment_start: "2026-10-13T10:00:00-06:00" })] }).lines[0]?.promoId, "p");
  assert.equal(reasonOf(run({ promos: [p], cart: [line({ id: "L1", appointment_start: "2026-10-13T14:00:00-06:00" })] }), "p"), "wrong_time");
});

test("midnight crossing: Fri 22:00-02:00 belongs to Friday", () => {
  const p = promo({ id: "p", weekdays: [5], time_from: "22:00", time_to: "02:00" });
  const at = (iso: string) => run({ promos: [p], cart: [line({ id: "L1", appointment_start: iso })] });
  assert.equal(at("2026-10-16T22:30:00-06:00").lines[0]?.promoId, "p"); // Fri 22:30
  assert.equal(at("2026-10-17T01:00:00-06:00").lines[0]?.promoId, "p"); // Sat 01:00, Friday's window
  assert.equal(reasonOf(at("2026-10-16T21:00:00-06:00"), "p"), "wrong_time");
  assert.equal(reasonOf(at("2026-10-17T23:00:00-06:00"), "p"), "wrong_day"); // Saturday's window
  assert.equal(reasonOf(at("2026-10-18T01:00:00-06:00"), "p"), "wrong_day");
});

test("DST spring forward: Tue 10-14 stays 10-14 local in New York", () => {
  const p = promo({ id: "p", tz: NY, weekdays: [2], time_from: "10:00", time_to: "14:00" });
  const at = (iso: string) => run({ promos: [p], now: "2026-03-01T12:00:00Z", cart: [line({ id: "L1", appointment_start: iso })] });
  assert.equal(at("2026-03-03T15:00:00Z").lines[0]?.promoId, "p"); // 10:00 EST
  assert.equal(at("2026-03-10T14:00:00Z").lines[0]?.promoId, "p"); // 10:00 EDT
  assert.equal(reasonOf(at("2026-03-10T13:30:00Z"), "p"), "wrong_time"); // 09:30 EDT
  assert.equal(reasonOf(at("2026-03-10T18:00:00Z"), "p"), "wrong_time"); // 14:00 EDT
});

test("DST spring forward night: the skipped hour never matches, 03:00 does", () => {
  const p = promo({ id: "p", tz: NY, time_from: "02:00", time_to: "04:00", starts_at: "2026-03-08", ends_at: "2026-03-08" });
  const at = (iso: string) => run({ promos: [p], now: "2026-03-01T12:00:00Z", cart: [line({ id: "L1", appointment_start: iso })] });
  assert.equal(reasonOf(at("2026-03-08T06:59:00Z"), "p"), "wrong_time"); // 01:59 EST
  assert.equal(at("2026-03-08T07:00:00Z").lines[0]?.promoId, "p"); // 03:00 EDT
});

test("DST fall back: the repeated hour counts once (first pass)", () => {
  const p = promo({ id: "p", tz: NY, weekdays: [0], time_from: "01:00", time_to: "02:00" });
  const at = (iso: string) => run({ promos: [p], now: "2026-10-25T12:00:00Z", cart: [line({ id: "L1", appointment_start: iso })] });
  assert.equal(at("2026-11-01T05:30:00Z").lines[0]?.promoId, "p"); // 01:30 EDT
  assert.equal(reasonOf(at("2026-11-01T06:30:00Z"), "p"), "wrong_time"); // 01:30 EST, second pass
});

test("DST fall back: end date still inclusive to 23:59:59 local", () => {
  const p = promo({ id: "p", tz: NY, ends_at: "2026-11-01" });
  const at = (iso: string) => run({ promos: [p], now: "2026-10-25T12:00:00Z", cart: [line({ id: "L1", appointment_start: iso })] });
  assert.equal(at("2026-11-02T04:59:00Z").lines[0]?.promoId, "p"); // 23:59 EST Nov 1
  assert.equal(reasonOf(at("2026-11-02T05:00:00Z"), "p"), "expired");
});

test("slot promo applies only to its slot", () => {
  const p = promo({ id: "p", slot_id: "slot-9" });
  assert.equal(run({ promos: [p], cart: [line({ id: "L1", slot_id: "slot-9" })] }).lines[0]?.promoId, "p");
  assert.equal(reasonOf(run({ promos: [p], cart: [line({ id: "L1", slot_id: "slot-1" })] }), "p"), "wrong_time");
});

// ---- limits, audience, unlock, flags ----

test("sold out from usage (confirmed + held)", () => {
  const usage: UsageMap = { p: { used: 3, usedByClient: 0 } };
  assert.equal(reasonOf(run({ promos: [promo({ id: "p", max_uses: 3 })], usage }), "p"), "sold_out");
  assert.equal(run({ promos: [promo({ id: "p", max_uses: 4 })], usage }).lines[0]?.promoId, "p");
});

test("per-client cap", () => {
  const usage: UsageMap = { p: { used: 1, usedByClient: 1 } };
  assert.equal(reasonOf(run({ promos: [promo({ id: "p", per_client_max: 1 })], usage }), "p"), "client_limit");
});

test("audience new / returning / lapsed", () => {
  const ret: Client = { customerId: "c-2", status: "returning" };
  const lapsed: Client = { customerId: "c-3", status: "lapsed" };
  assert.equal(run({ promos: [promo({ id: "p", audience: "new_clients" })] }).lines[0]?.promoId, "p");
  assert.equal(reasonOf(run({ promos: [promo({ id: "p", audience: "new_clients" })], client: ret }), "p"), "audience");
  assert.equal(reasonOf(run({ promos: [promo({ id: "p", audience: "returning" })] }), "p"), "audience");
  assert.equal(run({ promos: [promo({ id: "p", audience: "returning" })], client: lapsed }).lines[0]?.promoId, "p");
  assert.equal(reasonOf(run({ promos: [promo({ id: "p", audience: "lapsed" })], client: ret }), "p"), "audience");
});

test("single-use personal: bound to the customer, one use total", () => {
  const p = promo({ id: "p", unlock: "code", code: "ANA-7K2Q", is_single_use: true, customer_id: "c-1" });
  const unlocked = { codes: ["ANA-7K2Q"], linkPromoIds: [] };
  assert.equal(run({ promos: [p], unlocked }).applied[0]?.source, "personal");
  assert.equal(reasonOf(run({ promos: [p], unlocked, client: { customerId: "c-9", status: "new" } }), "p"), "audience");
  assert.equal(reasonOf(run({ promos: [p], unlocked, usage: { p: { used: 1, usedByClient: 0 } } }), "p"), "sold_out");
});

test("locked without the code or link", () => {
  assert.equal(reasonOf(run({ promos: [promo({ id: "p", unlock: "code", code: "LUZ" })] }), "p"), "locked");
  assert.equal(reasonOf(run({ promos: [promo({ id: "p", unlock: "link" })] }), "p"), "locked");
  assert.equal(run({ promos: [promo({ id: "p", unlock: "link" })], unlocked: { codes: [], linkPromoIds: ["p"] } }).applied[0]?.source, "link");
});

test("draft, paused, archived are rejected by name", () => {
  const r = run({
    promos: [promo({ id: "d", is_draft: true }), promo({ id: "s", is_paused: true }), promo({ id: "a", archived_at: "2026-10-01T00:00:00Z" })],
  });
  assert.equal(reasonOf(r, "d"), "draft");
  assert.equal(reasonOf(r, "s"), "paused");
  assert.equal(reasonOf(r, "a"), "archived");
});

test("min spend: below_minimum; out of scope: not_applicable", () => {
  assert.equal(reasonOf(run({ promos: [promo({ id: "p", min_subtotal_cents: 20_000 })] }), "p"), "below_minimum");
  assert.equal(reasonOf(run({ promos: [promo({ id: "p", scope: "products" })] }), "p"), "not_applicable");
  assert.equal(reasonOf(run({ promos: [promo({ id: "p", scope: "services", target_ids: ["other"] })] }), "p"), "not_applicable");
});

test("mixed-currency cart is refused", () => {
  assert.throws(() => run({ promos: [], cart: [line({ id: "a" }), line({ id: "b", currency: "MXN" })] }));
});

// ---- status ----

test("promoStatus is derived", () => {
  const now = "2026-10-14T12:00:00-06:00";
  assert.equal(promoStatus(promo({ id: "p" }), now), "live");
  assert.equal(promoStatus(promo({ id: "p", is_draft: true }), now), "draft");
  assert.equal(promoStatus(promo({ id: "p", archived_at: now }), now), "archived");
  assert.equal(promoStatus(promo({ id: "p", is_paused: true }), now), "paused");
  assert.equal(promoStatus(promo({ id: "p", starts_at: "2026-10-15" }), now), "scheduled");
  assert.equal(promoStatus(promo({ id: "p", ends_at: "2026-10-13" }), now), "expired");
  assert.equal(promoStatus(promo({ id: "p", ends_at: "2026-10-14" }), "2026-10-14T23:59:59-06:00"), "live");
  assert.equal(promoStatus(promo({ id: "p", max_uses: 2 }), now, { used: 2 }), "sold_out");
  // Sold out is reversible: a released hold brings it back.
  assert.equal(promoStatus(promo({ id: "p", max_uses: 2 }), now, { used: 1 }), "live");
});
