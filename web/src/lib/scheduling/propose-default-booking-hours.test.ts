import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WEEKLY_HOURS,
  proposeDefaultBookingHours,
} from "./propose-default-booking-hours";

type Row = Record<string, unknown>;

/** Minimal fake `admin.from(table)` covering the two tables this module touches. */
function fakeAdmin(opts: {
  hoursRow?: Row | null;
  proposalRow?: Row | null;
  onProposalInsert?: (row: Row) => void;
}) {
  const hoursRow = opts.hoursRow ?? null;
  const proposalRow = opts.proposalRow ?? null;
  const calls: Array<{ table: string; op: string }> = [];
  return {
    calls,
    admin: {
      from(table: string) {
        const api = {
          select() {
            return api;
          },
          eq() {
            return api;
          },
          async maybeSingle() {
            calls.push({ table, op: "read" });
            if (table === "talent_booking_hours") return { data: hoursRow, error: null };
            if (table === "talent_booking_hours_proposals") return { data: proposalRow, error: null };
            throw new Error(`unexpected table ${table}`);
          },
          async insert(row: Row) {
            calls.push({ table, op: "insert" });
            if (table === "talent_booking_hours") {
              throw new Error("must never insert into talent_booking_hours");
            }
            if (table === "talent_booking_hours_proposals") {
              opts.onProposalInsert?.(row);
              return { error: null };
            }
            throw new Error(`unexpected insert table ${table}`);
          },
        };
        return api;
      },
    },
  };
}

/** Force resolveTenantTimezone's internal client factory to short-circuit unconfigured. */
function withNoSupabaseEnv<T>(fn: () => Promise<T>): Promise<T> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return fn().finally(() => {
    if (url !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    if (key !== undefined) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = key;
  });
}

test("default weekly hours open weekdays only", () => {
  assert.equal(DEFAULT_WEEKLY_HOURS["0"].length, 0);
  assert.equal(DEFAULT_WEEKLY_HOURS["6"].length, 0);
  assert.equal(DEFAULT_WEEKLY_HOURS["1"][0]?.startMin, 540);
  assert.equal(DEFAULT_WEEKLY_HOURS["5"][0]?.endMin, 1020);
});

test("existing hours mean no proposal is written", async () => {
  const { admin, calls } = fakeAdmin({
    hoursRow: { talent_profile_id: "tal1" },
  });
  const r = await proposeDefaultBookingHours(admin as never, {
    talentProfileId: "tal1",
    tenantId: "t1",
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.created, false);
    assert.equal(r.status, "active");
  }
  assert.ok(!calls.some((c) => c.op === "insert"), "must not insert anything when hours already exist");
});

test("an existing proposal, in any status, is not duplicated", async () => {
  const { admin, calls } = fakeAdmin({
    proposalRow: { talent_profile_id: "tal1", status: "dismissed" },
  });
  const r = await proposeDefaultBookingHours(admin as never, {
    talentProfileId: "tal1",
    tenantId: "t1",
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.created, false);
    assert.equal(r.status, "absent", "a dismissed proposal reports absent, not proposed");
  }
  assert.ok(!calls.some((c) => c.op === "insert"), "must not insert a second proposal over a decided one");
});

test("publishing writes a proposal, never talent_booking_hours", async () => {
  let inserted: Row | null = null;
  const { admin } = fakeAdmin({
    onProposalInsert: (row) => {
      inserted = row;
    },
  });
  const r = await proposeDefaultBookingHours(admin as never, {
    talentProfileId: "tal2",
    tenantId: "t1",
    actorId: "user-9",
    timezone: "America/Cancun",
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.created, true);
    assert.equal(r.status, "proposed");
  }
  assert.ok(inserted, "expected a proposal row to be inserted");
  const row = inserted as Row;
  assert.equal(row.talent_profile_id, "tal2");
  assert.equal(row.tenant_id, "t1");
  assert.equal(row.timezone, "America/Cancun");
  assert.equal(row.source, "publish_default");
  assert.equal(row.status, "proposed");
  assert.equal(row.proposed_by_user_id, "user-9");
  assert.deepEqual(row.weekly, DEFAULT_WEEKLY_HOURS);
});

test("an unresolved tenant timezone stays null, never UTC", async () => {
  let inserted: Row | null = null;
  const { admin } = fakeAdmin({
    onProposalInsert: (row) => {
      inserted = row;
    },
  });
  await withNoSupabaseEnv(() =>
    proposeDefaultBookingHours(admin as never, {
      talentProfileId: "tal3",
      tenantId: "t1",
      // No `timezone` override: forces the tenant-resolution path, which
      // falls through to the platform default with no real Supabase client
      // configured. That fallback must surface as null, never "UTC".
    }),
  );
  assert.ok(inserted, "expected a proposal row to be inserted");
  const row = inserted as Row;
  assert.equal(row.timezone, null);
  assert.notEqual(row.timezone, "UTC");
});

test("a second publish does not duplicate a still-proposed row", async () => {
  const { admin, calls } = fakeAdmin({
    proposalRow: { talent_profile_id: "tal4", status: "proposed" },
  });
  const r = await proposeDefaultBookingHours(admin as never, {
    talentProfileId: "tal4",
    tenantId: "t1",
    timezone: "America/Mexico_City",
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.created, false);
    assert.equal(r.status, "proposed");
  }
  assert.ok(!calls.some((c) => c.op === "insert"), "must not insert a second time while one is still proposed");
});
