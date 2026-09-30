import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { policyFakeAdmin, type Store } from "../talent-policies/__fixtures__/policy-fake-admin";
import { loadBookingCancelPolicy } from "./booking-cancel-policy";
import { refundableCentsFromPolicy } from "./cancel-booking";

const TENANT = "00000000-0000-4000-8000-000000000001";
const ORDER = "00000000-0000-4000-8000-000000000002";
const OFFERING = "00000000-0000-4000-8000-000000000003";
const TALENT = "00000000-0000-4000-8000-000000000004";

function seed(over: { defaults?: Record<string, unknown>; offeringHours?: number | null; override?: number | null; depositPct?: number | null; published?: string } = {}): Store {
  const store: Store = {
    order_lines: [{ order_id: ORDER, offering_id: OFFERING, total_cents: 10000 }],
    booking_policy_overrides: over.override === undefined ? [] : [{ tenant_id: TENANT, offering_id: OFFERING, deposit_bps: null, cancel_free_hours: over.override, no_show_fee_cents: null }],
    talent_offerings: [
      { id: OFFERING, cancellation_hours: over.offeringHours ?? null, talent_profile_id: TALENT, reserve_mode: "full", deposit_pct: over.depositPct ?? null },
    ],
    talent_profiles: [{ id: TALENT, selling_defaults: over.defaults ?? {} }],
    talent_policy_versions: [],
  };
  if (over.published) {
    store.talent_policy_versions.push({
      talent_profile_id: TALENT,
      version: 1,
      content_hash: "h",
      answers: { late_cancel_refund: over.published, late_tolerance_min: 15 },
    });
  }
  return store;
}

// ---------------------------------------------------------------- one window source

test("window: the talent default drives the self-cancel window when no override exists", async () => {
  const { admin } = policyFakeAdmin(seed({ defaults: { cancelHours: 48 } }));
  const p = await loadBookingCancelPolicy(admin, { tenantId: TENANT, orderId: ORDER });
  assert.equal(p.cancelFreeHours, 48);
});

test("window: the offering's own value beats the talent default", async () => {
  const { admin } = policyFakeAdmin(seed({ defaults: { cancelHours: 48 }, offeringHours: 12 }));
  assert.equal((await loadBookingCancelPolicy(admin, { tenantId: TENANT, orderId: ORDER })).cancelFreeHours, 12);
});

test("window: a staff override is an explicit exception and wins over the resolver", async () => {
  const { admin } = policyFakeAdmin(seed({ defaults: { cancelHours: 48 }, override: 6 }));
  assert.equal((await loadBookingCancelPolicy(admin, { tenantId: TENANT, orderId: ORDER })).cancelFreeHours, 6);
});

test("window: nothing set anywhere is the platform 24 h for a talent offering", async () => {
  const { admin } = policyFakeAdmin(seed());
  assert.equal((await loadBookingCancelPolicy(admin, { tenantId: TENANT, orderId: ORDER })).cancelFreeHours, 24);
});

test("window: no order means no window and the old behaviour", async () => {
  const { admin } = policyFakeAdmin(seed());
  assert.deepEqual(await loadBookingCancelPolicy(admin, { tenantId: TENANT, orderId: null }), {
    cancelFreeHours: null,
    lateCancelRefund: "none",
    depositCents: null,
  });
});

test("the manage link and the cancel engine read the SAME loader", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const manage = readFileSync(join(root, "app", "(public)", "manage", "[token]", "page.tsx"), "utf8");
  const engine = readFileSync(join(root, "lib", "scheduling", "cancel-booking.ts"), "utf8");
  for (const src of [manage, engine]) {
    assert.ok(src.includes("loadBookingCancelPolicy"), "uses the shared loader");
    assert.ok(!src.includes("readPolicyOverride"), "does not read the overrides table on its own");
    assert.ok(src.includes("refundableCentsFromPolicy"), "amount from the shared function");
  }
});

// ---------------------------------------------------------------- deposit + late rule

test("late rule: the published answer is loaded, and the deposit is the order share", async () => {
  const { admin } = policyFakeAdmin(seed({ defaults: { depositPct: 30 }, published: "half" }));
  const p = await loadBookingCancelPolicy(admin, { tenantId: TENANT, orderId: ORDER });
  assert.equal(p.lateCancelRefund, "half");
  assert.equal(p.depositCents, 3000);
});

test("late rule: an unpublished talent keeps the deposit (none)", async () => {
  const { admin } = policyFakeAdmin(seed({ defaults: { depositPct: 30 } }));
  assert.equal((await loadBookingCancelPolicy(admin, { tenantId: TENANT, orderId: ORDER })).lateCancelRefund, "none");
});

// ---------------------------------------------------------------- the amount

const starts = "2026-10-05T10:00:00.000Z";
const inside = Date.parse("2026-10-05T09:00:00.000Z");
const outside = Date.parse("2026-10-03T10:00:00.000Z");

test("amount: outside the window everything paid is refundable, whatever the late rule", () => {
  for (const mode of ["none", "half", "full"] as const) {
    assert.equal(
      refundableCentsFromPolicy({ paidCents: 3000, cancelFreeHours: 24, startsAt: starts, nowMs: outside, lateCancelRefund: mode, depositCents: 3000 }),
      3000,
    );
  }
});

test("amount: inside the window none keeps the deposit, half returns half of it, full returns all", () => {
  const at = (mode: "none" | "half" | "full") =>
    refundableCentsFromPolicy({ paidCents: 3000, cancelFreeHours: 24, startsAt: starts, nowMs: inside, lateCancelRefund: mode, depositCents: 3000 });
  assert.equal(at("none"), 0);
  assert.equal(at("half"), 1500);
  assert.equal(at("full"), 3000);
});

test("amount: a missing late rule is none (the behaviour before policies existed)", () => {
  assert.equal(refundableCentsFromPolicy({ paidCents: 3000, cancelFreeHours: 24, startsAt: starts, nowMs: inside }), 0);
});

test("amount: half of a deposit with an odd cent rounds down and never exceeds what was paid", () => {
  const half = refundableCentsFromPolicy({ paidCents: 3001, cancelFreeHours: 24, startsAt: starts, nowMs: inside, lateCancelRefund: "half", depositCents: 3001 });
  assert.equal(half, 1500);
  assert.ok(half <= 3001);
});

test("amount: no window (flexible) refunds everything paid even inside what would have been the window", () => {
  assert.equal(refundableCentsFromPolicy({ paidCents: 3000, cancelFreeHours: null, startsAt: starts, nowMs: inside, lateCancelRefund: "none" }), 3000);
});
