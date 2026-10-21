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
type RpcResult = { data: unknown; error: { code?: string; message: string } | null };
function fakeAdmin(
  tables: Record<string, Row[]>,
  errors: Record<string, { code?: string; message: string }> = {},
  opts: { rpc?: () => RpcResult; onUpsert?: (t: Record<string, Row[]>) => void } = {},
) {
  const upserts: Row[] = [];
  const deletes: Array<Array<[string, unknown]>> = [];
  const rpcs: Array<{ name: string; args: Row }> = [];
  const reads: string[] = [];
  const from = (table: string) => {
    reads.push(table);
    const filters: Array<[string, unknown]> = [];
    const ins: Array<[string, unknown[]]> = [];
    let del = false;
    const rows = () =>
      (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v) && ins.every(([k, vs]) => vs.includes(r[k])));
    const q = {
      in: (k: string, vs: unknown[]) => (ins.push([k, vs]), q),
      select: () => q,
      delete: () => ((del = true), q),
      eq: (k: string, v: unknown) => (filters.push([k, v]), q),
      maybeSingle: async () => ({ data: rows()[0] ? { ...rows()[0] } : null, error: errors[table] ?? null }),
      upsert: async (row: Row) => {
        if (errors[table]) return { error: errors[table] };
        upserts.push(row);
        opts.onUpsert?.(tables);
        return { error: null };
      },
      then: (resolve: (v: { data: Row[]; error: unknown }) => unknown) => {
        if (del) {
          deletes.push([...filters]);
          return resolve({ data: [], error: errors[table] ?? null });
        }
        return resolve({ data: rows(), error: errors[table] ?? null });
      },
    };
    return q;
  };
  const rpc = async (name: string, args: Row): Promise<RpcResult> => {
    rpcs.push({ name, args });
    return opts.rpc ? opts.rpc() : { data: null, error: { code: "PGRST202", message: "missing" } };
  };
  return { admin: { from, rpc } as unknown as SupabaseClient, upserts, deletes, rpcs, reads };
}

test("a non-participant (no talent profile) triggers NO read of inquiry_offer_line_items", async () => {
  const { admin, reads, upserts } = fakeAdmin(world());
  assert.deepEqual(await answerOwnOfferLine(admin, { userId: "stranger", lineId: "l1", status: "confirmed" }), { ok: false, reason: "not_yours" });
  assert.equal(reads.includes("inquiry_offer_line_items"), false);
  assert.equal(upserts.length, 0);
});

test("the line read is scoped to the caller's own profiles, so another person's line is never returned", async () => {
  const { admin, reads } = fakeAdmin(world());
  assert.deepEqual(await answerOwnOfferLine(admin, { userId: "u1", lineId: "l2", status: "confirmed" }), { ok: false, reason: "not_yours" });
  assert.ok(reads.indexOf("talent_profiles") < reads.indexOf("inquiry_offer_line_items"));
});

test("a participant still answers their own line", async () => {
  const { admin, upserts } = fakeAdmin(world());
  assert.deepEqual(await answerOwnOfferLine(admin, { userId: "u2", lineId: "l2", status: "confirmed" }), { ok: true });
  assert.equal(upserts[0].talent_profile_id, "p2");
});

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

test("with the guarded RPC, a late write by the previous person is refused and changes nothing", async () => {
  const { admin, upserts, rpcs } = fakeAdmin(world(), {}, { rpc: () => ({ data: "stale", error: null }) });
  assert.deepEqual(await answerOwnOfferLine(admin, { userId: "u1", lineId: "l1", status: "confirmed" }), { ok: false, reason: "not_yours" });
  assert.equal(rpcs[0].name, "answer_offer_line_confirmation");
  assert.deepEqual(rpcs[0].args, { p_line: "l1", p_talent: "p1", p_status: "confirmed" });
  assert.equal(upserts.length, 0);
});

test("with the guarded RPC, an ok answer is one statement and no separate upsert", async () => {
  const { admin, upserts } = fakeAdmin(world(), {}, { rpc: () => ({ data: "ok", error: null }) });
  assert.deepEqual(await answerOwnOfferLine(admin, { userId: "u1", lineId: "l1", status: "declined" }), { ok: true });
  assert.equal(upserts.length, 0);
});

test("fallback: a person swapped out mid-write has their row removed and is refused", async () => {
  const tables = world();
  const { admin, deletes } = fakeAdmin(tables, {}, { onUpsert: (t) => void (t.inquiry_offer_line_items[0].talent_profile_id = "p2") });
  assert.deepEqual(await answerOwnOfferLine(admin, { userId: "u1", lineId: "l1", status: "confirmed" }), { ok: false, reason: "not_yours" });
  assert.deepEqual(deletes[0], [["offer_line_id", "l1"], ["talent_profile_id", "p1"]]);
});
