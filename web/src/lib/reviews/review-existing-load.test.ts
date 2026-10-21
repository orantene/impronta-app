import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { loadExistingReviewsByKey } from "./review-existing-load";

type Row = Record<string, unknown>;
type Result = { data: Row[] | null; error: { message: string } | null };

const REVIEW_ROW: Row = {
  booking_id: "b1",
  talent_profile_id: "t1",
  rating: 5,
  body: "great",
  would_book_again: true,
  attr_professionalism: 5,
  attr_skill: 4,
  attr_communication: 5,
  attr_reliability: 5,
  traits: ["kind"],
  anon: false,
  published_at: "2026-01-01T00:00:00Z",
};

class FakeQuery implements PromiseLike<Result> {
  calls: Array<[string, unknown[]]> = [];
  constructor(private readonly result: () => Result) {}
  select(cols: string) { this.calls.push(["select", [cols]]); return this; }
  eq(col: string, v: unknown) { this.calls.push(["eq", [col, v]]); return this; }
  in(col: string, v: unknown) { this.calls.push(["in", [col, v]]); return this; }
  returns() { return this; }
  then<A, B>(
    ok?: ((v: Result) => A | PromiseLike<A>) | null,
    bad?: ((e: unknown) => B | PromiseLike<B>) | null,
  ) {
    return Promise.resolve().then(() => this.result()).then(ok, bad);
  }
}

function fakeClient(
  handler: (cols: string) => Result,
  queries: FakeQuery[] = [],
): SupabaseClient {
  return {
    from(table: string) {
      assert.equal(table, "talent_reviews");
      let cols = "";
      const q: FakeQuery = new FakeQuery(() => handler(cols));
      const origSelect = q.select.bind(q);
      q.select = (c: string) => { cols = c; return origSelect(c); };
      queries.push(q);
      return q;
    },
  } as unknown as SupabaseClient;
}

/** Mimics Postgres: the column privilege rejects any select naming private_note. */
const userHandler = (cols: string): Result =>
  cols.includes("private_note")
    ? { data: null, error: { message: "permission denied for column private_note" } }
    : { data: [REVIEW_ROW], error: null };

test("list loads and the note comes from the service-role read scoped to the user", async () => {
  const userQ: FakeQuery[] = [];
  const svcQ: FakeQuery[] = [];
  const svc = fakeClient(
    () => ({
      data: [
        { booking_id: "b1", talent_profile_id: "t1", private_note: "be punctual" },
        { booking_id: "b2", talent_profile_id: "t9", private_note: "other" },
      ],
      error: null,
    }),
    svcQ,
  );
  const map = await loadExistingReviewsByKey(
    fakeClient(userHandler, userQ), svc, "u1", ["b1", "b2"],
  );
  const r = map.get("b1:t1");
  assert.ok(r);
  assert.equal(r.rating, 5);
  assert.equal(r.privateNote, "be punctual");
  assert.equal(map.has("b2:t9"), false);
  // user session never named private_note
  for (const q of userQ) for (const [m, a] of q.calls) if (m === "select") assert.doesNotMatch(String(a[0]), /private_note/);
  // service read is scoped by user + bookings
  const calls = svcQ[0].calls;
  assert.deepEqual(calls.find(([m, a]) => m === "eq" && a[0] === "client_user_id")?.[1], ["client_user_id", "u1"]);
  assert.deepEqual(calls.find(([m, a]) => m === "in" && a[0] === "booking_id")?.[1], ["booking_id", ["b1", "b2"]]);
});

test("service-role error leaves privateNote null without failing the list", async () => {
  const svc = fakeClient(() => ({ data: null, error: { message: "boom" } }));
  const map = await loadExistingReviewsByKey(fakeClient(userHandler), svc, "u1", ["b1"]);
  assert.equal(map.get("b1:t1")?.rating, 5);
  assert.equal(map.get("b1:t1")?.privateNote, null);
});

test("service-role throw or missing service client also leaves privateNote null", async () => {
  const throwing = fakeClient(() => { throw new Error("network"); });
  const a = await loadExistingReviewsByKey(fakeClient(userHandler), throwing, "u1", ["b1"]);
  assert.equal(a.get("b1:t1")?.privateNote, null);
  const b = await loadExistingReviewsByKey(fakeClient(userHandler), null, "u1", ["b1"]);
  assert.equal(b.get("b1:t1")?.privateNote, null);
});

test("static: no user-session talent_reviews select names private_note", () => {
  for (const f of ["review-actions.ts", "review-existing-load.ts"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    // Walk every `.from("talent_reviews")` and inspect the receiver client + select text.
    const re = /(\w+)\s*\.from\("talent_reviews"\)\s*\.select\(([\s\S]*?)\)/g;
    for (const m of src.matchAll(re)) {
      const client = m[1];
      const isUserSession = client === "supabase" || client === "userClient";
      if (isUserSession) {
        assert.doesNotMatch(m[2], /private_note/, `${f}: ${client} selects private_note`);
      }
    }
  }
  const helper = readFileSync(new URL("review-existing-load.ts", import.meta.url), "utf8");
  assert.doesNotMatch(
    helper.match(/EXISTING_REVIEW_PUBLIC_COLUMNS =\s*"([^"]*)"/)?.[1] ?? "private_note",
    /private_note/,
  );
});
