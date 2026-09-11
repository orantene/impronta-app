import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { blankComments } from "@/lib/quality/supabase-unchecked-read";

/**
 * One order, one booking shell — and every path that records money gets one.
 *
 * The shell exists because `trg_booking_transactions_scope` refuses a
 * `booking_transactions` row whose `booking_id` does not resolve to a booking
 * with a tenant. It is bookkeeping, not a sale — but every surface that lists
 * or sums bookings treats it as one, so a second shell for the same order is
 * the same sale counted twice. Collection is called once per ALLOCATION (a
 * split tab, a re-run card, a double tap), so "create a shell" ran as often as
 * money was taken and the duplicate arrived from the till rather than from the
 * customer.
 *
 * THE SECOND DEFECT, which is why this file now reads three sources. The shell
 * was private to `lib/pos/collection.ts`; the card path called it and the CASH
 * branch returned before reaching it. `settleAtDoor` inserted with a null
 * `booking_id`, the trigger refused it, and a cashier could take an $18 note
 * while the order stayed unpaid with the full amount outstanding. Every door
 * settlement was affected, not only POS cash — `_door-actions.ts` settles
 * event tickets through the same function.
 *
 * Static, because what is at stake is which statements exist and in what order.
 */
const SHELL = blankComments(
  readFileSync(join(process.cwd(), "src/lib/orders/booking-shell.ts"), "utf8"),
);
const POS = blankComments(readFileSync(join(process.cwd(), "src/lib/pos/collection.ts"), "utf8"));
const DOOR = blankComments(
  readFileSync(join(process.cwd(), "src/lib/orders/settle-at-door.ts"), "utf8"),
);
const MIGRATION = readFileSync(
  join(process.cwd(), "..", "supabase", "migrations", "20261230001000_one_booking_shell_per_order.sql"),
  "utf8",
);

test("the shell is found before it is created", () => {
  const find = SHELL.indexOf('.from("agency_bookings")\n      .select("id")');
  const insert = SHELL.indexOf('.from("agency_bookings")\n    .insert(');
  assert.ok(find > -1, "there must be a lookup");
  assert.ok(insert > -1, "and an insert for the first collection");
  assert.ok(find < insert, "the lookup must come first, or it is not find-or-create");
});

test("there is exactly ONE place in the codebase that inserts a booking shell", () => {
  const inserts = [
    ...SHELL.matchAll(/from\("agency_bookings"\)[\s\S]{0,40}\.insert\(/g),
    ...POS.matchAll(/from\("agency_bookings"\)[\s\S]{0,40}\.insert\(/g),
    ...DOOR.matchAll(/from\("agency_bookings"\)[\s\S]{0,40}\.insert\(/g),
  ];
  assert.equal(inserts.length, 1, "a second insert site is a second way to duplicate");
});

test("settling at the door ensures its own shell rather than trusting the caller", () => {
  // The whole defect was one caller remembering and another forgetting, so the
  // shell has to sit with the `booking_transactions` insert. Two callers reach
  // `settleAtDoor` with no contact at all (`recordVerifiedCollection` and the
  // event door), and neither can be asked to supply a booking.
  assert.match(DOOR, /bookingShellForOrder/, "the door path calls find-or-create");
  const shell = DOOR.indexOf("await bookingShellForOrder(");
  const insert = DOOR.indexOf('.from("booking_transactions")\n    .insert(');
  assert.ok(shell > -1 && insert > -1);
  assert.ok(shell < insert, "the shell must exist before the transaction that needs it");
  assert.match(DOOR, /booking_id: shell\.bookingId/, "and the transaction must carry it");
});

test("the POS file no longer owns a private copy", () => {
  assert.match(POS, /from "@\/lib\/orders\/booking-shell"/, "imported, not redefined");
  assert.doesNotMatch(POS, /async function bookingShellForOrder/, "no second implementation");
});

test("the lookup is tenant-scoped", () => {
  // `order_id` is a uuid the caller supplies. A lookup without the tenant
  // predicate would attach this workspace's payment to another workspace's
  // booking if one ever shared an id.
  const at = SHELL.indexOf("export async function bookingShellForOrder");
  assert.ok(at > -1);
  const body = SHELL.slice(at, at + 1400);
  assert.match(body, /\.eq\("order_id", input\.orderId\)/, "");
  assert.match(body, /\.eq\("tenant_id", input\.tenantId\)/, "");
});

test("a unique violation is resolved by re-reading, not reported as a failure", () => {
  // Two devices collecting the same tab both read "no booking" and both insert.
  // The loser's row is the one we wanted all along; refusing here would decline
  // a payment that has nothing wrong with it.
  assert.match(SHELL, /"23505"/, "the race has a code and it is not a generic error");
  const at = SHELL.indexOf("const raced");
  assert.ok(at > -1);
  assert.match(SHELL.slice(at, at + 500), /await find\(\)/, "re-read after losing the race");
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
