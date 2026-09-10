/**
 * The identity gate is enforced in SQL and consulted in TypeScript, and the two
 * hold the same list of order statuses. A list held twice is a list that drifts,
 * and the drift that already happened cost a locked till: the trigger treated
 * every status except `draft` as a sale, so a void and an expiry were refused
 * along with the payment.
 *
 * This test is the thing that fails if they come apart again:
 *   - the enum in the table's own migration must be exactly ORDER_STATUSES;
 *   - `public.order_status_is_selling` must classify every label the way
 *     `isSellingOrderStatus` does;
 *   - the CHECK that spells its exempt list out by hand must spell out exactly
 *     the non-selling side;
 *   - the trigger must exempt the non-selling side, and must not have gone back
 *     to the "same status" short-circuit that let a customer be stripped off a
 *     sale that already stood.
 *
 * Static: reads the migration text, opens no connection.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ORDER_STATUSES,
  NON_SELLING_ORDER_STATUSES,
  isSellingOrderStatus,
} from "./order-status";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, "..", "..", "..", "..", "supabase", "migrations");

const ENUM_DEFINED_IN = "20261228000142_orders_and_order_lines.sql";
const GATE_DEFINED_IN = "20261230002500_identity_gates_selling_not_abandoning.sql";

const gate = readFileSync(join(MIGRATIONS_DIR, GATE_DEFINED_IN), "utf8");

test("ORDER_STATUSES is exactly the enum the orders table was created with", () => {
  const enumSql = readFileSync(join(MIGRATIONS_DIR, ENUM_DEFINED_IN), "utf8");
  const block = /CREATE TYPE public\.order_status AS ENUM \(([\s\S]*?)\);/.exec(enumSql);
  assert.ok(block, "could not find the order_status enum declaration");
  const labels = [...block[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(
    labels,
    [...ORDER_STATUSES],
    "the enum and ORDER_STATUSES disagree. A status the code cannot name is a status no rule covers.",
  );
});

test("order_status_is_selling classifies every status the way the code does", () => {
  const body = /CREATE OR REPLACE FUNCTION public\.order_status_is_selling[\s\S]*?\n\$\$;/.exec(gate);
  assert.ok(body, "could not find public.order_status_is_selling");
  for (const status of ORDER_STATUSES) {
    const arm = new RegExp(`WHEN '${status}'\\s+THEN RETURN (true|false);`).exec(body[0]);
    assert.ok(arm, `SQL does not classify '${status}' at all`);
    assert.equal(
      arm[1] === "true",
      isSellingOrderStatus(status),
      `SQL and TypeScript disagree about '${status}'`,
    );
  }
});

test("an unclassified status raises in SQL rather than picking a side", () => {
  // Defaulting to selling re-locks the till the day a 'voided' state is added;
  // defaulting to not-selling sells a gated ticket to nobody and says nothing.
  const body = /CREATE OR REPLACE FUNCTION public\.order_status_is_selling[\s\S]*?\n\$\$;/.exec(gate);
  assert.ok(body);
  assert.match(body[0], /ELSE\s+RAISE EXCEPTION/);
  assert.equal(/ELSE\s+RETURN/.test(body[0]), false, "the ELSE arm must refuse, not answer");
});

test("the CHECK's hand-written exempt list is exactly the non-selling side", () => {
  const check = /ADD CONSTRAINT orders_identified_before_payment\s+CHECK \(([\s\S]*?)\n  \);/.exec(gate);
  assert.ok(check, "could not find the orders_identified_before_payment CHECK");
  const inList = /status IN \(([^)]*)\)/.exec(check[1]);
  assert.ok(inList, "the CHECK no longer exempts statuses by name");
  const exempt = [...inList[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(
    exempt.slice().sort(),
    [...NON_SELLING_ORDER_STATUSES].slice().sort(),
    "the CHECK exempts a different set of statuses than order_status_is_selling does",
  );
});

test("the trigger exempts the non-selling side and does not gate on the write alone", () => {
  const fn = /CREATE OR REPLACE FUNCTION public\.orders_require_identity_for_lines[\s\S]*?\n\$\$;/.exec(gate);
  assert.ok(fn, "could not find the identity trigger function");
  assert.match(
    fn[0],
    /IF NOT public\.order_status_is_selling\(NEW\.status\) THEN\s+RETURN NEW;/,
    "the trigger must let every non-selling transition through, which is what a void and an expiry write",
  );
  assert.equal(
    /OLD\.status IS NOT DISTINCT FROM NEW\.status/.test(fn[0]),
    false,
    "the 'same status' short-circuit is back. It waved through an UPDATE that stripped the customer off a standing sale.",
  );
  assert.match(
    fn[0],
    /public\.order_status_is_selling\(OLD\.status\)\s+AND OLD\.customer_id IS NULL/,
    "an already-anonymous sale must stay refundable, and only that case may skip the check",
  );
});
