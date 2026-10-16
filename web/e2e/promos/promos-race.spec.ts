/**
 * Promos v1, the contended seat: `promo_hold` under real concurrency.
 *
 * "First 3 bookings" is decided by counting and inserting under the promo row
 * lock (supabase/migrations/20261231382000_promo_redemption_service.sql). This
 * automates the manual check in src/lib/promos/redemption/concurrency.sql-test.md.
 *
 * It lives here, not as a SQL file, because the repo has no SQL/pgTAP test
 * lane: the local-Supabase job runs Playwright only, and the RPCs are
 * service-role-only, which is exactly the client this spec uses. 10 parallel
 * PostgREST calls are 10 separate transactions contending on the row lock.
 *
 * Fixture tenant: the hub tenant of t_ready. No browser, no UI. All rows are
 * created under the E2E prefix / throwaway customer emails and deleted after.
 */
import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { talentProfileIdFor } from "../talent-website/helpers";
import {
  adminDb,
  PROMO_PREFIX,
  cleanupPromos,
  promoTenantId,
  redemptionsFor,
  rpcVerdict,
  seedPromo,
  type RpcVerdict,
} from "./_db";

const SEATS = 3;
const CONTENDERS = 10;
const run = Date.now();
const SPEC_PREFIX = `${PROMO_PREFIX} race`;

let tenantId = "";
let promoId = "";
let customerIds: string[] = [];

function hold(customerId: string): Promise<RpcVerdict> {
  return rpcVerdict(adminDb(), "promo_hold", {
    p_code_id: promoId,
    p_customer_id: customerId,
    p_order_id: null,
    // Booking-anchored, a fresh id per caller: the anchor CHECK passes and no
    // two holds share a per-booking unique slot.
    p_booking_id: randomUUID(),
    p_line_id: null,
    p_hold_minutes: 10,
    p_amount_cents: 0,
    p_is_price_promo: true,
    p_source: "code",
    p_client_status: "new",
  });
}

test.beforeAll(async () => {
  const db = adminDb();
  tenantId = await promoTenantId(db, talentProfileIdFor("t_ready"));
  await cleanupPromos(db, tenantId, SPEC_PREFIX);
  promoId = await seedPromo(db, tenantId, {
    name: "race seats",
    unlock: "code",
    code: `RACE${String(run).slice(-6)}`,
    percent: 10,
    maxRedemptions: SEATS,
    perCustomerLimit: 1,
  });
  const { data, error } = await db
    .from("customers")
    .insert(
      Array.from({ length: CONTENDERS }, (_, i) => ({
        tenant_id: tenantId,
        email: `promo-race-${run}-${i}@example.test`,
      })),
    )
    .select("id");
  if (error) throw new Error(`seed customers: ${error.message}`);
  customerIds = ((data ?? []) as { id: string }[]).map((c) => c.id);
  expect(customerIds).toHaveLength(CONTENDERS);
});

test.afterAll(async () => {
  if (!tenantId) return;
  const db = adminDb();
  await cleanupPromos(db, tenantId, SPEC_PREFIX);
  if (customerIds.length > 0) await db.from("customers").delete().in("id", customerIds);
});

test("10 concurrent holds on a 3-seat promo: exactly 3 ok, 7 exhausted", async () => {
  const results = await Promise.all(customerIds.map((id) => hold(id)));

  const ok = results.filter((r) => r.ok);
  const refused = results.filter((r) => !r.ok);
  expect(ok, JSON.stringify(results)).toHaveLength(SEATS);
  expect(refused).toHaveLength(CONTENDERS - SEATS);
  for (const r of refused) expect(r.reason).toBe("exhausted");

  const rows = await redemptionsFor(adminDb(), promoId);
  expect(rows.filter((r) => r.status === "held")).toHaveLength(SEATS);
  expect(rows, "a refused hold leaves no row behind").toHaveLength(SEATS);
});

test("an expired hold frees its seat at once, and the sweeper releases it", async () => {
  const db = adminDb();
  const held = (await redemptionsFor(db, promoId)).filter((r) => r.status === "held");
  expect(held).toHaveLength(SEATS);
  const target = held[0];
  if (!target) throw new Error("no held row to expire");

  // The promo is full: a fresh customer is refused.
  const newcomer = customerIds[CONTENDERS - 1];
  if (!newcomer) throw new Error("no contender left");
  expect((await hold(newcomer)).reason).toBe("exhausted");

  // Let one hold lapse. Counts ignore expired holds, so the seat is free before any sweep runs.
  const { error } = await db
    .from("tenant_promo_redemptions")
    .update({ hold_expires_at: new Date(Date.now() - 60_000).toISOString() })
    .eq("id", target.id);
  if (error) throw new Error(error.message);

  const retry = await hold(newcomer);
  expect(retry.ok, `a lapsed hold must free its seat: ${JSON.stringify(retry)}`).toBe(true);

  // The sweeper only tidies the table: the lapsed row goes held -> released.
  const swept = await rpcVerdict(db, "promo_sweep_expired_holds", { p_limit: 500 });
  expect(swept.ok).toBe(true);
  expect(swept.released ?? 0).toBeGreaterThanOrEqual(1);

  const after = await redemptionsFor(db, promoId);
  expect(after.find((r) => r.id === target.id)?.status).toBe("released");
  expect(after.filter((r) => r.status === "held"), "3 live seats again: 2 old + the newcomer").toHaveLength(SEATS);

  // And the promo is full again for the next client.
  const another = customerIds[CONTENDERS - 2];
  if (!another) throw new Error("no contender left");
  expect((await hold(another)).reason).toBe("exhausted");
});
