import assert from "node:assert/strict";
import { test } from "node:test";

import { isTriviallyTrue, letsAnonWrite } from "./anon-write-policy-shape.mjs";

test("postgres renders a trivially-true predicate as true or (true)", () => {
  for (const value of ["true", "(true)", "TRUE", " true ", "", null, undefined]) {
    assert.equal(isTriviallyTrue(value), true, `${String(value)} should read as open`);
  }
  for (const value of ["is_agency_staff()", "(user_id = auth.uid())", "false"]) {
    assert.equal(isTriviallyTrue(value), false, `${value} should read as a real gate`);
  }
});

/** The exact shape that was live on production on 2026-09-06 (closed in #1908). */
const OPEN_DOOR = {
  table_name: "analytics_events",
  policy_name: "analytics_events_insert_public",
  cmd: "INSERT",
  using_expr: "",
  check_expr: "true",
  reaches_anon: true,
  anon_holds_grant: true,
};

test("the shape that was actually open is caught", () => {
  assert.equal(letsAnonWrite(OPEN_DOOR), true);
});

test("an UPDATE policy with USING (TRUE) is caught — rewriting rows, not just adding", () => {
  assert.equal(
    letsAnonWrite({
      ...OPEN_DOOR,
      policy_name: "analytics_search_sessions_update_public",
      cmd: "UPDATE",
      using_expr: "true",
      check_expr: "true",
    }),
    true,
  );
});

test("BOTH halves are required, or the guard cries wolf", () => {
  // A true policy anon cannot reach through a grant: RLS would allow, the grant refuses.
  assert.equal(letsAnonWrite({ ...OPEN_DOOR, anon_holds_grant: false }), false);
  // A grant with a policy that does not name anon.
  assert.equal(letsAnonWrite({ ...OPEN_DOOR, reaches_anon: false }), false);
});

test("a real gate is not flagged, however permissive its role list looks", () => {
  // client_profiles_write_own: names PUBLIC, but anon holds no auth.uid().
  assert.equal(
    letsAnonWrite({
      table_name: "client_profiles",
      policy_name: "client_profiles_write_own",
      cmd: "ALL",
      using_expr: "((user_id = ( SELECT auth.uid() AS uid)) OR is_agency_staff())",
      check_expr: "((user_id = ( SELECT auth.uid() AS uid)) OR is_agency_staff())",
      reaches_anon: true,
      anon_holds_grant: true,
    }),
    false,
    "a PII table with a real predicate must never be flagged",
  );
});

test("reads are not writes", () => {
  assert.equal(letsAnonWrite({ ...OPEN_DOOR, cmd: "SELECT" }), false);
});
