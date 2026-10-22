/** TUL-1601: the autopay columns live in their own held migration; the one already on main is not edited. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const dir = join(process.cwd(), "../supabase/migrations/_pending_pm");
const sql = readFileSync(join(dir, "20261231423000_studio_rent_autopay_tul1601.sql"), "utf8").replace(/^\s*--.*$/gm, "");
const first = readFileSync(join(dir, "20261231420700_studio_rent_tul1376.sql"), "utf8");

test("plans carry the autopay status, the subscription id and the first charged month; one live subscription per plan", () => {
  assert.match(sql, /autopay_status text NOT NULL DEFAULT 'off'/);
  assert.match(sql, /stripe_subscription_id text NULL/);
  assert.match(sql, /autopay_first_period text NULL/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS studio_rent_plans_subscription_uniq/);
});
test("invoices say where a month was paid and carry the Stripe invoice id, unique", () => {
  assert.match(sql, /source text NOT NULL DEFAULT 'link' CHECK \(source IN \('link','autopay'\)\)/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS studio_rent_invoices_stripe_invoice_uniq/);
});
test("the migration already on main is untouched", () => {
  assert.doesNotMatch(first, /autopay_status|stripe_subscription_id/);
});
