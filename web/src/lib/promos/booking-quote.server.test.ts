import assert from "node:assert/strict";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  bookingCartLines,
  dropLimitedForNoShows,
  orderDiscountCents,
  quoteBooking,
  redemptionPlan,
  typedCodeVerdict,
  type BookingQuoteDeps,
} from "./booking-quote.server";
import { quote } from "./quote";
import type { Promo, QuoteInput } from "./types";

const NOW = new Date("2026-10-14T18:00:00Z");
const START = "2026-10-20T17:00:00Z";
const SERVICE = "svc-nails";
const ADDON = "addon-art";

function promo(over: Partial<Promo> = {}): Promo {
  return {
    id: "p-auto", offer_kind: "percent", value: 20, currency: "MXN", scope: "all", audience: "public",
    unlock: "auto", applies_on: "appointment", tz: "America/Mexico_City", ...over,
  };
}

function quoteOf(promos: Promo[], over: Partial<QuoteInput> = {}) {
  return quote({
    channel: "booking",
    cart: bookingCartLines(
      [{ offeringId: SERVICE, kind: "service", totalCents: 60000, addons: [{ id: ADDON, cents: 10000 }] }],
      { currency: "MXN", appointmentStart: START },
    ),
    client: { customerId: "c1", status: "new" },
    now: NOW,
    promos,
    usage: {},
    unlocked: { codes: [], linkPromoIds: [] },
    ...over,
  });
}

test("bookingCartLines: the base and each add-on are their own engine line, add-ons outside the units", () => {
  const lines = bookingCartLines(
    [{ offeringId: SERVICE, kind: "service", totalCents: 3 * 20000 + 5000, addons: [{ id: ADDON, cents: 5000 }] }],
    { currency: "MXN", appointmentStart: START },
  );
  assert.deepEqual(lines, [
    { id: "l0", kind: "service", target_id: SERVICE, list_cents: 60000, qty: 1, currency: "MXN", appointment_start: START },
    { id: "l0a0", kind: "addon", target_id: ADDON, list_cents: 5000, qty: 1, currency: "MXN", appointment_start: START },
  ]);
});

test("bookingCartLines: a product carries no appointment, so appointment-basis promos read now", () => {
  const [line] = bookingCartLines(
    [{ offeringId: "prod", kind: "product", totalCents: 1000, addons: [] }],
    { currency: "USD", appointmentStart: START },
  );
  assert.equal(line?.kind, "product");
  assert.equal(line?.appointment_start, null);
});

test("a service-targeted promo discounts the service, never the add-on", () => {
  const r = quoteOf([promo({ target_ids: [SERVICE] })]);
  assert.equal(r.totals.list_cents, 60000);
  assert.equal(r.totals.discount_cents, 10000); // 20% of 500 MXN base only
  assert.equal(r.totals.charged_cents, 50000);
  assert.equal(orderDiscountCents(r), 10000);
});

test("redemptionPlan: one row per applied promo with list + discount snapshots", () => {
  const r = quoteOf([promo({ target_ids: [SERVICE] })]);
  assert.deepEqual(redemptionPlan(r), [
    { promoId: "p-auto", isPricePromo: true, source: "auto", listCents: 50000, discountCents: 10000 },
  ]);
});

test("free booking: the waived remainder is order discount and rides the biggest price promo", () => {
  // 80 MXN at fixed_price 5: the 90% cap lifts it to 8 MXN, still under Stripe's 10 MXN floor.
  const r = quoteOf(
    [promo({ id: "p-five", offer_kind: "fixed_price", value: 500, target_ids: [SERVICE] })],
    {
      cart: bookingCartLines([{ offeringId: SERVICE, kind: "service", totalCents: 8000, addons: [] }], {
        currency: "MXN",
        appointmentStart: START,
      }),
    },
  );
  assert.equal(r.free_booking, true);
  assert.equal(r.totals.charged_cents, 0);
  assert.equal(r.totals.discount_cents, 7200);
  assert.equal(r.totals.waived_cents, 800);
  assert.equal(orderDiscountCents(r), 8000, "the order owes nothing, so it settles on the free path");
  assert.equal(redemptionPlan(r)[0]?.discountCents, 8000);
});

