/**
 * A talent's own Money page reads her earnings with HER OWN client (no service role). That works for a sale she is
 * the SELLER of but not the coordinator of once the talent self-read policies exist (migration
 * 20261231353000_talent_self_read_own_sales.sql); paid run 2026-10-09 showed Cobrado $0 without them.
 *
 * Two halves: the loader returns the row from what her client can see (non-coordinator seller), and the
 * migration pins the policy shape (SELECT only, DEFINER helpers closed to anon, snapshot limited to HER participant).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { fetchTalentSnapshotAggregateRows } from "./snapshot-aggregations";

const TALENT = "tp-1";
const BK = "bk-hub";
const INQ = "inq-1";
const PART = "part-1";

/** What her own client sees once the policies exist: her booking_talent row, the booking, HER snapshot row, her paid transaction. */
function herClient() {
  const tables: Record<string, unknown[]> = {
    booking_talent: [
      {
        id: "bt-1",
        booking_id: BK,
        tenant_id: "hub",
        agency_bookings: { id: BK, event_date: null, starts_at: null, created_at: "2026-10-09T07:17:04Z", title: "QA own-workspace sale", client_account_name: null, client_summary: null, payout_lifecycle: "pending", payment_status: "paid", status: "draft", client_revenue_lifecycle: "fully_paid", source_type_snapshot: null, payment_method: null, source_inquiry_id: INQ, total_client_revenue: 1000, currency_code: "MXN" },
        agencies: { id: "hub", slug: "hub", display_name: "Impronta Hub" },
      },
    ],
    booking_commission_snapshot: [{ booking_id: BK, participant_id: PART, gross_cents: 100_000, talent_net_cents: 100_000, workspace_fee_cents: 0, currency_code: "MXN", payment_method: "card" }],
    inquiry_participants: [{ id: PART, inquiry_id: INQ, talent_profile_id: TALENT }],
    booking_payouts: [],
    booking_transactions: [{ booking_id: BK, status: "paid", gross_amount_cents: 100_000, net_amount_cents: 100_000, paid_at: "2026-10-09T07:20:00Z", metadata: {} }],
  };
  return {
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "is", "neq", "gte", "lte", "order", "limit", "not", "or"]) q[m] = () => q;
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(resolve);
      return q;
    },
  } as never;
}

test("a non-coordinator seller's paid hub sale comes out of the loader with her own client, collected in full", async () => {
  const rows = await fetchTalentSnapshotAggregateRows(herClient(), { talentProfileId: TALENT, since: "2026-01-01T00:00:00Z", includeAllCurrencies: true });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].bookingId, BK);
  assert.equal(rows[0].netCents, 100_000);
  assert.equal(rows[0].paymentStatus, "paid");
  assert.equal(rows[0].currencyCode, "MXN");
});

const sql = readFileSync("../supabase/migrations/20261231353000_talent_self_read_own_sales.sql", "utf8");

test("the migration is additive and SELECT-only: three helpers, two new policies, snapshot narrowed", () => {
  assert.match(sql, /CREATE POLICY booking_talent_self_select ON public\.booking_talent\s+FOR SELECT TO authenticated/);
  assert.match(sql, /CREATE POLICY agency_bookings_seller_select ON public\.agency_bookings\s+FOR SELECT TO authenticated/);
  assert.match(sql, /USING \(public\.is_own_talent_profile\(talent_profile_id\)\)/);
  assert.match(sql, /USING \(public\.is_booking_seller\(id\)\)/);
  assert.doesNotMatch(sql, /FOR (INSERT|UPDATE|DELETE|ALL)/, "no write policy");
});

test("the snapshot talent clause is limited to HER participant rows (production's merged policy and the older talent policy)", () => {
  assert.match(sql, /ALTER POLICY booking_commission_snapshot_merged_select_authenticated[\s\S]{0,200}is_own_talent_participant\(participant_id\)/);
  assert.match(sql, /CREATE POLICY booking_commission_snapshot_talent_self_select[\s\S]{0,160}is_own_talent_participant\(participant_id\)/);
  assert.doesNotMatch(sql, /bt\.booking_id = booking_commission_snapshot\.booking_id/, "not 'any snapshot row of a booking I am on'");
});

test("the DEFINER helpers answer only 'is this mine', pin search_path and are closed to anon/public", () => {
  for (const fn of ["is_own_talent_profile", "is_booking_seller", "is_own_talent_participant"]) {
    assert.match(sql, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\([\\s\\S]{0,80}RETURNS boolean`));
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\(uuid\\) FROM PUBLIC, anon;`));
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\(uuid\\) TO authenticated;`));
  }
  assert.equal((sql.match(/SECURITY DEFINER SET search_path = public/g) ?? []).length, 3);
  assert.equal((sql.match(/auth\.uid\(\)/g) ?? []).length >= 3, true);
});

test("the Money loaders keep using the user's own client (no service-role elevation)", () => {
  for (const f of ["src/lib/talent/earnings.ts", "src/lib/talent/earnings-by-currency.ts"]) {
    const src = readFileSync(f, "utf8");
    assert.doesNotMatch(src, /createServiceRoleClient|own-earnings-client/, f);
  }
});
