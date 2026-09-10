/**
 * The Payments screen must read the method out of the column the till writes
 * it into. Static, because the failure it guards is not a wrong number: it is
 * a CORRECT number computed from a field nothing writes.
 *
 * WHAT SHIPPED AND WHY NOTHING CAUGHT IT. `_data-bridge/payments-activity.ts`
 * selected `provider_metadata` and looked for `paid_via` inside it.
 * `settleAtDoor` — the only writer of an at-counter tender — puts `paid_via`
 * into `metadata`, a different jsonb column. So every manual row came back
 * with `paidVia: null`, `paymentMethodKey` answered `manual_other` for all of
 * them, and the cash and card buckets were unreachable. Exercised on the
 * isolated branch: a 1500 cash tender and a 2500 card tender, both settled
 * through the real path, arrived at the screen as a single
 * `{ method: "manual_other", totalCents: 4000, count: 2 }`.
 *
 * The unit tests over `groupTakingsByMethod` were all green throughout,
 * because they hand-fed `paidVia: "cash"` — a value production never
 * produced. They measured the shaping function; nothing measured the join
 * between the writer and the reader. This does.
 *
 * IT READS BOTH FILES' SOURCE, deliberately, rather than importing them:
 * `settle-at-door.ts` is `server-only` and pulls the whole orders graph, and
 * the property under test is a spelling in two places, which is exactly what
 * a source read can see and a type cannot.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PAID_VIA_KEY,
  PAYMENT_METHOD_COLUMN,
} from "@/app/(workspace)/[tenantSlug]/_data-bridge/payments-activity";

const SRC = join(process.cwd(), "src");
const WRITER = join(SRC, "lib", "orders", "settle-at-door.ts");
const READER = join(SRC, "app", "(workspace)", "[tenantSlug]", "_data-bridge", "payments-activity.ts");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

/**
 * The jsonb column `settleAtDoor`'s insert writes its tender bag into, taken
 * from the insert object literal itself rather than from anywhere it is
 * described in prose.
 */
function tenderColumnInTheWriter(source: string): string {
  const insert = source.slice(source.indexOf('.from("booking_transactions")\n    .insert({'));
  assert.ok(insert.length > 0, "settle-at-door.ts no longer inserts into booking_transactions");
  const match = /\n      (\w+): \{\n        paid_via: input\.paidVia,/.exec(insert);
  assert.ok(
    match,
    "settle-at-door.ts no longer writes `paid_via` into a jsonb column on the inserted row",
  );
  return match[1];
}

test("the takings reader selects the very column the door tender is written into", () => {
  const writesInto = tenderColumnInTheWriter(read(WRITER));
  assert.equal(
    PAYMENT_METHOD_COLUMN,
    writesInto,
    `settle-at-door.ts writes the tender into '${writesInto}' but the Payments reader selects ` +
      `'${PAYMENT_METHOD_COLUMN}'. Every manual row would come back with no method and cash ` +
      `would be indistinguishable from card.`,
  );
});

test("the reader's select actually names that column", () => {
  const reader = read(READER);
  // The select is interpolated from the constant, so this asserts the
  // constant is what reaches PostgREST rather than a second hard-coded name
  // drifting beside it.
  assert.ok(
    reader.includes("`gross_amount_cents, currency, provider, ${PAYMENT_METHOD_COLUMN}`"),
    "the takings select no longer builds its column list from PAYMENT_METHOD_COLUMN",
  );
  assert.ok(
    !/\.select\("[^"]*provider_metadata[^"]*"\)/.test(reader),
    "the takings reader is selecting provider_metadata again; the tender bag is not in that column",
  );
});

test("the key looked up inside the bag is the key the door writes", () => {
  assert.ok(
    read(WRITER).includes(`${PAID_VIA_KEY}: input.paidVia,`),
    `settle-at-door.ts no longer writes a '${PAID_VIA_KEY}' key, so the Payments reader is ` +
      `looking for something nothing records.`,
  );
});