test("typedCodeVerdict: applied, unknown, refused with the checkout's reason, better deal", () => {
  const code = promo({ id: "p-code", unlock: "code", code: "LUZ10", value: 10 });
  const applied = quoteOf([code], { unlocked: { codes: ["LUZ10"], linkPromoIds: [] } });
  assert.deepEqual(typedCodeVerdict(applied, [code], " luz10 "), { kind: "applied", promoId: "p-code" });
  assert.deepEqual(typedCodeVerdict(applied, [code], "NOPE"), { kind: "refused", reason: "promo_unknown" });
  assert.deepEqual(typedCodeVerdict(applied, [code], null), { kind: "none" });

  const soldOut = quoteOf([{ ...code, max_uses: 1 }], {
    usage: { "p-code": { used: 1, usedByClient: 0 } },
    unlocked: { codes: ["LUZ10"], linkPromoIds: [] },
  });
  assert.deepEqual(typedCodeVerdict(soldOut, [code], "LUZ10"), { kind: "refused", reason: "promo_exhausted" });

  const auto = promo({ id: "p-auto", value: 30 });
  const beaten = quoteOf([code, auto], { unlocked: { codes: ["LUZ10"], linkPromoIds: [] } });
  assert.deepEqual(typedCodeVerdict(beaten, [code, auto], "LUZ10"), { kind: "better_deal", promoId: "p-auto" });
});

// ── quoteBooking IO, with typed fakes for each read ───────────────────────

const DB = {} as unknown as SupabaseClient;

function deps(over: Partial<BookingQuoteDeps> & { promos?: Promo[] } = {}): BookingQuoteDeps & { seen: { usageFor: string | null; statusFor: string | null } } {
  const seen = { usageFor: null as string | null, statusFor: null as string | null };
  const promos = over.promos ?? [];
  return {
    seen,
    loadTenantPromos: over.loadTenantPromos ?? (async () => ({ ok: true as const, rows: [], promos })),
    loadUsage: over.loadUsage ?? (async (_db, ids, customerId) => {
      seen.usageFor = customerId;
      return Object.fromEntries(ids.map((id) => [id, { used: 0, usedByClient: 0 }]));
    }),
    loadLapsedDays: over.loadLapsedDays ?? (async () => new Map()),
    loadClientStatus: over.loadClientStatus ?? (async (_db, input) => {
      seen.statusFor = input.customerId;
      return "new";
    }),
    resolveCustomer: over.resolveCustomer ?? (async () => ({ kind: "matched" as const, customerId: "c-from-email", by: "email" as const, conflict: false })),
    countNoShows: over.countNoShows ?? (async () => 0),
  };
}

const CART = bookingCartLines([{ offeringId: SERVICE, kind: "service", totalCents: 50000, addons: [] }], {
  currency: "MXN",
  appointmentStart: START,
});

test("quoteBooking: live promos priced; paused / draft promos never read for usage", async () => {
  const d = deps({ promos: [promo(), promo({ id: "p-paused", is_paused: true, value: 50 })] });
  const r = await quoteBooking(DB, { tenantId: "t1", talentProfileId: null, lines: CART, customerId: "c1", now: NOW }, d);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.quote.totals.charged_cents, 40000);
  assert.deepEqual(r.value.quote.applied.map((a) => a.promoId), ["p-auto"]);
  assert.equal(d.seen.usageFor, "c1");
});

test("quoteBooking: a link cookie unlocks its promo; the customer comes from the contact when unknown", async () => {
  const link = promo({ id: "p-link", unlock: "link", value: 15 });
  const d = deps({ promos: [link] });
  const r = await quoteBooking(DB, { tenantId: "t1", talentProfileId: null, lines: CART, contact: { email: "a@b.co", phone: null }, linkPromoIds: ["p-link"], now: NOW }, d);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.value.customerId, "c-from-email");
  assert.equal(d.seen.statusFor, "c-from-email");
  assert.equal(r.value.quote.applied[0]?.source, "link");
});

test("quoteBooking: a typed paused code is still FOUND, so the client hears why", async () => {
  const paused = promo({ id: "p-code", unlock: "code", code: "LUZ10", is_paused: true });
  const r = await quoteBooking(DB, { tenantId: "t1", talentProfileId: null, lines: CART, customerId: "c1", code: "luz10", now: NOW }, deps({ promos: [paused] }));
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.value.typed, { kind: "refused", reason: "promo_unknown" });
});

