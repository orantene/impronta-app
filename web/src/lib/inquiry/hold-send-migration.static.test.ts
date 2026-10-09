import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/** Pins the clauses of Migration B (20261231357000) that carry the hold-the-send contract. */
const sql = readFileSync(join(process.cwd(), "..", "supabase/migrations/20261231357000_hold_offer_send_until_talent_approves.sql"), "utf8");
const fn = (name: string) => {
  const i = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  assert.ok(i >= 0, `${name} defined`);
  const next = sql.indexOf("CREATE OR REPLACE FUNCTION", i + 10);
  return sql.slice(i, next === -1 ? undefined : next);
};

test("the one-live-offer index includes the held state, so a second draft cannot sit beside it", () => {
  assert.match(sql, /WHERE status IN \('draft', 'sent', 'accepted', 'awaiting_talent'\)/);
});

test("the status pair trigger pairs awaiting_talent with offer_pending, like sent", () => {
  assert.match(fn("enforce_inquiry_status_offer_pair"), /offer_st = 'awaiting_talent'::public\.inquiry_offer_status THEN\s+IF st <> 'offer_pending'/);
});

test("the blocking set is talent approvals other than the offer's author, never the client or staff", () => {
  const f = fn("offer_pending_talent_approvals");
  assert.match(f, /p\.role\s+= 'talent'/);
  assert.match(f, /a\.status\s+<> 'accepted'/);
  assert.match(f, /o\.created_by_user_id IS NOT NULL/);
  assert.match(f, /p\.user_id = o\.created_by_user_id OR tp\.user_id = o\.created_by_user_id/);
});

test("engine_send_offer: a held offer is awaiting_talent and emits only a STAFF-ONLY event; a free one emits offer.sent to participants", () => {
  const f = fn("engine_send_offer");
  assert.match(f, /v_hold := public\.offer_pending_talent_approvals\(p_inquiry_id, p_offer_id\) > 0/);
  assert.match(f, /SET status = 'awaiting_talent'/);
  assert.match(f, /IF v_hold THEN\s+PERFORM public\.engine_emit_event\(\s+p_inquiry_id,\s+'offer\.awaiting_talent',[^;]*'staff_only'/);
  assert.match(f, /ELSE\s+PERFORM public\.engine_emit_event\(\s+p_inquiry_id,\s+'offer\.sent',[^;]*'participants'/);
  assert.match(f, /IF off\.status IN \('sent', 'awaiting_talent'\) THEN/);
  assert.match(f, /status IN \('sent', 'awaiting_talent'\);/);
});

test("engine_submit_approval: last talent releases to sent + offer.sent; a rejection returns it to draft and clears the approvals; held approvals are staff-only", () => {
  const f = fn("engine_submit_approval");
  assert.match(f, /'transition', 'released_to_client'/);
  assert.match(f, /offer_pending_talent_approvals\(p_inquiry_id, p_offer_id\) = 0/);
  assert.match(f, /SET status = 'sent', updated_at = now\(\) WHERE id = p_offer_id AND status = 'awaiting_talent'/);
  assert.match(f, /p_decision = 'rejected' AND v_held/);
  assert.match(f, /SET status = 'draft'/);
  assert.match(f, /DELETE FROM public\.inquiry_approvals WHERE inquiry_id = p_inquiry_id AND offer_id = p_offer_id/);
  assert.match(f, /'transition', 'returned_to_draft'/);
  assert.match(f, /'staff_only'/);
});

test("signatures and grants are untouched (CREATE OR REPLACE keeps the anon revoke)", () => {
  const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  assert.doesNotMatch(code, /DROP FUNCTION/i);
  assert.doesNotMatch(code, /\bGRANT\b/i);
  // The only REVOKE is on the NEW internal helper; the two engine functions keep their existing privileges.
  const revokes = code.match(/\bREVOKE\b[^;]*;/gi) ?? [];
  assert.equal(revokes.length, 1);
  assert.match(revokes[0]!, /REVOKE ALL ON FUNCTION public\.offer_pending_talent_approvals\(uuid, uuid\) FROM PUBLIC, anon, authenticated/);
});

test("the new helper is not executable by anon, authenticated or PUBLIC, and the migration asserts it", () => {
  assert.match(sql, /has_function_privilege\('anon', 'public\.offer_pending_talent_approvals\(uuid, uuid\)', 'EXECUTE'\)/);
  assert.match(sql, /has_function_privilege\('authenticated'/);
  assert.match(sql, /has_function_privilege\('public'/);
  assert.match(sql, /RAISE EXCEPTION 'offer_pending_talent_approvals must not be executable/);
});
