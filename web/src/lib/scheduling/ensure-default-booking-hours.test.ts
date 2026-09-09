import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_WEEKLY_HOURS, ensureDefaultBookingHours } from "./ensure-default-booking-hours";

test("default weekly hours open weekdays only", () => {
  assert.equal(DEFAULT_WEEKLY_HOURS["0"].length, 0);
  assert.equal(DEFAULT_WEEKLY_HOURS["6"].length, 0);
  assert.equal(DEFAULT_WEEKLY_HOURS["1"][0]?.startMin, 540);
  assert.equal(DEFAULT_WEEKLY_HOURS["5"][0]?.endMin, 1020);
});

test("does not overwrite an existing hours row", async () => {
  const rows: Array<Record<string, unknown>> = [
    { talent_profile_id: "tal1", timezone: "America/Mexico_City" },
  ];
  let inserts = 0;
  const admin = {
    from(table: string) {
      assert.equal(table, "talent_booking_hours");
      const api = {
        select() {
          return api;
        },
        eq() {
          return api;
        },
        async maybeSingle() {
          return { data: rows[0] ?? null, error: null };
        },
        async insert() {
          inserts += 1;
          return { error: null };
        },
      };
      return api;
    },
  };
  const r = await ensureDefaultBookingHours(admin as never, {
    talentProfileId: "tal1",
    tenantId: "t1",
  });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.created, false);
  assert.equal(inserts, 0);
});

test("inserts defaults when no row exists", async () => {
  const rows: Array<Record<string, unknown>> = [];
  const admin = {
    from(table: string) {
      assert.equal(table, "talent_booking_hours");
      const api = {
        select() {
          return api;
        },
        eq() {
          return api;
        },
        async maybeSingle() {
          return { data: null, error: null };
        },
        async insert(row: Record<string, unknown>) {
          rows.push(row);
          return { error: null };
        },
      };
      return api;
    },
  };
  const r = await ensureDefaultBookingHours(admin as never, {
    talentProfileId: "tal2",
    tenantId: "t1",
    timezone: "America/Cancun",
  });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.created, true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.talent_profile_id, "tal2");
  assert.equal(rows[0]?.timezone, "America/Cancun");
  assert.deepEqual(rows[0]?.weekly, DEFAULT_WEEKLY_HOURS);
});
