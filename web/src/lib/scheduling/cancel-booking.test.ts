import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  cancelBookingSet,
  normalizeCancelBy,
  refundableCentsFromPolicy,
} from "./cancel-booking";

test("inside the free-cancel window the paid amount is refundable", () => {
  assert.equal(
    refundableCentsFromPolicy({
      paidCents: 5000,
      cancelFreeHours: 24,
      startsAt: "2026-10-05T10:00:00.000Z",
      nowMs: Date.parse("2026-10-03T10:00:00.000Z"),
    }),
    5000,
  );
});

test("after the window the policy keeps the money", () => {
  assert.equal(
    refundableCentsFromPolicy({
      paidCents: 5000,
      cancelFreeHours: 24,
      startsAt: "2026-10-05T10:00:00.000Z",
      nowMs: Date.parse("2026-10-05T09:00:00.000Z"),
    }),
    0,
  );
});

test("normalizeCancelBy maps customer→client and rejects unknown roles", () => {
  assert.equal(normalizeCancelBy("customer"), "client");
  assert.equal(normalizeCancelBy("client"), "client");
  assert.equal(normalizeCancelBy("talent"), "talent");
  assert.equal(normalizeCancelBy("staff"), "staff");
  assert.equal(normalizeCancelBy("system"), "system");
  assert.equal(normalizeCancelBy("guest"), null);
  assert.equal(normalizeCancelBy(""), null);
});

test("a short operation key is invalid and a missing booking is not_found", async () => {
  const short = await cancelBookingSet(
    { from: () => ({}), rpc: async () => ({ data: { ok: true }, error: null }) },
    { tenantId: "t1", bookingId: "b1", operationKey: "short", reason: "x", by: "staff" },
  );
  assert.equal(short.ok, false);
  if (!short.ok) assert.equal(short.reason, "invalid");

  const admin = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
    rpc: async () => ({ data: { ok: true }, error: null }),
  };
  const missing = await cancelBookingSet(admin, {
    tenantId: "t1",
    bookingId: "b1",
    operationKey: "cancel-booking-1",
    reason: "changed",
    by: "staff",
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.reason, "not_found");
});

/** Enough of a PostgREST chain for cancel + conversation sync + policy load. */
function cancelAdmin(opts: {
  onCancelRpc: (args: Record<string, unknown>) => { data: unknown; error: null };
}) {
  const cancelCalls: Array<Record<string, unknown>> = [];
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    is: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({
      data: { id: "b1", tenant_id: "t1", starts_at: null, order_id: null },
      error: null,
    }),
    then: undefined as undefined,
  };
  // Thenable so `await admin.from(...).select...` resolves to empty rows when
  // callers don't end on maybeSingle (sync / policy loaders).
  const list = {
    ...chain,
    then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      resolve({ data: [], error: null }),
  };
  return {
    cancelCalls,
    admin: {
      from: () => list,
      rpc: async (fn: string, args: Record<string, unknown>) => {
        if (fn === "cancel_booking_set") {
          cancelCalls.push(args);
          return opts.onCancelRpc(args);
        }
        return { data: null, error: null };
      },
    },
  };
}

test("cancelBookingSet threads actor role + user id into cancel_booking_set", async () => {
  const { admin, cancelCalls } = cancelAdmin({
    onCancelRpc: () => ({
      data: { ok: true, booking_id: "b1", by: "client", actor_id: "u-client" },
      error: null,
    }),
  });

  const result = await cancelBookingSet(admin, {
    tenantId: "t1",
    bookingId: "b1",
    operationKey: "cancel-booking-1",
    reason: "changed plans",
    by: "customer",
    actorUserId: "u-client",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.by, "client");
  assert.equal(result.actorUserId, "u-client");
  assert.equal(cancelCalls.length, 1);
  assert.equal(cancelCalls[0]?.p_by, "client");
  assert.equal(cancelCalls[0]?.p_actor_id, "u-client");
});

test("talent cancel passes talent role and actor id", async () => {
  const { admin, cancelCalls } = cancelAdmin({
    onCancelRpc: () => ({
      data: { ok: true, booking_id: "b1", by: "talent", actor_id: "u-talent" },
      error: null,
    }),
  });

  const result = await cancelBookingSet(admin, {
    tenantId: "t1",
    bookingId: "b1",
    operationKey: "agenda-cancel-1",
    reason: "Cancelled from talent agenda",
    by: "talent",
    actorUserId: "u-talent",
  });
  assert.equal(result.ok, true);
  assert.equal(cancelCalls[0]?.p_by, "talent");
  assert.equal(cancelCalls[0]?.p_actor_id, "u-talent");
});

test("cancel_booking_set releases allocations through order_lines", () => {
  const sql = readFileSync(
    join(process.cwd(), "..", "supabase", "migrations", "20261231218000_cancel_booking_set.sql"),
    "utf8",
  );
  assert.match(sql, /CREATE OR REPLACE FUNCTION public.cancel_booking_set/);
  assert.match(sql, /order_line_id/);
  assert.match(sql, /release_capacity/);
});

test("TUL-151 migration records cancelled_by + cancelled_by_user_id and p_actor_id", () => {
  const sql = readFileSync(
    join(process.cwd(), "..", "supabase", "migrations", "20261231349151_cancel_booking_set_actor.sql"),
    "utf8",
  );
  assert.match(sql, /cancelled_by text/);
  assert.match(sql, /cancelled_by_user_id uuid/);
  assert.match(sql, /p_actor_id uuid/);
  assert.match(sql, /'talent', 'client', 'staff', 'system'/);
  assert.match(sql, /WHEN p_by = 'customer' THEN 'client'/);
  assert.match(sql, /SET status = 'cancelled'/);
  assert.match(sql, /cancelled_by = v_by/);
  assert.match(sql, /cancelled_by_user_id = p_actor_id/);
});

test("call sites pass actorUserId (talent agenda, staff desk, manage token, messages)", () => {
  const root = join(process.cwd(), "src");
  const agenda = readFileSync(join(root, "lib/talent-agenda/cancel-actions.ts"), "utf8");
  assert.match(agenda, /by:\s*input\.cancelledBy/);
  assert.match(agenda, /actorUserId:\s*own\.userId/);
  assert.doesNotMatch(agenda, /by:\s*input\.cancelledBy\s*===\s*"client"\s*\?\s*"customer"/);

  const engine = readFileSync(join(root, "lib/server-actions/scheduling-engine.ts"), "utf8");
  assert.match(engine, /actorUserId:\s*g\.userId/);
  assert.match(engine, /by:\s*"client"/);
  assert.match(engine, /actorUserId:\s*null/);

  const sheets = readFileSync(join(root, "lib/server-actions/messaging-sheets.ts"), "utf8");
  assert.match(sheets, /by:\s*"staff"/);
  assert.match(sheets, /actorUserId:\s*g\.userId/);
});