test("quoteBooking: any failed read is promo_unavailable, never 'no promos'", async () => {
  const failed = [
    deps({ loadTenantPromos: async () => ({ ok: false as const }) }),
    deps({ loadUsage: async () => null }),
    deps({ loadClientStatus: async () => null }),
  ];
  for (const d of failed) {
    const r = await quoteBooking(DB, { tenantId: "t1", talentProfileId: null, lines: CART, customerId: "c1", now: NOW }, d);
    assert.deepEqual(r, { ok: false, reason: "promo_unavailable" });
  }
});

// ── L1: 2 no-shows with this talent -> no limited promos, silently ─────────

test("dropLimitedForNoShows: 2 no-shows or a failed count drops only capped promos", () => {
  const open = promo({ id: "p-open" });
  const capped = promo({ id: "p-cap", max_uses: 3 });
  assert.deepEqual(dropLimitedForNoShows([open, capped], 1).map((p) => p.id), ["p-open", "p-cap"]);
  assert.deepEqual(dropLimitedForNoShows([open, capped], 2).map((p) => p.id), ["p-open"]);
  assert.deepEqual(dropLimitedForNoShows([open, capped], null).map((p) => p.id), ["p-open"]);
});

test("quoteBooking: a 2-no-show client sees regular price on a limited promo, open promo still applies", async () => {
  const capped = promo({ id: "p-cap", max_uses: 3, value: 50 });
  const open = promo({ id: "p-open", value: 10 });
  let asked: string | null = null;
  const d = deps({ promos: [capped, open], countNoShows: async (_db, _t, c) => { asked = c; return 2; } });
  const r = await quoteBooking(DB, { tenantId: "t1", talentProfileId: null, lines: CART, customerId: "c1", now: NOW }, d);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(asked, "c1");
  assert.deepEqual(r.value.quote.applied.map((a) => a.promoId), ["p-open"]);
  assert.equal(r.value.quote.totals.charged_cents, 45000);
});

test("quoteBooking: 1 no-show keeps the limited promo; no limited promo means no count read", async () => {
  const capped = promo({ id: "p-cap", max_uses: 3, value: 50 });
  const r = await quoteBooking(DB, { tenantId: "t1", talentProfileId: null, lines: CART, customerId: "c1", now: NOW }, deps({ promos: [capped], countNoShows: async () => 1 }));
  assert.ok(r.ok && r.value.quote.applied[0]?.promoId === "p-cap");
  let reads = 0;
  await quoteBooking(DB, { tenantId: "t1", talentProfileId: null, lines: CART, customerId: "c1", now: NOW }, deps({ promos: [promo()], countNoShows: async () => { reads += 1; return 5; } }));
  assert.equal(reads, 0);
});

test("quoteBooking: a typed limited code for a 2-no-show client is refused generically, never priced", async () => {
  const code = promo({ id: "p-code", unlock: "code", code: "LUZ10", max_uses: 3 });
  const r = await quoteBooking(DB, { tenantId: "t1", talentProfileId: null, lines: CART, customerId: "c1", code: "luz10", now: NOW }, deps({ promos: [code], countNoShows: async () => 2 }));
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.value.quote.applied.length, 0);
  assert.equal(r.value.typed.kind, "refused");
});

test("hub: talent A's promo never prices talent B's booking on the same tenant", async () => {
  const byOwner: Record<string, Promo[]> = { "tp-a": [promo({ id: "p-a", value: 20 })], agency: [] };
  const asked: string[] = [];
  const d = deps({
    loadTenantPromos: async (_db, _tenant, owner) => {
      const key = "talentProfileId" in owner ? owner.talentProfileId : "agency";
      asked.push(key);
      return { ok: true as const, rows: [], promos: byOwner[key] ?? [] };
    },
  });
  const b = await quoteBooking(DB, { tenantId: "t1", talentProfileId: "tp-b", lines: CART, customerId: "c1", now: NOW }, d);
  assert.equal(b.ok, true);
  if (!b.ok) return;
  assert.equal(b.value.quote.applied.length, 0);
  assert.deepEqual(asked.sort(), ["agency", "tp-b"]);
  const a = await quoteBooking(DB, { tenantId: "t1", talentProfileId: "tp-a", lines: CART, customerId: "c1", now: NOW }, d);
  assert.equal(a.ok, true);
  if (!a.ok) return;
  assert.deepEqual(a.value.quote.applied.map((x) => x.promoId), ["p-a"]);
});
