/**
 * TUL-1308: the cart tip is collected, and menu/cart/package/class collect the
 * owner's deposit instead of always charging in full.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCheckoutCollectCents } from "@/lib/orders/purchase-collect";
import { ownerDepositChoice, type OfferingPolicy } from "@/lib/orders/purchase-policy";

const admin = {} as unknown as SupabaseClient;
const base = {
  tenantId: "t1", orderCurrency: "USD", lines: [], subtotalCents: 10000, sourceChannel: "pos", payInPerson: false,
};

test("full: the tip is part of what is collected (10000 + 1500 tip = 11500, was 10000)", async () => {
  const r = await resolveCheckoutCollectCents(admin, { ...base, totalCents: 11500, tipCents: 1500, collect: "full", depositPct: null });
  assert.equal(r.collectCents, 11500);
  assert.equal(r.baseCollectCents, 11500);
});

test("deposit: the % applies to the order without the tip, and the tip rides on top (30% of 10000 + 1500 = 4500)", async () => {
  const r = await resolveCheckoutCollectCents(admin, { ...base, totalCents: 11500, tipCents: 1500, collect: "deposit", depositPct: 30 });
  assert.equal(r.collectCents, 4500);
});

test("no tip: unchanged (full 10000, deposit 3000)", async () => {
  assert.equal((await resolveCheckoutCollectCents(admin, { ...base, totalCents: 10000, collect: "full", depositPct: null })).collectCents, 10000);
  assert.equal((await resolveCheckoutCollectCents(admin, { ...base, totalCents: 10000, collect: "deposit", depositPct: 30 })).collectCents, 3000);
});

test("nothing collected now: the tip is not collected either", async () => {
  const r = await resolveCheckoutCollectCents(admin, { ...base, totalCents: 11500, tipCents: 1500, collect: "none", depositPct: null, payInPerson: true });
  assert.equal(r.collectCents, 0);
});

const policy = (id: string, over: Partial<OfferingPolicy> = {}): OfferingPolicy => ({
  offeringId: id, status: "published", tenantId: "t1", reserveMode: "deposit", depositPct: 30,
  allowPayInPerson: false, requireAccountToBook: false, cancellationHours: null, ...over,
});

test("followOwnerDeposit turns full into deposit only when EVERY line is a deposit offering", () => {
  const lines = [{ offeringId: "a" }, { offeringId: "b" }];
  const both = new Map([["a", policy("a")], ["b", policy("b")]]);
  assert.equal(ownerDepositChoice("full", true, lines, both), "deposit");
  const mixed = new Map([["a", policy("a")], ["b", policy("b", { reserveMode: "full", depositPct: null })]]);
  assert.equal(ownerDepositChoice("full", true, lines, mixed), "full");
  assert.equal(ownerDepositChoice("full", false, lines, both), "full", "off unless the surface asks");
  assert.equal(ownerDepositChoice("in_person", true, lines, both), "in_person");
  const noPct = new Map([["a", policy("a", { depositPct: null })], ["b", policy("b")]]);
  assert.equal(ownerDepositChoice("full", true, lines, noPct), "full");
});
