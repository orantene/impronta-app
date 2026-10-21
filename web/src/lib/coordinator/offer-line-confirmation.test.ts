import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { lineConfirmationState, offerConfirmation, LINE_STATE_LABELS, type ConfirmableLine } from "./offer-line-confirmation";
import { answerOwnOfferLine, readOfferLineAnswers } from "./offer-line-confirmation.server";

const lines: ConfirmableLine[] = [
  { id: "l1", kind: "talent", talentProfileId: "p1" },
  { id: "l2", kind: "talent", talentProfileId: "p2" },
  { id: "h", kind: "house", talentProfileId: null },
];

test("a line is confirmed only for the person it belongs to", () => {
  const read = { ok: true as const, answers: [{ lineId: "l1", talentProfileId: "p1", status: "confirmed" as const }] };
  assert.equal(lineConfirmationState(lines[0], read), "confirmed");
  assert.equal(lineConfirmationState(lines[1], read), "pending");
  assert.equal(lineConfirmationState(lines[2], read), "not_applicable");
});

test("a replaced person's answer never carries over", () => {
  const read = { ok: true as const, answers: [{ lineId: "l1", talentProfileId: "p1", status: "confirmed" as const }] };
  assert.equal(lineConfirmationState({ id: "l1", kind: "talent", talentProfileId: "p9" }, read), "pending");
});

test("fully confirmed only when every talent line is confirmed", () => {
  const some = { ok: true as const, answers: [{ lineId: "l1", talentProfileId: "p1", status: "confirmed" as const }] };
  assert.equal(offerConfirmation(lines, some).fullyConfirmed, false);
  const all = { ok: true as const, answers: [...some.answers, { lineId: "l2", talentProfileId: "p2", status: "confirmed" as const }] };
  assert.equal(offerConfirmation(lines, all).fullyConfirmed, true);
  assert.equal(offerConfirmation([lines[2]], all).fullyConfirmed, false);
});

test("a declined line reopens only that line", () => {
  const read = {
    ok: true as const,
    answers: [
      { lineId: "l1", talentProfileId: "p1", status: "confirmed" as const },
      { lineId: "l2", talentProfileId: "p2", status: "declined" as const },
    ],
  };
  const r = offerConfirmation(lines, read);
  assert.deepEqual(r.reopenedLineIds, ["l2"]);
  assert.deepEqual(r.confirmedLineIds, ["l1"]);
  assert.equal(r.fullyConfirmed, false);
});

test("unreadable state is never confirmed", () => {
  const r = offerConfirmation(lines, { ok: false });
  assert.equal(r.fullyConfirmed, false);
  assert.deepEqual(r.pendingLineIds, ["l1", "l2"]);
});

test("labels exist in ES and EN with no em dashes", () => {
  for (const lang of ["en", "es"] as const) {
    for (const v of Object.values(LINE_STATE_LABELS[lang])) assert.ok(v.length > 0 && !v.includes("—"));
  }
});

type Row = Record<string, unknown>;
function fakeAdmin(tables: Record<string, Row[]>, errors: Record<string, { code?: string; message: string }> = {}) {
  const upserts: Row[] = [];
  const from = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => (filters.push([k, v]), q),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: errors[table] ?? null }),
      upsert: async (row: Row) => {
        if (errors[table]) return { error: errors[table] };
        upserts.push(row);
        return { error: null };
      },
      then: (resolve: (v: { data: Row[]; error: unknown }) => unknown) => resolve({ data: rows(), error: errors[table] ?? null }),
    };
    return q;
  };
  return { admin: { from } as unknown as SupabaseClient, upserts };
}

const world = () => ({
  inquiry_offer_line_items: [
    { id: "l1", offer_id: "o1", tenant_id: "t1", talent_profile_id: "p1" },
    { id: "l2", offer_id: "o1", tenant_id: "t1", talent_profile_id: "p2" },
  ],
  talent_profiles: [
    { id: "p1", user_id: "u1" },
    { id: "p2", user_id: "u2" },
  ],
});

test("a person answers their own line and only that row is written", async () => {
  const { admin, upserts } = fakeAdmin(world());
  assert.deepEqual(await answerOwnOfferLine(admin, { userId: "u1", lineId: "l1", status: "declined" }), { ok: true });
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].offer_line_id, "l1");
  assert.equal(upserts[0].talent_profile_id, "p1");
});

test("a person cannot answer another person's line", async () => {
  const { admin, upserts } = fakeAdmin(world());
  assert.deepEqual(await answerOwnOfferLine(admin, { userId: "u1", lineId: "l2", status: "confirmed" }), { ok: false, reason: "not_yours" });
  assert.equal(upserts.length, 0);
});

test("unknown line, house line and bad input are refused", async () => {
  const { admin, upserts } = fakeAdmin({ ...world(), inquiry_offer_line_items: [{ id: "h", offer_id: "o1", tenant_id: "t1", talent_profile_id: null }] });
  assert.deepEqual(await answerOwnOfferLine(admin, { userId: "u1", lineId: "h", status: "confirmed" }), { ok: false, reason: "not_yours" });
  assert.deepEqual(await answerOwnOfferLine(admin, { userId: "u1", lineId: "nope", status: "confirmed" }), { ok: false, reason: "not_yours" });
  assert.deepEqual(await answerOwnOfferLine(admin, { userId: "u1", lineId: "h", status: "x" as never }), { ok: false, reason: "invalid" });
  assert.equal(upserts.length, 0);
});

test("a missing table on write is unavailable; on read it is not ok", async () => {
  const err = { offer_line_confirmations: { code: "42P01", message: "x" } };
  const w = fakeAdmin(world(), err);
  assert.deepEqual(await answerOwnOfferLine(w.admin, { userId: "u1", lineId: "l1", status: "confirmed" }), { ok: false, reason: "unavailable" });
  assert.deepEqual(await readOfferLineAnswers(w.admin, { tenantId: "t1", offerId: "o1" }), { ok: false });
});

test("read keeps only well-formed answers", async () => {
  const { admin } = fakeAdmin({
    offer_line_confirmations: [
      { tenant_id: "t1", offer_id: "o1", offer_line_id: "l1", talent_profile_id: "p1", status: "confirmed" },
      { tenant_id: "t1", offer_id: "o1", offer_line_id: "l2", talent_profile_id: "p2", status: "weird" },
    ],
  });
  assert.deepEqual(await readOfferLineAnswers(admin, { tenantId: "t1", offerId: "o1" }), {
    ok: true,
    answers: [{ lineId: "l1", talentProfileId: "p1", status: "confirmed" }],
  });
});
