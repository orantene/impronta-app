import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { HOLD_TTL_CAP_SECONDS } from "./ticket-purchase";

/**
 * `HOLD_TTL_CAP_SECONDS` is a COPY of the engine's cap (the column CHECK in
 * `capacity_pools` and the `CP007` check in `_capacity_reserve_locked`). Two
 * constants meaning one fact is how the 30-versus-7 gap opened in Orders'
 * clamp; until Capacity exports one constant for every caller to import,
 * this pins mine to the number the migrations actually enforce.
 */
const MIGRATIONS = join(__dirname, "..", "..", "..", "..", "supabase", "migrations");

test("the ticket picker's hold cap equals the engine's CHECK, read from the migrations", () => {
  const sql = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()
    .map((f) => readFileSync(join(MIGRATIONS, f), "utf8")).join("\n");
  const m = [...sql.matchAll(/hold_ttl_seconds\s+BETWEEN\s+30\s+AND\s+(\d+)/gi)];
  assert.ok(m.length > 0, "no hold_ttl_seconds CHECK found in the migrations");
  const caps = new Set(m.map((x) => Number(x[1])));
  assert.equal(caps.size, 1, `the migrations disagree about the cap: ${[...caps].join(", ")}`);
  assert.equal(HOLD_TTL_CAP_SECONDS, [...caps][0]);
});
