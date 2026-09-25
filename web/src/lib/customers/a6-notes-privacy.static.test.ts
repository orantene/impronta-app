/**
 * A6 static guard: migration revokes customers.notes from authenticated SELECT.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const migrationsDir = join(process.cwd(), "..", "supabase", "migrations");

describe("A6 customers.notes column privilege", () => {
  it("has a migration that revokes notes from authenticated SELECT", () => {
    const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
    const hit = files.find((f) => f.includes("customers_notes_column_privilege"));
    assert.ok(hit, "expected customers_notes_column_privilege migration");
    const sql = readFileSync(join(migrationsDir, hit!), "utf8");
    assert.match(sql, /REVOKE SELECT ON public\.customers FROM authenticated/);
    assert.match(sql, /column_name <> 'notes'/);
    assert.match(sql, /GRANT SELECT \(%s\) ON public\.customers TO authenticated/);
  });
});
