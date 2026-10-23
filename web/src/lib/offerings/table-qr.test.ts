/**
 * TUL-1916: the table-QR guest menu lists only items with table_qr_enabled; a
 * row without the key (column not applied yet) is still listed.
 *
 * Run: node_modules/.bin/tsx --test src/lib/offerings/table-qr.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

import { isOnTableQrMenu, withTableQrOnly } from "./table-qr";

const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("only an explicit false hides an item from the QR menu", () => {
  assert.equal(isOnTableQrMenu({ table_qr_enabled: true }), true);
  assert.equal(isOnTableQrMenu({ table_qr_enabled: false }), false);
  assert.equal(isOnTableQrMenu({}), true);
  assert.equal(isOnTableQrMenu({ table_qr_enabled: null }), true);
});

test("withTableQrOnly filters the rows", () => {
  const rows = [{ id: "a", table_qr_enabled: true }, { id: "b", table_qr_enabled: false }, { id: "c" }];
  assert.deepEqual(withTableQrOnly(rows).map((r) => r.id), ["a", "c"]);
});

test("guest menu and guest add-line both apply the flag, and fall back when the column is missing", () => {
  const code = src("../visits/guest-order.ts");
  assert.match(code, /TABLE_QR_COLUMN/);
  assert.match(code, /withTableQrOnly\(/);
  assert.match(code, /isOnTableQrMenu\(off\)/);
  assert.equal((code.match(/isMissingColumnError\(/g) ?? []).length, 2);
});

test("the migration is additive, defaults to true (nothing leaves the menu), has no data update and a rollback", () => {
  const dir = new URL("../../../../supabase/migrations/", import.meta.url);
  const file = readdirSync(dir).find((f) => /talent_offerings_table_qr_enabled/.test(f));
  assert.ok(file, "migration missing");
  const sql = readFileSync(new URL(file!, dir), "utf8");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS table_qr_enabled boolean NOT NULL DEFAULT true/);
  assert.match(sql, /ROLLBACK/);
  assert.match(sql, /DROP COLUMN IF EXISTS table_qr_enabled/);
  assert.doesNotMatch(sql.replace(/^--.*$/gm, ""), /\b(UPDATE|INSERT|DELETE)\b/i);
  const newest = readdirSync(dir).filter((f) => /^\d{14}_/.test(f)).sort().pop();
  assert.equal(newest, file, "must sort after every existing migration");
});
