import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { activateGuestBookerIfEligible } from "./guest-activate.server";

// TUL-690 guard: a guest who only PAID (no inquiry, no booking) is still a client with history.
type Counts = Partial<Record<"inquiries" | "agency_bookings" | "booking_transactions" | "orders", number>>;

function fake(opts: { counts: Counts; customerIds?: string[]; failTable?: string }) {
  const updates: Array<Record<string, unknown>> = [];
  const admin = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      for (const m of ["select", "eq", "in"]) chain[m] = self;
      if (table === "profiles") {
        chain.maybeSingle = async () => ({ data: { app_role: "client", account_status: "onboarding" }, error: null });
        chain.update = (patch: Record<string, unknown>) => { updates.push(patch); return chain; };
        chain.then = (r: (v: unknown) => void) => r({ error: null });
      } else if (table === "client_profiles") {
        chain.upsert = async () => ({ error: null });
      } else if (table === "customers") {
        chain.then = (r: (v: unknown) => void) => r({ data: (opts.customerIds ?? []).map((id) => ({ id })), error: null });
      } else {
        chain.then = (r: (v: unknown) => void) =>
          r(opts.failTable === table ? { count: null, error: { message: "boom" } } : { count: opts.counts[table as keyof Counts] ?? 0, error: null });
      }
      return chain;
    },
  } as unknown as SupabaseClient;
  return { admin, updates };
}

const run = (admin: SupabaseClient) => activateGuestBookerIfEligible(admin, { userId: "u1", emailProven: true });

test("TUL-690: a guest whose only record is a payment is activated", async () => {
  const { admin, updates } = fake({ counts: { booking_transactions: 1 } });
  assert.equal(await run(admin), true);
  assert.equal(updates[0]?.account_status, "active");
});

test("TUL-690: a guest whose only record is an order through an owned customer is activated", async () => {
  const { admin } = fake({ counts: { orders: 2 }, customerIds: ["c1"] });
  assert.equal(await run(admin), true);
});

test("TUL-690: no inquiry, booking, payment or order leaves the account in onboarding", async () => {
  const { admin, updates } = fake({ counts: {}, customerIds: ["c1"] });
  assert.equal(await run(admin), false);
  assert.equal(updates.length, 0);
});

test("TUL-690: an unreadable history fails closed (no activation)", async () => {
  const { admin, updates } = fake({ counts: { booking_transactions: 1 }, failTable: "inquiries" });
  assert.equal(await run(admin), false);
  assert.equal(updates.length, 0);
});
