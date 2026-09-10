/**
 * T1-07 accept path. Before this test existed, the only exercise of
 * `accept_booking_hours_proposal`'s refusals was the proof block inside the
 * migration itself — it runs once, at apply time, inside a transaction, and
 * can never catch a regression here or in the reason-to-message mapping,
 * which is pure TypeScript with no SQL underneath it at all.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acceptBookingHoursProposalCore,
  messageForAcceptRefusal,
} from "./accept-booking-hours-proposal";

const GENERIC_ERROR = "Update failed. Try again.";

type Row = Record<string, unknown>;

const VALID_HOURS_ROW: Row = {
  timezone: "America/Mexico_City",
  weekly: { 1: [{ startMin: 540, endMin: 1020 }] },
  exceptions: [],
  slot_minutes: 30,
  buffer_before_min: 0,
  buffer_after_min: 0,
  min_notice_min: 120,
  horizon_days: 60,
};

/** Minimal fake admin: one scripted `rpc` reply, one scripted hours-row read. */
function fakeAdmin(opts: {
  rpcResult?: { ok?: boolean; reason?: string; timezone?: string } | null;
  rpcError?: { message: string } | null;
  hoursRow?: Row | null;
  hoursError?: { message: string } | null;
}) {
  const rpcCalls: Array<{ name: string; args: unknown }> = [];
  return {
    rpcCalls,
    admin: {
      async rpc(name: string, args: unknown) {
        rpcCalls.push({ name, args });
        return { data: opts.rpcResult ?? null, error: opts.rpcError ?? null };
      },
      from(table: string) {
        if (table !== "talent_booking_hours") throw new Error(`unexpected table ${table}`);
        const api = {
          select() {
            return api;
          },
          eq() {
            return api;
          },
          async maybeSingle() {
            return { data: opts.hoursRow ?? null, error: opts.hoursError ?? null };
          },
        };
        return api;
      },
    },
  };
}

test("refuses when hours already exist, without touching them", async () => {
  const { admin, rpcCalls } = fakeAdmin({ rpcResult: { ok: false, reason: "hours_exist" } });
  const r = await acceptBookingHoursProposalCore(
    admin as never,
    { talentProfileId: "tal1", actorId: "user-1", timezone: "America/Cancun" },
    GENERIC_ERROR,
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error, "This person already has booking hours.");
  assert.equal(rpcCalls.length, 1);
  assert.equal(
    (rpcCalls[0].args as Record<string, unknown>).p_talent_profile_id,
    "tal1",
  );
});

test("refuses without a timezone", async () => {
  const { admin } = fakeAdmin({ rpcResult: { ok: false, reason: "timezone_required" } });
  const r = await acceptBookingHoursProposalCore(
    admin as never,
    { talentProfileId: "tal2", actorId: "user-1", timezone: "" },
    GENERIC_ERROR,
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error, "Pick a time zone.");
});

test("succeeds with an operator-chosen timezone and returns the written hours", async () => {
  const { admin, rpcCalls } = fakeAdmin({
    rpcResult: { ok: true, timezone: "America/Mexico_City" },
    hoursRow: VALID_HOURS_ROW,
  });
  const r = await acceptBookingHoursProposalCore(
    admin as never,
    { talentProfileId: "tal3", actorId: "user-1", timezone: "America/Mexico_City" },
    GENERIC_ERROR,
  );
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.hours.timezone, "America/Mexico_City");
    assert.equal(r.hours.slotMinutes, 30);
  }
  const overrides = (rpcCalls[0].args as { p_overrides: { timezone: string } }).p_overrides;
  assert.equal(overrides.timezone, "America/Mexico_City");
});

test("an RPC-level error (not a refusal) surfaces the generic message, not raw SQL", async () => {
  const { admin } = fakeAdmin({ rpcError: { message: "connection reset" } });
  const r = await acceptBookingHoursProposalCore(
    admin as never,
    { talentProfileId: "tal4", actorId: "user-1", timezone: "America/Cancun" },
    GENERIC_ERROR,
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error, GENERIC_ERROR);
});

test("a success reply whose hours row failed to reload is reported as an error, not a false ok", async () => {
  const { admin } = fakeAdmin({
    rpcResult: { ok: true, timezone: "America/Cancun" },
    hoursRow: null,
  });
  const r = await acceptBookingHoursProposalCore(
    admin as never,
    { talentProfileId: "tal5", actorId: "user-1", timezone: "America/Cancun" },
    GENERIC_ERROR,
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error, GENERIC_ERROR);
});

test("every refusal reason the RPC can return maps to the message an operator actually sees", () => {
  const cases: Array<[string | undefined, string]> = [
    ["hours_exist", "This person already has booking hours."],
    ["timezone_required", "Pick a time zone."],
    ["bad_input", "Pick a time zone."],
    ["not_found", "That proposal is no longer there."],
    ["unavailable", GENERIC_ERROR],
    [undefined, GENERIC_ERROR],
    ["some_future_reason_this_module_has_never_heard_of", GENERIC_ERROR],
  ];
  for (const [reason, expected] of cases) {
    assert.equal(
      messageForAcceptRefusal(reason, GENERIC_ERROR),
      expected,
      `reason ${String(reason)} should map to "${expected}"`,
    );
  }
});
