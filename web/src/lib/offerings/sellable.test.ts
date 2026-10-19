/**
 * D1: the ONE "can this be sold" rule, table-driven, plus one test per entry point
 * (checkout, quote, reservation, each display surface that used to re-derive it).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { isSellable, scopeToSellableOfferings, sellability, type SellContext, type SellRefusalReason } from "./sellable";
import { isSellableOnChannel } from "./guest-sellable";
import { refuseUnsellableOfferings, type Catalog } from "@/lib/orders/purchase-catalog";
import { offeringIsQuotable } from "@/lib/orders/checkout-quote-gate";
import { orderOfferingsSellable } from "@/lib/orders/order-sellable-gate";
import { offeringIsDirectlyBookable } from "@/lib/talent/offerings-types";

const web = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

type Row = { status?: unknown; moderation_state?: unknown; visibility?: unknown };
const OK: Row = { status: "published", moderation_state: "approved", visibility: "public" };

type Case = { name: string; row: Row | null; expect: Record<SellContext, true | SellRefusalReason> };

const CASES: Case[] = [
  {
    name: "published + approved + public",
    row: OK,
    expect: { guest: true, client: true, guest_request: true, pos_desk: true, reservation: true },
  },
  {
    name: "on_request",
    row: { ...OK, visibility: "on_request" },
    expect: { guest: "on_request_no_charge", client: "on_request_no_charge", guest_request: true, pos_desk: true, reservation: true },
  },
  {
    name: "agency_only",
    row: { ...OK, visibility: "agency_only" },
    expect: { guest: "not_public", client: "not_public", guest_request: "not_public", pos_desk: true, reservation: true },
  },
  {
    name: "unlisted (a table-reservation offering)",
    row: { ...OK, visibility: "unlisted" },
    expect: { guest: "not_public", client: "not_public", guest_request: "not_public", pos_desk: true, reservation: true },
  },
  {
    name: "pending approval",
    row: { ...OK, moderation_state: "pending" },
    expect: { guest: "not_approved", client: "not_approved", guest_request: "not_approved", pos_desk: true, reservation: "not_approved" },
  },
  {
    name: "rejected",
    row: { ...OK, moderation_state: "rejected" },
    expect: { guest: "not_approved", client: "not_approved", guest_request: "not_approved", pos_desk: true, reservation: "not_approved" },
  },
  {
    name: "draft",
    row: { ...OK, status: "draft" },
    expect: { guest: "not_published", client: "not_published", guest_request: "not_published", pos_desk: "not_published", reservation: "not_published" },
  },
  {
    name: "archived",
    row: { ...OK, status: "archived" },
    expect: { guest: "not_published", client: "not_published", guest_request: "not_published", pos_desk: "not_published", reservation: "not_published" },
  },
  {
    name: "missing row",
    row: null,
    expect: { guest: "not_found", client: "not_found", guest_request: "not_found", pos_desk: "not_found", reservation: "not_found" },
  },
  {
    name: "no moderation / visibility value (fails closed)",
    row: { status: "published" },
    expect: { guest: "not_approved", client: "not_approved", guest_request: "not_approved", pos_desk: true, reservation: "not_approved" },
  },
];

for (const c of CASES) {
  for (const [context, want] of Object.entries(c.expect) as [SellContext, true | SellRefusalReason][]) {
    test(`sellability: ${c.name} in ${context} -> ${want === true ? "ok" : want}`, () => {
      const got = sellability(c.row, context);
      if (want === true) assert.deepEqual(got, { ok: true });
      else assert.deepEqual(got, { ok: false, reason: want });
      assert.equal(isSellable(c.row, context), want === true);
    });
  }
}

test("sellability reads the camelCase TalentOffering shape too", () => {
  assert.equal(isSellable({ status: "published", moderationState: "approved", visibility: "public" }, "guest"), true);
  assert.equal(isSellable({ status: "published", moderationState: "pending", visibility: "public" }, "guest"), false);
});

test("scopeToSellableOfferings emits the same filters the predicate implies", () => {
  const calls: string[] = [];
  const chain = {
    eq: (c: string, v: unknown) => (calls.push(`eq:${c}=${String(v)}`), chain),
    in: (c: string, v: readonly unknown[]) => (calls.push(`in:${c}=${v.join("|")}`), chain),
  };
  scopeToSellableOfferings(chain, "guest");
  assert.deepEqual(calls.splice(0), ["eq:status=published", "eq:moderation_state=approved", "eq:visibility=public"]);
  scopeToSellableOfferings(chain, "guest_request");
  assert.deepEqual(calls.splice(0), ["eq:status=published", "eq:moderation_state=approved", "in:visibility=public|on_request"]);
  scopeToSellableOfferings(chain, "pos_desk");
  assert.deepEqual(calls.splice(0), ["eq:status=published"]);
});

// ── Entry point: createPurchase (every catalog checkout) ────────────────────

function catalogOf(row: Row): Extract<Catalog, { ok: true }> {
  return {
    ok: true,
    policies: new Map([["o1", { status: row.status } as never]]),
    rawOfferings: new Map([["o1", { visibility: row.visibility ?? null, moderationState: row.moderation_state ?? null } as never]]),
    offerings: new Map(),
    variants: new Map(),
    addons: new Map(),
  };
}

for (const c of CASES.filter((k) => k.row)) {
  test(`createPurchase gate agrees with the rule: ${c.name}`, () => {
    const cat = catalogOf(c.row as Row);
    assert.equal(refuseUnsellableOfferings(cat, ["o1"], undefined).ok, c.expect.guest === true, "default channel = guest");
    assert.equal(refuseUnsellableOfferings(cat, ["o1"], "guest").ok, c.expect.guest === true);
    assert.equal(refuseUnsellableOfferings(cat, ["o1"], "staff").ok, c.expect.pos_desk === true);
    assert.equal(refuseUnsellableOfferings(cat, ["o1"], "reservation").ok, c.expect.reservation === true);
    assert.equal(isSellableOnChannel(c.row, "staff"), c.expect.pos_desk === true);
  });
}

// ── Entry point: the public quote action ────────────────────────────────────

function adminWith(row: Row | null) {
  const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: row, error: null }) };
  return { from: () => q } as never;
}

for (const c of CASES.filter((k) => k.row)) {
  test(`quote gate agrees with the rule: ${c.name}`, async () => {
    assert.equal(await offeringIsQuotable(adminWith(c.row), "o1"), c.expect.guest === true);
  });
}

// ── Entry point: card payment started on an existing order (tickets) ────────

function orderAdmin(lines: Array<{ offering_id: string | null }>, offerings: Array<Row & { id: string }>) {
  const table = (name: string) => {
    const data = name === "order_lines" ? lines : offerings;
    const q = { select: () => q, eq: () => q, in: () => q, then: (r: (v: { data: unknown; error: null }) => unknown) => r({ data, error: null }) };
    return q;
  };
  return { from: table } as never;
}

test("a card payment on an order whose offering is no longer guest-sellable is refused", async () => {
  const bad = await orderOfferingsSellable(orderAdmin([{ offering_id: "o1" }], [{ id: "o1", ...OK, visibility: "agency_only" }]), "ord", "guest");
  assert.equal(bad.ok, false);
  const good = await orderOfferingsSellable(orderAdmin([{ offering_id: "o1" }], [{ id: "o1", ...OK }]), "ord", "guest");
  assert.equal(good.ok, true);
  const missing = await orderOfferingsSellable(orderAdmin([{ offering_id: "o1" }], []), "ord", "guest");
  assert.equal(missing.ok, false, "an offering that cannot be read is not sold");
  const none = await orderOfferingsSellable(orderAdmin([], []), "ord", "guest");
  assert.equal(none.ok, false, "an order with no catalog line is not a catalog charge");
});

test("startTicketCardPayment calls the shared gate before creating the Checkout session", () => {
  const src = web("src/app/(public)/_events/ticket-picker-actions.ts");
  const gate = src.indexOf("orderOfferingsSellable(");
  const session = src.indexOf("createCheckoutSessionForTransaction({");
  assert.ok(gate > 0 && session > gate, "gate must come before the Stripe session");
});

// ── Entry point: table reservation (regression guard, reserve.ts) ───────────

test("a table reservation books against an unlisted, approved offering: its own channel, not the guest rule", () => {
  const unlisted = catalogOf({ ...OK, visibility: "unlisted" });
  assert.equal(refuseUnsellableOfferings(unlisted, ["o1"], undefined).ok, false, "a plain guest cannot buy it from the menu");
  assert.equal(refuseUnsellableOfferings(unlisted, ["o1"], "reservation").ok, true);
  const pending = catalogOf({ ...OK, visibility: "unlisted", moderation_state: "pending" });
  assert.equal(refuseUnsellableOfferings(pending, ["o1"], "reservation").ok, false, "still must be approved");
  const draft = catalogOf({ ...OK, visibility: "unlisted", status: "draft" });
  assert.equal(refuseUnsellableOfferings(draft, ["o1"], "reservation").ok, false, "still must be published");
});

test("reserve.ts is the only caller on the reservation channel", () => {
  assert.match(web("src/lib/reservations/reserve.ts"), /channel: "reservation"/);
  for (const f of ["src/lib/storefront/cart-checkout.core.ts", "src/lib/storefront/class-timetable.core.ts", "src/lib/storefront/package-selector.core.ts", "src/app/(public)/_menu/menu-order-actions.ts", "src/app/(public)/_sessions/session-picker-actions.ts"]) {
    assert.doesNotMatch(web(f), /channel:\s*"reservation"/, `${f} must not borrow the reservation channel`);
  }
});

// ── Display surfaces: the UI never offers what checkout refuses ─────────────

test("a Book button is only directly bookable when checkout would take the charge", () => {
  const base = {
    bookingMode: "instant", priceType: "fixed", priceDisplay: "exact", amountCents: 5000,
    status: "published", moderationState: "approved", visibility: "public",
  } as const;
  assert.equal(offeringIsDirectlyBookable(base as never), true);
  assert.equal(offeringIsDirectlyBookable({ ...base, visibility: "on_request" } as never), false, "on_request has no instant charge");
  assert.equal(offeringIsDirectlyBookable({ ...base, visibility: "agency_only" } as never), false);
  assert.equal(offeringIsDirectlyBookable({ ...base, moderationState: "pending" } as never), false);
});

test("every surface that used to re-derive the rule now imports it", () => {
  const wired: Array<[string, RegExp]> = [
    ["src/lib/scheduling/public-open-times.ts", /sellability\(/],
    ["src/lib/scheduling/booking-surface.ts", /sellability\(/],
    ["src/app/t/[profileCode]/_shared/TalentStorefront.tsx", /isSellable\(/],
    ["src/app/t/[profileCode]/_maison/maison-derive.ts", /isSellable\(/],
    ["src/lib/booking/agent/catalog.ts", /isSellable\(/],
    ["src/lib/storefront/catalog-grid.core.ts", /scopeToSellableOfferings\(/],
    ["src/lib/storefront/package-selector.core.ts", /scopeToSellableOfferings\(|scopeToGuestSellableOfferings\(/],
    ["src/lib/talent/offerings-types.ts", /isSellable\(/],
    ["src/lib/site-admin/builder-node/services-catalog-selection.ts", /isSellable\(/],
  ];
  for (const [file, re] of wired) assert.match(web(file), re, `${file} must use the shared rule`);
});
