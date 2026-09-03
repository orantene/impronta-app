import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { isExclusionViolation } from "./reservation-hold";

const migration = readFileSync(
  new URL("../../../../supabase/migrations/20261229000320_talent_bookings_no_overlap.sql", import.meta.url),
  "utf8",
).toLowerCase();

const convert = readFileSync(new URL("./reservation-convert.ts", import.meta.url), "utf8");

test("the constraint keys on the talent alone, never on the tenant", () => {
  const exclude = migration.slice(migration.indexOf("exclude using gist"), migration.indexOf("where ("));
  assert.ok(exclude.includes("talent_profile_id with ="), "must key on talent_profile_id");
  assert.ok(
    !exclude.includes("tenant_id"),
    "adding tenant_id to the key lets two agencies book the same talent at the same time",
  );
});

test("the range is half-open so back-to-back appointments do not collide", () => {
  assert.ok(
    migration.includes("tstzrange(starts_at, ends_at, '[)')"),
    "a closed range would refuse 10:00-11:00 followed by 11:00-12:00",
  );
});

test("cancelled bookings free the time; completed ones do not", () => {
  const where = migration.slice(migration.indexOf("where ("));
  assert.ok(where.includes("'confirmed'") && where.includes("'completed'"));
  assert.ok(!where.includes("'cancelled'"), "cancelling must release the slot");
});

test("a booking overlap is recognised as an exclusion violation", () => {
  assert.ok(isExclusionViolation({ code: "23P01", message: "whatever" }));
  assert.ok(
    isExclusionViolation({
      code: null,
      message: 'conflicting key value violates exclusion constraint "talent_bookings_no_overlap"',
    }),
    "the constraint name alone must be enough when the code is missing",
  );
  assert.ok(!isExclusionViolation({ code: "23505", message: "duplicate key" }));
});

test("the convert path refuses in words, not in Postgres", () => {
  assert.ok(
    convert.includes("isExclusionViolation(insErr)"),
    "an overlap must not reach a person as a raw exclusion message",
  );
  assert.ok(convert.includes("already booked for this talent"));
});
