import assert from "node:assert/strict";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { EmitNotificationInput } from "@/lib/notifications/emit";

import { firstNameOf, makeGoodMessage, makeGoodOnTalentCancel, type MakeGoodDeps } from "./talent-cancel";

type Red = { id: string; customer_id: string | null; order_id: string | null; booking_id: string | null; status: string };
type Cust = { id: string; tenant_id: string; display_name: string | null; user_id: string | null };

/** Two tables, eq / in filters; `failRead` makes the redemption read error. */
function world(reds: Red[], custs: Cust[], opts: { failRead?: boolean } = {}) {
  const from = (table: string) => {
    const filters: Array<(r: Record<string, unknown>) => boolean> = [];
    const src = (): Record<string, unknown>[] => (table === "tenant_promo_redemptions" ? reds : table === "customers" ? custs : []);
    const pick = () => src().filter((r) => filters.every((f) => f(r)));
    const err = table === "tenant_promo_redemptions" && opts.failRead ? { message: "boom" } : null;
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => {
        filters.push((r) => r[k] === v);
        return q;
      },
      in: (k: string, vs: readonly unknown[]) => {
        filters.push((r) => vs.includes(r[k]));
        return q;
      },
      maybeSingle: async () => ({ data: pick()[0] ?? null, error: null }),
      then: (resolve: (v: { data: Record<string, unknown>[] | null; error: { message: string } | null }) => unknown) =>
        resolve(err ? { data: null, error: err } : { data: pick(), error: null }),
    };
    return q;
  };
  return { from } as unknown as SupabaseClient;
}

function deps(reds: Red[]) {
  const sent: Array<{ userIds: string[]; input: Omit<EmitNotificationInput, "userId"> }> = [];
  const calls: Array<{ id: string; name: string | null | undefined; kind: string }> = [];
  const d: MakeGoodDeps = {
    now: () => new Date("2026-10-14T12:00:00Z"),
    notify: async (userIds, input) => {
      sent.push({ userIds, input });
    },
    handleCancellation: async (_db, input) => {
      calls.push({ id: input.redemptionId, name: input.clientFirstName, kind: input.event.kind });
      const row = reds.find((r) => r.id === input.redemptionId);
      if (!row) return { ok: false, reason: "unknown_redemption", refund: "full" };
      if (row.status === "released") return { ok: true, already: true, refund: "full" };
      row.status = "released";
      return { ok: true, already: false, refund: "full", reissueCode: `${(input.clientFirstName ?? "TU").toUpperCase()}-7K2Q` };
    },
  };
  return { d, sent, calls };
}

const T = "t1";
const custs: Cust[] = [{ id: "c1", tenant_id: T, display_name: "Ana  Lopez", user_id: "u1" }];

test("talent cancel: the promo is released, a 14-day code is minted and sent to the client", async () => {
  const reds: Red[] = [{ id: "r1", customer_id: "c1", order_id: "o1", booking_id: null, status: "confirmed" }];
  const { d, sent, calls } = deps(reds);
  const out = await makeGoodOnTalentCancel(world(reds, custs), { tenantId: T, bookingId: "b1", orderId: "o1" }, d);
  assert.deepEqual(out, { ok: true, released: 1, codes: ["ANA-7K2Q"] });
  assert.deepEqual(calls, [{ id: "r1", name: "Ana", kind: "talent_cancel" }]);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0]?.userIds, ["u1"]);
  assert.equal(sent[0]?.input.surface, "client");
  assert.match(sent[0]?.input.body ?? "", /ANA-7K2Q/);
  assert.match(sent[0]?.input.body ?? "", /14 días/);
});

test("talent cancel: a held promo anchored on the booking (no order) is made good too", async () => {
  const reds: Red[] = [{ id: "r2", customer_id: "c1", order_id: null, booking_id: "b1", status: "held" }];
  const { d } = deps(reds);
  const out = await makeGoodOnTalentCancel(world(reds, custs), { tenantId: T, bookingId: "b1", orderId: null }, d);
  assert.deepEqual(out.codes, ["ANA-7K2Q"]);
});

test("talent cancel retried: released rows are not picked up again, so no second code or message", async () => {
  const reds: Red[] = [{ id: "r1", customer_id: "c1", order_id: "o1", booking_id: "b1", status: "confirmed" }];
  const { d, sent, calls } = deps(reds);
  const db = world(reds, custs);
  await makeGoodOnTalentCancel(db, { tenantId: T, bookingId: "b1", orderId: "o1" }, d);
  const again = await makeGoodOnTalentCancel(db, { tenantId: T, bookingId: "b1", orderId: "o1" }, d);
  assert.deepEqual(again, { ok: true, released: 0, codes: [] });
  // Found by order AND booking, still handled once.
  assert.equal(calls.length, 1);
  assert.equal(sent.length, 1);
});

test("talent cancel: a guest client with no account gets the code minted but no in-app message", async () => {
  const reds: Red[] = [{ id: "r1", customer_id: "c2", order_id: "o1", booking_id: null, status: "confirmed" }];
  const { d, sent } = deps(reds);
  const guests: Cust[] = [{ id: "c2", tenant_id: T, display_name: null, user_id: null }];
  const out = await makeGoodOnTalentCancel(world(reds, guests), { tenantId: T, bookingId: "b1", orderId: "o1" }, d);
  assert.deepEqual(out.codes, ["TU-7K2Q"]);
  assert.equal(sent.length, 0);
});

test("talent cancel: a failed redemption read is not 'no promos'", async () => {
  const { d, calls } = deps([]);
  const out = await makeGoodOnTalentCancel(world([], custs, { failRead: true }), { tenantId: T, bookingId: "b1", orderId: "o1" }, d);
  assert.equal(out.ok, false);
  assert.equal(calls.length, 0);
});

test("firstNameOf + makeGoodMessage: first word only; client copy has no em dash", () => {
  assert.equal(firstNameOf("  María José "), "María");
  assert.equal(firstNameOf(null), null);
  const m = makeGoodMessage("ANA-7K2Q");
  assert.ok(!/—/.test(m.title + m.body));
});
