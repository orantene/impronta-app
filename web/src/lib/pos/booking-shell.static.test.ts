import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { blankComments } from "@/lib/quality/supabase-unchecked-read";

/**
 * One order, one booking shell.
 *
 * The shell exists only because `booking_transactions.booking_id` is NOT NULL.
 * It is bookkeeping, not a sale — but every surface that lists or sums bookings
 * treats it as one, so a second shell for the same order is the same sale
 * counted twice. Collection is called once per ALLOCATION (a split tab, a
 * re-run card, a double tap), so "create a shell" ran as often as money was
 * taken and the duplicate arrived from the till rather than from the customer.
 *
 * Static, because what is at stake is which statements exist and in what order.
 */
const SRC = blankComments(readFileSync(join(process.cwd(), "src/lib/pos/collection.ts"), "utf8"));
const MIGRATION = readFileSync(
  join(process.cwd(), "..", "supabase", "migrations", "20261230001000_one_booking_shell_per_order.sql"),
  "utf8",
);

test("the card path finds the order's booking before it creates one", () => {
  assert.match(SRC, /bookingShellForOrder/, "collection goes through find-or-create");
  const find = SRC.indexOf('.from("agency_bookings")\n      .select("id")');
  const insert = SRC.indexOf('.from("agency_bookings")\n    .insert(');
  assert.ok(find > -1, "there must be a lookup");
  assert.ok(insert > -1, "and an insert for the first collection");
  assert.ok(find < insert, "the lookup must come first, or it is not find-or-create");
});

test("there is exactly ONE place that inserts a booking on the POS path", () => {
  const inserts = [...SRC.matchAll(/from\("agency_bookings"\)[\s\S]{0,40}\.insert\(/g)];
  assert.equal(inserts.length, 1, "a second insert site is a second way to duplicate");
});

test("the lookup is tenant-scoped", () => {
  // `order_id` is a uuid the caller supplies. A lookup without the tenant
  // predicate would attach this workspace's payment to another workspace's
  // booking if one ever shared an id.
  const at = SRC.indexOf("async function bookingShellForOrder");
  assert.ok(at > -1);
  const body = SRC.slice(at, at + 1400);
  assert.match(body, /\.eq\("order_id", input\.orderId\)/, "");
  assert.match(body, /\.eq\("tenant_id", input\.tenantId\)/, "");
});

test("a unique violation is resolved by re-reading, not reported as a failure", () => {
  // Two devices collecting the same tab both read "no booking" and both insert.
  // The loser's row is the one we wanted all along; refusing here would decline
  // a payment that has nothing wrong with it.
  assert.match(SRC, /"23505"/, "the race has a code and it is not a generic error");
  const at = SRC.indexOf("const raced");
  assert.ok(at > -1);
  assert.match(SRC.slice(at, at + 500), /await find\(\)/, "re-read after losing the race");
});

test("the database, not the read-then-write, is what guarantees uniqueness", () => {
  assert.match(MIGRATION, /CREATE UNIQUE INDEX[\s\S]{0,120}agency_bookings \(order_id\)/, "");
  assert.match(MIGRATION, /WHERE order_id IS NOT NULL/, "partial: inquiry bookings have no order");
  assert.match(
    MIGRATION,
    /DROP INDEX IF EXISTS public\.agency_bookings_order_idx/,
    "the superseded non-unique index on the same expression is removed",
  );
});

test("the remediation refuses to merge bookings that carry their own history", () => {
  // Re-pointing a transaction is safe: `booking_transactions.order_id` already
  // names the order, so both shells were shells for the same record. Merging
  // payouts or deliverables is a money decision, and a migration that picks one
  // silently is worse than one that stops.
  assert.match(MIGRATION, /RAISE EXCEPTION/, "unresolvable duplicates stop the migration");
  assert.match(MIGRATION, /ORDER BY created_at, id/, "the oldest booking is the keeper");
});
