import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { holdTtlMs, RESERVATION_HOLD_TTL_MS } from "./reservation-hold";

const SRC = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** The argument object of every placeReservationHold(...) call in the tree. */
function holdCallSites(): { file: string; body: string }[] {
  const sites: { file: string; body: string }[] = [];
  for (const file of walk(SRC)) {
    const source = readFileSync(file, "utf8");
    let from = 0;
    for (;;) {
      const at = source.indexOf("placeReservationHold(", from);
      if (at === -1) break;
      from = at + 1;
      // Skip the definition and re-exports; we only want invocations that
      // pass an options object.
      const open = source.indexOf("{", at);
      if (open === -1 || open > at + 120) continue;
      let depth = 0;
      let end = open;
      for (; end < source.length; end += 1) {
        if (source[end] === "{") depth += 1;
        else if (source[end] === "}") {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      sites.push({ file: path.relative(SRC, file), body: source.slice(open, end + 1) });
    }
  }
  return sites;
}

test("every hold call site passes the pool's TTL", () => {
  const sites = holdCallSites();
  assert.ok(sites.length >= 3, `expected to find the hold call sites, found ${sites.length}`);

  const silent = sites.filter((s) => !s.body.includes("ttlSeconds") && !s.body.includes("expiresAt"));
  assert.deepEqual(
    silent.map((s) => s.file),
    [],
    "a call site with neither ttlSeconds nor expiresAt silently takes the 48h default, " +
      "so the same offering expires in 15 minutes down one path and 48 hours down another",
  );
});

test("both offering reads select the pool, or the TTL cannot be resolved", () => {
  for (const file of [
    "lib/inquiry/inquiry-intent-engine.ts",
    "lib/server-actions/reservation-propose.ts",
  ]) {
    const source = readFileSync(path.join(SRC, file), "utf8");
    const select = source.slice(source.indexOf('.from("talent_offerings")'));
    assert.ok(
      select.slice(0, 300).includes("capacity_pool_id"),
      `${file} must select capacity_pool_id — a column that is never read cannot reach the decision`,
    );
  }
});

test("a nonsense TTL falls back rather than costing someone their slot", () => {
  assert.equal(holdTtlMs(900), 900_000);
  assert.equal(holdTtlMs(null), RESERVATION_HOLD_TTL_MS);
  assert.equal(holdTtlMs(1), RESERVATION_HOLD_TTL_MS, "below the floor");
  assert.equal(holdTtlMs(999_999_999), RESERVATION_HOLD_TTL_MS, "above the ceiling");
  assert.equal(holdTtlMs(Number.NaN), RESERVATION_HOLD_TTL_MS);
});
