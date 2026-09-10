/**
 * The three properties of `reschedule_booking_set` that no unit test can see.
 *
 * A fake RPC proves the wrapper's arithmetic. It cannot prove that the parent
 * row is locked, that the capacity re-count leaves the moving allocation out
 * of its own total, or that the guard hold is taken BEFORE the mirror moves —
 * and each of those, if it regresses, fails silently: the reschedule still
 * returns ok, and two people end up holding one hour.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const MIGRATION_PATH = "../../../../supabase/migrations/20261231010200_reschedule_booking_set.sql";

const sql = readFileSync(new URL(MIGRATION_PATH, import.meta.url), "utf8");
const lower = sql.toLowerCase();

/** Body of the function, so a comment above it cannot satisfy an assertion. */
const body = (() => {
  const start = lower.indexOf("create or replace function public.reschedule_booking_set");
  assert.ok(start >= 0, "the migration must define reschedule_booking_set");
  const end = lower.indexOf("revoke all on function", start);
  assert.ok(end > start, "the migration must revoke the function it defines");
  return lower.slice(start, end);
})();

/** Strip `--` comments so prose about a rule cannot stand in for the rule. */
const code = body
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");

test("the parent booking is locked FOR UPDATE before anything is decided", () => {
  const select = code.indexOf("select * into v_booking");
  assert.ok(select >= 0, "the function must read the parent row into a variable");
  const forUpdate = code.indexOf("for update", select);
  assert.ok(forUpdate > select, "the parent read must take a row lock");
  const clause = code.slice(select, forUpdate);
  assert.ok(clause.includes("from public.agency_bookings"), "the lock must be on the parent table");
  assert.ok(clause.includes("where id = p_booking_id"), "the lock must be on THIS booking");

  const firstWrite = Math.min(
    ...["delete from public.talent_holds", "update public.talent_bookings", "update public.agency_bookings"]
      .map((needle) => code.indexOf(needle))
      .filter((i) => i >= 0),
  );
  assert.ok(
    forUpdate < firstWrite,
    "the row lock must be taken before the first write, or two operators can interleave",
  );
});

test("the capacity re-count excludes the allocation that is moving", () => {
  const countStart = code.indexOf("select coalesce(sum(al.units), 0) into v_used");
  assert.ok(countStart >= 0, "the function must count usage over the new window");
  const countEnd = code.indexOf(";", countStart);
  const count = code.slice(countStart, countEnd);
  assert.ok(
    count.includes("al.id <> v_alloc.id"),
    "without the self-exclusion every small move is sold_out against units it already holds",
  );
  assert.ok(
    count.includes("al.pool_path @> array[v_anc.id]"),
    "usage must be counted over the pool and its descendants, as the engine does",
  );
  assert.ok(
    count.includes("v_alloc_start") && count.includes("v_alloc_end"),
    "the count must be over the NEW window, not the old one",
  );
});

test("the guard hold is inserted before the talent row is updated", () => {
  const insertHold = code.indexOf("insert into public.talent_holds");
  const updateMirror = code.indexOf("update public.talent_bookings");
  assert.ok(insertHold >= 0, "the move must take the destination on talent_holds");
  assert.ok(updateMirror >= 0, "the move must rewrite the mirror");
  assert.ok(
    insertHold < updateMirror,
    "moving the mirror first would leave the destination open to a concurrent firm hold",
  );

  const deleteOwn = code.indexOf("delete from public.talent_holds");
  assert.ok(
    deleteOwn >= 0 && deleteOwn < insertHold,
    "this inquiry's own firm hold must go first, or the booking collides with itself",
  );

  const dropGuard = code.indexOf("delete from public.talent_holds where id = any (v_guard_ids)");
  assert.ok(
    dropGuard > updateMirror,
    "the guard is only released once the mirrors own the window",
  );
});

test("the guard hold covers the buffered window, not the bare one", () => {
  const insertHold = code.indexOf("insert into public.talent_holds");
  const values = code.slice(insertHold, code.indexOf("returning id into v_guard_id", insertHold));
  assert.ok(values.includes("p_starts_at - make_interval(secs => v_before)"));
  assert.ok(values.includes("p_ends_at   + make_interval(secs => v_after)"));
});

test("pool ancestors are locked root-first, the order the reserve helper uses", () => {
  assert.ok(
    code.includes("from unnest(v_alloc.pool_path) with ordinality as a(pool_id, ord)"),
    "the chain must be walked in pool_path order",
  );
  const walk = code.slice(code.indexOf("from unnest(v_alloc.pool_path)"));
  const order = walk.indexOf("order by a.ord");
  const lock = walk.indexOf("for update of p");
  assert.ok(order >= 0 && lock > order, "root-first ordering must be applied under the lock");
});

test("the parent is written last, with the explicit end", () => {
  const parentWrite = code.indexOf("update public.agency_bookings");
  const mirrorWrite = code.indexOf("update public.talent_bookings");
  const allocWrite = code.indexOf("update public.capacity_allocations");
  assert.ok(parentWrite > mirrorWrite && parentWrite > allocWrite);
  const stmt = code.slice(parentWrite, code.indexOf(";", parentWrite));
  assert.ok(
    stmt.includes("ends_at   = p_ends_at"),
    "the parent must store the SAME end the mirrors took, never a null",
  );
});

test("every failure maps to a reason, and the block rolls back", () => {
  const handler = code.slice(code.indexOf("exception"));
  assert.ok(handler.includes("when exclusion_violation then"));
  assert.ok(handler.includes("'slot_taken'"));
  assert.ok(handler.includes("when deadlock_detected or serialization_failure then"));
  assert.ok(handler.includes("'deadlock'"));
  assert.ok(handler.includes("when others then"));
  assert.ok(handler.includes("'unavailable'"));
  assert.ok(
    handler.indexOf("sqlstate 'rs005'") < handler.indexOf("when others then"),
    "a custom refusal listed after WHEN OTHERS would be swallowed as unavailable",
  );
  assert.ok(
    handler.includes("'failed_talent_id', v_failed_talent"),
    "slot_taken must name the person whose calendar refused",
  );
});

test("a refusal that is not an error still rolls back, because it RAISEs", () => {
  assert.ok(code.includes("raise exception 'sold_out' using errcode = 'rs005'"));
  assert.ok(code.includes("raise exception 'ancestor_full' using errcode = 'rs006'"));
  assert.ok(
    !code.includes("return jsonb_build_object('ok', false, 'reason', 'sold_out'"),
    "returning sold_out instead of raising would leave the talent legs moved",
  );
});

test("the function is service-role only", () => {
  assert.ok(lower.includes("revoke all on function public.reschedule_booking_set"));
  assert.ok(lower.includes("from public, anon, authenticated"));
  assert.ok(lower.includes("to service_role"));
  assert.ok(
    lower.includes("has_function_privilege('anon'"),
    "the migration must verify its own revoke rather than assume it took",
  );
});
